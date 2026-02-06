import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import { db } from '~/db';
import { slackMessages, manualArchetypes } from '~/db/schema';
import { eq, sql } from 'drizzle-orm';
import { detectManualArchetype } from '~/lib/manual-archetypes';
import * as z from 'zod';

const querySchema = z.object({
  archetypeId: z.coerce.number().optional(),
});

/**
 * Reclassify messages in the database using manual archetypes
 *
 * Query params:
 * - archetypeId (optional): If provided, only reclassify using this specific archetype
 *
 * This endpoint:
 * 1. Fetches all non-thread-reply messages from DB
 * 2. Applies manual archetype detection to each message
 * 3. Updates messages that should have a different archetype
 * 4. Returns count of updated messages
 */
export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse, session) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }

    const { archetypeId } = parsed.data;

    // If archetypeId is provided, fetch only that archetype
    let targetArchetype: { name: string; keywords: string[] } | null = null;
    if (archetypeId) {
      const [archetype] = await db
        .select()
        .from(manualArchetypes)
        .where(eq(manualArchetypes.id, archetypeId))
        .limit(1);

      if (!archetype) {
        return res.status(404).json({ error: 'Archetype not found' });
      }

      targetArchetype = {
        name: archetype.name,
        keywords: archetype.keywords as string[],
      };
    }

    // Fetch all non-thread-reply messages
    // We only reclassify parent messages, not thread replies
    const messages = await db
      .select({
        id: slackMessages.id,
        text: slackMessages.text,
        currentArchetype: slackMessages.archetype,
        isThreadReply: slackMessages.isThreadReply,
      })
      .from(slackMessages)
      .where(eq(slackMessages.isThreadReply, false));

    let updatedCount = 0;
    const batchSize = 50; // Process in batches to avoid overwhelming the system

    // Process messages in batches
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (message) => {
          try {
            // If we're reclassifying for a specific archetype
            if (targetArchetype) {
              // Check if message matches this archetype's keywords
              const matches = targetArchetype.keywords.some((keyword) =>
                message.text.toLowerCase().includes(keyword.toLowerCase()),
              );

              if (matches && message.currentArchetype !== targetArchetype.name) {
                // Update message to use this archetype
                await db
                  .update(slackMessages)
                  .set({
                    archetype: targetArchetype.name,
                    archetypeConfidence: 'high',
                    updatedAt: new Date(),
                  })
                  .where(eq(slackMessages.id, message.id));

                updatedCount++;
              }
            } else {
              // Reclassify using all manual archetypes
              const manualMatch = await detectManualArchetype(message.text);

              if (manualMatch && manualMatch.archetype !== message.currentArchetype) {
                // Update message to use the matched archetype
                await db
                  .update(slackMessages)
                  .set({
                    archetype: manualMatch.archetype,
                    archetypeConfidence: manualMatch.confidence,
                    updatedAt: new Date(),
                  })
                  .where(eq(slackMessages.id, message.id));

                updatedCount++;
              }
            }
          } catch (error) {
            console.error(`Failed to reclassify message ${message.id}:`, error);
            // Continue processing other messages
          }
        }),
      );
    }

    return res.status(200).json({
      success: true,
      updated: updatedCount,
      total: messages.length,
    });
  } catch (error) {
    console.error('Reclassification error:', error);
    return res.status(500).json({ error: 'Failed to reclassify messages' });
  }
});

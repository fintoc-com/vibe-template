import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import { db } from '~/db';
import { manualArchetypeCorrections, slackMessages } from '~/db/schema';
import { eq } from 'drizzle-orm';
import * as z from 'zod';

const correctArchetypeSchema = z.object({
  messageId: z.string().min(1),
  correctedArchetype: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
  addToManualArchetypes: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse, session) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = correctArchetypeSchema.parse(req.body);

    // Get the message to correct
    const [message] = await db
      .select()
      .from(slackMessages)
      .where(eq(slackMessages.id, body.messageId))
      .limit(1);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const originalArchetype = message.archetype;

    // Record the correction
    await db.insert(manualArchetypeCorrections).values({
      messageId: body.messageId,
      originalArchetype,
      correctedArchetype: body.correctedArchetype,
      correctedBy: session.user.email,
      reason: body.reason,
    });

    // Update the message archetype
    await db
      .update(slackMessages)
      .set({
        archetype: body.correctedArchetype,
        archetypeConfidence: 'high',
        updatedAt: new Date(),
      })
      .where(eq(slackMessages.id, body.messageId));

    // If requested, add this archetype to manual archetypes
    if (body.addToManualArchetypes && body.keywords) {
      const { addManualArchetype } = await import('~/lib/manual-archetypes');

      try {
        await addManualArchetype({
          name: body.correctedArchetype,
          description: `Creado desde corrección manual del mensaje ${body.messageId}`,
          keywords: body.keywords,
          exampleMessageIds: [body.messageId],
        });
      } catch (error: any) {
        // If archetype already exists, just add the example message
        if (error?.code === '23505') {
          // Unique constraint violation
          console.log('Archetype already exists, skipping creation');
        } else {
          console.error('Failed to add manual archetype:', error);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Archetype corrected successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    console.error('Failed to correct archetype:', error);
    return res.status(500).json({ error: 'Failed to correct archetype' });
  }
});

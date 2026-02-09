import type { NextApiRequest, NextApiResponse } from 'next';
import * as z from 'zod';
import { protectedHandler } from '~/lib/api/protected-handler';
import { db } from '~/db';
import { slackMessages } from '~/db/schema';
import { inArray, eq } from 'drizzle-orm';

const requestSchema = z.object({
  messageIds: z.array(z.string()).min(1).max(1000),
  archetype: z.string().min(1),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { messageIds, archetype } = parsed.data;

  try {
    // Update messages in database
    await db
      .update(slackMessages)
      .set({
        archetype,
        archetypeConfidence: 'manual',
        updatedAt: new Date(),
      })
      .where(inArray(slackMessages.id, messageIds));

    return res.status(200).json({
      success: true,
      updated: messageIds.length,
    });
  } catch (error) {
    console.error('Error updating messages:', error);
    return res.status(500).json({ error: 'Failed to update messages' });
  }
});

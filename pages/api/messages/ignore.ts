import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import { db } from '~/db';
import { slackMessages } from '~/db/schema';
import { eq } from 'drizzle-orm';
import * as z from 'zod';

const ignoreMessageSchema = z.object({
  messageId: z.string().min(1),
  ignored: z.boolean(),
});

/**
 * Toggle ignored status of a message
 *
 * POST body:
 * - messageId: The Slack message ID to ignore/unignore
 * - ignored: true to ignore, false to unignore
 */
export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse, session) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = ignoreMessageSchema.parse(req.body);

    // Check if message exists
    const [message] = await db
      .select()
      .from(slackMessages)
      .where(eq(slackMessages.id, body.messageId))
      .limit(1);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Update ignored status
    await db
      .update(slackMessages)
      .set({
        isIgnored: body.ignored,
        updatedAt: new Date(),
      })
      .where(eq(slackMessages.id, body.messageId));

    return res.status(200).json({
      success: true,
      messageId: body.messageId,
      ignored: body.ignored,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    console.error('Failed to update message ignored status:', error);
    return res.status(500).json({ error: 'Failed to update message' });
  }
});

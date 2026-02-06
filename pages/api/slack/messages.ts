import type { NextApiRequest, NextApiResponse } from 'next';
import * as z from 'zod';
import { protectedHandler } from '~/lib/api/protected-handler';
import { env } from '~/config/env';
import { db } from '~/db';
import { slackMessages, slackUsers } from '~/db/schema';
import { eq, and, gte } from 'drizzle-orm';

const querySchema = z.object({
  channelId: z.string().optional(),
  days: z.coerce.number().min(1).max(90).optional().default(30),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
  }

  const { channelId, days } = parsed.data;
  const channel = channelId || env.SLACK_CHANNEL_ID;

  if (!channel) {
    return res.status(400).json({ error: 'Channel ID is required. Provide channelId query param or set SLACK_CHANNEL_ID env variable.' });
  }

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Fetch messages from database with user info
  // Only fetch parent messages (exclude thread replies and ignored messages)
  const dbMessages = await db
    .select({
      message: slackMessages,
      user: slackUsers,
    })
    .from(slackMessages)
    .innerJoin(slackUsers, eq(slackMessages.userId, slackUsers.id))
    .where(
      and(
        eq(slackMessages.channelId, channel),
        gte(slackMessages.datetime, cutoffDate),
        eq(slackMessages.isThreadReply, false), // Only parent messages
        eq(slackMessages.isIgnored, false), // Exclude ignored messages
      ),
    )
    .orderBy(slackMessages.datetime);

  // Transform to match the expected format
  const messages = dbMessages.map(({ message, user }) => ({
    id: message.id,
    text: message.text,
    rawText: message.rawText,
    user: {
      id: user.id,
      name: user.name,
      realName: user.realName,
      isBot: user.isBot,
    },
    timestamp: message.timestamp,
    datetime: message.datetime.toISOString(),
    type: message.type,
    category: {
      role: message.categoryRole,
      group: message.categoryGroup,
    },
    topic: {
      topic: message.topic,
      color: message.topicColor,
    },
    summary: message.summary,
    archetype: {
      archetype: message.archetype,
      confidence: message.archetypeConfidence,
    },
    subtype: message.subtype,
    isIgnored: message.isIgnored,
  }));

  return res.status(200).json({ messages, channel });
});

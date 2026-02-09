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

  // Helper to normalize type values
  const normalizeType = (type: string): 'reminder' | 'bot' | 'user' => {
    if (type === 'reminder') return 'reminder';
    if (type === 'bot') return 'bot';
    // Map 'message' and any other unknown types to 'user'
    return 'user';
  };

  // Helper to normalize role values
  const normalizeRole = (role: string): 'support' | 'kam' | 'merchant' | 'bot' | 'unknown' => {
    const normalized = role.toLowerCase();
    if (normalized === 'support') return 'support';
    if (normalized === 'kam') return 'kam';
    if (normalized === 'merchant') return 'merchant';
    if (normalized === 'bot') return 'bot';
    // Map 'User' and any unknown values to 'unknown'
    return 'unknown';
  };

  // Helper to normalize confidence values
  const normalizeConfidence = (confidence: string): 'high' | 'medium' | 'low' => {
    // Map classification methods to confidence levels
    if (confidence === 'claude_exhaustive') return 'high';
    if (confidence === 'bertopic') return 'medium';
    if (confidence === 'backfill') return 'low';
    // Use existing values if already in correct format
    if (confidence === 'high') return 'high';
    if (confidence === 'medium') return 'medium';
    if (confidence === 'low') return 'low';
    // Default to medium for unknown values
    return 'medium';
  };

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
    type: normalizeType(message.type),
    category: {
      role: normalizeRole(message.categoryRole),
      group: message.categoryGroup,
    },
    topic: {
      topic: message.topic,
      color: message.topicColor,
    },
    summary: message.summary,
    archetype: {
      archetype: message.archetype,
      confidence: normalizeConfidence(message.archetypeConfidence),
    },
    subtype: message.subtype,
    isIgnored: message.isIgnored,
  }));

  return res.status(200).json({ messages, channel });
});

import type { NextApiRequest, NextApiResponse } from 'next';
import * as z from 'zod';
import { protectedHandler } from '~/lib/api/protected-handler';
import { slack } from '~/lib/slack';
import { env } from '~/config/env';
import { parseSlackMessage, categorizeUser, getMessageType } from '~/lib/slack-parser';
import { extractUserIdsFromText, detectTopic, generateSummary } from '~/lib/slack-topics';
import { detectArchetype } from '~/lib/slack-archetypes';
import { db } from '~/db';
import { slackUsers, slackMessages } from '~/db/schema';
import { eq, sql } from 'drizzle-orm';

const querySchema = z.object({
  channelId: z.string().optional(),
  days: z.coerce.number().min(1).max(90).optional().default(30),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
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

  // Calculate timestamp for N days ago
  const oldestTimestamp = (Date.now() / 1000) - (days * 24 * 60 * 60);

  // Fetch messages from last N days
  const result = await slack.conversations.history({
    channel,
    oldest: oldestTimestamp.toString(),
    limit: 1000,
  });

  if (!result.ok) {
    return res.status(500).json({ error: 'Failed to fetch messages from Slack', details: result.error });
  }

  const rawMessages = result.messages ?? [];

  // Fetch thread replies for messages that have threads
  const allMessages = [...rawMessages];
  await Promise.all(
    rawMessages.map(async (msg) => {
      if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
        try {
          const threadResult = await slack.conversations.replies({
            channel,
            ts: msg.thread_ts,
            oldest: oldestTimestamp.toString(),
          });
          if (threadResult.ok && threadResult.messages) {
            const replies = threadResult.messages.slice(1);
            allMessages.push(...replies);
          }
        } catch (error) {
          console.error(`Failed to fetch thread ${msg.thread_ts}:`, error);
        }
      }
    }),
  );

  // Collect unique user IDs from message authors and mentions
  const userIds = new Set<string>();
  for (const msg of allMessages) {
    if (msg.user) {
      userIds.add(msg.user);
    }
    if (msg.text) {
      const mentionedIds = extractUserIdsFromText(msg.text);
      for (const id of mentionedIds) {
        userIds.add(id);
      }
    }
  }

  // Fetch user information and store in DB
  const userMap = new Map<string, string>();
  const userDetailsMap = new Map<string, { name: string, realName: string, isBot: boolean }>();

  await Promise.all(
    Array.from(userIds).map(async (userId) => {
      try {
        const userInfo = await slack.users.info({ user: userId });
        if (userInfo.ok && userInfo.user) {
          const displayName = userInfo.user.profile?.display_name || userInfo.user.real_name || userInfo.user.name || userId;
          const realName = userInfo.user.real_name || userInfo.user.name || userId;
          const isBot = userInfo.user.is_bot || false;

          userMap.set(userId, displayName);
          userDetailsMap.set(userId, {
            name: displayName,
            realName,
            isBot,
          });

          // Upsert user to database
          await db
            .insert(slackUsers)
            .values({
              id: userId,
              name: displayName,
              realName,
              isBot,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: slackUsers.id,
              set: {
                name: displayName,
                realName,
                isBot,
                updatedAt: new Date(),
              },
            });
        } else {
          console.error(`Failed to fetch user ${userId}: ${userInfo.error}`);
          userMap.set(userId, userId);
        }
      } catch (error) {
        console.error(`Exception fetching user ${userId}:`, error);
        userMap.set(userId, userId);
      }
    }),
  );

  // Sort messages to ensure parent messages are processed before replies
  // This prevents foreign key constraint violations
  const sortedMessages = allMessages.sort((a, b) => {
    const aIsReply = a.thread_ts && a.ts !== a.thread_ts;
    const bIsReply = b.thread_ts && b.ts !== b.thread_ts;

    // Non-replies come before replies
    if (!aIsReply && bIsReply) return -1;
    if (aIsReply && !bIsReply) return 1;

    // Otherwise sort by timestamp
    const aTime = parseFloat(a.ts ?? '0');
    const bTime = parseFloat(b.ts ?? '0');
    return aTime - bTime;
  });

  // Process and store messages
  let newMessages = 0;
  let updatedMessages = 0;

  for (const msg of sortedMessages) {
    try {
      const userId = msg.user ?? (msg.bot_id ? `bot_${msg.bot_id}` : 'unknown');
      const userName = userMap.get(msg.user ?? '') || msg.username || 'Unknown';
      const userDetails = userDetailsMap.get(msg.user ?? '');
      const isBot = userDetails?.isBot || !!msg.bot_id;

      const messageType = getMessageType(msg);
      const { role, category } = categorizeUser(userName, userId);

      // Parse message text
      const rawText = msg.text ?? '';
      const parsedText = parseSlackMessage(rawText, userMap, new Map());

      const isReply = !!msg.thread_ts && msg.ts !== msg.thread_ts;

      // For archetype detection, use full thread context if this is a parent message
      let contextText = parsedText;
      if (!isReply && msg.thread_ts === msg.ts) {
        // This is a parent message - gather all its replies for context
        const threadReplies = sortedMessages.filter(
          (m) => m.thread_ts === msg.thread_ts && m.ts !== msg.ts,
        );
        const repliesText = threadReplies
          .map((reply) => {
            const replyText = reply.text ?? '';
            return parseSlackMessage(replyText, userMap, new Map());
          })
          .join('\n');
        contextText = parsedText + (repliesText ? '\n' + repliesText : '');
      }

      // Detect topic, summary, and archetype
      // Only assign archetype to parent messages
      const topicInfo = detectTopic(parsedText);
      const summary = generateSummary(parsedText);
      const archetypeInfo = isReply
        ? { archetype: 'Thread Reply', confidence: 'high' as const }
        : await detectArchetype(contextText, {
            name: userName,
            isBot,
          }, messageType);

      const messageId = msg.ts ?? '';
      const datetime = msg.ts ? new Date(parseFloat(msg.ts) * 1000) : new Date();

      // Check if message already exists
      const existingMessage = await db
        .select()
        .from(slackMessages)
        .where(eq(slackMessages.id, messageId))
        .limit(1);

      if (existingMessage.length > 0) {
      // Update existing message
      await db
        .update(slackMessages)
        .set({
          text: parsedText,
          rawText,
          type: messageType,
          subtype: msg.subtype ?? null,
          categoryRole: role,
          categoryGroup: category,
          topic: topicInfo.topic,
          topicColor: topicInfo.color,
          summary,
          archetype: archetypeInfo.archetype,
          archetypeConfidence: archetypeInfo.confidence,
          threadTs: msg.thread_ts ?? null,
          isThreadReply: isReply,
          parentMessageId: isReply ? msg.thread_ts ?? null : null,
          updatedAt: new Date(),
        })
        .where(eq(slackMessages.id, messageId));
      updatedMessages++;
    } else {
      // Insert new message
      await db.insert(slackMessages).values({
        id: messageId,
        channelId: channel,
        text: parsedText,
        rawText,
        userId,
        timestamp: msg.ts ?? '',
        datetime,
        type: messageType,
        subtype: msg.subtype ?? null,
        categoryRole: role,
        categoryGroup: category,
        topic: topicInfo.topic,
        topicColor: topicInfo.color,
        summary,
        archetype: archetypeInfo.archetype,
        archetypeConfidence: archetypeInfo.confidence,
        threadTs: msg.thread_ts ?? null,
        isThreadReply: isReply,
        parentMessageId: isReply ? msg.thread_ts ?? null : null,
      });
      newMessages++;
    }
    } catch (error) {
      console.error(`Error processing message ${msg.ts}:`, error);
      // Continue processing other messages even if one fails
    }
  }

  return res.status(200).json({
    success: true,
    channel,
    stats: {
      totalProcessed: allMessages.length,
      newMessages,
      updatedMessages,
      users: userIds.size,
    },
  });
});

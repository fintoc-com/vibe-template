import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '~/db';
import { slackMessages, slackUsers } from '~/db/schema';
import { WebClient } from '@slack/web-api';
import { env } from '~/config/env';

const slack = new WebClient(env.SLACK_BOT_TOKEN);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify internal request
  if (req.headers['x-internal-request'] !== 'true') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { messageId, userId, text, channelId, threadTs, timestamp } = req.body;

  if (!messageId || !userId || !text || !channelId || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Get user info from Slack
    const userInfo = await slack.users.info({ user: userId });

    if (!userInfo.ok || !userInfo.user) {
      throw new Error('Failed to fetch user info');
    }

    const user = userInfo.user;

    // Upsert user
    await db
      .insert(slackUsers)
      .values({
        id: userId,
        name: user.name || userId,
        realName: user.real_name || user.name || userId,
        isBot: user.is_bot || false,
      })
      .onConflictDoUpdate({
        target: slackUsers.id,
        set: {
          name: user.name || userId,
          realName: user.real_name || user.name || userId,
          isBot: user.is_bot || false,
        },
      });

    // Convert Slack timestamp to Date
    const datetime = new Date(parseFloat(timestamp) * 1000);

    // Determine if it's a thread reply
    const isThreadReply = !!threadTs && threadTs !== timestamp;

    // Insert or update message
    await db
      .insert(slackMessages)
      .values({
        id: messageId,
        text: text,
        rawText: text,
        userId: userId,
        timestamp: timestamp,
        datetime: datetime,
        channelId: channelId,
        threadTs: threadTs || timestamp,
        isThreadReply: isThreadReply,
        type: 'user',
        categoryRole: 'unknown',
        categoryGroup: 'General',
        topic: 'Sin Categoría',
        topicColor: '#gray',
        summary: text.slice(0, 200),
        archetype: 'Sin Clasificar',
        archetypeConfidence: 'low',
        subtype: null,
        isIgnored: false,
      })
      .onConflictDoUpdate({
        target: slackMessages.id,
        set: {
          text: text,
          rawText: text,
          updatedAt: new Date(),
        },
      });

    console.log(`✓ Ingested message ${messageId} from user ${userId}`);

    return res.status(200).json({ ok: true, messageId });
  } catch (error) {
    console.error('Error ingesting message:', error);
    return res.status(500).json({
      error: 'Failed to ingest message',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

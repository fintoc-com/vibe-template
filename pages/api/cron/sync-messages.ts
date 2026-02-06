import type { NextApiRequest, NextApiResponse } from 'next';
import { slack } from '~/lib/slack';
import { db } from '~/db';
import { slackMessages } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '~/config/env';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

/**
 * Cron job to sync and classify new Slack messages
 * Runs 3x per day via Vercel Cron
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/sync-messages",
 *     "schedule": "0 8,14,20 * * *"
 *   }]
 * }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting message sync...');

    // Get messages from last 8 hours
    const eightHoursAgo = Math.floor(Date.now() / 1000) - 8 * 60 * 60;

    const result = await slack.conversations.history({
      channel: env.SLACK_CHANNEL_ID || 'C05ADHG3WAF',
      oldest: eightHoursAgo.toString(),
      limit: 1000,
    });

    if (!result.ok || !result.messages) {
      throw new Error('Failed to fetch messages from Slack');
    }

    console.log(`Fetched ${result.messages.length} messages`);

    // Load archetypes from DB
    const archetypes = await db.query.manualArchetypes.findMany();
    const archetypeDescriptions = archetypes.map(a =>
      `- ${a.name}: ${a.description}`
    ).join('\n');

    let classified = 0;
    let skipped = 0;

    for (const message of result.messages) {
      if (!message.text || message.subtype) {
        skipped++;
        continue;
      }

      // Check if message already exists
      const existing = await db.query.slackMessages.findFirst({
        where: eq(slackMessages.ts, message.ts),
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Classify with Claude
      const classification = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Clasifica este mensaje de Slack en uno de estos arquetipos:

${archetypeDescriptions}

Mensaje: "${message.text}"

Responde SOLO con el nombre exacto del arquetipo.`,
        }],
      });

      const archetype = classification.content[0].type === 'text'
        ? classification.content[0].text.trim()
        : 'Unknown';

      // Insert message with classification
      await db.insert(slackMessages).values({
        ts: message.ts,
        text: message.text,
        userId: message.user || 'unknown',
        channelId: env.SLACK_CHANNEL_ID || 'C05ADHG3WAF',
        archetype,
        archetypeConfidence: 'high',
        isThreadReply: false,
        isIgnored: false,
      });

      classified++;
    }

    console.log(`Sync complete: ${classified} classified, ${skipped} skipped`);

    return res.status(200).json({
      success: true,
      classified,
      skipped,
      total: result.messages.length,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
}

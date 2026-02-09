import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'node:crypto';
import { env } from '~/config/env';
import { slack } from '~/lib/slack';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Slack Events API endpoint
 * Handles app_mention events for AI-powered actions
 *
 * Uses Claude to interpret user intent and route to appropriate handlers.
 */

// In-memory deduplication cache (event_id -> timestamp)
const processedEvents = new Map<string, number>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [eventId, timestamp] of processedEvents.entries()) {
    if (timestamp < fiveMinutesAgo) {
      processedEvents.delete(eventId);
    }
  }
}, 5 * 60 * 1000);

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

// Verify Slack request signature
function verifySlackRequest(req: NextApiRequest): boolean {
  const slackSignature = req.headers['x-slack-signature'] as string;
  const slackTimestamp = req.headers['x-slack-request-timestamp'] as string;

  if (!slackSignature || !slackTimestamp) {
    return false;
  }

  // Prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(slackTimestamp, 10)) > 60 * 5) {
    return false;
  }

  // Verify signature
  const rawBody = JSON.stringify(req.body);
  const sigBasestring = `v0:${slackTimestamp}:${rawBody}`;
  const mySignature = `v0=${crypto
    .createHmac('sha256', env.SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature),
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('=== SLACK WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify({
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
    'x-slack-signature': req.headers['x-slack-signature'] ? 'present' : 'missing',
    'x-slack-request-timestamp': req.headers['x-slack-request-timestamp'] || 'missing',
  }, null, 2));
  console.log('Body type:', typeof req.body);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('==============================');

  if (req.method !== 'POST') {
    console.log('Rejecting non-POST request');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle URL verification challenge FIRST (before signature verification)
  // Slack's challenge doesn't need signature verification
  if (req.body?.type === 'url_verification') {
    const challengeValue = req.body.challenge;
    console.log('🔍 URL Verification Challenge Detected');
    console.log('Challenge value:', challengeValue);
    console.log('Challenge type:', typeof challengeValue);

    const response = { challenge: challengeValue };
    console.log('Responding with:', JSON.stringify(response));

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(response);
  }

  console.log('Not a challenge, checking signature...');

  // Ignore bot's own messages and maintenance events
  const ignoredSubtypes = ['message_changed', 'message_deleted', 'message_replied', 'channel_join', 'channel_leave'];
  const isBotMessage = req.body.event?.bot_id;
  const isIgnoredSubtype = ignoredSubtypes.includes(req.body.event?.subtype);

  if (isBotMessage || isIgnoredSubtype) {
    console.log('Ignoring bot message or maintenance event:', req.body.event?.subtype || 'bot_message');
    return res.status(200).json({ ok: true });
  }

  // Verify request is from Slack (for all other events)
  if (!verifySlackRequest(req)) {
    console.error('Invalid Slack signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle ONLY app_mention events (Slack always sends this when bot is mentioned)
  // Don't process message events with mentions to avoid duplicates
  const isAppMention = req.body.type === 'event_callback' && req.body.event.type === 'app_mention';

  if (isAppMention) {
    const event = req.body.event;
    const eventId = req.body.event_id;
    const text = event.text || '';
    const threadTs = event.thread_ts || event.ts;
    const channelId = event.channel;
    const messageTs = parseFloat(event.ts);

    console.log('📝 Processing mention:', {
      eventId,
      eventType: event.type,
      text,
      threadTs,
      channelId,
      messageTs,
    });

    // Deduplication: Check if we already processed this event
    if (processedEvents.has(eventId)) {
      console.log(`Skipping duplicate event: ${eventId}`);
      return res.status(200).json({ ok: true });
    }

    // Mark event as processed
    processedEvents.set(eventId, Date.now());

    // Ignore old messages (more than 2 minutes old)
    const currentTime = Date.now() / 1000;
    const messageAge = currentTime - messageTs;
    if (messageAge > 120) {
      console.log(`Ignoring old message (${Math.round(messageAge)}s old)`);
      return res.status(200).json({ ok: true });
    }

    // Respond immediately to Slack (required within 3 seconds)
    res.status(200).json({ ok: true });

    try {
      // Use Claude to classify intent and extract parameters
      const intentClassification = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Analiza este mensaje de Slack y determina la intención del usuario.

Mensaje: "${text}"

Responde en JSON con:
{
  "action": "escribir" | "leer" | "none",
  "type": "runbook" | "documentacion" | "resumen" | "issue" | "reporte" | null,
  "instructions": "instrucciones específicas del usuario o null"
}

Intenciones:
- "escribir": Generar cualquier tipo de documento desde este thread (runbooks formales, documentación, resúmenes rápidos, issues, reportes). Claude decidirá el formato según el contexto: si pides "resumen" será breve y casual, si pides "runbook" será estructurado y formal.
- "leer": Buscar y leer documentación existente guardada (futuro)
- "none": no es una petición válida

Responde SOLO con el JSON, sin explicaciones.`,
        }],
      });

      const content = intentClassification.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response from Claude');
      }

      // Extract JSON from markdown code block if present
      let jsonText = content.text.trim();
      if (jsonText.includes('```json')) {
        const jsonStart = jsonText.indexOf('```json') + 7;
        const jsonEnd = jsonText.indexOf('```', jsonStart);
        jsonText = jsonText.substring(jsonStart, jsonEnd).trim();
      } else if (jsonText.includes('```')) {
        // Handle plain ``` code blocks
        const jsonStart = jsonText.indexOf('```') + 3;
        const jsonEnd = jsonText.indexOf('```', jsonStart);
        jsonText = jsonText.substring(jsonStart, jsonEnd).trim();
      }

      const intent = JSON.parse(jsonText);
      console.log('Intent classification:', intent);

      if (intent.action === 'none') {
        console.log('No valid action detected, ignoring');
        return;
      }

      if (intent.action === 'escribir') {
        // Handle "write" action - generate documentation from thread
        await slack.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: intent.instructions
            ? `🤖 Generando ${intent.type || 'documentación'} con tus instrucciones...\nEsto puede tomar unos segundos.`
            : `🤖 Generando ${intent.type || 'documentación'} desde este thread...\nEsto puede tomar unos segundos.`,
        });

        const generateUrl = `${env.BETTER_AUTH_URL}/api/runbooks/generate-internal`;
        const response = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-request': 'true',
          },
          body: JSON.stringify({
            threadTs,
            channelId,
            prompt: intent.instructions,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate document');
        }

        const result = await response.json();

        await slack.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `✅ Documento creado exitosamente!\n\n*${result.runbook.title}*\n\nVer documentos: ${env.BETTER_AUTH_URL}/tiger/runbooks`,
        });
      } else if (intent.action === 'leer') {
        // Future: Handle "read" action - search and read existing documentation
        await slack.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: '🚧 La función de lectura de documentación está en desarrollo.',
        });
      }
    } catch (error) {
      console.error('Error processing mention:', error);

      await slack.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: '❌ Error al procesar tu solicitud. Por favor intenta de nuevo.',
      });
    }

    return;
  }

  // Handle regular message events (automatic ingestion)
  const isChannelMessage = req.body.type === 'event_callback' && req.body.event.type === 'message';

  if (isChannelMessage) {
    const event = req.body.event;

    // Only process messages from our configured channel
    if (event.channel !== env.SLACK_CHANNEL_ID) {
      return res.status(200).json({ ok: true });
    }

    try {
      // Store message in database
      const response = await fetch(`${env.BETTER_AUTH_URL}/api/slack/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-request': 'true',
        },
        body: JSON.stringify({
          messageId: event.ts,
          userId: event.user,
          text: event.text,
          channelId: event.channel,
          threadTs: event.thread_ts,
          timestamp: event.ts,
        }),
      });

      if (!response.ok) {
        console.error('Failed to ingest message:', await response.text());
      } else {
        console.log('✓ Message ingested:', event.ts);
      }
    } catch (error) {
      console.error('Error ingesting message:', error);
    }

    return res.status(200).json({ ok: true });
  }

  // Unknown event type
  return res.status(200).json({ ok: true });
}

// Enable body parsing for JSON
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

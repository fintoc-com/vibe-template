import { env } from '~/config/env';

type SlackPostMessageResponse = {
  ok?: boolean
  error?: string
  ts?: string
  channel?: string
};

type PostSlackMessageParams = {
  channel: string
  text: string
  threadTs?: string
};

export async function postSlackMessage(params: PostSlackMessageParams): Promise<{ ts: string, channel: string }> {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error('Missing SLACK_BOT_TOKEN');
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: params.channel,
      text: params.text,
      thread_ts: params.threadTs,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const payload = (await response.json()) as SlackPostMessageResponse;
  if (!response.ok || !payload.ok || !payload.ts || !payload.channel) {
    throw new Error(`Slack API error: ${payload.error ?? response.statusText}`);
  }

  return { ts: payload.ts, channel: payload.channel };
}

import { WebClient } from '@slack/web-api';
import { env } from '~/config/env';

export const slack = new WebClient(env.SLACK_BOT_TOKEN);

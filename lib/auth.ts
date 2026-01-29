import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { db } from '~/db';
import { env } from '~/config/env';
import { ALLOWED_EMAIL_DOMAIN } from './auth-config';

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!user.email?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
            throw new APIError('BAD_REQUEST', {
              message: `Only @${ALLOWED_EMAIL_DOMAIN} emails are allowed`,
            });
          }
          return { data: user };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;

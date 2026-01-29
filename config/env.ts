import * as z from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().optional().default('postgresql://postgres:postgres@localhost:5432/postgres'),
  BETTER_AUTH_URL: z.string().optional().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);

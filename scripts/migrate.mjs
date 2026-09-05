import { execSync } from 'child_process';

import { loadDopplerSecrets } from './load-doppler-secrets.mjs';

loadDopplerSecrets();

// Migrations run as the migrations user (the app user is least-privilege, no CREATE).
if (process.env.MIGRATIONS_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATIONS_DATABASE_URL;
}

execSync('npx drizzle-kit migrate', { stdio: 'inherit', env: process.env });

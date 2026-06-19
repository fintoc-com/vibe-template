import { execSync } from 'child_process';

const dopplerSecrets = process.env.DOPPLER_SECRETS;
if (dopplerSecrets) {
  const secrets = JSON.parse(dopplerSecrets);
  for (const [key, value] of Object.entries(secrets)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

execSync('npx drizzle-kit migrate', { stdio: 'inherit', env: process.env });

// Verifies the app still fits the Cloud Run deploy contract (AGENTS.md > Deployment):
// the image serves with nothing but DOPPLER_SECRETS in its environment.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadDopplerSecrets } from './load-doppler-secrets.mjs';

// A route that imports config/env and needs no database: 500 here means the blob never
// reached the app. Next loads route modules on the first request, not at boot.
const PROBE_PATH = '/api/auth/ok';

const failures = [];
const expect = (ok, message) => {
  if (!ok) failures.push(message);
};
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

function checkWiring() {
  expect(
    /output:\s*['"]standalone['"]/.test(read('next.config.ts')),
    'next.config.ts: the Dockerfile needs `output: \'standalone\'`',
  );
  expect(
    read('Dockerfile').includes('CMD ["node", "scripts/start.mjs"]'),
    'Dockerfile: CMD must be scripts/start.mjs, which expands DOPPLER_SECRETS before Next boots',
  );
  expect(
    read('scripts/migrate.mjs').includes('MIGRATIONS_DATABASE_URL'),
    'scripts/migrate.mjs: migrations must run with MIGRATIONS_DATABASE_URL (the app user has no DDL)',
  );
  expect(
    !/['"]\.\/config\/env['"]/.test(read('drizzle.config.ts')),
    'drizzle.config.ts: must not import config/env, the migrate job does not carry app secrets',
  );
}

function checkDopplerExpansion() {
  const original = process.env;
  process.env = {
    ...original,
    DOPPLER_SECRETS: JSON.stringify({ FROM_BLOB: 'blob', SHADOWED: 'blob' }),
    SHADOWED: 'env',
  };
  const loaded = loadDopplerSecrets();
  expect(
    loaded === 1 && process.env.FROM_BLOB === 'blob' && process.env.SHADOWED === 'env',
    'load-doppler-secrets: the blob must fill missing keys without overriding the environment',
  );
  process.env = original;
}

function requiredEnvKeys() {
  const entries = [];
  for (const line of read('config/env.ts').split('\n')) {
    const key = line.match(/^ {2}([A-Z][A-Z0-9_]*):\s*z\./)?.[1];
    if (key) entries.push({ key, text: '' });
    if (entries.length) entries.at(-1).text += line;
  }
  return entries
    .filter(({ text }) => !text.includes('.optional(') && !text.includes('.default('))
    .map(({ key }) => key);
}

function exampleEnv() {
  const pairs = read('.env.example')
    .split('\n')
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]);
  return Object.fromEntries(pairs);
}

function checkExampleEnv(required, example) {
  const missing = required.filter((key) => !(key in example));
  expect(
    missing.length === 0,
    `.env.example: missing ${missing.join(', ')}. Every required variable in config/env.ts goes here, and into Doppler before the first deploy`,
  );
}

async function waitForResponse(url, server, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  server.once('exit', () => {
    exited = true;
  });
  while (Date.now() < deadline && !exited) {
    try {
      return await fetch(url, { redirect: 'manual' });
    } catch {
      await sleep(250);
    }
  }
  return null;
}

async function checkBoot(required, example) {
  if (!existsSync('.next/standalone/server.js')) {
    expect(false, 'boot: run `bun run build` first, the check boots the standalone output');
    return;
  }
  // Same layout the Dockerfile assembles.
  cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
  cpSync('public', '.next/standalone/public', { recursive: true });
  cpSync('scripts', '.next/standalone/scripts', { recursive: true });

  const secrets = Object.fromEntries(
    required.map((key) => [key, example[key] || randomBytes(32).toString('hex')]),
  );
  const port = 3999;
  const server = spawn(process.execPath, ['scripts/start.mjs'], {
    cwd: '.next/standalone',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DOPPLER_SECRETS: JSON.stringify(secrets),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));

  const response = await waitForResponse(`http://127.0.0.1:${port}${PROBE_PATH}`, server, 20_000);
  server.kill();
  expect(
    response !== null && response.status < 500,
    `boot: with only DOPPLER_SECRETS (${Object.keys(secrets).join(', ')}) GET ${PROBE_PATH} ${response ? `answered ${response.status}` : 'never answered'}\n${output.trim()}`,
  );
}

checkWiring();
checkDopplerExpansion();
const required = requiredEnvKeys();
const example = exampleEnv();
checkExampleEnv(required, example);
await checkBoot(required, example);

if (failures.length) {
  console.error(failures.map((message) => `✗ ${message}`).join('\n\n'));
  process.exit(1);
}
console.log(`✓ deploy contract ok (required env: ${required.join(', ')})`);

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright';
import { env } from '../config/env';

async function run(): Promise<void> {
  const loginUrl = env.REGCHECK_WEB_LOGIN_URL ?? 'https://app.regcheq.com/login';
  const storageStatePath = env.REGCHECK_WEB_STORAGE_STATE_PATH ?? '.cache/regcheck-storage-state.json';

  console.log(`Abriendo Regcheq en modo visual: ${loginUrl}`);
  console.log('Inicia sesion manualmente en esa ventana.');
  console.log('Cuando veas el home (cantidad de fichas), vuelve aca y presiona Enter.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    const rl = readline.createInterface({ input, output });
    await rl.question('Presiona Enter para guardar la sesion... ');
    rl.close();

    await mkdir(dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
    console.log(`Sesion guardada en: ${storageStatePath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

void run().catch((error) => {
  console.error('No fue posible guardar sesion de Regcheq:', error);
  process.exit(1);
});

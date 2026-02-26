import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { env } from '~/config/env';

type WebTaxLookupResult = {
  taxStartDate: string | null
  details: Record<string, unknown>
};

function sanitizeRut(value: string): string {
  return value.replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
}

function formatRut(value: string): string {
  const clean = sanitizeRut(value);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

function toIsoDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const dm = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!dm) return null;

  const day = dm[1].padStart(2, '0');
  const month = dm[2].padStart(2, '0');
  const yearRaw = dm[3];
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `${year}-${month}-${day}`;
}

function extractTaxStartDateFromText(content: string): string | null {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const idx = lines.findIndex((line) => /fecha\s+(de\s+)?inicio\s+(de\s+)?actividades/i.test(line));
  if (idx >= 0) {
    for (let i = idx + 1; i < Math.min(lines.length, idx + 5); i += 1) {
      const parsed = toIsoDate(lines[i]);
      if (parsed) return parsed;
    }
  }

  const inline = content.match(/fecha\s+(de\s+)?inicio\s+(de\s+)?actividades[^0-9]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (inline?.[3]) return toIsoDate(inline[3]);
  const inlineLegacy = content.match(/fecha\s+inicio\s+actividades[^0-9]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (inlineLegacy?.[1]) return toIsoDate(inlineLegacy[1]);

  return null;
}

async function firstAvailableLocator(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count > 0) return locator;
  }
  return null;
}

async function hasFichasEntry(page: Page): Promise<boolean> {
  const fichasEntry = page.getByText(/cantidad de fichas|fichas/i).first();
  return (await fichasEntry.count()) > 0;
}

async function saveStorageState(context: BrowserContext, storageStatePath: string): Promise<void> {
  await mkdir(dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
}

async function openRecordFromCantidadFichasPath(
  page: Page,
  origin: string,
  rut: string,
  sanitizedRut: string,
): Promise<boolean> {
  await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 });

  const cantidadFichasCard = page.getByText(/cantidad\s+fichas/i).first();
  if ((await cantidadFichasCard.count()) === 0) return false;

  await cantidadFichasCard.click({ timeout: 20_000 });
  await page.waitForTimeout(1200);

  const searchInput = await firstAvailableLocator(page, [
    'input[placeholder*="buscar" i]',
    'input[placeholder*="filtrar" i]',
    'input.VueTables__search__input',
    'input[type="search"]',
  ]);
  if (!searchInput) return false;

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await searchInput.fill('');
    await searchInput.fill(rut);
    await searchInput.press('Enter');
    await page.waitForTimeout(1200);

    const targetRowByFormatted = page.locator('tr', { hasText: rut }).first();
    const targetRowBySanitized = page.locator('tr', { hasText: sanitizedRut }).first();
    const formattedCount = await targetRowByFormatted.count();
    const sanitizedCount = await targetRowBySanitized.count();
    const targetRow = formattedCount > 0 ? targetRowByFormatted : targetRowBySanitized;

    if (formattedCount > 0 || sanitizedCount > 0) {
      const viewFichaLink = targetRow.getByText(/ver ficha/i).first();
      if ((await viewFichaLink.count()) > 0) {
        await viewFichaLink.click({ timeout: 20_000 });
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
        await page.waitForTimeout(800);
        if (/\/home\/records\/.+\/historial/i.test(page.url())) {
          return true;
        }
      }
    }

    if (attempt < maxAttempts - 1) await page.waitForTimeout(1500);
  }

  return false;
}

export async function fetchTaxStartDateFromRegcheckWeb(companyRut: string): Promise<WebTaxLookupResult> {
  if (!env.REGCHECK_WEB_USER || !env.REGCHECK_WEB_PASSWORD) {
    return {
      taxStartDate: null,
      details: { status: 'not_configured' },
    };
  }

  const loginUrl = env.REGCHECK_WEB_LOGIN_URL ?? 'https://app.regcheq.com/login';
  const origin = new URL(loginUrl).origin;
  const fichasUrl = `${origin}/home/fichas`;
  const storageStatePath = env.REGCHECK_WEB_STORAGE_STATE_PATH?.trim() || '.cache/regcheck-storage-state.json';
  const rut = formatRut(companyRut);
  const sanitizedRut = sanitizeRut(companyRut);
  const headless = env.REGCHECK_WEB_HEADLESS !== 'false';

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(
    existsSync(storageStatePath) ? { storageState: storageStatePath } : undefined,
  );
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    if (!(await hasFichasEntry(page))) {
      const emailInput = await firstAvailableLocator(page, [
        'input[placeholder*="usuario@regcheq.com" i]',
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="mail" i]',
        'input[placeholder*="usuario" i]',
      ]);
      const passwordInput = await firstAvailableLocator(page, [
        'input[type="password"]',
        'input[name="password"]',
        'input[placeholder*="contrase" i]',
        'input[placeholder*="password" i]',
      ]);
      if (!emailInput || !passwordInput) {
        return {
          taxStartDate: null,
          details: {
            status: 'login_fields_not_found',
            rut,
            sanitizedRut,
            currentUrl: page.url(),
          },
        };
      }
      await emailInput.fill(env.REGCHECK_WEB_USER);
      await passwordInput.fill(env.REGCHECK_WEB_PASSWORD);

      const submitByRole = page.getByRole('button', { name: /iniciar|ingresar|entrar|log in|login/i }).first();
      const submitBySelector = await firstAvailableLocator(page, ['button[type="submit"]', 'button']);
      const submitRoleCount = await submitByRole.count();
      if (submitRoleCount > 0) {
        await submitByRole.click();
      } else if (submitBySelector) {
        await submitBySelector.click();
      } else {
        await passwordInput.press('Enter');
      }

      await page.waitForLoadState('networkidle', { timeout: 30_000 });
      if (!(await hasFichasEntry(page))) {
        return {
          taxStartDate: null,
          details: {
            status: 'fichas_entry_not_found_after_login',
            rut,
            sanitizedRut,
            currentUrl: page.url(),
          },
        };
      }

      await saveStorageState(context, storageStatePath);
    }

    let openedFicha = await openRecordFromCantidadFichasPath(page, origin, rut, sanitizedRut);
    if (!openedFicha) {
      await page.goto(fichasUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 });

      const searchInput = await firstAvailableLocator(page, [
        'input[placeholder*="buscar" i]',
        'input.VueTables__search__input',
        'input[placeholder*="filtrar" i]',
        'input[placeholder*="filtro" i]',
        'input[type="search"]',
      ]);
      if (!searchInput) {
        return {
          taxStartDate: null,
          details: {
            status: 'search_input_not_found',
            rut,
            sanitizedRut,
            currentUrl: page.url(),
          },
        };
      }

      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await searchInput.fill('');
        await searchInput.fill(rut);
        await searchInput.press('Enter');
        await page.waitForTimeout(1500);

        const targetRowByFormatted = page.locator('tr', { hasText: rut }).first();
        const targetRowBySanitized = page.locator('tr', { hasText: sanitizedRut }).first();

        const formattedCount = await targetRowByFormatted.count();
        const sanitizedCount = await targetRowBySanitized.count();
        const targetRow = formattedCount > 0 ? targetRowByFormatted : targetRowBySanitized;

        if (formattedCount > 0 || sanitizedCount > 0) {
          const recordId = await targetRow
            .locator('input[type="checkbox"]')
            .first()
            .evaluate((element) => {
              const checkbox = element as HTMLInputElement;
              return checkbox.value || checkbox.id || null;
            })
            .catch(() => null);

          if (recordId && typeof recordId === 'string') {
            await page.goto(`${origin}/home/records/${recordId}/historial`, {
              waitUntil: 'domcontentloaded',
              timeout: 30_000,
            });
            await page.waitForLoadState('networkidle', { timeout: 30_000 });
            openedFicha = true;
            break;
          }
        }

        if (attempt < maxAttempts - 1) {
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!openedFicha) {
      return {
        taxStartDate: null,
        details: {
          status: 'record_not_found',
          rut,
          sanitizedRut,
          currentUrl: page.url(),
        },
      };
    }

    const situacionTributaria = page.getByRole('button', { name: /situaci[oó]n tributaria/i }).first();
    await situacionTributaria.click({ timeout: 20_000 });

    let taxStartDate: string | null = null;
    const readAttempts = 3;
    for (let attempt = 0; attempt < readAttempts; attempt += 1) {
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      taxStartDate = extractTaxStartDateFromText(bodyText);
      if (taxStartDate) break;

      // Some records render tax section asynchronously or collapse on first click.
      if (attempt < readAttempts - 1) {
        await situacionTributaria.click({ timeout: 20_000 }).catch(() => undefined);
      }
    }

    return {
      taxStartDate,
      details: {
        status: taxStartDate ? 'ok' : 'missing_date',
        rut,
        sanitizedRut,
      },
    };
  } catch (error) {
    return {
      taxStartDate: null,
      details: {
        status: 'error',
        currentUrl: page.url(),
        message: error instanceof Error ? error.message : 'Unknown web fallback error',
      },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

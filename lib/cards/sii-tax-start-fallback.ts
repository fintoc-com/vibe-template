import { chromium } from 'playwright';

type SiiTaxLookupResult = {
  taxStartDate: string | null
  details: Record<string, unknown>
};

const SII_STC_URL = 'https://www2.sii.cl/stc/noauthz/consulta';

function sanitizeRut(value: string): string {
  return value.replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
}

function formatRut(value: string): string {
  const clean = sanitizeRut(value);
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function toIsoDate(raw: string): string | null {
  const value = raw.trim();
  const dm = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!dm) return null;
  const day = dm[1].padStart(2, '0');
  const month = dm[2].padStart(2, '0');
  const year = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
  return `${year}-${month}-${day}`;
}

function extractTaxStartDate(text: string): string | null {
  const direct = text.match(/fecha\s+de\s+inicio\s+de\s+actividades[^0-9]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i);
  if (direct?.[1]) return toIsoDate(direct[1]);
  const alt = text.match(/fecha\s+inicio\s+actividades[^0-9]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i);
  if (alt?.[1]) return toIsoDate(alt[1]);
  return null;
}

export async function fetchTaxStartDateFromSii(companyRut: string): Promise<SiiTaxLookupResult> {
  const rut = formatRut(companyRut);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(SII_STC_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const bodyAtStart = await page.locator('body').innerText();
    if (/error de comunicaci[oó]n con el servidor/i.test(bodyAtStart)) {
      return {
        taxStartDate: null,
        details: { status: 'sii_server_communication_error' },
      };
    }

    const rutInput = page.locator('input[type="text"], input[name*="rut" i], input[placeholder*="rut" i]').first();
    const inputCount = await rutInput.count();
    if (inputCount === 0) {
      return {
        taxStartDate: null,
        details: { status: 'sii_rut_input_not_found' },
      };
    }

    await rutInput.fill(rut);
    const submit = page.getByRole('button', { name: /consultar|buscar/i }).first();
    if ((await submit.count()) > 0) {
      await submit.click();
    } else {
      await rutInput.press('Enter');
    }

    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    const taxStartDate = extractTaxStartDate(body);
    return {
      taxStartDate,
      details: {
        status: taxStartDate ? 'ok' : 'missing_date',
      },
    };
  } catch (error) {
    return {
      taxStartDate: null,
      details: {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown SII fallback error',
      },
    };
  } finally {
    await browser.close();
  }
}

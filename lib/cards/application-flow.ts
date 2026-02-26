import { env } from '~/config/env';
import { fetchTaxStartDateFromRegcheckWeb } from '~/lib/cards/regcheck-web-fallback';
import { fetchTaxStartDateFromSii } from '~/lib/cards/sii-tax-start-fallback';

export type CardApplicationInput = {
  merchantExternalId?: string
  companyName: string
  companyRut: string
  companyAddress: string
  companyCommune: string
  companyWebsiteUrl?: string
  contactEmail: string
  legalRepName: string
  legalRepRut: string
  legalRepBirthDate: string
  mcc?: string
};

export type RegcheckOutcome = {
  status: 'ok' | 'not_configured' | 'error'
  riskLevel: 'low' | 'medium' | 'high' | null
  taxStartDate: string | null
  profileUrl: string | null
  raw: unknown
};

export type ApplicationDecision = {
  decision: 'approved' | 'rejected' | 'pending_rai_approval' | 'manual_review'
  reason: string
  customerMessage: string
};

type RegcheckResponse = {
  risk_level?: string
  tax_start_date?: string
  profile_url?: string
  [key: string]: unknown
};

function normalizeRiskLevel(value: string | undefined): 'low' | 'medium' | 'high' | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim().replace(/\s+risk$/, '');
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }

  return null;
}

function monthsSince(dateString: string): number | null {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const years = now.getUTCFullYear() - parsed.getUTCFullYear();
  const months = now.getUTCMonth() - parsed.getUTCMonth();
  return years * 12 + months;
}

function sanitizeRut(value: string): string {
  return value.replace(/\./g, '').replace(/-/g, '').trim();
}

function getValueByPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getFirstString(source: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getValueByPath(source, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function buildRegcheckUrls(input: CardApplicationInput): { consultUrl: string, upsertUrl: string } {
  const base = env.REGCHECK_BASE_URL!.replace(/\/+$/, '');
  const apiKey = env.REGCHECK_API_KEY!;
  const checkPath = env.REGCHECK_CHECK_PATH?.trim();
  const dni = sanitizeRut(input.companyRut);

  const origin = new URL(base).origin;
  const consultUrl = `${origin}/record/${dni}/${apiKey}`;

  if (checkPath) {
    const resolvedPath = checkPath.includes('{API_KEY}') ? checkPath.replaceAll('{API_KEY}', apiKey) : checkPath;
    const upsertUrl = resolvedPath.startsWith('http') ? resolvedPath : `${origin}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
    return { consultUrl, upsertUrl };
  }

  if (/\/record\/[^/]+$/i.test(base)) {
    return { consultUrl, upsertUrl: base };
  }

  return { consultUrl, upsertUrl: `${origin}/record/${apiKey}` };
}

function buildConsultUrl(identifier: string): string {
  const base = env.REGCHECK_BASE_URL!.replace(/\/+$/, '');
  const apiKey = env.REGCHECK_API_KEY!;
  const origin = new URL(base).origin;
  return `${origin}/record/${sanitizeRut(identifier)}/${apiKey}`;
}

function mapRegcheckData(raw: unknown): {
  riskLevel: 'low' | 'medium' | 'high' | null
  taxStartDate: string | null
  profileUrl: string | null
} {
  const risk = getFirstString(raw, [
    ['effectiveRisk'],
    ['calculatedRisk'],
    ['situacionTributaria', 'riesgo'],
    ['risk_level'],
    ['riskLevel'],
    ['risk', 'level'],
    ['risk', 'name'],
    ['data', 'risk_level'],
    ['data', 'riskLevel'],
    ['data', 'risk', 'level'],
    ['result', 'risk_level'],
  ]);
  const taxStartDate = getFirstString(raw, [
    ['situacionTributaria', 'fecha_inicio_actividades'],
    ['situacionTributaria', 'fechaInicioActividades'],
    ['Activities', '0', 'Date'],
    ['tax_start_date'],
    ['taxStartDate'],
    ['tax', 'start_date'],
    ['tax', 'startDate'],
    ['data', 'tax_start_date'],
    ['data', 'taxStartDate'],
    ['data', 'tax', 'start_date'],
    ['result', 'tax_start_date'],
  ]);
  const profileUrl = getFirstString(raw, [
    ['profile_url'],
    ['profileUrl'],
    ['url'],
    ['record_url'],
    ['ficha_url'],
    ['data', 'profile_url'],
    ['data', 'url'],
    ['result', 'profile_url'],
  ]);

  return {
    riskLevel: normalizeRiskLevel(risk ?? undefined),
    taxStartDate,
    profileUrl,
  };
}

function getRelatedCompanyRut(raw: unknown): string | null {
  return getFirstString(raw, [
    ['business_rut'],
    ['empresa_rut'],
    ['company', 'rut'],
    ['data', 'business_rut'],
  ]);
}

const MANUAL_REVIEW_MESSAGE = 'Estamos validando tus datos. Te contactaremos apenas terminemos la revision.';
const REGCHECK_POST_CREATE_WAIT_MS = 4000;
const REGCHECK_CONSULT_ATTEMPTS = 5;
const REGCHECK_CONSULT_RETRY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRecordByIdentifier(identifier: string): Promise<RegcheckResponse | null> {
  const response = await fetch(buildConsultUrl(identifier), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as RegcheckResponse;
}

async function upsertBusinessRecord(input: CardApplicationInput): Promise<RegcheckResponse | null> {
  const { upsertUrl } = buildRegcheckUrls(input);
  const response = await fetch(upsertUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      dni: sanitizeRut(input.companyRut),
      personType: 'legal',
      country: 'Chile',
      document: 'RUT',
      dniType: {
        person: 'legal',
        country: 'Chile',
        document: 'RUT',
      },
      business_name: input.companyName,
      business_rut: sanitizeRut(input.companyRut),
      email: input.contactEmail,
      address: input.companyAddress,
      commune: input.companyCommune,
    }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as RegcheckResponse;
}

export async function runRegcheck(input: CardApplicationInput): Promise<RegcheckOutcome> {
  if (!env.REGCHECK_BASE_URL || !env.REGCHECK_API_KEY) {
    return {
      status: 'not_configured',
      riskLevel: null,
      taxStartDate: null,
      profileUrl: null,
      raw: null,
    };
  }

  try {
    const legalRepRaw = await fetchRecordByIdentifier(input.legalRepRut);
    let companyRaw: RegcheckResponse | null = null;

    // Follow Regcheq recommended flow: create/update first, then consult.
    const upsertedCompanyRaw = await upsertBusinessRecord(input);

    await sleep(REGCHECK_POST_CREATE_WAIT_MS);
    for (let attempt = 0; attempt < REGCHECK_CONSULT_ATTEMPTS; attempt += 1) {
      const refreshed = await fetchRecordByIdentifier(input.companyRut);
      if (refreshed) {
        companyRaw = refreshed;
      }

      if (companyRaw && mapRegcheckData(companyRaw).taxStartDate) {
        break;
      }

      if (attempt < REGCHECK_CONSULT_ATTEMPTS - 1) {
        await sleep(REGCHECK_CONSULT_RETRY_MS);
      }
    }

    if (!companyRaw && legalRepRaw) {
      const relatedCompanyRut = getRelatedCompanyRut(legalRepRaw);
      if (relatedCompanyRut) {
        companyRaw = await fetchRecordByIdentifier(relatedCompanyRut);
      }
    }

    if (!companyRaw) {
      companyRaw = upsertedCompanyRaw;
    }

    // Tax start date is fetched from Regcheq web view after create/update + wait.
    // Keep API date as fallback only if web scraping is unavailable.
    const webResult = await fetchTaxStartDateFromRegcheckWeb(input.companyRut);
    const webTaxStartDate = webResult.taxStartDate;
    const webFallbackDetails = webResult.details;
    const siiResult = webTaxStartDate ? null : await fetchTaxStartDateFromSii(input.companyRut);
    const siiTaxStartDate = siiResult?.taxStartDate ?? null;
    const siiFallbackDetails = siiResult?.details ?? null;

    if (companyRaw || legalRepRaw) {
      const companyMapped = companyRaw ? mapRegcheckData(companyRaw) : null;
      const legalRepMapped = legalRepRaw ? mapRegcheckData(legalRepRaw) : null;
      return {
        status: 'ok',
        riskLevel: companyMapped?.riskLevel ?? legalRepMapped?.riskLevel ?? null,
        taxStartDate: webTaxStartDate ?? siiTaxStartDate ?? companyMapped?.taxStartDate ?? legalRepMapped?.taxStartDate ?? null,
        profileUrl: companyMapped?.profileUrl ?? legalRepMapped?.profileUrl ?? null,
        raw: {
          company: companyRaw,
          legalRepresentative: legalRepRaw,
          upsertCompany: upsertedCompanyRaw,
          webTaxFallback: webFallbackDetails,
          siiTaxFallback: siiFallbackDetails,
        },
      };
    }
    return {
      status: 'error',
      riskLevel: null,
      taxStartDate: null,
      profileUrl: null,
      raw: {
        message: 'No fue posible crear ni consultar ficha en Regcheq',
        legalRepresentative: legalRepRaw,
        upsertCompany: upsertedCompanyRaw,
        webTaxFallback: webFallbackDetails,
        siiTaxFallback: siiFallbackDetails,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      riskLevel: null,
      taxStartDate: null,
      profileUrl: null,
      raw: {
        message: error instanceof Error ? error.message : 'Unknown Regcheck error',
      },
    };
  }
}

export function decideApplication(_input: CardApplicationInput, regcheck: RegcheckOutcome): ApplicationDecision {
  if (regcheck.status !== 'ok') {
    return {
      decision: 'manual_review',
      reason: 'Regcheck no disponible o sin configurar',
      customerMessage: MANUAL_REVIEW_MESSAGE,
    };
  }

  if (regcheck.riskLevel === 'high') {
    return {
      decision: 'pending_rai_approval',
      reason: 'Riesgo alto en Regcheck, requiere aprobacion de Rai',
      customerMessage: 'Tu solicitud esta en revision. Te avisaremos el resultado muy pronto.',
    };
  }

  if (regcheck.riskLevel !== 'low') {
    return {
      decision: 'manual_review',
      reason: 'Riesgo no concluyente para aprobacion automatica: requiere revision manual',
      customerMessage: MANUAL_REVIEW_MESSAGE,
    };
  }

  if (!regcheck.taxStartDate) {
    return {
      decision: 'manual_review',
      reason: 'No fue posible obtener fecha de inicio de actividades en la ficha de negocio en Regcheck',
      customerMessage: MANUAL_REVIEW_MESSAGE,
    };
  }

  const companyAgeInMonths = monthsSince(regcheck.taxStartDate);
  if (companyAgeInMonths === null) {
    return {
      decision: 'manual_review',
      reason: 'Fecha de inicio de actividades invalida',
      customerMessage: MANUAL_REVIEW_MESSAGE,
    };
  }

  if (companyAgeInMonths < 6) {
    return {
      decision: 'manual_review',
      reason: 'Inicio de actividades menor a 6 meses: requiere revision manual',
      customerMessage: MANUAL_REVIEW_MESSAGE,
    };
  }

  return {
    decision: 'approved',
    reason: 'Riesgo bajo e inicio de actividades mayor o igual a 6 meses',
    customerMessage: 'Tu solicitud fue recibida y ya estamos continuando con la activacion.',
  };
}

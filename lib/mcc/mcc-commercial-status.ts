import { env } from '~/config/env';

type TableRow = Record<string, unknown>;
const CLP_PER_USD_REFERENCE = 900;

export type MccCommercialStatus = {
  cotizado: boolean
  anexado: boolean
  costs: [string, string, string]
  ticketAverageUsd: string
};

export type MccCommercialAction
  = | 'none'
    | 'await_annex_confirmation'
    | 'await_revalidation'
    | 'await_mcc_confirmation'
    | 'await_supabase_retry';

export type MccCommercialMessageResult = {
  text: string
  requiresKushkiApproval: boolean
  status: MccCommercialStatus
  normalizedMcc: string | null
  action: MccCommercialAction
};

function normalizeMcc(mcc: string | null | undefined): string | null {
  if (!mcc) return null;
  const normalized = mcc.replace(/\D/g, '').slice(0, 4);
  return normalized.length === 4 ? normalized : null;
}

function parseCostColumns(): [string, string, string] {
  const values = (env.SUPABASE_MCC_COST_COLUMNS ?? 'XXX,YYY,ZZZ')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // Normalize by semantic name when present, regardless of configured order.
  const credito = values.find((item) => item.toLowerCase().includes('credito'));
  const debito = values.find((item) => item.toLowerCase().includes('debito'));
  const prepago = values.find((item) => item.toLowerCase().includes('prepago'));
  if (credito && debito && prepago) {
    return [credito, debito, prepago];
  }

  if (values.length >= 3) {
    return [values[0]!, values[1]!, values[2]!];
  }

  return ['costo_credito', 'costo_debito', 'costo_prepago'];
}

function toPrintableCost(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const percent = value * 100;
    return `${percent.toFixed(4).replace(/\.?0+$/, '')}%`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 'n/a';
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return trimmed;
    const percent = numeric * 100;
    return `${percent.toFixed(4).replace(/\.?0+$/, '')}%`;
  }
  return 'n/a';
}

function toPrintableUsd(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `USD ${value.toFixed(2).replace(/\.?0+$/, '')}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 'n/a';
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return `USD ${trimmed}`;
    return `USD ${numeric.toFixed(2).replace(/\.?0+$/, '')}`;
  }
  return 'n/a';
}

async function fetchFirstByMcc(table: string, mcc: string): Promise<TableRow | null> {
  const baseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;
  const mccColumn = env.SUPABASE_MCC_COLUMN ?? 'mcc';

  if (!baseUrl || !serviceKey) {
    return null;
  }

  const url = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  url.searchParams.set(mccColumn, `eq.${mcc}`);
  url.searchParams.set('limit', '1');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase query failed (${table}): ${response.status} ${text}`);
  }

  const rows = await response.json() as unknown;
  if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0] !== 'object' || !rows[0]) {
    return null;
  }

  return rows[0] as TableRow;
}

async function fetchRowsByMcc(table: string, mcc: string): Promise<TableRow[]> {
  const baseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;
  const mccColumn = env.SUPABASE_MCC_COLUMN ?? 'mcc';

  if (!baseUrl || !serviceKey) {
    return [];
  }

  const url = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  url.searchParams.set(mccColumn, `eq.${mcc}`);
  url.searchParams.set('limit', '200');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase query failed (${table}): ${response.status} ${text}`);
  }

  const rows = await response.json() as unknown;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter((row) => typeof row === 'object' && row !== null) as TableRow[];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function pickClosestCostRow(rows: TableRow[], averageTicketClp?: number | null): TableRow | null {
  if (rows.length === 0) return null;
  if (!averageTicketClp || averageTicketClp <= 0) return rows[0] ?? null;

  const targetUsd = averageTicketClp / CLP_PER_USD_REFERENCE;
  let best: TableRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const ticketUsd = toNumber(row.ticket_promedio_usd);
    if (ticketUsd === null) continue;
    const distance = Math.abs(ticketUsd - targetUsd);
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }

  return best ?? rows[0] ?? null;
}

export async function getMccCommercialStatus(
  mcc: string | null | undefined,
  averageTicketClp?: number | null,
): Promise<MccCommercialStatus> {
  const normalizedMcc = normalizeMcc(mcc);
  const [xCol, yCol, zCol] = parseCostColumns();

  if (!normalizedMcc) {
    return {
      cotizado: false,
      anexado: false,
      costs: ['n/a', 'n/a', 'n/a'],
      ticketAverageUsd: 'n/a',
    };
  }

  const costsRows = await fetchRowsByMcc(env.SUPABASE_MCC_COSTS_TABLE ?? 'costos_mcc', normalizedMcc);
  const costsRow = pickClosestCostRow(costsRows, averageTicketClp);
  const annexedRow = await fetchFirstByMcc(env.SUPABASE_MCC_ANNEXED_TABLE ?? 'mcc_anexados_firmados', normalizedMcc);
  const costs: [string, string, string] = costsRow
    ? [
        toPrintableCost(costsRow[xCol]),
        toPrintableCost(costsRow[yCol]),
        toPrintableCost(costsRow[zCol]),
      ]
    : ['n/a', 'n/a', 'n/a'];

  return {
    cotizado: Boolean(costsRow),
    anexado: Boolean(annexedRow),
    costs,
    ticketAverageUsd: costsRow ? toPrintableUsd(costsRow.ticket_promedio_usd) : 'n/a',
  };
}

export async function buildMccCommercialStatusMessage(
  mcc: string | null | undefined,
  antoniaMention: string,
  averageTicketClp?: number | null,
): Promise<string> {
  const result = await buildMccCommercialStatusResult(mcc, antoniaMention, averageTicketClp);
  return result.text;
}

export async function buildMccCommercialStatusResult(
  mcc: string | null | undefined,
  antoniaMention: string,
  averageTicketClp?: number | null,
): Promise<MccCommercialMessageResult> {
  const normalizedMcc = normalizeMcc(mcc);

  if (!normalizedMcc) {
    return {
      text: `MCC no informado. ${antoniaMention} responde con un MCC de 4 digitos para re-revisar (o :x: para rechazar).`,
      requiresKushkiApproval: true,
      status: {
        cotizado: false,
        anexado: false,
        costs: ['n/a', 'n/a', 'n/a'],
        ticketAverageUsd: 'n/a',
      },
      normalizedMcc: null,
      action: 'await_mcc_confirmation',
    };
  }

  let status: MccCommercialStatus;
  try {
    status = await getMccCommercialStatus(normalizedMcc, averageTicketClp);
  } catch (error) {
    console.error('Failed to resolve MCC commercial status:', error);
    return {
      text: `MCC ${normalizedMcc}: Supabase no disponible para validar cotizacion/anexo. Cuando este listo, ${antoniaMention} reacciona con :white_check_mark: para re-validar (o :x: para rechazar).`,
      requiresKushkiApproval: true,
      status: {
        cotizado: false,
        anexado: false,
        costs: ['n/a', 'n/a', 'n/a'],
        ticketAverageUsd: 'n/a',
      },
      normalizedMcc,
      action: 'await_supabase_retry',
    };
  }

  if (status.cotizado && status.anexado) {
    return {
      text: `MCC ${normalizedMcc} ya cotizado en Kushki (credito ${status.costs[0]}, debito ${status.costs[1]}, prepago ${status.costs[2]}), ticket promedio Supabase ${status.ticketAverageUsd}, y anexado. Continua el proceso.`,
      requiresKushkiApproval: false,
      status,
      normalizedMcc,
      action: 'none',
    };
  }

  if (status.cotizado && !status.anexado) {
    return {
      text: `MCC ${normalizedMcc} ya cotizado en Kushki (credito ${status.costs[0]}, debito ${status.costs[1]}, prepago ${status.costs[2]}), ticket promedio Supabase ${status.ticketAverageUsd}, pero no anexado. ${antoniaMention} confirma con :white_check_mark: o responde "Anexado" para re-validar; tambien puede enviar un MCC (4 digitos) para probar otro. Con :x: o "Rechazado" se termina.`,
      requiresKushkiApproval: true,
      status,
      normalizedMcc,
      action: 'await_annex_confirmation',
    };
  }

  const warningSuffix = status.anexado ? ' (inconsistencia: aparece anexado sin cotizacion)' : '';
  return {
    text: `MCC ${normalizedMcc} no cotizado con Kushki${warningSuffix}. Cuando este actualizado en Supabase, ${antoniaMention} reacciona con :white_check_mark: para re-validar; tambien puede enviar un MCC (4 digitos). Con :x: se rechaza.`,
    requiresKushkiApproval: true,
    status,
    normalizedMcc,
    action: 'await_revalidation',
  };
}

const FINT0C_RATE_PERCENT = 2.69;
const SHOPIFY_RATE_PERCENT = 0.35;
const THREEDS_FIXED_CLP = 50;

type PaymentMethod = 'Tarjeta Credito' | 'Tarjeta Debito' | 'Tarjeta Prepago';

type ProfitabilityRow = {
  method: PaymentMethod
  kushkiRatePercent: number
  effectiveCommissionPercent: number
  freeCommissionForFintocPercent: number
  marginPercent: number
  rentable: boolean
};

export type ProfitabilityAssessment = {
  text: string
  rentable: boolean
  rows: ProfitabilityRow[]
};

function parsePercent(value: string): number | null {
  const numeric = Number(value.replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function toClp(value: number): string {
  return new Intl.NumberFormat('es-CL').format(Math.round(value));
}

export function buildProfitabilityAssessment(input: {
  averageTicketClp: number | null | undefined
  monthlyTransactions: number | null | undefined
  costs: [string, string, string]
}): ProfitabilityAssessment | null {
  const ticket = input.averageTicketClp ?? null;
  if (!ticket || ticket <= 0) return null;

  const parsed = input.costs.map(parsePercent);
  if (parsed.some((value) => value === null)) return null;

  const threedPercent = (THREEDS_FIXED_CLP / ticket) * 100;
  const methods: PaymentMethod[] = ['Tarjeta Credito', 'Tarjeta Debito', 'Tarjeta Prepago'];
  const rows: ProfitabilityRow[] = methods.map((method, index) => {
    const kushkiRatePercent = parsed[index]!;
    const effectiveCommissionPercent = kushkiRatePercent + SHOPIFY_RATE_PERCENT + threedPercent;
    const freeCommissionForFintocPercent = FINT0C_RATE_PERCENT - effectiveCommissionPercent;
    const marginPercent = effectiveCommissionPercent > 0
      ? (freeCommissionForFintocPercent / effectiveCommissionPercent) * 100
      : 0;
    return {
      method,
      kushkiRatePercent: roundTwo(kushkiRatePercent),
      effectiveCommissionPercent: roundTwo(effectiveCommissionPercent),
      freeCommissionForFintocPercent: roundTwo(freeCommissionForFintocPercent),
      marginPercent: roundTwo(marginPercent),
      rentable: freeCommissionForFintocPercent > 0,
    };
  });
  const rentable = rows.every((row) => row.rentable);

  const header = [
    ':bar_chart: Analisis rentabilidad',
    `Ticket promedio: $ ${toClp(ticket)} CLP`,
    input.monthlyTransactions && input.monthlyTransactions > 0
      ? `Transacciones mensuales: ${toClp(input.monthlyTransactions)}`
      : 'Transacciones mensuales: n/a',
    `Comision Fintoc: ${FINT0C_RATE_PERCENT}%`,
    `Adicionales: Shopify ${SHOPIFY_RATE_PERCENT}% + 3DS $ ${THREEDS_FIXED_CLP} (equivale a ${roundTwo(threedPercent)}%)`,
  ];

  const body = rows.map((row) => {
    const rentableLabel = row.rentable ? 'rentable' : 'no rentable';
    return `• ${row.method}: comision ${row.effectiveCommissionPercent}% | comision libre Fintoc ${row.freeCommissionForFintocPercent}% | margen ${row.marginPercent}% (${rentableLabel})`;
  });

  return {
    text: [...header, ...body].join('\n'),
    rentable,
    rows,
  };
}

export function buildProfitabilitySlackMessage(input: {
  averageTicketClp: number | null | undefined
  monthlyTransactions: number | null | undefined
  costs: [string, string, string]
}): string | null {
  const assessment = buildProfitabilityAssessment(input);
  return assessment?.text ?? null;
}

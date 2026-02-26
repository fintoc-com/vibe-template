const MCC_DESCRIPTIONS: Record<string, string> = {
  '5411': 'Tiendas de abarrotes y supermercados',
  '5499': 'Tiendas de alimentos especializados',
  '5541': 'Estaciones de servicio',
  '5732': 'Tiendas de electronica',
  '5812': 'Restaurantes y lugares para comer',
  '5814': 'Comida rapida',
  '5912': 'Farmacias',
  '5999': 'Retail miscelaneo',
  '7011': 'Hoteles y hospedaje',
  '7230': 'Salones de belleza y barberias',
  '7299': 'Servicios personales varios',
  '7372': 'Programacion y servicios informaticos',
  '7399': 'Servicios empresariales varios',
  '7999': 'Servicios recreativos',
};

function normalizeMcc(mcc: string | null | undefined): string | null {
  if (!mcc) return null;
  const normalized = mcc.replace(/\D/g, '').slice(0, 4);
  return normalized.length === 4 ? normalized : null;
}

export function getMccDescription(mcc: string | null | undefined): string | null {
  const normalized = normalizeMcc(mcc);
  if (!normalized) return null;
  return MCC_DESCRIPTIONS[normalized] ?? null;
}

export function formatMccLabel(
  mcc: string | null | undefined,
  preferredDescription?: string | null,
): string {
  const normalized = normalizeMcc(mcc);
  const codeLabel = normalized ?? 'n/a';
  const fallbackDescription = getMccDescription(normalized);
  const description = preferredDescription?.trim() || fallbackDescription;

  if (!description) return codeLabel;
  return `${codeLabel} (${description})`;
}

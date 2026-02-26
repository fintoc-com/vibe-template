function computeVerificationDigit(body: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

export function formatRutInput(rawValue: string): string {
  const cleaned = rawValue.toUpperCase().replace(/[^0-9K]/g, '');
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned;

  const dv = cleaned.slice(-1);
  const body = cleaned.slice(0, -1).replace(/[^0-9]/g, '');
  if (!body) return dv;

  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

export function isValidRut(value: string): boolean {
  const normalized = value.toUpperCase().replace(/[^0-9K]/g, '');
  if (normalized.length < 2) return false;

  const body = normalized.slice(0, -1);
  const dv = normalized.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  return computeVerificationDigit(body) === dv;
}

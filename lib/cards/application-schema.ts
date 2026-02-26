import * as z from 'zod';
import { formatRutInput, isValidRut } from '~/lib/rut';

function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isValidWebsiteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const cardApplicationSchema = z.object({
  companyName: z.string().trim().min(2),
  companyRut: z.string().trim().transform(formatRutInput).refine(isValidRut, {
    message: 'RUT empresa invalido',
  }),
  companyAddress: z.string().trim().min(8),
  companyCommune: z.string().trim().min(2),
  companyWebsiteUrl: z.string().trim().min(1, 'URL ecommerce invalida').transform(normalizeWebsiteUrl).refine(
    isValidWebsiteUrl,
    { message: 'URL ecommerce invalida' },
  ),
  monthlyTransactions: z.string().trim().regex(/^\d+$/, '# transacciones mensuales debe ser un numero entero').refine(
    (value) => Number(value) > 0,
    { message: '# transacciones mensuales debe ser mayor a 0' },
  ),
  averageTicketClp: z.string().trim().regex(/^\d+$/, 'Ticket promedio debe ser un numero entero').refine(
    (value) => Number(value) > 0,
    { message: 'Ticket promedio debe ser mayor a 0' },
  ),
  contactEmail: z.string().trim().email(),
  legalRepName: z.string().trim().min(2),
  legalRepLastName: z.string().trim().min(2),
  legalRepRut: z.string().trim().transform(formatRutInput).refine(isValidRut, {
    message: 'RUT representante invalido',
  }),
  legalRepBirthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  mcc: z.string().trim().regex(/^\d{4}$/, 'MCC debe tener 4 digitos').optional().or(z.literal('')),
});

export type CardApplicationPayload = z.infer<typeof cardApplicationSchema>;

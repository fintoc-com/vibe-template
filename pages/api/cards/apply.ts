import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '~/db';
import { cardApplications } from '~/db/schema';
import { cardApplicationSchema } from '~/lib/cards/application-schema';
import { decideApplication, runRegcheck } from '~/lib/cards/application-flow';
import { runPostApprovalMccCheck } from '~/lib/mcc/post-approval-check';
import { sendRejectionEmail } from '~/lib/notifications/rejection-email';
import { postSlackMessage } from '~/lib/slack/post-message';
import { env } from '~/config/env';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';

const APPLY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const APPLY_RATE_LIMIT_MAX_REQUESTS = 20;
const applyRateLimitStore = new Map<string, { count: number, resetAt: number }>();
const APPLY_IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000;
const inFlightApplyRequests = new Map<string, Promise<ApplyApiResponse>>();

type ApplyApiResponse
  = | {
    ok: true
    applicationId: number
    decision: 'approved' | 'rejected' | 'pending_rai_approval' | 'manual_review'
    customerMessage: string
  }
  | {
    ok: false
    error: string
    details?: unknown
  };

function formatThousands(value: number): string {
  return new Intl.NumberFormat('es-CL').format(Math.round(value));
}

function formatClp(value: number): string {
  return `$ ${formatThousands(value)}`;
}

function toOptional(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getClientKey(req: NextApiRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0]!.trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function checkApplyRateLimit(req: NextApiRequest): boolean {
  const key = getClientKey(req);
  const now = Date.now();
  const current = applyRateLimitStore.get(key);

  if (!current || now >= current.resetAt) {
    applyRateLimitStore.set(key, {
      count: 1,
      resetAt: now + APPLY_RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (current.count >= APPLY_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  current.count += 1;
  applyRateLimitStore.set(key, current);
  return true;
}

function getReviewStatus(decision: 'approved' | 'rejected' | 'pending_rai_approval' | 'manual_review'): string {
  if (decision === 'pending_rai_approval') return 'pending_rai';
  if (decision === 'manual_review') return 'pending_manual';
  return 'not_required';
}

type NormalizedApplyInput = {
  companyName: string
  companyRut: string
  companyAddress: string
  companyCommune: string
  companyWebsiteUrl?: string
  monthlyTransactions: number
  averageTicketClp: number
  contactEmail: string
  legalRepName: string
  legalRepRut: string
  legalRepBirthDate: string
  mcc?: string
};

function buildApplyIdempotencyKey(input: NormalizedApplyInput): string {
  return [
    input.companyRut.trim().toUpperCase(),
    input.contactEmail.trim().toLowerCase(),
    input.legalRepRut.trim().toUpperCase(),
    input.legalRepBirthDate.trim(),
    input.companyName.trim().toLowerCase(),
    input.companyAddress.trim().toLowerCase(),
    input.companyCommune.trim().toLowerCase(),
    (input.companyWebsiteUrl ?? '').trim().toLowerCase(),
    String(input.monthlyTransactions),
    String(input.averageTicketClp),
    (input.mcc ?? '').trim(),
  ].join('|');
}

async function findRecentDuplicate(input: NormalizedApplyInput): Promise<Extract<ApplyApiResponse, { ok: true }> | null> {
  const cutoff = new Date(Date.now() - APPLY_IDEMPOTENCY_WINDOW_MS);
  const [existing] = await db
    .select({
      id: cardApplications.id,
      decision: cardApplications.decision,
      customerMessage: cardApplications.customerMessage,
    })
    .from(cardApplications)
    .where(
      and(
        eq(cardApplications.companyRut, input.companyRut),
        eq(cardApplications.contactEmail, input.contactEmail),
        eq(cardApplications.legalRepRut, input.legalRepRut),
        eq(cardApplications.legalRepBirthDate, input.legalRepBirthDate),
        eq(cardApplications.companyName, input.companyName),
        eq(cardApplications.companyAddress, input.companyAddress),
        eq(cardApplications.companyCommune, input.companyCommune),
        input.companyWebsiteUrl
          ? eq(cardApplications.companyWebsiteUrl, input.companyWebsiteUrl)
          : isNull(cardApplications.companyWebsiteUrl),
        eq(cardApplications.monthlyTransactions, input.monthlyTransactions),
        eq(cardApplications.averageTicketClp, input.averageTicketClp),
        input.mcc
          ? eq(cardApplications.mcc, input.mcc)
          : isNull(cardApplications.mcc),
        gte(cardApplications.createdAt, cutoff),
      ),
    )
    .orderBy(desc(cardApplications.id))
    .limit(1);

  if (!existing) return null;
  return {
    ok: true,
    applicationId: existing.id,
    decision: existing.decision as 'approved' | 'rejected' | 'pending_rai_approval' | 'manual_review',
    customerMessage: existing.customerMessage,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApplyApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!checkApplyRateLimit(req)) {
    return res.status(429).json({
      ok: false,
      error: 'Too many requests. Please wait a few minutes and try again.',
    });
  }

  const parsed = cardApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const payload = parsed.data;
  const normalizedInput: NormalizedApplyInput = {
    ...payload,
    legalRepName: `${payload.legalRepName.trim()} ${payload.legalRepLastName.trim()}`.trim(),
    companyWebsiteUrl: toOptional(payload.companyWebsiteUrl),
    monthlyTransactions: Number(payload.monthlyTransactions),
    averageTicketClp: Number(payload.averageTicketClp),
    mcc: toOptional(payload.mcc),
  };
  const idempotencyKey = buildApplyIdempotencyKey(normalizedInput);

  const existing = await findRecentDuplicate(normalizedInput);
  if (existing) {
    return res.status(200).json(existing);
  }

  const inFlight = inFlightApplyRequests.get(idempotencyKey);
  if (inFlight) {
    const inFlightResult = await inFlight;
    return res.status(inFlightResult.ok ? 200 : 500).json(inFlightResult);
  }

  const processingPromise = (async (): Promise<ApplyApiResponse> => {
    const regcheck = await runRegcheck(normalizedInput);
    const decision = decideApplication(normalizedInput, regcheck);

    const [created] = await db
      .insert(cardApplications)
      .values({
        companyName: normalizedInput.companyName,
        companyRut: normalizedInput.companyRut,
        companyAddress: normalizedInput.companyAddress,
        companyCommune: normalizedInput.companyCommune,
        companyWebsiteUrl: normalizedInput.companyWebsiteUrl,
        monthlyTransactions: normalizedInput.monthlyTransactions,
        averageTicketClp: normalizedInput.averageTicketClp,
        contactEmail: normalizedInput.contactEmail,
        legalRepName: normalizedInput.legalRepName,
        legalRepRut: normalizedInput.legalRepRut,
        legalRepBirthDate: normalizedInput.legalRepBirthDate,
        mcc: normalizedInput.mcc,
        regcheckStatus: regcheck.status,
        regcheckRiskLevel: regcheck.riskLevel,
        regcheckTaxStartDate: regcheck.taxStartDate,
        regcheckProfileUrl: regcheck.profileUrl,
        decision: decision.decision,
        decisionReason: decision.reason,
        customerMessage: decision.customerMessage,
        rawInput: req.body,
        rawRegcheck: regcheck.raw,
        raiApprovalStatus: getReviewStatus(decision.decision),
      })
      .returning({ id: cardApplications.id });

    if (env.SLACK_ALERTS_CHANNEL && env.SLACK_BOT_TOKEN) {
      const raiMention = env.SLACK_RAI_USER_ID ? `<@${env.SLACK_RAI_USER_ID}>` : 'Raimundo Hurtado';
      const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
      const lines = [
        ':credit_card: Nueva solicitud de activacion de tarjetas',
        `Estado: *${decision.decision}*`,
        `Razon: ${decision.reason}`,
        `ID interno: ${created.id}`,
        `Empresa: ${normalizedInput.companyName}`,
        `RUT empresa: ${normalizedInput.companyRut}`,
        `Comuna: ${normalizedInput.companyCommune}`,
        `URL ecommerce: ${normalizedInput.companyWebsiteUrl ?? 'n/a'}`,
        `Transacciones mensuales: ${formatThousands(normalizedInput.monthlyTransactions)}`,
        `Ticket promedio (CLP): ${formatClp(normalizedInput.averageTicketClp)}`,
        `Email contacto: ${normalizedInput.contactEmail}`,
        `Riesgo Regcheck: ${regcheck.riskLevel ?? 'n/a'}`,
        `Inicio actividades: ${regcheck.taxStartDate ?? 'n/a'}`,
        regcheck.profileUrl ? `Ficha Regcheck: ${regcheck.profileUrl}` : 'Ficha Regcheck: n/a',
      ];

      if (decision.decision === 'approved') {
        lines.push(':white_check_mark: Regcheck aprobado');
      }

      if (decision.decision === 'pending_rai_approval') {
        lines.push('');
        lines.push(`${raiMention} por favor reacciona a este mensaje con ✅ para aprobar o ❌ para rechazar.`);
        lines.push('El bot tomara esa reaccion para continuar el flujo.');
      }

      if (decision.decision === 'manual_review') {
        lines.push('');
        lines.push(`${antoniaMention} por favor revisa este caso y reacciona con ✅ para aprobar o ❌ para rechazar.`);
        lines.push('El bot tomara esa reaccion para continuar o detener el flujo.');
      }

      try {
        const posted = await postSlackMessage({
          channel: env.SLACK_ALERTS_CHANNEL,
          text: lines.join('\n'),
        });

        await db
          .update(cardApplications)
          .set({
            slackChannelId: posted.channel,
            slackMessageTs: posted.ts,
          })
          .where(eq(cardApplications.id, created.id));
      } catch (error) {
        console.error('Failed to notify Slack:', error);
      }
    }

    if (decision.decision === 'approved') {
      void runPostApprovalMccCheck(created.id).catch((error) => {
        console.error('Failed to run post-approval MCC check:', error);
      });
    }

    if (decision.decision === 'rejected') {
      void sendRejectionEmail({
        contactEmail: normalizedInput.contactEmail,
        companyName: normalizedInput.companyName,
      }).catch((error) => {
        console.error('Failed to send rejection email:', error);
      });
    }

    return {
      ok: true,
      applicationId: created.id,
      decision: decision.decision,
      customerMessage: decision.customerMessage,
    };
  })()
    .finally(() => {
      inFlightApplyRequests.delete(idempotencyKey);
    });

  inFlightApplyRequests.set(idempotencyKey, processingPromise);
  const result = await processingPromise;
  return res.status(result.ok ? 201 : 500).json(result);
}

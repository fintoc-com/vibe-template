import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { env } from '~/config/env';
import { db } from '~/db';
import { cardApplications } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import { formatMccLabel } from '~/lib/mcc/mcc-descriptions';
import type { MccCommercialAction } from '~/lib/mcc/mcc-commercial-status';
import { buildMccCommercialStatusResult } from '~/lib/mcc/mcc-commercial-status';
import { buildProfitabilityAssessment } from '~/lib/mcc/profitability';
import { runPostApprovalMccCheck } from '~/lib/mcc/post-approval-check';
import { sendRejectionEmail } from '~/lib/notifications/rejection-email';
import { postSlackMessage } from '~/lib/slack/post-message';

const MAX_REQUEST_AGE_SECONDS = 60 * 5;

type SlackUrlVerificationPayload = {
  type: 'url_verification'
  challenge: string
};

type SlackEventCallbackPayload = {
  type: 'event_callback'
  event_id: string
  event: Record<string, unknown>
};

type SlackPayload = SlackUrlVerificationPayload | SlackEventCallbackPayload;
type ParsedTycMessage = {
  companyName: string | null
  merchantId: string | null
  email: string | null
  companyRut: string | null
  address: string | null
  mcc: string | null
  websiteUrl: string | null
  legalRepRut: string | null
  legalRepName: string | null
  legalRepBirthDate: string | null
};
type SlackMessageEvent = {
  type: 'message'
  channel: string
  text?: string
  ts?: string
  thread_ts?: string
  subtype?: string
  bot_id?: string
  user?: string
};

type SlackReactionEvent = {
  type: 'reaction_added'
  user: string
  reaction: string
  item: {
    type: 'message'
    channel: string
    ts: string
  }
};

export const config = {
  api: {
    bodyParser: false,
  },
};

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function isSlackMessageEvent(event: Record<string, unknown>): event is SlackMessageEvent {
  return event.type === 'message' && typeof event.channel === 'string';
}

function isSlackReactionEvent(event: Record<string, unknown>): event is SlackReactionEvent {
  if (event.type !== 'reaction_added' || typeof event.user !== 'string' || typeof event.reaction !== 'string') {
    return false;
  }

  const item = event.item;
  return Boolean(
    item
    && typeof item === 'object'
    && (item as Record<string, unknown>).type === 'message'
    && typeof (item as Record<string, unknown>).channel === 'string'
    && typeof (item as Record<string, unknown>).ts === 'string',
  );
}

function extractField(text: string, regex: RegExp): string | null {
  const value = regex.exec(text)?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseTycMessage(text: string): ParsedTycMessage | null {
  if (!/tyc\s*tarjetas/i.test(text)) {
    return null;
  }

  const companyName = extractField(text, /TyC TARJETAS de\s*(.+)/i)?.replace(/:\S+:\s*$/, '') ?? null;

  return {
    companyName,
    merchantId: extractField(text, /^ID:\s*(.+)$/im),
    email: extractField(text, /^Correo:\s*(.+)$/im),
    companyRut: extractField(text, /^Rut Empresa:\s*(.+)$/im),
    address: extractField(text, /^Direcci[oó]n:\s*(.+)$/im),
    mcc: extractField(text, /^MCC:\s*(.+)$/im),
    websiteUrl: extractField(text, /^URL:\s*(https?:\/\/\S+)/im),
    legalRepRut: extractField(text, /^RUT:\s*(.+)$/im),
    legalRepName: extractField(text, /^Nombre:\s*(.+)$/im),
    legalRepBirthDate: extractField(text, /^Fecha de nacimiento:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/im),
  };
}

function getMissingFields(parsed: ParsedTycMessage): string[] {
  const required: Array<{ label: string, value: string | null }> = [
    { label: 'ID', value: parsed.merchantId },
    { label: 'Correo', value: parsed.email },
    { label: 'Rut Empresa', value: parsed.companyRut },
    { label: 'Direccion', value: parsed.address },
    { label: 'MCC', value: parsed.mcc },
    { label: 'URL', value: parsed.websiteUrl },
    { label: 'Representante legal RUT', value: parsed.legalRepRut },
    { label: 'Representante legal Nombre', value: parsed.legalRepName },
    { label: 'Representante legal Fecha de nacimiento', value: parsed.legalRepBirthDate },
  ];

  return required.filter((item) => !item.value).map((item) => item.label);
}

function buildThreadMessage(parsed: ParsedTycMessage): string {
  const missingFields = getMissingFields(parsed);
  const merchantLabel = parsed.merchantId ? `ID ${parsed.merchantId}` : 'sin ID';

  if (missingFields.length > 0) {
    return [
      `:warning: Recibido caso TyC TARJETAS (${merchantLabel}).`,
      'No puedo iniciar automatizacion porque faltan datos:',
      `• ${missingFields.join('\n• ')}`,
      'Cuando completen esos campos, vuelvan a enviar el mensaje para procesarlo.',
    ].join('\n');
  }

  return [
    `:robot_face: Recibido caso TyC TARJETAS (${merchantLabel}).`,
    'Validacion inicial completada: datos minimos presentes.',
    'Siguiente paso automatico (proximo): crear/consultar ficha en Regcheq y evaluar reglas tributarias + riesgo.',
  ].join('\n');
}

async function postSlackThreadMessage(channel: string, threadTs: string, text: string): Promise<void> {
  await postSlackMessage({ channel, threadTs, text });
}

async function resolveRootThreadTs(channel: string, messageTs: string): Promise<string> {
  if (!env.SLACK_BOT_TOKEN) return messageTs;

  try {
    const url = new URL('https://slack.com/api/conversations.replies');
    url.searchParams.set('channel', channel);
    url.searchParams.set('ts', messageTs);
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
    });
    if (!response.ok) return messageTs;

    const payload = await response.json() as {
      ok?: boolean
      messages?: Array<{ ts?: string, thread_ts?: string }>
    };
    if (!payload.ok) return messageTs;

    const message = payload.messages?.[0];
    if (!message) return messageTs;
    return message.thread_ts ?? message.ts ?? messageTs;
  } catch {
    try {
      const url = new URL('https://slack.com/api/conversations.history');
      url.searchParams.set('channel', channel);
      url.searchParams.set('latest', messageTs);
      url.searchParams.set('oldest', messageTs);
      url.searchParams.set('inclusive', 'true');
      url.searchParams.set('limit', '1');

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
        },
      });
      if (!response.ok) return messageTs;

      const payload = await response.json() as {
        ok?: boolean
        messages?: Array<{ ts?: string, thread_ts?: string }>
      };
      if (!payload.ok) return messageTs;

      const message = payload.messages?.[0];
      if (!message) return messageTs;
      return message.thread_ts ?? message.ts ?? messageTs;
    } catch {
      return messageTs;
    }
  }
}

function normalizeApprovalReaction(reaction: string): 'approved' | 'rejected' | null {
  const approved = new Set(['white_check_mark', 'heavy_check_mark', 'white_check_mark']);
  const rejected = new Set(['x', 'negative_squared_cross_mark', 'xmark']);
  if (approved.has(reaction)) return 'approved';
  if (rejected.has(reaction)) return 'rejected';
  return null;
}

function normalizeMccManualReaction(reaction: string): 'approve_input_mcc' | 'approve_sheldon_mcc' | 'rejected' | null {
  const approveInput = new Set(['one']);
  const approveSheldon = new Set(['two']);
  const rejected = new Set(['x', 'negative_squared_cross_mark', 'xmark']);

  if (approveInput.has(reaction)) return 'approve_input_mcc';
  if (approveSheldon.has(reaction)) return 'approve_sheldon_mcc';
  if (rejected.has(reaction)) return 'rejected';
  return null;
}

function normalizeKushkiMccReaction(reaction: string): 'approved' | 'rejected' | null {
  const approved = new Set(['white_check_mark', 'heavy_check_mark', 'check-green', 'check_green', 'check-greeen']);
  const rejected = new Set(['x', 'negative_squared_cross_mark', 'xmark']);
  if (approved.has(reaction)) return 'approved';
  if (rejected.has(reaction)) return 'rejected';
  return null;
}

function getAdditionalApprovers(): Set<string> {
  const raw = env.SLACK_ADDITIONAL_APPROVER_USER_IDS;
  if (!raw) return new Set();
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  return new Set(ids);
}

function isMccManualReviewReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.includes('Manual review por MCC');
}

function isAuthorizedManualMccReviewer(userId: string): boolean {
  if (env.SLACK_ANTONIA_USER_ID && userId === env.SLACK_ANTONIA_USER_ID) {
    return true;
  }
  return getAdditionalApprovers().has(userId);
}

function shouldEnforceChannelMatch(): boolean {
  if (!env.SLACK_ALERTS_CHANNEL) return false;
  return /^[CGD]/.test(env.SLACK_ALERTS_CHANNEL);
}

function extractMccCommercialState(rawRegcheck: unknown): {
  awaiting: boolean
  action: MccCommercialAction | null
  rawRegcheckObject: Record<string, unknown>
  commercial: Record<string, unknown>
} {
  const rawRegcheckObject = rawRegcheck && typeof rawRegcheck === 'object'
    ? rawRegcheck as Record<string, unknown>
    : {};
  const commercial = rawRegcheckObject.mcc_commercial && typeof rawRegcheckObject.mcc_commercial === 'object'
    ? rawRegcheckObject.mcc_commercial as Record<string, unknown>
    : {};
  const action = typeof commercial.action === 'string' ? commercial.action as MccCommercialAction : null;
  return {
    awaiting: commercial.awaiting_kushki_approval === true,
    action,
    rawRegcheckObject,
    commercial,
  };
}

function extractProfitabilityState(rawRegcheck: unknown): {
  awaiting: boolean
  rawRegcheckObject: Record<string, unknown>
  profitability: Record<string, unknown>
} {
  const rawRegcheckObject = rawRegcheck && typeof rawRegcheck === 'object'
    ? rawRegcheck as Record<string, unknown>
    : {};
  const profitability = rawRegcheckObject.mcc_profitability && typeof rawRegcheckObject.mcc_profitability === 'object'
    ? rawRegcheckObject.mcc_profitability as Record<string, unknown>
    : {};
  return {
    awaiting: profitability.awaiting_profitability_approval === true,
    rawRegcheckObject,
    profitability,
  };
}

function isAuthorizedKushkiReviewer(userId: string): boolean {
  if (env.SLACK_ANTONIA_USER_ID && userId === env.SLACK_ANTONIA_USER_ID) {
    return true;
  }
  return getAdditionalApprovers().has(userId);
}

async function applyKushkiRevalidation(input: {
  application: {
    id: number
    mcc: string | null
    averageTicketClp: number | null
    monthlyTransactions: number | null
  }
  currentRawRegcheck: Record<string, unknown>
  currentCommercial: Record<string, unknown>
  reviewerUserId: string
  reviewerMention: string
  antoniaMention: string
  channel: string
  threadTs: string
  mccOverride?: string
  announceMccUpdate?: boolean
}): Promise<void> {
  const mccToCheck = input.mccOverride ?? input.application.mcc;
  const recheckResult = await buildMccCommercialStatusResult(
    mccToCheck,
    input.antoniaMention,
    input.application.averageTicketClp,
  );
  const requiresManual = recheckResult.action !== 'none';

  const nextRawRegcheck = {
    ...input.currentRawRegcheck,
    mcc_commercial: {
      ...input.currentCommercial,
      mcc: recheckResult.normalizedMcc,
      cotizado: recheckResult.status.cotizado,
      anexado: recheckResult.status.anexado,
      costs: recheckResult.status.costs,
      action: recheckResult.action,
      awaiting_kushki_approval: requiresManual,
      reviewed_by: input.reviewerUserId,
      reviewed_at: new Date().toISOString(),
      review_outcome: requiresManual ? 'pending' : 'approved',
      rechecked_at: new Date().toISOString(),
      rechecked_by: input.reviewerUserId,
    },
  };

  await db
    .update(cardApplications)
    .set({
      mcc: recheckResult.normalizedMcc,
      decision: requiresManual ? 'manual_review' : 'approved',
      decisionReason: requiresManual
        ? `Manual review por Kushki MCC: ${recheckResult.action}`
        : `Aprobado por ${input.reviewerMention} tras re-validacion Kushki MCC`,
      customerMessage: requiresManual
        ? 'Estamos validando tus datos. Te contactaremos apenas terminemos la revision.'
        : 'Tu solicitud fue recibida y ya estamos continuando con la activacion.',
      raiApprovalStatus: requiresManual ? 'pending_manual' : 'approved',
      rawRegcheck: nextRawRegcheck,
      raiReviewedBySlackUserId: input.reviewerUserId,
      raiReviewedAt: new Date(),
    })
    .where(eq(cardApplications.id, input.application.id));

  if (input.announceMccUpdate && recheckResult.normalizedMcc) {
    await postSlackThreadMessage(
      input.channel,
      input.threadTs,
      `:information_source: MCC actualizado a ${recheckResult.normalizedMcc}. Re-evaluando estado comercial.`,
    );
  }

  await postSlackThreadMessage(
    input.channel,
    input.threadTs,
    !requiresManual
      ? `:money_with_wings: Re-check Kushki: ${recheckResult.text}`
      : `:hourglass_flowing_sand: Sigue pendiente: ${recheckResult.text}`,
  );

  if (!requiresManual) {
    const profitabilityAssessment = buildProfitabilityAssessment({
      averageTicketClp: input.application.averageTicketClp,
      monthlyTransactions: input.application.monthlyTransactions,
      costs: recheckResult.status.costs,
    });
    if (profitabilityAssessment) {
      await postSlackThreadMessage(
        input.channel,
        input.threadTs,
        profitabilityAssessment.text,
      );

      if (!profitabilityAssessment.rentable) {
        const nextRawRegcheckWithProfitability = {
          ...nextRawRegcheck,
          mcc_profitability: {
            rentable: false,
            awaiting_profitability_approval: true,
            checked_at: new Date().toISOString(),
            reviewed_by: input.reviewerUserId,
            reviewed_at: new Date().toISOString(),
            review_outcome: 'pending',
          },
        };

        await db
          .update(cardApplications)
          .set({
            decision: 'manual_review',
            decisionReason: 'Manual review por rentabilidad: no rentable',
            customerMessage: 'Estamos validando tus datos. Te contactaremos apenas terminemos la revision.',
            raiApprovalStatus: 'pending_manual',
            rawRegcheck: nextRawRegcheckWithProfitability,
            raiReviewedBySlackUserId: input.reviewerUserId,
            raiReviewedAt: new Date(),
          })
          .where(eq(cardApplications.id, input.application.id));

        await postSlackThreadMessage(
          input.channel,
          input.threadTs,
          `:warning: Rentabilidad no rentable. ${input.antoniaMention} revisa este caso: :white_check_mark: para continuar con estos costos, responde "Re-cotizar" (o un MCC de 4 digitos) para re-evaluar, o :x: / "Rechazado" para terminar.`,
        );
        return;
      }
    }

    await postSlackThreadMessage(
      input.channel,
      input.threadTs,
      `:white_check_mark: aprobado por ${input.reviewerMention} tras re-validacion Kushki, continua el flujo`,
    );
    return;
  }
}

async function processMccManualThreadText(event: SlackMessageEvent): Promise<boolean> {
  if (!event.thread_ts || !event.text || !event.user) {
    return false;
  }

  const trimmed = event.text.trim();
  const match = trimmed.match(/^(\d{4})$/);
  if (!match) {
    return false;
  }

  const mccFromThread = match[1]!;
  const [application] = await db
    .select({
      id: cardApplications.id,
      companyName: cardApplications.companyName,
      contactEmail: cardApplications.contactEmail,
      decision: cardApplications.decision,
      decisionReason: cardApplications.decisionReason,
      raiApprovalStatus: cardApplications.raiApprovalStatus,
      mcc: cardApplications.mcc,
      averageTicketClp: cardApplications.averageTicketClp,
      monthlyTransactions: cardApplications.monthlyTransactions,
      rawRegcheck: cardApplications.rawRegcheck,
      slackChannelId: cardApplications.slackChannelId,
      slackMessageTs: cardApplications.slackMessageTs,
    })
    .from(cardApplications)
    .where(
      and(
        eq(cardApplications.slackChannelId, event.channel),
        eq(cardApplications.slackMessageTs, event.thread_ts),
      ),
    )
    .limit(1);

  if (
    !application
    || application.decision !== 'manual_review'
    || application.raiApprovalStatus !== 'pending_manual'
    || !isMccManualReviewReason(application.decisionReason)
  ) {
    return false;
  }

  if (!isAuthorizedManualMccReviewer(event.user)) {
    return false;
  }

  const reviewerMention = `<@${event.user}>`;
  await db
    .update(cardApplications)
    .set({
      decision: 'approved',
      decisionReason: `Aprobado por ${reviewerMention} mediante mensaje MCC en thread (${mccFromThread})`,
      customerMessage: 'Tu solicitud fue recibida y ya estamos continuando con la activacion.',
      raiApprovalStatus: 'approved',
      mcc: mccFromThread,
      raiReviewedBySlackUserId: event.user,
      raiReviewedAt: new Date(),
    })
    .where(eq(cardApplications.id, application.id));

  await postSlackThreadMessage(
    event.channel,
    event.thread_ts,
    `:white_check_mark: aprobado por ${reviewerMention}, considerado MCC informado (${mccFromThread}) y continua el flujo.`,
  );

  const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
  const commercialState = extractMccCommercialState(application.rawRegcheck);
  await applyKushkiRevalidation({
    application: {
      id: application.id,
      mcc: application.mcc,
      averageTicketClp: application.averageTicketClp,
      monthlyTransactions: application.monthlyTransactions,
    },
    currentRawRegcheck: commercialState.rawRegcheckObject,
    currentCommercial: commercialState.commercial,
    reviewerUserId: event.user,
    reviewerMention,
    antoniaMention,
    channel: event.channel,
    threadTs: event.thread_ts,
    mccOverride: mccFromThread,
  });
  return true;
}

async function processKushkiCommercialThreadText(event: SlackMessageEvent): Promise<boolean> {
  if (!event.thread_ts || !event.text || !event.user) {
    return false;
  }

  const [application] = await db
    .select({
      id: cardApplications.id,
      companyName: cardApplications.companyName,
      contactEmail: cardApplications.contactEmail,
      decision: cardApplications.decision,
      mcc: cardApplications.mcc,
      averageTicketClp: cardApplications.averageTicketClp,
      monthlyTransactions: cardApplications.monthlyTransactions,
      rawRegcheck: cardApplications.rawRegcheck,
      slackChannelId: cardApplications.slackChannelId,
      slackMessageTs: cardApplications.slackMessageTs,
    })
    .from(cardApplications)
    .where(
      and(
        eq(cardApplications.slackChannelId, event.channel),
        eq(cardApplications.slackMessageTs, event.thread_ts),
      ),
    )
    .limit(1);

  if (!application || !isAuthorizedKushkiReviewer(event.user)) {
    return false;
  }

  const commercialState = extractMccCommercialState(application.rawRegcheck);
  if (!commercialState.awaiting) {
    return false;
  }

  const reviewerMention = `<@${event.user}>`;
  const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
  const trimmed = event.text.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === 'rechazado') {
    const nextRawRegcheck = {
      ...commercialState.rawRegcheckObject,
      mcc_commercial: {
        ...commercialState.commercial,
        awaiting_kushki_approval: false,
        reviewed_by: event.user,
        reviewed_at: new Date().toISOString(),
        review_outcome: 'rejected',
      },
    };
    await db
      .update(cardApplications)
      .set({
        decision: 'rejected',
        decisionReason: `Rechazado por ${reviewerMention} en validacion Kushki MCC`,
        customerMessage: 'Tu solicitud no pudo continuar. Nuestro equipo te contactara con los siguientes pasos.',
        raiApprovalStatus: 'rejected',
        rawRegcheck: nextRawRegcheck,
        raiReviewedBySlackUserId: event.user,
        raiReviewedAt: new Date(),
      })
      .where(eq(cardApplications.id, application.id));

    void sendRejectionEmail({
      contactEmail: application.contactEmail,
      companyName: application.companyName,
    }).catch((error) => {
      console.error('Failed to send rejection email:', error);
    });

    await postSlackThreadMessage(
      event.channel,
      event.thread_ts,
      `:x: rechazado por ${reviewerMention} en validacion Kushki MCC, se detiene el flujo`,
    );
    return true;
  }

  if (normalized === 'anexado') {
    await applyKushkiRevalidation({
      application,
      currentRawRegcheck: commercialState.rawRegcheckObject,
      currentCommercial: commercialState.commercial,
      reviewerUserId: event.user,
      reviewerMention,
      antoniaMention,
      channel: event.channel,
      threadTs: event.thread_ts,
    });
    return true;
  }

  if (/^\d{4}$/.test(trimmed)) {
    await applyKushkiRevalidation({
      application,
      currentRawRegcheck: commercialState.rawRegcheckObject,
      currentCommercial: commercialState.commercial,
      reviewerUserId: event.user,
      reviewerMention,
      antoniaMention,
      channel: event.channel,
      threadTs: event.thread_ts,
      mccOverride: trimmed,
      announceMccUpdate: true,
    });
    return true;
  }

  return false;
}

async function processProfitabilityThreadText(event: SlackMessageEvent): Promise<boolean> {
  if (!event.thread_ts || !event.text || !event.user) {
    return false;
  }

  const [application] = await db
    .select({
      id: cardApplications.id,
      companyName: cardApplications.companyName,
      contactEmail: cardApplications.contactEmail,
      decision: cardApplications.decision,
      mcc: cardApplications.mcc,
      averageTicketClp: cardApplications.averageTicketClp,
      monthlyTransactions: cardApplications.monthlyTransactions,
      rawRegcheck: cardApplications.rawRegcheck,
      slackChannelId: cardApplications.slackChannelId,
      slackMessageTs: cardApplications.slackMessageTs,
    })
    .from(cardApplications)
    .where(
      and(
        eq(cardApplications.slackChannelId, event.channel),
        eq(cardApplications.slackMessageTs, event.thread_ts),
      ),
    )
    .limit(1);

  if (!application || !isAuthorizedKushkiReviewer(event.user)) {
    return false;
  }

  const profitabilityState = extractProfitabilityState(application.rawRegcheck);
  if (!profitabilityState.awaiting) {
    return false;
  }

  const reviewerMention = `<@${event.user}>`;
  const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
  const trimmed = event.text.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === 'rechazado') {
    const nextRawRegcheck = {
      ...profitabilityState.rawRegcheckObject,
      mcc_profitability: {
        ...profitabilityState.profitability,
        awaiting_profitability_approval: false,
        reviewed_by: event.user,
        reviewed_at: new Date().toISOString(),
        review_outcome: 'rejected',
      },
    };

    await db
      .update(cardApplications)
      .set({
        decision: 'rejected',
        decisionReason: `Rechazado por ${reviewerMention} por rentabilidad no rentable`,
        customerMessage: 'Tu solicitud no pudo continuar. Nuestro equipo te contactara con los siguientes pasos.',
        raiApprovalStatus: 'rejected',
        rawRegcheck: nextRawRegcheck,
        raiReviewedBySlackUserId: event.user,
        raiReviewedAt: new Date(),
      })
      .where(eq(cardApplications.id, application.id));

    void sendRejectionEmail({
      contactEmail: application.contactEmail,
      companyName: application.companyName,
    }).catch((error) => {
      console.error('Failed to send rejection email:', error);
    });

    await postSlackThreadMessage(
      event.channel,
      event.thread_ts,
      `:x: rechazado por ${reviewerMention} por rentabilidad no rentable, se detiene el flujo`,
    );
    return true;
  }

  if (normalized === 're-cotizar' || normalized === 'recotizar') {
    const commercialState = extractMccCommercialState(application.rawRegcheck);
    await applyKushkiRevalidation({
      application,
      currentRawRegcheck: commercialState.rawRegcheckObject,
      currentCommercial: commercialState.commercial,
      reviewerUserId: event.user,
      reviewerMention,
      antoniaMention,
      channel: event.channel,
      threadTs: event.thread_ts,
    });
    return true;
  }

  if (/^\d{4}$/.test(trimmed)) {
    const commercialState = extractMccCommercialState(application.rawRegcheck);
    await applyKushkiRevalidation({
      application,
      currentRawRegcheck: commercialState.rawRegcheckObject,
      currentCommercial: commercialState.commercial,
      reviewerUserId: event.user,
      reviewerMention,
      antoniaMention,
      channel: event.channel,
      threadTs: event.thread_ts,
      mccOverride: trimmed,
      announceMccUpdate: true,
    });
    return true;
  }

  if (normalized === 'continuar' || normalized === 'aprobar') {
    const nextRawRegcheck = {
      ...profitabilityState.rawRegcheckObject,
      mcc_profitability: {
        ...profitabilityState.profitability,
        awaiting_profitability_approval: false,
        reviewed_by: event.user,
        reviewed_at: new Date().toISOString(),
        review_outcome: 'approved',
      },
    };
    await db
      .update(cardApplications)
      .set({
        decision: 'approved',
        decisionReason: `Aprobado por ${reviewerMention} pese a rentabilidad no rentable`,
        customerMessage: 'Tu solicitud fue recibida y ya estamos continuando con la activacion.',
        raiApprovalStatus: 'approved',
        rawRegcheck: nextRawRegcheck,
        raiReviewedBySlackUserId: event.user,
        raiReviewedAt: new Date(),
      })
      .where(eq(cardApplications.id, application.id));

    await postSlackThreadMessage(
      event.channel,
      event.thread_ts,
      `:white_check_mark: aprobado por ${reviewerMention} pese a rentabilidad no rentable, continua el flujo`,
    );
    return true;
  }

  return false;
}

async function processSlackMessageEvent(event: SlackMessageEvent): Promise<void> {
  console.log('Slack message event received', {
    channel: event.channel,
    subtype: event.subtype ?? null,
    hasUser: Boolean(event.user),
    hasText: Boolean(event.text),
    ts: event.ts ?? null,
    threadTs: event.thread_ts ?? null,
  });

  if (shouldEnforceChannelMatch() && event.channel !== env.SLACK_ALERTS_CHANNEL) {
    console.log('Skipping event: channel does not match SLACK_ALERTS_CHANNEL');
    return;
  }

  if (event.subtype || event.bot_id || !event.user || !event.text || !event.ts) {
    console.log('Skipping event: unsupported subtype/bot/missing text/user/ts');
    return;
  }

  if (await processMccManualThreadText(event)) {
    return;
  }

  if (await processProfitabilityThreadText(event)) {
    return;
  }

  if (await processKushkiCommercialThreadText(event)) {
    return;
  }

  const parsed = parseTycMessage(event.text);
  if (!parsed) {
    console.log('Skipping event: not a TyC TARJETAS message');
    return;
  }

  const threadTs = event.thread_ts ?? event.ts;
  const reply = buildThreadMessage(parsed);
  console.log('Posting automated TyC response', {
    channel: event.channel,
    threadTs,
    hasMissingFields: getMissingFields(parsed).length > 0,
  });
  await postSlackThreadMessage(event.channel, threadTs, reply);
}

async function processSlackReactionEvent(event: SlackReactionEvent): Promise<void> {
  const additionalApprovers = getAdditionalApprovers();
  const outcome = normalizeApprovalReaction(event.reaction);

  const [exactTsApplication] = await db
    .select({
      id: cardApplications.id,
      companyName: cardApplications.companyName,
      contactEmail: cardApplications.contactEmail,
      decision: cardApplications.decision,
      decisionReason: cardApplications.decisionReason,
      raiApprovalStatus: cardApplications.raiApprovalStatus,
      mcc: cardApplications.mcc,
      averageTicketClp: cardApplications.averageTicketClp,
      monthlyTransactions: cardApplications.monthlyTransactions,
      rawRegcheck: cardApplications.rawRegcheck,
      slackChannelId: cardApplications.slackChannelId,
      slackMessageTs: cardApplications.slackMessageTs,
    })
    .from(cardApplications)
    .where(
      and(
        eq(cardApplications.slackChannelId, event.item.channel),
        eq(cardApplications.slackMessageTs, event.item.ts),
      ),
    )
    .limit(1);

  let application = exactTsApplication;
  if (!application) {
    const rootTs = await resolveRootThreadTs(event.item.channel, event.item.ts);
    if (rootTs !== event.item.ts) {
      const [threadRootApplication] = await db
        .select({
          id: cardApplications.id,
          companyName: cardApplications.companyName,
          contactEmail: cardApplications.contactEmail,
          decision: cardApplications.decision,
          decisionReason: cardApplications.decisionReason,
          raiApprovalStatus: cardApplications.raiApprovalStatus,
          mcc: cardApplications.mcc,
          averageTicketClp: cardApplications.averageTicketClp,
          monthlyTransactions: cardApplications.monthlyTransactions,
          rawRegcheck: cardApplications.rawRegcheck,
          slackChannelId: cardApplications.slackChannelId,
          slackMessageTs: cardApplications.slackMessageTs,
        })
        .from(cardApplications)
        .where(
          and(
            eq(cardApplications.slackChannelId, event.item.channel),
            eq(cardApplications.slackMessageTs, rootTs),
          ),
        )
        .limit(1);
      application = threadRootApplication;
    }
  }

  const commercialState = extractMccCommercialState(application?.rawRegcheck);
  const hasPendingKushkiApproval = commercialState.awaiting;
  const kushkiAction = commercialState.action;
  const profitabilityState = extractProfitabilityState(application?.rawRegcheck);
  const hasPendingProfitabilityApproval = profitabilityState.awaiting;

  if (
    !application
    || (
      !hasPendingKushkiApproval
      && !hasPendingProfitabilityApproval
      && (
        !['pending_rai_approval', 'manual_review'].includes(application.decision)
        || !['pending_rai', 'pending_manual'].includes(application.raiApprovalStatus)
      )
    )
  ) {
    return;
  }

  if (hasPendingKushkiApproval) {
    if (!isAuthorizedKushkiReviewer(event.user)) {
      return;
    }

    const kushkiOutcome = normalizeKushkiMccReaction(event.reaction);
    if (!kushkiOutcome) {
      return;
    }

    const reviewerMention = `<@${event.user}>`;
    const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
    const currentRawRegcheck = commercialState.rawRegcheckObject;
    const currentCommercial = commercialState.commercial;
    const nextRawRegcheck = {
      ...currentRawRegcheck,
      mcc_commercial: {
        ...currentCommercial,
        reviewed_by: event.user,
        reviewed_at: new Date().toISOString(),
        review_outcome: kushkiOutcome,
      },
    };

    if (kushkiOutcome === 'approved') {
      if (kushkiAction === 'await_mcc_confirmation') {
        await postSlackThreadMessage(
          event.item.channel,
          event.item.ts,
          `:information_source: Para este caso necesitamos un MCC confirmado (4 digitos) por mensaje en el thread para re-validar.`,
        );
        return;
      }
      await applyKushkiRevalidation({
        application,
        currentRawRegcheck: currentRawRegcheck,
        currentCommercial: currentCommercial,
        reviewerUserId: event.user,
        reviewerMention,
        antoniaMention,
        channel: event.item.channel,
        threadTs: event.item.ts,
      });
      return;
    }

    await db
      .update(cardApplications)
      .set({
        decision: 'rejected',
        decisionReason: `Rechazado por ${reviewerMention} en validacion Kushki MCC`,
        customerMessage: 'Tu solicitud no pudo continuar. Nuestro equipo te contactara con los siguientes pasos.',
        raiApprovalStatus: 'rejected',
        rawRegcheck: {
          ...nextRawRegcheck,
          mcc_commercial: {
            ...(nextRawRegcheck.mcc_commercial as Record<string, unknown>),
            awaiting_kushki_approval: false,
          },
        },
        raiReviewedBySlackUserId: event.user,
        raiReviewedAt: new Date(),
      })
      .where(eq(cardApplications.id, application.id));

    void sendRejectionEmail({
      contactEmail: application.contactEmail,
      companyName: application.companyName,
    }).catch((error) => {
      console.error('Failed to send rejection email:', error);
    });

    await postSlackThreadMessage(
      event.item.channel,
      event.item.ts,
      `:x: rechazado por ${reviewerMention} para MCC no cotizado en Kushki, se detiene el flujo`,
    );
    return;
  }

  if (hasPendingProfitabilityApproval) {
    if (!isAuthorizedKushkiReviewer(event.user)) {
      return;
    }

    const profitabilityOutcome = normalizeKushkiMccReaction(event.reaction);
    if (!profitabilityOutcome) {
      return;
    }

    const reviewerMention = `<@${event.user}>`;
    const nextRawRegcheck = {
      ...profitabilityState.rawRegcheckObject,
      mcc_profitability: {
        ...profitabilityState.profitability,
        awaiting_profitability_approval: false,
        reviewed_by: event.user,
        reviewed_at: new Date().toISOString(),
        review_outcome: profitabilityOutcome,
      },
    };

    if (profitabilityOutcome === 'approved') {
      await db
        .update(cardApplications)
        .set({
          decision: 'approved',
          decisionReason: `Aprobado por ${reviewerMention} pese a rentabilidad no rentable`,
          customerMessage: 'Tu solicitud fue recibida y ya estamos continuando con la activacion.',
          raiApprovalStatus: 'approved',
          rawRegcheck: nextRawRegcheck,
          raiReviewedBySlackUserId: event.user,
          raiReviewedAt: new Date(),
        })
        .where(eq(cardApplications.id, application.id));

      await postSlackThreadMessage(
        event.item.channel,
        event.item.ts,
        `:white_check_mark: aprobado por ${reviewerMention} pese a rentabilidad no rentable, continua el flujo`,
      );
      return;
    }

    await db
      .update(cardApplications)
      .set({
        decision: 'rejected',
        decisionReason: `Rechazado por ${reviewerMention} por rentabilidad no rentable`,
        customerMessage: 'Tu solicitud no pudo continuar. Nuestro equipo te contactara con los siguientes pasos.',
        raiApprovalStatus: 'rejected',
        rawRegcheck: nextRawRegcheck,
        raiReviewedBySlackUserId: event.user,
        raiReviewedAt: new Date(),
      })
      .where(eq(cardApplications.id, application.id));

    void sendRejectionEmail({
      contactEmail: application.contactEmail,
      companyName: application.companyName,
    }).catch((error) => {
      console.error('Failed to send rejection email:', error);
    });

    await postSlackThreadMessage(
      event.item.channel,
      event.item.ts,
      `:x: rechazado por ${reviewerMention} por rentabilidad no rentable, se detiene el flujo`,
    );
    return;
  }

  if (application.raiApprovalStatus === 'pending_rai' && env.SLACK_RAI_USER_ID && event.user !== env.SLACK_RAI_USER_ID) {
    if (!additionalApprovers.has(event.user)) {
      return;
    }
  }

  if (
    application.raiApprovalStatus === 'pending_manual'
    && env.SLACK_ANTONIA_USER_ID
    && event.user !== env.SLACK_ANTONIA_USER_ID
  ) {
    if (!additionalApprovers.has(event.user)) {
      return;
    }
  }

  const isMccManualReview = typeof application.decisionReason === 'string' && application.decisionReason.includes('Manual review por MCC');
  const mccManualOutcome = isMccManualReview ? normalizeMccManualReaction(event.reaction) : null;
  if (!isMccManualReview && !outcome) {
    return;
  }
  if (isMccManualReview && !mccManualOutcome) {
    return;
  }

  const approved = isMccManualReview ? mccManualOutcome !== 'rejected' : outcome === 'approved';
  const decision = approved ? 'approved' : 'rejected';
  const reviewerMention = `<@${event.user}>`;
  const sheldonMcc = (
    application.rawRegcheck
    && typeof application.rawRegcheck === 'object'
    && 'mcc_sheldon' in application.rawRegcheck
    && (application.rawRegcheck as Record<string, unknown>).mcc_sheldon
    && typeof (application.rawRegcheck as Record<string, unknown>).mcc_sheldon === 'object'
    && 'mcc' in ((application.rawRegcheck as Record<string, unknown>).mcc_sheldon as Record<string, unknown>)
  )
    ? String((((application.rawRegcheck as Record<string, unknown>).mcc_sheldon as Record<string, unknown>).mcc ?? '')).replace(/\D/g, '').slice(0, 4)
    : null;
  const sheldonMccDescription = (
    application.rawRegcheck
    && typeof application.rawRegcheck === 'object'
    && 'mcc_sheldon' in application.rawRegcheck
    && (application.rawRegcheck as Record<string, unknown>).mcc_sheldon
    && typeof (application.rawRegcheck as Record<string, unknown>).mcc_sheldon === 'object'
    && 'mcc_description' in ((application.rawRegcheck as Record<string, unknown>).mcc_sheldon as Record<string, unknown>)
  )
    ? String((((application.rawRegcheck as Record<string, unknown>).mcc_sheldon as Record<string, unknown>).mcc_description ?? '')).trim() || null
    : null;
  const inputMccLabel = formatMccLabel(application.mcc);
  const sheldonMccLabel = formatMccLabel(sheldonMcc, sheldonMccDescription);

  const approvedReason = (() => {
    if (isMccManualReview && mccManualOutcome === 'approve_input_mcc') {
      return `Aprobado por ${reviewerMention} usando MCC informado (${inputMccLabel})`;
    }
    if (isMccManualReview && mccManualOutcome === 'approve_sheldon_mcc') {
      return `Aprobado por ${reviewerMention} usando MCC Sheldon (${sheldonMccLabel})`;
    }
    return `Aprobado por ${reviewerMention} mediante reaccion en Slack`;
  })();
  const reason = approved
    ? approvedReason
    : `Rechazado por ${reviewerMention} mediante reaccion en Slack`;
  const customerMessage = approved
    ? 'Tu solicitud fue recibida y ya estamos continuando con la activacion.'
    : 'Regcheck rechazado. Nuestro equipo te contactara con los siguientes pasos.';

  const nextMcc = isMccManualReview && mccManualOutcome === 'approve_sheldon_mcc' && sheldonMcc ? sheldonMcc : application.mcc;

  await db
    .update(cardApplications)
    .set({
      decision,
      decisionReason: reason,
      customerMessage,
      raiApprovalStatus: decision,
      mcc: nextMcc,
      raiReviewedBySlackUserId: event.user,
      raiReviewedAt: new Date(),
    })
    .where(eq(cardApplications.id, application.id));

  if (!approved) {
    void sendRejectionEmail({
      contactEmail: application.contactEmail,
      companyName: application.companyName,
    }).catch((error) => {
      console.error('Failed to send rejection email:', error);
    });
  }

  const approvedLabel = isMccManualReview && mccManualOutcome === 'approve_input_mcc'
    ? `MCC informado (${inputMccLabel})`
    : isMccManualReview && mccManualOutcome === 'approve_sheldon_mcc'
      ? `MCC Sheldon (${sheldonMccLabel})`
      : null;
  const statusLine = approved
    ? `:white_check_mark: aprobado por ${reviewerMention}${approvedLabel ? `, se elige ${approvedLabel}` : ''}, continua el flujo`
    : `:x: rechazado por ${reviewerMention}, se detiene el flujo`;
  const text = [
    statusLine,
    `Solicitud #${application.id} (${application.companyName}).`,
    approved ? 'Continuamos con el flujo de activacion.' : 'Se detiene el flujo de activacion.',
  ].join('\n');

  await postSlackThreadMessage(event.item.channel, event.item.ts, text);

  if (approved && isMccManualReview) {
    const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
    await applyKushkiRevalidation({
      application: {
        id: application.id,
        mcc: application.mcc,
        averageTicketClp: application.averageTicketClp,
        monthlyTransactions: application.monthlyTransactions,
      },
      currentRawRegcheck: commercialState.rawRegcheckObject,
      currentCommercial: commercialState.commercial,
      reviewerUserId: event.user,
      reviewerMention,
      antoniaMention,
      channel: application.slackChannelId ?? event.item.channel,
      threadTs: application.slackMessageTs ?? event.item.ts,
      mccOverride: nextMcc ?? undefined,
    });
  } else if (approved && !isMccManualReview) {
    void runPostApprovalMccCheck(application.id).catch((error) => {
      console.error('Failed to run post-approval MCC check:', error);
    });
  }
}

async function processSlackEvent(payload: SlackEventCallbackPayload): Promise<void> {
  const event = payload.event;
  if (isSlackMessageEvent(event)) {
    await processSlackMessageEvent(event);
    return;
  }

  if (isSlackReactionEvent(event)) {
    await processSlackReactionEvent(event);
  }
}

function verifySlackSignature(rawBody: string, timestamp: string, signature: string): boolean {
  if (!env.SLACK_SIGNING_SECRET) {
    return false;
  }

  // Some setups accidentally copy the secret with a leading "=" in .env.
  const signingSecret = env.SLACK_SIGNING_SECRET.trim().replace(/^=/, '');

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - timestampNumber;
  if (Math.abs(age) > MAX_REQUEST_AGE_SECONDS) {
    return false;
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const digest = crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');
  const expectedSignature = `v0=${digest}`;

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await readRawBody(req);

  if (!env.SLACK_SIGNING_SECRET) {
    return res.status(500).json({ error: 'Missing SLACK_SIGNING_SECRET' });
  }

  const signature = getHeaderValue(req.headers['x-slack-signature']);
  const timestamp = getHeaderValue(req.headers['x-slack-request-timestamp']);

  if (!signature || !timestamp) {
    return res.status(400).json({ error: 'Missing Slack signature headers' });
  }

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return res.status(401).json({ error: 'Invalid Slack signature' });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(rawBody) as SlackPayload;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Slack validates Request URL with url_verification first.
  if (payload.type === 'url_verification') {
    return res.status(200).json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback') {
    void processSlackEvent(payload).catch((error) => {
      console.error('Failed to process Slack event:', error);
    });

    return res.status(200).json({ ok: true, eventId: payload.event_id });
  }

  return res.status(200).json({ ok: true });
}

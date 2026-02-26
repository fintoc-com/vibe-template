import { and, eq } from 'drizzle-orm';
import { env } from '~/config/env';
import { db } from '~/db';
import { cardApplications } from '~/db/schema';
import { formatMccLabel } from '~/lib/mcc/mcc-descriptions';
import { buildMccCommercialStatusResult } from '~/lib/mcc/mcc-commercial-status';
import { buildProfitabilityAssessment } from '~/lib/mcc/profitability';
import { postSlackMessage } from '~/lib/slack/post-message';

const MCC_ACCURACY_THRESHOLD = 85;
const MANUAL_REVIEW_MESSAGE = 'Estamos validando tus datos. Te contactaremos apenas terminemos la revision.';

type SheldonMccResult = {
  mcc: string | null
  accuracy: number | null
  reasoning: string | null
  mccDescription: string | null
  inputMccDescription: string | null
  raw: unknown
};

type MccDecision = {
  status: 'continue' | 'manual_review'
  reason: string
  resolvedMcc: string | null
};

async function fetchWebsiteContext(websiteUrl: string | null): Promise<string | null> {
  if (!websiteUrl) return null;

  try {
    const response = await fetch(websiteUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SheldonMccBot/1.0)',
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    if (!html) return null;

    const plain = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return plain.length > 4000 ? plain.slice(0, 4000) : plain;
  } catch {
    return null;
  }
}

function normalizeMcc(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 4 ? digits : null;
}

function normalizeAccuracy(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function classifyMccWithSheldon(input: {
  companyName: string
  websiteUrl: string | null
  companyRut: string
  mccInput: string | null
}): Promise<SheldonMccResult> {
  if (!env.OPENAI_API_KEY) {
    return {
      mcc: null,
      accuracy: null,
      reasoning: 'OPENAI_API_KEY no configurada',
      mccDescription: null,
      inputMccDescription: null,
      raw: null,
    };
  }

  const model = env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const websiteContext = await fetchWebsiteContext(input.websiteUrl);
  if (!websiteContext) {
    return {
      mcc: null,
      accuracy: 0,
      reasoning: 'Sitio web inaccesible o sin contenido util para clasificar MCC',
      mccDescription: null,
      inputMccDescription: null,
      raw: {
        websiteUrl: input.websiteUrl,
        websiteContextAvailable: false,
      },
    };
  }
  const payload = {
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system',
        content: [
          'Eres Sheldon, clasificador de MCC para comercios.',
          'Debes responder exclusivamente un JSON valido con llaves: mcc, accuracy, reasoning.',
          'Agrega mcc_description e input_mcc_description cuando sea posible.',
          'mcc debe ser string de 4 digitos cuando tengas certeza razonable, sino null.',
          'accuracy debe ser numero entre 0 y 100.',
          'Si hay contenido util del sitio (productos, rubro, checkout, categorias), entrega tu mejor MCC estimado aunque la confianza sea moderada.',
          'Usa mcc=null solo si realmente no hay senal suficiente (sitio inaccesible, sin contenido relevante o ambiguo de forma critica).',
          'No incluyas texto fuera del JSON.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Clasificar MCC del comercio',
          companyName: input.companyName,
          websiteUrl: input.websiteUrl,
          websiteContext,
          companyRut: input.companyRut,
          mccInput: input.mccInput,
        }),
      },
    ],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        mcc: null,
        accuracy: null,
        reasoning: `Error OpenAI (${response.status})`,
        mccDescription: null,
        inputMccDescription: null,
        raw: await response.text(),
      };
    }

    const raw = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    };
    const content = raw.choices?.[0]?.message?.content;
    if (!content) {
      return {
        mcc: null,
        accuracy: null,
        reasoning: 'OpenAI no devolvio contenido',
        mccDescription: null,
        inputMccDescription: null,
        raw,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {
        mcc: null,
        accuracy: null,
        reasoning: 'OpenAI devolvio JSON invalido',
        mccDescription: null,
        inputMccDescription: null,
        raw: content,
      };
    }

    return {
      mcc: normalizeMcc(typeof parsed.mcc === 'string' ? parsed.mcc : null),
      accuracy: normalizeAccuracy(parsed.accuracy),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
      mccDescription: normalizeDescription(parsed.mcc_description),
      inputMccDescription: normalizeDescription(parsed.input_mcc_description),
      raw: parsed,
    };
  } catch (error) {
    return {
      mcc: null,
      accuracy: null,
      reasoning: error instanceof Error ? error.message : 'Error desconocido en Sheldon',
      mccDescription: null,
      inputMccDescription: null,
      raw: null,
    };
  }
}

function evaluateMccDecision(inputMcc: string | null, sheldon: SheldonMccResult): MccDecision {
  const normalizedInputMcc = normalizeMcc(inputMcc);
  const normalizedSheldonMcc = normalizeMcc(sheldon.mcc);
  const accuracy = sheldon.accuracy ?? 0;

  if (normalizedInputMcc && normalizedSheldonMcc && normalizedInputMcc === normalizedSheldonMcc) {
    return {
      status: 'continue',
      reason: `MCC informado (${normalizedInputMcc}) coincide con Sheldon`,
      resolvedMcc: normalizedInputMcc,
    };
  }

  if (!normalizedInputMcc && normalizedSheldonMcc && accuracy >= MCC_ACCURACY_THRESHOLD) {
    return {
      status: 'continue',
      reason: `Sin MCC informado y Sheldon sugiere ${normalizedSheldonMcc} con ${accuracy}%`,
      resolvedMcc: normalizedSheldonMcc,
    };
  }

  if (normalizedInputMcc && normalizedSheldonMcc && normalizedInputMcc !== normalizedSheldonMcc && accuracy >= MCC_ACCURACY_THRESHOLD) {
    return {
      status: 'manual_review',
      reason: `MCC informado (${normalizedInputMcc}) difiere de Sheldon (${normalizedSheldonMcc}) con ${accuracy}%`,
      resolvedMcc: normalizedInputMcc,
    };
  }

  if (!normalizedInputMcc && accuracy < MCC_ACCURACY_THRESHOLD) {
    return {
      status: 'manual_review',
      reason: `Sin MCC informado y Sheldon con baja confianza (${accuracy}%)`,
      resolvedMcc: null,
    };
  }

  return {
    status: 'manual_review',
    reason: sheldon.reasoning
      ? `No fue posible concluir validacion MCC automaticamente (${sheldon.reasoning})`
      : 'No fue posible concluir validacion MCC automaticamente',
    resolvedMcc: normalizedInputMcc,
  };
}

export async function runPostApprovalMccCheck(applicationId: number): Promise<void> {
  const [application] = await db
    .select({
      id: cardApplications.id,
      decision: cardApplications.decision,
      companyName: cardApplications.companyName,
      companyRut: cardApplications.companyRut,
      companyWebsiteUrl: cardApplications.companyWebsiteUrl,
      monthlyTransactions: cardApplications.monthlyTransactions,
      averageTicketClp: cardApplications.averageTicketClp,
      mcc: cardApplications.mcc,
      rawRegcheck: cardApplications.rawRegcheck,
      slackChannelId: cardApplications.slackChannelId,
      slackMessageTs: cardApplications.slackMessageTs,
    })
    .from(cardApplications)
    .where(eq(cardApplications.id, applicationId))
    .limit(1);

  if (!application || application.decision !== 'approved') {
    return;
  }

  const sheldon = await classifyMccWithSheldon({
    companyName: application.companyName,
    websiteUrl: application.companyWebsiteUrl,
    companyRut: application.companyRut,
    mccInput: application.mcc,
  });
  const mccDecision = evaluateMccDecision(application.mcc, sheldon);
  const nextRawRegcheck = {
    ...(application.rawRegcheck && typeof application.rawRegcheck === 'object' ? application.rawRegcheck : {}),
    mcc_sheldon: {
      mcc: sheldon.mcc,
      mcc_description: sheldon.mccDescription,
      input_mcc_description: sheldon.inputMccDescription,
      accuracy: sheldon.accuracy,
      reasoning: sheldon.reasoning,
      checkedAt: new Date().toISOString(),
      raw: sheldon.raw,
    },
  };

  const antoniaMention = env.SLACK_ANTONIA_USER_ID ? `<@${env.SLACK_ANTONIA_USER_ID}>` : 'Antonia';
  const accuracyLabel = sheldon.accuracy ?? 'n/a';
  const inputMccCode = normalizeMcc(application.mcc);
  const inputMccLabel = inputMccCode
    ? formatMccLabel(inputMccCode)
    : 'no informado';
  const sheldonMccLabel = formatMccLabel(sheldon.mcc, sheldon.mccDescription);

  if (mccDecision.status === 'continue') {
    const commercialResult = await buildMccCommercialStatusResult(
      mccDecision.resolvedMcc,
      antoniaMention,
      application.averageTicketClp,
    );
    const requiresCommercialManual = commercialResult.action !== 'none';
    const nextRawRegcheckWithCommercial = {
      ...nextRawRegcheck,
      mcc_commercial: {
        mcc: commercialResult.normalizedMcc,
        cotizado: commercialResult.status.cotizado,
        anexado: commercialResult.status.anexado,
        costs: commercialResult.status.costs,
        awaiting_kushki_approval: requiresCommercialManual,
        action: commercialResult.action,
        checkedAt: new Date().toISOString(),
      },
    };

    await db
      .update(cardApplications)
      .set({
        decision: requiresCommercialManual ? 'manual_review' : 'approved',
        mcc: mccDecision.resolvedMcc,
        decisionReason: requiresCommercialManual
          ? `Manual review por Kushki MCC: ${commercialResult.action}`
          : `${application.decision} + MCC validado (${mccDecision.reason})`,
        customerMessage: requiresCommercialManual
          ? MANUAL_REVIEW_MESSAGE
          : 'Tu solicitud fue recibida y ya estamos continuando con la activacion.',
        raiApprovalStatus: requiresCommercialManual ? 'pending_manual' : 'approved',
        rawRegcheck: nextRawRegcheckWithCommercial,
      })
      .where(eq(cardApplications.id, application.id));

    if (application.slackChannelId && application.slackMessageTs) {
      const threadText = [
        ':mag: Check MCC completado',
        `MCC informado: ${inputMccLabel}`,
        `MCC Sheldon: ${sheldonMccLabel} (${accuracyLabel}% confianza)`,
        `:white_check_mark: ${mccDecision.reason}. Continua el flujo.`,
      ].join('\n');
      await postSlackMessage({
        channel: application.slackChannelId,
        threadTs: application.slackMessageTs,
        text: threadText,
      });

      await postSlackMessage({
        channel: application.slackChannelId,
        threadTs: application.slackMessageTs,
        text: `:money_with_wings: ${commercialResult.text}`,
      });

      if (commercialResult.action === 'none') {
        const profitabilityAssessment = buildProfitabilityAssessment({
          averageTicketClp: application.averageTicketClp,
          monthlyTransactions: application.monthlyTransactions,
          costs: commercialResult.status.costs,
        });
        if (profitabilityAssessment) {
          await postSlackMessage({
            channel: application.slackChannelId,
            threadTs: application.slackMessageTs,
            text: profitabilityAssessment.text,
          });

          if (!profitabilityAssessment.rentable) {
            const nextRawRegcheckWithProfitability = {
              ...nextRawRegcheckWithCommercial,
              mcc_profitability: {
                rentable: false,
                awaiting_profitability_approval: true,
                checked_at: new Date().toISOString(),
              },
            };

            await db
              .update(cardApplications)
              .set({
                decision: 'manual_review',
                decisionReason: 'Manual review por rentabilidad: no rentable',
                customerMessage: MANUAL_REVIEW_MESSAGE,
                raiApprovalStatus: 'pending_manual',
                rawRegcheck: nextRawRegcheckWithProfitability,
              })
              .where(eq(cardApplications.id, application.id));

            await postSlackMessage({
              channel: application.slackChannelId,
              threadTs: application.slackMessageTs,
              text: `:warning: Rentabilidad no rentable. ${antoniaMention} revisa este caso: :white_check_mark: para continuar con estos costos, responde \"Re-cotizar\" (o un MCC de 4 digitos) para re-evaluar, o :x: / \"Rechazado\" para terminar.`,
            });
          }
        }
      }
    }
    return;
  }

  await db
    .update(cardApplications)
    .set({
      decision: 'manual_review',
      decisionReason: `Manual review por MCC: ${mccDecision.reason}`,
      customerMessage: MANUAL_REVIEW_MESSAGE,
      raiApprovalStatus: 'pending_manual',
      rawRegcheck: nextRawRegcheck,
    })
    .where(
      and(
        eq(cardApplications.id, application.id),
        eq(cardApplications.decision, 'approved'),
      ),
    );

  if (application.slackChannelId && application.slackMessageTs) {
    const threadText = [
      ':mag: Check MCC completado',
      `MCC informado: ${inputMccLabel}`,
      `MCC Sheldon: ${sheldonMccLabel} (${accuracyLabel}% confianza)`,
      `:warning: ${mccDecision.reason}`,
      `${antoniaMention} por favor revisar este manual review de MCC y reaccionar:`,
      `1️⃣ Aprobar MCC informado (${inputMccLabel})`,
      `2️⃣ Aprobar MCC Sheldon (${sheldonMccLabel})`,
      '❌ Rechazar solicitud',
    ].join('\n');
    await postSlackMessage({
      channel: application.slackChannelId,
      threadTs: application.slackMessageTs,
      text: threadText,
    });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { slack } from '~/lib/slack';
import { db } from '~/db';
import { runbooks } from '~/db/schema';
import { env } from '~/config/env';
import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod';

const generateRunbookSchema = z.object({
  threadTs: z.string(),
  channelId: z.string(),
  prompt: z.string().optional(),
});

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

/**
 * Internal endpoint for generating runbooks
 * Called by Slack webhook, does not require user authentication
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify internal request
  if (req.headers['x-internal-request'] !== 'true') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const body = generateRunbookSchema.parse(req.body);

    // Fetch thread messages from Slack
    const threadResult = await slack.conversations.replies({
      channel: body.channelId,
      ts: body.threadTs,
    });

    if (!threadResult.ok || !threadResult.messages || threadResult.messages.length === 0) {
      return res.status(404).json({ error: 'Thread not found or empty' });
    }

    // Format thread messages for Claude
    const threadMessages = await Promise.all(
      threadResult.messages.map(async (msg, idx) => {
        let userName = 'Unknown';

        if (msg.user) {
          try {
            const userInfo = await slack.users.info({ user: msg.user });
            if (userInfo.ok && userInfo.user) {
              userName = userInfo.user.profile?.display_name || userInfo.user.real_name || userInfo.user.name || msg.user;
            }
          } catch (error) {
            console.error('Failed to fetch user info:', error);
          }
        }

        const text = msg.text || '';
        const timestamp = new Date(parseFloat(msg.ts || '0') * 1000).toLocaleString();
        return `[${timestamp}] ${userName}: ${text}`;
      }),
    );

    const threadText = threadMessages.join('\n\n');

    // Generate runbook using Claude
    const systemPrompt = `Eres un documentador técnico que crea runbooks concisos desde conversaciones de Slack.

REGLAS CRÍTICAS:
- Solo usa información EXPLÍCITAMENTE mencionada en la conversación
- NO inventes detalles, pasos o comandos que no estén en el thread
- Sé BREVE y directo - máximo 300-400 palabras
- Si algo no está claro en la conversación, omítelo

Estructura del runbook:
1. **Título** (# H1): Corto y descriptivo del problema
2. **Resumen** (2-3 oraciones): Qué pasó y cómo se resolvió
3. **Pasos** (si hay solución): Enumera solo lo que REALMENTE se hizo
4. **Comandos/Código**: Solo si están explícitos en el thread (usa \`\`\`language)
5. **Resultado**: Cómo terminó (éxito/pendiente/error)

FORMATO MARKDOWN - MUY IMPORTANTE:
- **Headers**: Usa # ## ### con texto en negrita
  Ejemplo:
  # Título Principal

  ## **Sección Principal**

  ### **Subsección**

- **Espaciado**: SIEMPRE deja línea en blanco entre:
  - Headers y contenido
  - Párrafos
  - Secciones
  - Antes y después de listas
  - Antes y después de bloques de código

- **Listas**:
  - Para pasos secuenciales: usa numeración (1. 2. 3.)
  - Para items/puntos: usa bullets con guión (- item)
  - Deja línea en blanco antes y después de cada lista
  - Cada item en su propia línea

- **Bloques de código**:
  - Usa \`\`\`bash, \`\`\`python, etc.
  - Deja línea en blanco antes y después

- **Énfasis**:
  - Usa **negrita** para términos importantes
  - Usa \`código inline\` para comandos cortos o variables

EJEMPLO DE FORMATO CORRECTO:

# Título del Problema

## **Resumen**

Descripción breve del problema y la solución.

Segunda oración del resumen con más contexto.

## **Pasos de Solución**

1. Primer paso con descripción clara

2. Segundo paso con más detalles

3. Tercer paso final

## **Comandos Ejecutados**

\`\`\`bash
comando aqui
\`\`\`

## **Resultado**

Descripción del resultado final.

Estado: **Resuelto** o **Pendiente**

NO agregues secciones vacías. Si no hay comandos, omite esa sección.`;

    const userPrompt = body.prompt
      ? `Crea un runbook CONCISO (máx 300-400 palabras, solo hechos del thread) siguiendo estas instrucciones específicas del usuario:

**INSTRUCCIONES DEL USUARIO:** ${body.prompt}

Conversación de Slack:

${threadText}`
      : `Crea un runbook CONCISO de esta conversación (máx 300-400 palabras, solo hechos del thread):

${threadText}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const runbookContent = content.text;

    // Extract title from markdown (first # heading)
    const titleMatch = runbookContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : 'Untitled Runbook';

    // Save runbook to database
    const [runbook] = await db
      .insert(runbooks)
      .values({
        title,
        content: runbookContent,
        threadTs: body.threadTs,
        channelId: body.channelId,
        prompt: body.prompt || null,
        model: 'claude-sonnet-4-5',
        createdBy: 'slack-bot',
      })
      .returning();

    return res.status(201).json({
      success: true,
      runbook: {
        id: runbook.id,
        title: runbook.title,
        content: runbook.content,
        threadTs: runbook.threadTs,
        channelId: runbook.channelId,
        createdAt: runbook.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    console.error('Failed to generate runbook:', error);
    return res.status(500).json({ error: 'Failed to generate runbook' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import { db } from '~/db';
import { runbooks } from '~/db/schema';
import { eq, desc } from 'drizzle-orm';
import * as z from 'zod';

const querySchema = z.object({
  id: z.coerce.number().optional(),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }

    const { id } = parsed.data;

    // Get specific runbook
    if (id) {
      const [runbook] = await db
        .select()
        .from(runbooks)
        .where(eq(runbooks.id, id))
        .limit(1);

      if (!runbook) {
        return res.status(404).json({ error: 'Runbook not found' });
      }

      return res.status(200).json({
        runbook: {
          id: runbook.id,
          title: runbook.title,
          content: runbook.content,
          threadTs: runbook.threadTs,
          channelId: runbook.channelId,
          prompt: runbook.prompt,
          model: runbook.model,
          createdBy: runbook.createdBy,
          createdAt: runbook.createdAt.toISOString(),
          updatedAt: runbook.updatedAt.toISOString(),
        },
      });
    }

    // List all runbooks
    const allRunbooks = await db
      .select({
        id: runbooks.id,
        title: runbooks.title,
        threadTs: runbooks.threadTs,
        channelId: runbooks.channelId,
        createdBy: runbooks.createdBy,
        createdAt: runbooks.createdAt,
      })
      .from(runbooks)
      .orderBy(desc(runbooks.createdAt));

    return res.status(200).json({
      runbooks: allRunbooks.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch runbooks:', error);
    return res.status(500).json({ error: 'Failed to fetch runbooks' });
  }
});

import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import {
  updateManualArchetype,
  deleteManualArchetype,
} from '~/lib/manual-archetypes';
import * as z from 'zod';

const updateArchetypeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(500).optional(),
  keywords: z.array(z.string().min(1)).min(1).optional(),
  exampleMessageIds: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse, session) => {
  const { id } = req.query;

  if (typeof id !== 'string' || !id.match(/^\d+$/)) {
    return res.status(400).json({ error: 'Invalid archetype ID' });
  }

  const archetypeId = parseInt(id, 10);

  if (req.method === 'PATCH') {
    // Update manual archetype
    try {
      const body = updateArchetypeSchema.parse(req.body);

      const archetype = await updateManualArchetype(archetypeId, body);

      if (!archetype) {
        return res.status(404).json({ error: 'Archetype not found' });
      }

      return res.status(200).json({ archetype });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }

      console.error('Failed to update manual archetype:', error);
      return res.status(500).json({ error: 'Failed to update archetype' });
    }
  }

  if (req.method === 'DELETE') {
    // Delete manual archetype
    try {
      await deleteManualArchetype(archetypeId);
      return res.status(204).end();
    } catch (error) {
      console.error('Failed to delete manual archetype:', error);
      return res.status(500).json({ error: 'Failed to delete archetype' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import {
  getManualArchetypes,
  addManualArchetype,
} from '~/lib/manual-archetypes';
import * as z from 'zod';

const createArchetypeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  keywords: z.array(z.string().min(1)).min(1),
  exampleMessageIds: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse, session) => {
  if (req.method === 'GET') {
    // List all manual archetypes
    try {
      const archetypes = await getManualArchetypes();
      return res.status(200).json({ archetypes });
    } catch (error) {
      console.error('Failed to load manual archetypes:', error);
      return res.status(500).json({ error: 'Failed to load archetypes' });
    }
  }

  if (req.method === 'POST') {
    // Create new manual archetype
    try {
      const body = createArchetypeSchema.parse(req.body);

      const archetype = await addManualArchetype({
        name: body.name,
        description: body.description,
        keywords: body.keywords,
        exampleMessageIds: body.exampleMessageIds,
        priority: body.priority,
      });

      return res.status(201).json({ archetype });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }

      console.error('Failed to create manual archetype:', error);
      return res.status(500).json({ error: 'Failed to create archetype' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

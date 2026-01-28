import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '~/db';
import { examples } from '~/db/schema';
import { count } from 'drizzle-orm';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [result] = await db.select({ count: count() }).from(examples);

  return res.status(200).json({ count: result.count });
}

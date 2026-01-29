import { count } from 'drizzle-orm';
import { db } from '~/db';
import { examples } from '~/db/schema';
import { protectedHandler } from '~/lib/api/protected-handler';

export default protectedHandler(async (req, res, session) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log(`[${session.session.id}] ${session.user.email} accessed the protected endpoint`);

  const [result] = await db.select({ count: count() }).from(examples);

  return res.status(200).json({ count: result.count });
});

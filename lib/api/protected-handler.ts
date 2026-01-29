import type { NextApiRequest, NextApiResponse } from 'next';
import { auth, type Session } from '~/lib/auth';

type ProtectedApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  session: Session,
) => Promise<void> | void;

export function protectedHandler(handler: ProtectedApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await auth.api.getSession({
      headers: req.headers as HeadersInit,
    });

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return handler(req, res, session);
  };
}

import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Simple test endpoint to verify LocalTunnel and body parsing
 * Test with: curl -X POST https://your-tunnel-url.loca.lt/api/slack/test -H "Content-Type: application/json" -d '{"test":"value"}'
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('=== TEST ENDPOINT HIT ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body type:', typeof req.body);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================');

  return res.status(200).json({
    success: true,
    received: {
      method: req.method,
      body: req.body,
      bodyType: typeof req.body,
      headers: req.headers,
    },
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

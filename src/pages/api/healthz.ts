import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Coolify Health Check 엔드포인트.
 * Coolify Application 설정의 Health Check Path에 `/api/healthz` 를 지정해주세요.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ status: 'ok' });
}

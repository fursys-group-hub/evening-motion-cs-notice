import type { NextApiRequest, NextApiResponse } from 'next';
import { isAdmin } from '@/lib/admin';

/** POST /api/admin/check — 화면이 관리자 비밀번호가 맞는지 확인할 때 쓴다 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: '허용되지 않는 요청이에요.' });
  if (!isAdmin(req)) return res.status(403).json({ detail: '관리자 비밀번호가 맞지 않아요.' });
  return res.status(200).json({ ok: true });
}

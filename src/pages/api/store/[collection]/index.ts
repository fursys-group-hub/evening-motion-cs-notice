import type { NextApiRequest, NextApiResponse } from 'next';
import { COLLECTIONS, listDocs } from '@/lib/store';

/** GET /api/store/frame_replies — 화면에서 추가한 회신 목록 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const collection = String(req.query.collection);
  if (!COLLECTIONS.has(collection)) return res.status(400).json({ detail: '잘못된 collection 이름이에요.' });
  if (req.method !== 'GET') return res.status(405).json({ detail: '허용되지 않는 요청이에요.' });

  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ docs: await listDocs(collection) });
  } catch (e) {
    console.error('회신 목록 읽기 실패', e);
    return res.status(500).json({ detail: '저장된 회신을 읽지 못했어요.' });
  }
}

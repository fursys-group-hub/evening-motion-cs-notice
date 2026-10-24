import type { NextApiRequest, NextApiResponse } from 'next';
import { COLLECTIONS, deleteDoc, setDoc, validId } from '@/lib/store';

const VERDICTS = new Set(['ok', 'cond', 'warn', 'no']);
const TEXT_FIELDS: Record<string, number> = { brand: 40, name: 80, type: 30, reply: 400, guide: 400, url: 500, createdAt: 40 };
// 화면이 줄여서 보내는 320×240 JPEG 사진만 받는다
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 200_000;

function clean(body: unknown): Record<string, string> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!VERDICTS.has(String(b.v))) return null;
  const out: Record<string, string> = { v: String(b.v) };
  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    if (b[k] == null) continue;
    if (typeof b[k] !== 'string' || (b[k] as string).length > max) return null;
    out[k] = b[k] as string;
  }
  if (!out.brand || !out.name || !out.reply) return null;
  if (out.url && !/^https?:\/\//.test(out.url)) return null;
  if (b.photo) {
    if (typeof b.photo !== 'string' || b.photo.length > PHOTO_MAX || !PHOTO_RE.test(b.photo)) return null;
    out.photo = b.photo;
  }
  return out;
}

/** PUT·DELETE /api/store/frame_replies/<id> — 회신 저장·삭제 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const collection = String(req.query.collection);
  const id = String(req.query.id);
  if (!COLLECTIONS.has(collection) || !validId(id)) return res.status(400).json({ detail: '잘못된 요청이에요.' });

  try {
    if (req.method === 'PUT') {
      const data = clean(req.body);
      if (!data) return res.status(400).json({ detail: '브랜드, 제품명, 판정, 회신 요지를 확인해주세요.' });
      return res.status(200).json({ data: await setDoc(collection, id, data) });
    }
    if (req.method === 'DELETE') {
      await deleteDoc(collection, id);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ detail: '허용되지 않는 요청이에요.' });
  } catch (e) {
    console.error('회신 저장 실패', e);
    return res.status(500).json({ detail: '저장하지 못했어요. 잠시 후 다시 시도해주세요.' });
  }
}

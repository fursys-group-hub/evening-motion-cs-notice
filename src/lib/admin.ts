import { createHash, timingSafeEqual } from 'crypto';
import type { NextApiRequest } from 'next';

/**
 * 카드 삭제·기존 카드 덮어쓰기는 관리자(슬로우베드사업팀 윤소연)만 한다.
 * 사내 로그인은 "누가" 들어왔는지 앱에 알려주지 않아서, 관리자 비밀번호로 가른다.
 * 코드에는 비밀번호의 SHA-256 지문만 둔다 — 비밀번호를 바꾸려면 이 값을 새 지문으로 교체한다.
 */
const ADMIN_KEY_SHA256 = 'dcccd408ca3939e8e61690d8c34c4cdf35287fc82c775e7615c1266eed86df70';

export function isAdmin(req: NextApiRequest): boolean {
  const key = req.headers['x-admin-key'];
  if (typeof key !== 'string' || !key || key.length > 200) return false;
  const got = createHash('sha256').update(key).digest();
  return timingSafeEqual(got, Buffer.from(ADMIN_KEY_SHA256, 'hex'));
}

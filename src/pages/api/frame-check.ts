// 타사 침대 프레임 상세페이지 → 이브닝 모션 호환 1차 검증
//
// POST /api/frame-check
//   { url: "https://..." }            상세페이지 링크 — 서버가 페이지와 상세 이미지를 받아온다
//   { images: ["data:image/...", …] } 링크를 못 받아올 때 CS 가 올린 캡처
//
// 받은 이미지·글자를 Claude 가 읽어 프레임 치수·구조를 뽑아 JSON 으로 돌려준다.
// 판정(가능·조건부·불가)은 화면(notice.html)의 간편 판정이 같은 규칙으로 계산한다.
//
// 필요한 환경변수: ANTHROPIC_API_KEY (Coolify Runtime Variable, Locked=Yes)
import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import sharp from 'sharp';

export const config = { api: { bodyParser: { sizeLimit: '25mb' } }, maxDuration: 300 };

const MODEL = 'claude-opus-5-5';
const MAX_SOURCE_IMAGES = 40; // 페이지에서 받아올 이미지 수 상한
const MAX_SLICES = 60; // Claude 에 보낼 조각 수 상한
const SLICE_H = 2000; // 긴 상세 이미지를 자르는 높이(px)
const MAX_W = 1000; // 조각 가로 폭 상한(px)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const Extract = z.object({
  page_ok: z.boolean().describe('침대 프레임 상품 정보가 실제로 보였는지'),
  brand: z.string(),
  product_name: z.string(),
  size_label: z.string().describe('치수를 읽은 사이즈 옵션. SS(슈퍼싱글) 우선'),
  rim: z.enum(['yes', 'no', 'unknown']).describe('매트리스를 둘러싸는 테두리(매립형·수납형 외곽틀)가 있는지'),
  inner_width_mm: z.number().nullable(),
  inner_length_mm: z.number().nullable(),
  inner_basis: z
    .enum(['explicit', 'mattress_size', 'none'])
    .describe('explicit=안쪽 치수가 직접 적힘, mattress_size=맞는 매트리스 크기만 적힘(안쪽≈매트리스), none=없음'),
  outer_width_mm: z.number().nullable(),
  outer_length_mm: z.number().nullable(),
  headboard: z.boolean().nullable(),
  footboard: z.boolean().nullable(),
  corner_guard_or_round: z.boolean().nullable().describe('안쪽 코너 밀림방지 가드나 둥근 모서리'),
  hotel_box: z.boolean().nullable().describe('호텔식 패브릭 박스 받침 등 매트리스 아래 구조가 안 보이는 형태'),
  base: z.enum(['board', 'slat_ok', 'slat_wide', 'unknown']).describe('board=통판·분할 깔판, slat_ok=갈빗살 간격 50mm 이하, slat_wide=50mm 초과'),
  slat_gap_mm: z.number().nullable(),
  max_load_kg: z.number().nullable(),
  evidence: z
    .array(z.object({ field: z.string(), quote: z.string(), source: z.string().describe('예: 이미지 7, 페이지 글자') }))
    .describe('뽑은 값마다 근거 문구와 위치'),
  notes: z.array(z.string()).describe('CS 가 알아야 할 점(추정한 값, 못 찾은 값 등) — 한국어 짧은 문장'),
});
export type FrameExtract = z.infer<typeof Extract>;

const SYSTEM = `당신은 침대 프레임 상세페이지에서 치수와 구조를 정확히 옮겨 적는 검수자입니다.
목적: 슬로우베드 "이브닝 모션" 모션 매트리스(SS 1,100×2,000mm, 높이 250mm)를 이 프레임에 올릴 수 있는지 고객센터가 판단할 수 있게, 상세페이지에 실제로 적힌 값만 뽑습니다.

규칙
- 사이즈 옵션이 여럿이면 SS(슈퍼싱글, 폭 1,100mm 안팎) 값을 뽑습니다. SS 가 없으면 가장 작은 사이즈를 쓰고 size_label 에 그 이름을 적습니다.
- 이미지·글자에 적힌 숫자만 씁니다. cm 는 mm 로 바꿉니다(116cm → 1160). 보이지 않으면 null. 바깥 치수에서 테두리 두께를 빼서 안쪽 치수를 계산하지 않습니다.
- "SS 1100×2000 매트리스에 맞음"처럼 맞는 매트리스 크기만 있으면 inner_basis=mattress_size 로 두고 inner 치수에 그 크기를 적습니다.
- 테두리(rim): 매트리스가 프레임 안으로 들어가는 매립형·수납형 외곽틀이면 yes, 깔판 위에 얹기만 하는 평판형·평상형이면 no.
- 상품과 무관한 이미지(배송 안내, 다른 상품 배너, 리뷰 이벤트)는 무시합니다.
- evidence 에는 값마다 그대로 옮긴 원문과 "이미지 N" 또는 "페이지 글자"를 적습니다. 추정한 것은 notes 에 "추정"이라고 밝힙니다.`;

function isBlockedHost(host: string) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  // 사내 도메인은 이 기능으로 읽지 않는다
  if (h === 'fursys.com' || h.endsWith('.fursys.com') || h.endsWith('letus4u.com') || h.endsWith('efursys.com')) return true;
  if (/^(\d+\.){3}\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true;
  }
  return h.includes(':'); // IPv6 리터럴 차단
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

function pageText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
}

function imageUrls(html: string, base: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*?\b(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/gi;
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  for (const r of [og, re]) {
    let m: RegExpExecArray | null;
    while ((m = r.exec(html))) {
      const raw = m[1].replace(/&amp;/g, '&').trim();
      if (!raw || raw.startsWith('data:')) continue;
      let u: URL;
      try {
        u = new URL(raw, base);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) continue;
      if (/\.(svg|gif)(\?|$)/i.test(u.pathname) || /icon|logo|sprite|blank|btn_|banner_s/i.test(u.pathname)) continue;
      const key = u.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out.slice(0, MAX_SOURCE_IMAGES);
}

// 이미지 한 장 → Claude 에 보낼 JPEG 조각들 (긴 상세 이미지는 세로로 자른다)
async function toSlices(buf: Buffer): Promise<string[]> {
  const img = sharp(buf, { failOn: 'none', limitInputPixels: 200_000_000 });
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 300 || h < 200) return []; // 아이콘·썸네일 제외
  const scale = Math.min(1, MAX_W / w);
  const W = Math.round(w * scale);
  const H = Math.round(h * scale);
  const resized = await sharp(buf, { failOn: 'none', limitInputPixels: 200_000_000 }).resize(W, H).toBuffer();
  const parts: string[] = [];
  for (let y = 0; y < H; y += SLICE_H) {
    const height = Math.min(SLICE_H, H - y);
    if (height < 80) break;
    const jpg = await sharp(resized).extract({ left: 0, top: y, width: W, height }).jpeg({ quality: 82 }).toBuffer();
    parts.push(jpg.toString('base64'));
  }
  return parts;
}

type Img = { data: string; label: string };

async function fromUrl(url: string) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  const finalUrl = res.url || url;
  const host = new URL(finalUrl).hostname;
  if (isBlockedHost(host)) throw new HttpError(400, '사내 주소는 확인할 수 없어요.');
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok || !ctype.includes('html')) {
    throw new HttpError(502, `페이지를 받아오지 못했어요 (응답 ${res.status}). 상세페이지 캡처를 올려 주세요.`);
  }
  const html = await res.text();
  const text = pageText(html);
  const urls = imageUrls(html, finalUrl);
  const images: Img[] = [];
  let n = 0;
  await Promise.all(
    urls.map(async (u, i) => {
      try {
        const r = await fetchWithTimeout(u, { headers: { 'User-Agent': UA, Referer: finalUrl } }, 20000);
        if (!r.ok) return;
        const len = Number(r.headers.get('content-length') || 0);
        if (len > 15_000_000) return;
        const slices = await toSlices(Buffer.from(await r.arrayBuffer()));
        slices.forEach((d, k) => images.push({ data: d, label: `${i + 1}${slices.length > 1 ? `-${k + 1}` : ''}` }));
        n++;
      } catch {
        /* 한 장 실패는 건너뛴다 */
      }
    }),
  );
  images.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return { finalUrl, text, images: images.slice(0, MAX_SLICES), fetchedImages: n, foundImages: urls.length };
}

async function fromUploads(list: unknown) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 20) throw new HttpError(400, '캡처는 1~20장까지 올려 주세요.');
  const images: Img[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(String(list[i]));
    if (!m) throw new HttpError(400, '이미지 파일만 올릴 수 있어요.');
    const slices = await toSlices(Buffer.from(m[1], 'base64'));
    slices.forEach((d, k) => images.push({ data: d, label: `${i + 1}${slices.length > 1 ? `-${k + 1}` : ''}` }));
  }
  return { images: images.slice(0, MAX_SLICES) };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET: 화면이 처음 열릴 때 AI 검증을 쓸 수 있는지만 묻는다(키 값은 절대 돌려주지 않는다)
  if (req.method === 'GET') {
    return res.status(200).json({ ready: process.env.NODE_ENV !== 'production' || !!process.env.ANTHROPIC_API_KEY });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET·POST 만 지원해요.' });
  // 로컬 개발에서는 `ant auth login` 프로필로도 동작하게, 키 확인은 배포 환경에서만 한다
  if (process.env.NODE_ENV === 'production' && !process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: '서버에 AI 키(ANTHROPIC_API_KEY)가 아직 등록되지 않았어요.' });

  try {
    const body = (req.body || {}) as { url?: string; images?: unknown };
    let text = '';
    let images: Img[] = [];
    let source: Record<string, unknown> = {};

    if (body.url) {
      let u: URL;
      try {
        u = new URL(String(body.url).trim());
      } catch {
        throw new HttpError(400, '링크 형식이 아니에요.');
      }
      if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) throw new HttpError(400, '확인할 수 없는 주소예요.');
      const got = await fromUrl(u.toString());
      text = got.text;
      images = got.images;
      source = { type: 'url', url: got.finalUrl, foundImages: got.foundImages, fetchedImages: got.fetchedImages, slices: images.length };
      if (images.length === 0 && text.length < 200) {
        throw new HttpError(502, '페이지에서 상품 이미지를 찾지 못했어요. 상세페이지 캡처를 올려 주세요.');
      }
    } else if (body.images) {
      const got = await fromUploads(body.images);
      images = got.images;
      source = { type: 'upload', slices: images.length };
    } else {
      throw new HttpError(400, '링크나 캡처 이미지를 보내 주세요.');
    }

    const content: Anthropic.ContentBlockParam[] = [];
    images.forEach((im) => {
      content.push({ type: 'text', text: `이미지 ${im.label}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.data } });
    });
    content.push({
      type: 'text',
      text: `${text ? `페이지 글자(일부):\n${text}\n\n` : ''}위 상세페이지에서 침대 프레임 정보를 규칙대로 뽑아 주세요.`,
    });

    const client = new Anthropic();
    const msg = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: 'medium', format: zodOutputFormat(Extract) },
        messages: [{ role: 'user', content }],
      },
      { timeout: 240_000 },
    );

    if (msg.stop_reason === 'refusal') throw new HttpError(502, 'AI 가 이 페이지를 읽지 못했어요. 캡처로 다시 시도해 주세요.');
    if (!msg.parsed_output) throw new HttpError(502, 'AI 응답을 해석하지 못했어요. 다시 시도해 주세요.');

    return res.status(200).json({ ok: true, source, extract: msg.parsed_output, usage: msg.usage });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'AI 요청이 몰렸어요. 잠시 뒤 다시 시도해 주세요.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: '서버의 AI 키가 올바르지 않아요.' });
    if (e instanceof Anthropic.APIConnectionError) return res.status(502).json({ error: '서버에서 AI 로 연결하지 못했어요(외부 접속 확인 필요).' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `AI 오류 (${e.status ?? '연결'}): 잠시 뒤 다시 시도해 주세요.` });
    if ((e as Error)?.name === 'AbortError' || (e as { cause?: { code?: string } })?.cause?.code) {
      return res.status(502).json({ error: '서버에서 그 페이지로 접속하지 못했어요. 상세페이지 캡처를 올려 주세요.' });
    }
    console.error('[frame-check]', e);
    return res.status(500).json({ error: '처리 중 오류가 났어요.' });
  }
}

import { promises as fs } from 'fs';
import path from 'path';
import seedFrames from './seed-frames.json';

/**
 * 화면에서 추가한 회신을 담는 작은 저장소.
 * collection 하나당 JSON 파일 하나(`<APP_DATA_DIR>/<collection>.json`)에 `{ [id]: data }` 로 쌓는다.
 * 컨테이너가 재배포돼도 남도록 APP_DATA_DIR(기본 /app/data)에 Coolify 영구볼륨을 마운트해야 한다.
 */
const DATA_DIR = process.env.APP_DATA_DIR || path.join(process.cwd(), 'data');

// 화면이 쓰는 collection 만 받는다 — 아무 이름이나 파일로 만들어지지 않게
export const COLLECTIONS = new Set(['frame_replies']);

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type Doc = { id: string; data: Record<string, unknown> };

let queue: Promise<unknown> = Promise.resolve();

// 쓰기는 한 번에 하나씩 — 동시에 두 사람이 저장해도 파일이 깨지지 않게 순서대로 처리한다
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function fileOf(collection: string) {
  return path.join(DATA_DIR, `${collection}.json`);
}

async function readRaw(collection: string): Promise<Record<string, Record<string, unknown>>> {
  try {
    return JSON.parse(await fs.readFile(fileOf(collection), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

// 확정 사례(CS 채널 회신)를 저장소에 넣는다. 사례마다 딱 한 번만 넣고, 넣은 id 는 표식 파일
// (<collection>.json.seeded-ids)에 남겨 화면에서 지운 사례가 다시 살아나지 않게 한다.
// 예전 표식(.seeded, 첫 12건 s01~s12 를 넣었다는 뜻)만 있는 서버는 그 12건을 넣은 것으로 본다.
const SEEDS: Record<string, Record<string, Record<string, unknown>>> = { frame_replies: seedFrames };
const LEGACY_SEEDED = Array.from({ length: 12 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);

async function seededIds(collection: string): Promise<Set<string> | null> {
  try {
    return new Set(JSON.parse(await fs.readFile(`${fileOf(collection)}.seeded-ids`, 'utf8')));
  } catch {
    try {
      await fs.access(`${fileOf(collection)}.seeded`);
      return new Set(LEGACY_SEEDED);
    } catch {
      return null;
    }
  }
}

async function readAll(collection: string): Promise<Record<string, Record<string, unknown>>> {
  const seed = SEEDS[collection];
  const all = await readRaw(collection);
  if (!seed) return all;
  const done = (await seededIds(collection)) ?? new Set<string>();
  const fresh = Object.keys(seed).filter((id) => !done.has(id));
  // 이미 들어간 확정 사례의 문구를 고쳤을 때: seed 의 rev 가 더 크고, 서버 카드가 아직 손대지 않은
  // 확정 사례(seed:true — 관리자가 고친 카드는 저장 때 seed 표시가 빠진다)일 때만 새 문구로 바꾼다.
  const revised = Object.keys(seed).filter((id) => {
    const cur = all[id];
    return !!cur && cur.seed === true && Number(seed[id].rev || 0) > Number(cur.rev || 0);
  });
  if (!fresh.length && !revised.length) return all;
  for (const id of fresh) if (!(id in all)) all[id] = seed[id];
  for (const id of revised) all[id] = seed[id];
  await writeAll(collection, all);
  if (fresh.length) {
    fresh.forEach((id) => done.add(id));
    await fs.writeFile(`${fileOf(collection)}.seeded-ids`, JSON.stringify([...done]), 'utf8');
  }
  return all;
}

async function writeAll(collection: string, all: Record<string, Record<string, unknown>>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${fileOf(collection)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(all), 'utf8');
  await fs.rename(tmp, fileOf(collection));
}

export function validId(id: string) {
  return ID_RE.test(id);
}

export async function listDocs(collection: string): Promise<Doc[]> {
  const all = await serial(() => readAll(collection));
  return Object.keys(all)
    .sort()
    .map((id) => ({ id, data: all[id] }));
}

// createOnly 면 이미 있는 id 는 덮어쓰지 않고 null 을 돌려준다(관리자가 아닌 사람의 저장은 새 카드만)
export function setDoc(collection: string, id: string, data: Record<string, unknown>, createOnly = false) {
  return serial(async () => {
    const all = await readAll(collection);
    if (createOnly && id in all) return null;
    all[id] = data;
    await writeAll(collection, all);
    return data;
  });
}

export function deleteDoc(collection: string, id: string) {
  return serial(async () => {
    const all = await readAll(collection);
    delete all[id];
    await writeAll(collection, all);
  });
}

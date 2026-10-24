import { promises as fs } from 'fs';
import path from 'path';

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

async function readAll(collection: string): Promise<Record<string, Record<string, unknown>>> {
  try {
    return JSON.parse(await fs.readFile(fileOf(collection), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
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
  const all = await readAll(collection);
  return Object.keys(all)
    .sort()
    .map((id) => ({ id, data: all[id] }));
}

export function setDoc(collection: string, id: string, data: Record<string, unknown>) {
  return serial(async () => {
    const all = await readAll(collection);
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

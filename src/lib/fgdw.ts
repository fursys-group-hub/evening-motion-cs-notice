// fgdw (사내 MSSQL Data Warehouse) 연결 헬퍼.
//
// ⚠️ 서버사이드 전용 — 절대 클라이언트(브라우저)에서 import 하지 마세요.
//    이 모듈은 src/pages/api/* 안에서만 사용하세요. FGDW_DB_* 는 NEXT_PUBLIC_* 가
//    아니므로 브라우저로 노출되지 않습니다.
//
// 드라이버: mssql (tedious 기반, 순수 JS → Docker 친화).
//
// 자격증명 운영 안내:
//   - 로컬 개발 시 .env 의 FGDW_DB_USER / FGDW_DB_PASSWORD 에 "본인 fgdw 개발 계정" 을 넣습니다.
//   - 배포 시에는 중앙 배포 프록시가 USER/PASSWORD 를 사내 공용 시스템계정으로 강제 치환하고
//     HOST/NAME 을 정규화합니다. 따라서 실무자는 공용 비번을 몰라도 되며, 실제 시크릿을
//     repo 에 커밋하면 안 됩니다(.env 는 gitignore, .env.example 만 커밋).

import sql from 'mssql';

// fgdw host 는 `192.9.201.23,1672` 처럼 MSSQL 의 `server,port` 형식으로 들어올 수 있습니다.
// server 와 port 를 분리해서 mssql 설정에 넣습니다.
function parseHost(host: string, fallbackPort: string): { server: string; port: number } {
  const [server, portPart] = host.split(',');
  const port = Number((portPart ?? fallbackPort).trim());
  return { server: server.trim(), port };
}

function buildConfig(): sql.config {
  const host = process.env.FGDW_DB_HOST ?? '';
  const { server, port } = parseHost(host, process.env.FGDW_DB_PORT ?? '1672');
  return {
    server,
    port,
    database: process.env.FGDW_DB_NAME ?? 'fgdw',
    user: process.env.FGDW_DB_USER ?? '',
    password: process.env.FGDW_DB_PASSWORD ?? '',
    options: {
      encrypt: false, // 사내망 MSSQL
      trustServerCertificate: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let poolPromise: Promise<sql.ConnectionPool> | null = null;

/** 커넥션 풀을 반환합니다(없으면 생성, 있으면 재사용). 서버사이드 전용. */
export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(buildConfig()).connect();
  }
  return poolPromise;
}

/**
 * 파라미터 바인딩 쿼리. 결과 레코드 배열을 반환합니다.
 * 값은 반드시 params 로 전달하세요(문자열 연결 금지 → SQL 인젝션 방지).
 *
 * 예) query<{ name: string }>('SELECT name FROM sys.tables WHERE name = @t', { t: 'foo' })
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  const result = await request.query<T>(text);
  return result.recordset;
}

/** 예시 쿼리 — fgdw 의 테이블 목록 상위 5개. 실제 사용 시 SQL 을 바꿔주세요. */
export async function sampleTables(): Promise<{ name: string }[]> {
  return query<{ name: string }>('SELECT TOP 5 name FROM sys.tables ORDER BY name');
}

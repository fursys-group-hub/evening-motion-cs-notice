# AGENTS.md — AI 코딩 도구 작업 지침

이 파일은 Claude Code / OpenAI Codex / Kilo / Cursor 등 AI 코딩 도구가 본 프로젝트에서 작업할 때 따라야 하는 규칙입니다. 본 프로젝트는 **퍼시스홀딩스 사내 표준 스캐폴드 `@fursys/create-app`** 으로 생성되었고, 사내 Coolify 배포 정책을 따릅니다.

---

## 1. 프로젝트 정체

- **이름**: `evening-motion-cs-notice`
- **스택**: Next.js 15 (Page Router) + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **배포**: 사내 Coolify (단일 컨테이너, Next.js standalone 빌드)
- **외부 호스팅 의존성**: 0 (`NEXT_TELEMETRY_DISABLED=1`, Vercel 등 외부 서비스 호출 없음)
- **사용자**: 사내 비개발자 또는 주니어 — 코드를 추가할 때 학습 곡선이 낮게 유지되도록 신경

> AI 가 새 의존성을 추가하거나 빌드/배포 방식을 바꿀 때는 반드시 본 정체성을 깨뜨리지 않는지 확인해주세요.

---

## 2. 시크릿 규칙 (가장 중요 — 반드시 준수)

### 절대 금지

- ❌ `NEXT_PUBLIC_*` 변수에 시크릿(비밀번호, API Key, JWT secret, DB 자격증명 등) 절대 금지
  - `NEXT_PUBLIC_*` 는 빌드 시 브라우저 번들에 그대로 박혀 누구나 F12 → Sources 로 볼 수 있어요
- ❌ 클라이언트 컴포넌트(`src/pages/index.tsx`, `src/components/*`)에서 시크릿 직접 사용 금지

### 올바른 패턴

- ✅ 시크릿은 prefix 없이 `.env.local` 또는 Coolify Environment Variables 에만 보관
- ✅ 시크릿이 필요한 모든 호출(DB, OpenAI, 사내 백엔드 등)은 `src/pages/api/*.ts` 안에서만 실행
- ✅ 클라이언트에서는 `fetch('/api/...')` 같은 same-origin 호출만

### 예시

```ts
// ❌ 잘못된 예 — src/pages/index.tsx
const apiKey = process.env.NEXT_PUBLIC_OPENAI_KEY;   // 브라우저 노출!
fetch('https://api.openai.com/v1/chat', { headers: { Authorization: `Bearer ${apiKey}` } });

// ✅ 올바른 예 — src/pages/api/chat.ts
const apiKey = process.env.OPENAI_API_KEY;   // 서버에서만 실행
const result = await fetch('https://api.openai.com/v1/chat', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
res.status(200).json(await result.json());

// 그리고 src/pages/index.tsx 에서는
fetch('/api/chat')   // same-origin, 시크릿 노출 없음, CORS 자동 해결
```

---

## 3. 환경변수 컨벤션

### 변수명 규칙

```
<SERVICE>_<RESOURCE>_<DETAIL>
```

| 위치 | 의미 | 예시 |
|------|------|------|
| SERVICE | 시스템 식별자 | `FURSYS`, `APP`, `ADMIN` |
| RESOURCE | 자원 종류 | `DB`, `S3`, `JWT`, `API`, `LLM` |
| DETAIL | 세부 항목 | `URL`, `KEY`, `SECRET`, `REGION` |

**좋은 예:** `FURSYS_DB_PASSWORD`, `FURSYS_OPENAI_API_KEY`

**나쁜 예:** `API_KEY`, `dbUrl`, `BACKEND` (모호함, 형식 불일치)

### Build vs Runtime

| Prefix | 노출 범위 | Coolify 분류 | 용도 |
|--------|---------|-------------|------|
| `NEXT_PUBLIC_*` | **브라우저 노출** | Build Variable | 공개 가능한 앱 이름, 공개 API URL 등 |
| (prefix 없음) | 서버 전용 | Runtime Variable | 시크릿, DB 자격증명 |

> ⚠️ **`NEXT_PUBLIC_*` 를 추가하면 `Dockerfile` 의 `builder` 스테이지에 `ARG <이름>` + `ENV <이름>=$<이름>` 를 `npm run build` 전에 선언**해야 합니다. 선언이 없으면 Coolify 가 Build Variable 로 넘긴 값이 무시되어 `undefined` 로 번들에 박힙니다(빌드는 통과하지만 브라우저에서 깨짐).
>
> ⚠️ **Coolify 는 빌드에 `NODE_ENV=production` 을 주입**합니다. 그대로면 `npm ci` 가 devDependencies(tailwind·typescript 등)를 스킵해 빌드가 깨지므로, **설치(`deps`) 스테이지에 `ENV NODE_ENV=development` 를 명시해 덮어써야** 합니다(Dockerfile 기본 템플릿에 이미 반영됨 — 지우지 마세요). `NODE_ENV=production` 은 `runner` 스테이지에만 둡니다.

새 환경변수를 추가할 때 반드시 `.env.example` 도 함께 업데이트해주세요. 변수의 용도와 (필요 시) 발급처 안내 주석을 같이 작성해주세요.

---

## 4. UI 작성 규칙

### 우선 순위

1. **shadcn/ui 컴포넌트 우선** — `src/components/ui/` 에 이미 들어있는 것 (`Button`, `Card` 등) 을 먼저 활용
2. shadcn 에 없으면 **Tailwind 유틸리티 클래스** 로 조립
3. 자체 CSS 작성은 마지막 수단 (`src/styles/globals.css` 의 `@layer base` 정도까지만)

### shadcn 컴포넌트 추가가 필요할 때

- 새 컴포넌트는 `src/components/ui/<name>.tsx` 에 같은 패턴(`React.forwardRef`, `cn()`)으로 작성
- `src/lib/utils.ts` 의 `cn()` 헬퍼를 className 합성에 사용

### 디자인 토큰

- **브랜드 색상**: Tailwind 의 `brand` 토큰 (`bg-brand`, `text-brand`) — `tailwind.config.ts` 에 `#2272eb` 로 정의
- **폰트**: Pretendard (`_document.tsx` 에서 CDN 로드, 로컬 npm 패키지로 전환은 선택)
- **반응형**: 모바일 우선 → 데스크탑 (`md:`, `lg:` breakpoint)
- **다크 모드**: 현재 미지원. 필요 시 별도 plan 으로 추가

### 금지

- ❌ `dangerouslySetInnerHTML` 사용 금지 (XSS 위험). 꼭 필요하면 DOMPurify 같은 검증 거치고 주석으로 사유 명시
- ❌ `localStorage` 에 access_token / 시크릿 저장 금지 (XSS 노출). 인증이 필요하면 httpOnly cookie 패턴 사용

---

## 5. API Routes 패턴 (`src/pages/api/*.ts`)

### 기본 형식

```ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // 시크릿 사용 OK (서버에서만 실행)
  const token = process.env.FURSYS_BACKEND_API_TOKEN;
  // ... 외부 호출 / DB 쿼리 / 로직 ...
  res.status(200).json({ ok: true });
}
```

### 권장 사항

- HTTP 메서드 검증 (`req.method !== 'POST'` 등) 먼저
- 외부 호출 실패 시 적절한 상태 코드 + JSON 응답 (절대 500 + stack trace 노출 금지)
- DB 자격증명, API key 는 `process.env.<NAME>` 으로만 접근
- 응답에 절대 시크릿 포함 금지 — 응답 JSON 검토 후 시크릿이 새지 않는지 확인

### 헬스 체크 라우트 보호

- `src/pages/api/healthz.ts` 는 Coolify Health Check 가 호출함. 절대 삭제하지 마시고, 응답을 200 + `{ status: 'ok' }` 형태로 유지해주세요
- 헬스 체크 응답에 DB/외부 API 의존성을 추가하지 마세요 (의존성이 일시 죽으면 컨테이너가 unhealthy 로 표시됨)

---

## 6. Coolify 배포 표준 유지

### 절대 깨뜨리지 말 것

- ✅ `Dockerfile` 의 3-stage 구조 유지 (`deps` → `builder` → `runner`)
- ✅ `next.config.mjs` 의 `output: 'standalone'` 유지 (이미지 경량화 필수)
- ✅ `NEXT_TELEMETRY_DISABLED=1` 유지 (외부 호스팅 의존성 0 정책)
- ✅ `EXPOSE 3000`, `HOSTNAME=0.0.0.0` 유지 (Coolify 포트 매핑 호환)
- ✅ non-root `nextjs` 사용자로 실행 (보안)

### Docker Compose 금지

사내 Coolify 정책상 `docker-compose.yml` 사용 불가. 추가 서비스가 필요하면 **별도 Coolify Application** 으로 분리해주세요.

### 의존성 추가 시

- `package.json` 에 추가 후 반드시 로컬에서 `docker build -t test .` 으로 이미지 빌드 통과 확인
- 네이티브 모듈(예: `sharp`, `bcrypt`) 추가 시 alpine 호환성 확인 (`apk add` 필요 여부)

---

## 7. 응답 톤 (AI 가 사람에게 답할 때)

이 프로젝트의 사용자(코드 작성자)는 사내 비개발자 또는 주니어 가능성이 큽니다.

- **한국어로 응답**
- 정중하고 부드러운 어조 (`~합니다`, `~하시면 좋을 것 같아요`)
- 기술 용어는 풀어쓰기 (예: "BFF" → "백엔드 연결 다리")
- 명령조 회피 (`~하세요` < `~해주시면 좋습니다`)
- 위험한 작업(git push --force, 운영 환경 변경 등) 은 명확히 경고 후 사용자 확인 받기

---

## 8. 변경 시 함께 업데이트할 파일

새 기능을 추가할 때 다음 파일도 같이 갱신해주세요:

| 변경 사항 | 함께 업데이트할 파일 |
|---------|-------------------|
| 새 환경변수 사용 | `.env.example` (주석 + 분류 + 예시값) |
| 새 환경변수 — 시크릿 | `README.md` 의 환경변수 안내 + Coolify 등록 안내 |
| 새 API Routes | `README.md` 의 라우트 목록 (있을 경우) |
| 새 페이지 추가 | `README.md` 의 페이지 흐름 안내 |
| 의존성 추가 | `package.json` + `Dockerfile` 빌드 확인 |
| Dockerfile 변경 | `.dockerignore` 도 점검 |
| 보안 영향이 있는 변경 | 본 `AGENTS.md` 에 새 규칙 추가 |

---

## 9. 자주 묻는 시나리오

### Q. 외부 API(예: OpenAI, 카카오 지도) 를 부르고 싶어요

→ `src/pages/api/<name>.ts` 안에서 호출. 클라이언트에서 직접 호출 금지. 시크릿 키는 prefix 없이 보관.

### Q. DB(PostgreSQL/MSSQL 등) 에 직접 접근하고 싶어요

→ 동일하게 `src/pages/api/<name>.ts` 안에서 SDK 사용. 자격증명은 Coolify Environment Variables 에 `Locked=Yes` 로 등록.

### Q. 인증/로그인을 구현하고 싶어요

→ httpOnly cookie + `pages/api/auth/*.ts` 패턴 권장. `localStorage` 에 토큰 저장은 XSS 위험으로 금지. 사내 SSO 가 있으면 그 흐름을 따라주세요.

### Q. 새 컴포넌트가 필요해요

→ 먼저 `src/components/ui/` 확인. 없으면 shadcn/ui 공식 사이트(`ui.shadcn.com`) 의 컴포넌트 코드를 같은 형식으로 추가.

### Q. 화면 라우팅을 추가하고 싶어요

→ `src/pages/<name>.tsx` 파일을 만들면 자동으로 `/<name>` URL 이 됩니다 (Page Router). 동적 경로는 `[id].tsx` 같은 대괄호 표기.

---

## 10. 본 지침의 우선순위

본 지침은 **사내 표준** 과 **사용자의 직접 지시** 다음 순위입니다.

1. 사용자의 직접 지시 (최우선)
2. 사내 보안 / 배포 정책 (위 § 2, § 6)
3. 본 AGENTS.md 의 나머지 규칙
4. 일반적인 모범 사례

사용자가 본 지침에 반하는 지시를 했다면, 일단 우려를 한 번 말씀드리되 최종 결정은 사용자에게 맡깁니다.

---

> 본 파일은 `@fursys/create-app` 스캐폴드가 자동 생성했어요.
> 프로젝트가 진화하면서 규칙을 추가/갱신하셔도 좋습니다.

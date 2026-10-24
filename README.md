# evening-motion-cs-notice

퍼시스 사내 표준 프로젝트입니다. Next.js (Page Router) + TypeScript + Tailwind CSS + shadcn/ui 로 구성되어 있고, 사내 Coolify 에 바로 올릴 수 있도록 Dockerfile 이 함께 들어 있어요.

## 시작하기

스캐폴드 시 라이브러리는 자동으로 설치되어 있어요. 바로 개발 서버를 띄우시면 됩니다.

```bash
npm run dev          # → http://localhost:3000
```

> 만약 스캐폴드 시 `--no-install` 옵션을 사용하셨다면, `npm install` 을 먼저 실행해주세요.

화면은 `public/notice.html` 한 장이에요(이브닝 모션 안내사항 — 프레임 호환 아카이브 + 유저가이드). 화면에서 "회신 추가"로 넣은 회신은 `/api/store/frame_replies` 가 `APP_DATA_DIR`(기본 /app/data, 영구볼륨)에 저장해요.

서버 측 로직(DB 조회, 외부 API 호출, 시크릿 다루는 작업)은 `src/pages/api/*` 안에 넣어주세요. 같은 도메인으로 호출되기 때문에 CORS 가 발생하지 않고, 시크릿이 브라우저로 노출되지도 않아요.

## AI 코딩 도구로 이어가기

본 프로젝트에는 AI 코딩 도구(Claude Code, Kilo, Cursor 등) 가 자동으로 참고하는 지침 파일이 들어 있어요:

- [`AGENTS.md`](./AGENTS.md) — 사내 규칙 본문 (시크릿 / 환경변수 컨벤션 / UI / API Routes / Coolify 배포 / 응답 톤)
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 진입점 (AGENTS.md 참조)

AI 도구로 "사용자 등록 기능 만들어줘" 같은 요청을 하시면, 이 지침을 자동으로 읽어 시크릿을 안전한 위치에 두고, shadcn 컴포넌트를 사용하고, 변수명 컨벤션을 지키는 코드를 만들어 줍니다.

## 폴더 구조

```
src/
├── pages/
│   ├── index.tsx           # 첫 화면 (헤더 + 카드)
│   ├── api/
│   │   ├── healthz.ts      # Coolify Health Check
│   │   └── hello.ts        # 서버 측 로직 샘플 (BFF)
│   ├── _app.tsx
│   └── _document.tsx
├── components/ui/          # shadcn/ui 컴포넌트
├── lib/utils.ts            # cn() 헬퍼
└── styles/globals.css      # Tailwind
```

## 환경 변수

`.env.example` 을 복사해서 `.env.local` 을 만들어 로컬에서 사용해주세요.

```bash
cp .env.example .env.local
```

> ⚠️ **시크릿 보안 규칙**
> - `NEXT_PUBLIC_*` 로 시작하는 변수는 브라우저로 그대로 노출됩니다. 비밀번호/API Key/토큰 같은 시크릿은 절대 `NEXT_PUBLIC_*` 에 넣지 마세요.
> - 시크릿은 prefix 없이 등록하고, `src/pages/api/*` 안에서만 사용해주세요. 서버에서만 실행되므로 안전합니다.
> - 자세한 규칙은 [`AGENTS.md`](./AGENTS.md) 의 § 2, § 3 참고.

## 배포하기 (사내 Coolify)

1. 이 저장소를 사내 GitLab 또는 GitHub 에 푸시해주세요.
2. Coolify 대시보드에서 `+ New Application` → 해당 저장소를 선택해주세요.
3. **Build Pack**: `Dockerfile` 을 선택해주세요. (Docker Compose / Nixpacks / Buildpacks 는 사내 정책상 사용하지 않습니다)
4. **Port**: `3000` 으로 설정해주세요.
5. **Health Check Path**: `/api/healthz` 를 입력해주세요.
6. **Environment Variables**: `.env.example` 에 적힌 변수들을 등록해주세요. 시크릿은 `Locked` 체크박스를 켜주세요.
7. **Deploy** 버튼을 눌러주세요.

배포가 끝나면 Coolify 가 발급한 URL 로 접속해보고, `/api/healthz` 가 `{"status":"ok"}` 를 반환하는지 확인해주세요.

## 자주 묻는 것

**Q. DB(PostgreSQL/MSSQL 등) 에 직접 연결하고 싶어요.**
A. `src/pages/api/` 안에 새 파일을 만들고 거기서 연결해주세요. 예: `src/pages/api/sales.ts` 에서 DB 쿼리. 자격증명은 Coolify Environment Variables 탭에 `Locked=Yes` 로 등록한 뒤 `process.env.FURSYS_DB_PASSWORD` 처럼 사용하시면 됩니다.

**Q. OpenAI / Anthropic 같은 외부 API 를 부르고 싶어요.**
A. 위와 동일하게 `src/pages/api/` 에서 호출해주세요. 키는 Coolify 에서 `Locked` 로 등록하시면 됩니다. 클라이언트(`pages/index.tsx` 등) 에서 직접 호출하면 키가 브라우저로 노출됩니다.

**Q. CORS 가 발생해요.**
A. `src/pages/api/` 를 거치면 같은 도메인 호출이라 CORS 가 발생하지 않습니다. 클라이언트에서 외부 도메인을 직접 호출하지 마시고, 항상 `/api/...` 를 거쳐주세요.

**Q. 라이브러리(node_modules) 가 너무 커요.**
A. Next.js 프로젝트는 보통 400 MB 정도 됩니다. 정상이에요. 운영 Docker 이미지는 standalone 빌드로 ~150 MB 까지 줄어들고, 사용자 브라우저는 1 MB 정도만 받아요.

## 유용한 링크

- 이 스캐폴드(create-app): https://github.com/ai-admin-hub/fursys-create-app
- 배포·사용 문의: IT본부 AI추진팀

## 라이선스

사내 전용 · © 2026 Fursys Holdings

# CLAUDE.md

본 프로젝트(`evening-motion-cs-notice`) 의 AI 작업 지침은 [`AGENTS.md`](./AGENTS.md) 를 참조해주세요.

## 가장 중요한 3가지 (반드시 준수)

1. **시크릿은 `src/pages/api/*` 안에서만** — `NEXT_PUBLIC_*` 에 비밀번호/API Key/토큰 절대 금지 (브라우저 노출됨)
2. **변수명 컨벤션**: `<SERVICE>_<RESOURCE>_<DETAIL>` (예: `FURSYS_DB_PASSWORD`)
3. **UI 는 shadcn/ui + Tailwind 우선** — `src/components/ui/` 의 컴포넌트 먼저 활용

자세한 규칙(API Routes 패턴, Coolify 배포 표준, 응답 톤 등) 은 `AGENTS.md` 에 정리되어 있어요.

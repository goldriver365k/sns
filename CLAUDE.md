# AI 콘텐츠 매니저

- 기준 문서: `docs/SPEC.md` — 작업 전에 반드시 읽고 따른다. 데이터 구조 등을 바꾸면 이 문서에도 반영한다.
- 설정·배포 안내: `docs/SETUP.md`
- 진행 현황: `docs/PROGRESS.md`
- 운영 안내: `docs/OPERATIONS.md`
- AI 자동 릴스: `docs/REELS.md` (구현 현황·다음 단계·라이선스 검토)
- 디자인 시스템: `docs/DESIGN.md` (토큰·글자 크기·공용 스타일 `src/components/ui.ts`·화면 구성). 화면을 만들거나 고칠 때 따른다. 화면 디자인 작업은 `ui-designer` 에이전트(`.claude/agents/ui-designer.md`)를 쓸 수 있다.
- 엑셀·워드 문서 도구(사이트와 별도 프로그램): `tools/office-viewer/README.md` — 확인: `npm run build:office`
- 화면 문구, 주석, 보고는 모두 한국어로 한다. 의존성은 꼭 필요한 것만 쓴다.
- OpenAI·뉴스 API 키 등 비밀값은 Netlify 환경변수에만 둔다. `VITE_` 접두사 변수는 브라우저에 노출되므로 비밀값에 쓰지 않는다.
- 기존 Firebase 프로젝트·Netlify 사이트는 절대 수정하거나 삭제하지 않는다.
- 확인: `npm run build` (타입 검사 + 빌드)

# SALU 작업 기준

- 개인 AI 지침(`~/.agents/AI_INSTRUCTIONS.md`, `~/.agents/HOST.md`, Codex의 `~/.codex/AGENTS.md`)이 있으면 먼저 확인
- 로컬 `.local/AGENTS.md`가 있으면 작업 전에 읽고 개인 검증 절차 적용
- 작업 전 `docs/development-contract.md` 확인. 해당 기능의 로컬 검증 기록이 있으면 함께 확인
- 구현 범위: README `지금 되는 것`과 GitHub Issue #15 목록에서 맡은 기능. 목록에 없는 기능·메뉴·테이블은 조원과 합의해 #15에 적기 전에는 만들지 않음. 개인 기록은 docs/personal-storage.md, 상담·알림·디자이너·커뮤니티 서버 API는 docs/*-api.md 계약 적용. 예시 체험은 메모리 전용. 실제 소셜 제공자 client 설정·동의는 별도 확인 전까지 완료로 보지 않음
- 기존 인증 backend와 로컬 검증 기록 보존. 테스트·Playwright·검증 도구·Linux 전용 DB 도구·NAS 설정은 로컬 전용이며 Git 공유 제외. 로컬 검증 환경이 있으면 화면·실제 인증·저장/API/DB 검증을 구분하고, 예시 화면 통과를 업무 DB·전송 검증으로 주장하지 않음
- Controller는 입력/응답, Service는 업무·소유권·트랜잭션, Mapper는 SQL 담당
- URL 인증/역할 규칙은 SecurityConfig에 집중. 자원 소유권·상담 참여자 검사는 해당 Service에서 수행
- Security filter 오류는 SecurityConfig, MVC 오류는 GlobalExceptionHandler에서 처리. 같은 ApiError JSON 사용, Controller별 try-catch·redirect·오류 형식 추가 금지
- 여러 DB 변경은 Service의 Spring `@Transactional`로 묶고 proxy 경유 호출. 조회 전용은 필요 시 `readOnly=true`. checked exception도 롤백해야 하는 메서드는 `rollbackFor` 명시
- 오류를 잡아 성공 응답으로 바꾸어 부분 저장을 남기지 않음. 조건부 UPDATE 0행·중복 key도 실패로 처리
- 파일·HTTP·STOMP는 DB 롤백으로 되돌아가지 않음. 실시간 신호는 `RealtimePublisher`(commit 뒤 전송), 알림은 `NotificationService.create`(업무 transaction 안)로만 보냄
- 실제 MySQL 커밋/롤백 검증은 테스트 전용 salu_test·fixture 사용. 테스트 메서드 자체에 @Transactional을 붙여 Service의 커밋 여부를 가리지 않음
- 테스트 API·테이블·보안 완화는 src/test에만 배치. 일반 실행 jar/API에 포함 금지
- .env·비밀번호·원문 요청·SQL 오류를 응답/로그/Git에 넣지 않음. 적용한 Flyway migration 수정·기존 Salon/DB 초기화 금지
- 변경한 공통 동작은 빌드뿐 아니라 실제 서버/API·DB·브라우저에서 확인. 테스트 결과로 구현되지 않은 기능을 완료 처리하지 않음

## 함께 작업할 때

- 두 명이 작업해 기능·수정마다 Issue를 만들지 않음. 작업 하나당 branch 하나(`fix/<짧은 이름>`, `feat/<짧은 이름>`). main에 직접 push하지 않고 PR로 merge
- 새 화면·이동은 `docs/screen-flow.md`를 코드보다 먼저 고치고 PR에서 흐름 확인. 제목·뒤로 링크·완료 화면은 `PageHeading`·`BackLink`·`completion.tsx` 공통 부품 사용
- 화면을 만들거나 고칠 때는 `DESIGN.md`(색·배치·공통 패턴·문구)와 `PRODUCT.md`(제품 맥락) 적용. 새 색·글꼴·스타일 체계를 만들지 않고 `frontend/src/theme.css` 토큰 사용. 디자인 skill도 이 기준 안에서만 적용
- `backend/`·DB migration·`docs/`·작업 지침은 CODEOWNERS 승인 필요. 서버 API가 더 필요하면 계약 문서 변경을 먼저 PR로 올림. 화면 작업에서 서버 코드를 함께 고치지 않음
- 기존 Salon 코드는 로직만 참고하고 복사하지 않음. 피할 점은 docs/development-contract.md의 `기존 Salon 참고`

- 로그인 변경 전 docs/login.md 확인. 로컬 docs/salon-security-audit.md가 있으면 참고. 요청 role/memberId 사용 금지, ACTIVE 상태·전체 CSRF·세션 교체·JSON 실패 계약 유지
- 서버 API 구현·호출 전 해당 docs/*-api.md 확인(상담·알림·디자이너·커뮤니티). 경로·필드·오류를 바꿀 때는 코드보다 문서를 먼저 갱신

- Git의 Markdown은 README·파일 안내(docs/files.md)·작업 지침·디자인 기준(DESIGN.md·PRODUCT.md)·스킬·PR 템플릿·개발/인증/저장 계약·API 계약(docs/*-api.md)·화면 흐름(docs/screen-flow.md)만 유지. 파일을 추가·삭제·이동하면 docs/files.md도 갱신. 진행상황·할 일·기능 검토·구버전·운영/배포 안내·발표 메모는 로컬 보관, Git 추적 제외. 새 공유 문서는 .gitignore 허용 목록을 명시적으로 갱신

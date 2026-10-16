# SALU 작업 기준

- `~/.agents/AI_INSTRUCTIONS.md`, `~/.agents/HOST.md`, Codex의 `~/.codex/AGENTS.md`를 먼저 확인
- 로컬 `.local/AGENTS.md`가 있으면 작업 전에 읽고 개인 검증 절차 적용
- 작업 전 `docs/development-contract.md` 확인. 해당 기능의 로컬 검증 기록이 있으면 함께 확인
- 현재 승인 범위: SALU 자체 미용실/공개 디자이너 등록·선택·앱 달력·공통 완료 화면 포함. 초기 React 화면·Spring 인증·이메일 회원가입·IndexedDB 개인 기록/사진/전체 초안·ZIP 복사본 복원·로그인 후 자동 암호화 백업·Google OIDC/네이버 OAuth2 및 명시적 연결. docs/personal-storage.md의 계약 적용. 로그인 회원의 상담 요청·받은 상담·답변 1회는 docs/consultation-api.md 계약 적용. 예시 체험은 메모리 전용. 실제 소셜 제공자 client 설정/동의 검증·도메인 기록 CRUD·상담 알림/실시간 대화·후기·커뮤니티·앱은 후속.
- 상담 예시 승인: 사용자 제공 KakaoTalk_20261007_120806990.jpg의 지우 이미지·소개·후기·세 커트 자료와 동선 적용. 기존 담당자 → 상담 요청 → 자료 선택·이번 요청 한 화면 → 요청 보내기 → 전달했어요 → 상담 내역·답변 대기. 준비 내용에서는 고른 디자이너(담당 아니어도)에게 바로 상담 작성. 예시 표시는 상단만, 자동 가짜 답변 없음. 개인 커트 준비와 별도 메모리 상담 저장소 사용. 상담 완료를 ‘커트 준비 완료’·‘보여 줄 내용’으로 되돌리지 않음. 실제 공간은 같은 동선을 서버 상담 API에 연결하며, 예시 완료를 서버 전송 검증 근거로 주장하지 않음
- 기존 인증 backend와 로컬 검증 기록 보존. 테스트·Playwright·검증 도구·Linux 전용 DB 도구·NAS 설정은 로컬 전용이며 Git 공유 제외. 로컬 검증 환경이 있으면 화면·실제 인증·저장/API/DB 검증을 구분하고, 예시 화면 통과를 업무 DB·전송 검증으로 주장하지 않음
- Controller는 입력/응답, Service는 업무·소유권·트랜잭션, Mapper는 SQL 담당
- URL 인증/역할 규칙은 SecurityConfig에 집중. 자원 소유권·상담 참여자 검사는 해당 Service에서 수행
- Security filter 오류는 SecurityConfig, MVC 오류는 GlobalExceptionHandler에서 처리. 같은 ApiError JSON 사용, Controller별 try-catch·redirect·오류 형식 추가 금지
- 여러 DB 변경은 Service의 Spring `@Transactional`로 묶고 proxy 경유 호출. 조회 전용은 필요 시 `readOnly=true`. checked exception도 롤백해야 하는 메서드는 `rollbackFor` 명시
- 오류를 잡아 성공 응답으로 바꾸어 부분 저장을 남기지 않음. 조건부 UPDATE 0행·중복 key도 실패로 처리
- 파일·HTTP·STOMP는 DB 롤백으로 되돌아가지 않음. 해당 기능 전에 커밋 후 전송·실패 복구 정책 확정
- 실제 MySQL 커밋/롤백 검증은 테스트 전용 salu_test·fixture 사용. 테스트 메서드 자체에 @Transactional을 붙여 Service의 커밋 여부를 가리지 않음
- 테스트 API·테이블·보안 완화는 src/test에만 배치. 일반 실행 jar/API에 포함 금지
- .env·비밀번호·원문 요청·SQL 오류를 응답/로그/Git에 넣지 않음. 적용한 Flyway migration 수정·기존 Salon/DB 초기화 금지
- 변경한 공통 동작은 빌드뿐 아니라 실제 서버/API·DB·브라우저에서 확인. 테스트 결과로 구현되지 않은 기능을 완료 처리하지 않음

- 로그인 변경 전 docs/login.md 확인. 로컬 docs/salon-security-audit.md가 있으면 참고. 요청 role/memberId 사용 금지, ACTIVE 상태·전체 CSRF·세션 교체·JSON 실패 계약 유지
- 상담 API 구현·호출 전 docs/consultation-api.md 확인. 경로·필드·오류를 바꿀 때는 코드보다 문서를 먼저 갱신

- Git의 Markdown은 README·파일 안내(docs/files.md)·작업 지침·스킬·개발/인증/저장/상담 계약만 유지. 파일을 추가·삭제·이동하면 docs/files.md도 갱신. 진행상황·할 일·기능 검토·구버전·운영/배포 안내·발표 메모는 로컬 보관, Git 추적 제외. 새 공유 문서는 .gitignore 허용 목록을 명시적으로 갱신

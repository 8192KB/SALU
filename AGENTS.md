# SALU 작업 기준

- `~/.agents/AI_INSTRUCTIONS.md`, `~/.agents/HOST.md`, Codex의 `~/.codex/AGENTS.md`를 먼저 확인
- 작업 전 `docs/development-contract.md`와 해당 기능의 검증 기록 확인
- 현재 범위는 공통 기반과 로컬 로그인·세션 조회·로그아웃. 회원가입·기록·사진·디자이너·상담·후기·커뮤니티 구현은 별도 요청 후 진행
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

- 로그인 변경 전 docs/login.md와 docs/salon-security-audit.md 확인. 요청 role/memberId 사용 금지, ACTIVE 상태·전체 CSRF·세션 교체·JSON 실패 계약 유지

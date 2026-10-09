# 로그인 실행과 검증

현재 범위: 로컬 이메일/비밀번호 로그인, 세션 회원 조회, 로그아웃, React 화면. 회원가입·OAuth·관리자/디자이너 권한·비밀번호 변경은 다음 단계.

## 실행

`docs/local-runtime.md`의 MySQL·서버·React 실행 후 http://127.0.0.1:5174 접속.

이미 생성된 로컬 확인 계정은 `dev@salu.local`. 무작위 비밀번호는 프로젝트의 `.env.dev-login.json`에만 저장(권한600, Git 제외). 이 파일은 개발 확인용이며 프론트 번들·서버 설정에 포함하지 않음. 다음 명령으로 원하는 별도 개발 계정 생성 가능.

```bash
cd /home/chuwe/soldesk/SALU
./scripts/create-dev-member.sh
```

대화형 이메일·표시 이름·비밀번호 입력. 비밀번호는 화면에 표시하지 않음. 12자 이상·UTF-8 72바이트 이하, 이메일 trim/소문자 정규화. 로컬127.0.0.1:3307/salu_dev에만 INSERT하며 중복 계정은 덮어쓰지 않음. backend jar가 먼저 필요. root·Salon DB·회원가입 API 사용 없음. `--stdin`은 자동 검증에서만 사용하며 비밀번호를 shell 인자에 넣지 않음.

## API

| 경로 | 동작 |
|---|---|
| GET /api/csrf | 세션 masked token/headerName, no-store |
| POST /api/auth/login | application/x-www-form-urlencoded email/password + CSRF header.200은 id/email/displayName만, 실패401/LOGIN_FAILED |
| GET /api/auth/me | 로그인 회원 id/email/displayName, 비로그인401 |
| POST /api/auth/logout | CSRF 필수, 세션 무효화·SALU_SESSION 삭제,204. GET으로 로그아웃하지 않음 |

React는 각 변경 요청 전에 CSRF 조회, 쿠키 자동 전송. 로그인·로그아웃 후 토큰 재조회. 비밀번호는 전송 후 입력에서 제거, localStorage·로그 저장 없음. 토큰 재조회가 일시 실패해도 이미 성공한 로그인/로그아웃을 실패로 바꾸지 않으며 다음 요청 전에 다시 조회.

세션 추적은 cookie만 허용(jsessionid URL 제외). 현재 cookie: HttpOnly/SameSite=Lax,30분 세션. HTTPS에서는 SALU_COOKIE_SECURE=true. 인증 성공 시 session ID 교체, 이전 CSRF 무효화. 현재 계정 상태는 보호 요청에서 DB 재확인. 로그인 조회는 단일 SELECT로 불필요한 쓰기 트랜잭션을 추가하지 않음. 다중 변경 Service의 트랜잭션 규칙은 development-contract 유지.

로그인 query string 거부(비밀번호 URL 전송 금지), 중복 파라미터·이메일·BCrypt72바이트 제한 검사. IP당30회/60초 후429, 요청 X-Forwarded-For를 신뢰하지 않음. 단일 개발 서버 범위의 방어이며 배포 전 프록시·분산 방어는 추가 검증 필요. 요청 role/memberId는 권한 부여에 사용하지 않음. ACTIVE만 로그인, 존재하지 않음·틀린 비밀번호·비활성 모두 동일 실패.

DB 장애: 로그인503/AUTHENTICATION_UNAVAILABLE, 기존 세션 요청503/DATABASE_UNAVAILABLE. 내부 DB 예외를 원인 없이 고정 예외로 바꿔 인증 필터 로그의 SQL·비밀 노출 차단. DB 장애에도 유효CSRF 로그아웃 가능. 공개health는 기존503/HealthResponse 계약 유지.

## 검증

```bash
cd /home/chuwe/soldesk/SALU
./scripts/verify-backend.sh
python scripts/verify-api.py
cd frontend
npm run build
SALU_E2E_LOGIN_FILE=../.env.dev-login.json npm run test:e2e
```

실제 DB 테스트는 salu_test 전용 생성 계정을 각 테스트 후 삭제. 운영 jar에 테스트 API/테이블/보안 완화 없음. 일반 mvnw verify는 실제 DB 테스트를 건너뛰므로 verify-backend 사용. E2E는 서버8081·DB3307 필요; 계정 파일을 지정하지 않으면 로그인 E2E만 skip이므로 전체 완료 근거로 사용하지 않음.

검증 범위: 세션 ID 변경/이전 세션 replay 차단, CSRF 로그인·로그아웃 필수/이전 token 차단, 새로고침 로그인 유지, 로그아웃 후401, 잘못된 입력·중복 parameter·긴 다국어 비밀번호400, 계정 상태 차단/로그인 중 탈퇴 후 세션 무효화, 고정 실패 응답/해시 비노출, IP 제한/헤더 위조, DB 장애·복구, 모바일 화면. Salon 정적 감사는 salon-security-audit 참고.

실제 DB 장애 검증은 개발 서버를 켠 상태에서 아래 명령 실행. SALU 전용 로컬 MySQL을 잠시 중단하고 finally에서 재시작하므로 다른 SALU 테스트와 동시에 실행하지 않음.

```bash
python scripts/verify-login-db-recovery.py --db-outage
```

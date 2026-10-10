# 로그인 실행과 검증

React 초기 화면에 실제 Spring 세션 로그인·회원 조회·로그아웃 연결 완료(2026-10-10). 이전 준비본 `8bcace5`의 인증 계약을 유지하고 현재 UI의 계정 상태·오류 복구·예시 데이터 분리를 추가.

현재 범위: 로컬 이메일/비밀번호 로그인, 세션 회원 조회, 로그아웃, React 연결. 회원가입·OAuth·관리자/디자이너 권한·비밀번호 변경은 후속. 기록·사진·요청은 메모리 예시이며 로그인해도 서버 저장되지 않음.
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
npm run test:e2e
SALU_E2E_LOGIN_FILE=../.env.dev-login.json npm run test:auth
```

실제 DB 테스트는 salu_test 전용 생성 계정을 각 테스트 후 삭제. 운영 jar에 테스트 API/테이블/보안 완화 없음. 일반 mvnw verify는 실제 DB 테스트를 건너뛰므로 verify-backend 사용. `test:e2e`는 서버 없는 화면 전용 검증, `test:auth`는 서버8081·DB3307·실제 계정 필요. 인증 검증의 기본 계정 경로는 `.env.dev-login.json`; 다른 파일은 SALU_E2E_LOGIN_FILE 지정. 파일 누락/오류는 skip이 아닌 실패. 실제 비밀번호·token이 포함될 trace·영상·스크린샷은 저장하지 않음.

검증 범위: 세션 ID 변경/이전 세션 replay 차단, CSRF 로그인·로그아웃 필수/이전 token 차단, 새로고침 로그인 유지, 로그아웃 후401, 잘못된 입력·중복 parameter·긴 다국어 비밀번호400, 계정 상태 차단/로그인 중 탈퇴 후 세션 무효화, 고정 실패 응답/해시 비노출, IP 제한/헤더 위조, DB 장애·복구, 모바일 화면. Salon 정적 감사는 salon-security-audit 참고.

실제 DB 장애 검증은 개발 서버를 켠 상태에서 아래 명령 실행. SALU 전용 로컬 MySQL을 잠시 중단하고 finally에서 재시작하므로 다른 SALU 테스트와 동시에 실행하지 않음.

```bash
python scripts/verify-login-db-recovery.py --db-outage
```

## React 연결 동작 · 2026-10-10

- 기본 `npm run dev`는 실제 세션 확인. 명시적 `npm run dev:prototype`만 API 없는 화면 전용 모드
- 첫 세션 확인 뒤 화면 표시. `/api/auth/me`의 401만 비로그인. 503·연결 오류는 확인 불가로 표시하고 재확인 제공
- CSRF는 매 변경 요청 전에 새로 조회. 403/CSRF_INVALID만 한 번 재조회·재전송; ACCESS_DENIED·네트워크 실패는 자동 재전송 없음
- 늦게 도착한 회원 조회 응답이 최신 로그인 결과를 덮어쓰지 않도록 요청 순서 확인. 창으로 돌아올 때 세션 재확인
- 로그인·로그아웃·다른 회원/비로그인 상태 확인 시 예시 repository와 모든 초안·임시 사진 URL 초기화. 서버 장애만으로 작성 중 예시를 지우지 않음
- 로그아웃 실패는 성공으로 표시하지 않고 기존 회원·예시 유지. 재시도 또는 세션 재확인으로 회복
- 서버 응답의 숫자 회원 ID는 안전한 정수인지 확인한 뒤 프론트 내부 문자열로 정규화. 신규 업무 API의 문자열 ID 계약과 구분
- 비밀번호는 전송 후 입력에서 제거. 회원/CSRF/token을 localStorage·sessionStorage에 저장하지 않음

현재 React의 인증 경계는 예시 자료 구분까지. 회원별 커트 저장·소유권·사진 접근·디자이너 답변을 검증한 결과가 아님.

### 이번 연결 검증 결과

실제 Spring8081·MySQL3307에 연결해 `npm run test:auth` **9개 통과, skip 없음(21.7초)**. 로그인 실패·성공, session ID 교체, HttpOnly/SameSite cookie, 새로고침, 로그아웃 후401, 예시 초안 분리, 외부 로그아웃 감지, 모바일 포함.

503·접속 중단·CSRF 만료·권한 거부·성공 후 token 조회 실패는 브라우저 요청을 가로채 장애 응답을 재현. 실제 DB를 이번 작업에서 중단한 검증은 아님. Spring 인증 성공/조회/로그아웃은 실제 서버 응답 사용.

별도 `npm run test:e2e` **PC20+모바일20=40개 통과, skip 없음(25.1초)**. 화면 전용 모드에서 API·외부 HTTP·영구 저장이 없고 기존 기록·요청 준비 흐름이 유지됨. `npm run build`·`npm run format:check` 통과. 비밀번호 입력 없는 실제 [PC 로그인](screenshots/login-desktop.png)·[모바일 로그인](screenshots/login-mobile.png) 캡처 확인.

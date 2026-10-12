# SALU 인증 계약

이메일 회원가입·비밀번호 로그인과 Google OIDC/네이버 OAuth2는 같은 Spring 세션을 사용합니다. 개인 자료 연결은 [저장 계약](personal-storage.md)을 따릅니다.

- 신규 소셜 신원은 provider+subject로 식별, 이메일 자동 병합 금지
- 새 가입과 실제 제공자 동의·콜백은 별도 실환경 검증 필요

## API

| 경로 | 동작 |
|---|---|
| GET /api/csrf | 세션 masked token/headerName, no-store |
| POST /api/auth/signup | JSON email/displayName/password + CSRF; 201 가입 완료, 이후 기존 로그인 경로 사용; 중복 409; 실제 가입 검증은 별도 수행 |
| POST /api/auth/login | application/x-www-form-urlencoded email/password + CSRF header, 200은 id/email(nullable)/displayName/storageContext만, 실패 401/LOGIN_FAILED |
| GET /api/auth/me | 로그인 회원 id/email(nullable)/displayName/storageContext, 비로그인 401 |
| POST /api/auth/logout | CSRF 필수, 세션 무효화·SALU_SESSION 삭제, 204; GET으로 로그아웃하지 않음 |

## 인증 처리

- React는 각 변경 요청 전에 CSRF 조회, 쿠키 자동 전송
- 성공 후 화면 전환을 토큰 재조회 때문에 지연시키지 않으며 다음 변경 요청 전에 새 토큰 조회
- 비밀번호는 전송 후 입력에서 제거, localStorage·로그 저장 없음
- 토큰 재조회가 일시 실패해도 이미 성공한 로그인/로그아웃을 실패로 바꾸지 않으며 다음 요청 전에 다시 조회

### 세션

- 세션 추적은 cookie만 허용(jsessionid URL 제외)
- 현재 cookie: HttpOnly/SameSite=Lax, 30분 세션
- HTTPS에서는 SALU_COOKIE_SECURE=true. 인증 성공 시 session ID 교체, 이전 CSRF 무효화
- 현재 계정 상태는 보호 요청에서 DB 재확인
- 로그인 조회는 단일 SELECT로 불필요한 쓰기 트랜잭션을 추가하지 않음
- 다중 변경 Service의 트랜잭션 규칙은 development-contract 유지

### 입력과 로그인 제한

- 로그인 query string 거부(비밀번호 URL 전송 금지), 중복 파라미터·이메일·BCrypt 72바이트 제한 검사
- IP당 30회/60초 후 429, 요청 X-Forwarded-For를 신뢰하지 않음
- 단일 개발 서버 범위의 방어이며 배포 전 프록시·분산 방어는 추가 검증 필요
- 요청 role/memberId는 권한 부여에 사용하지 않음
- ACTIVE만 로그인, 존재하지 않음·틀린 비밀번호·비활성 모두 동일 실패

### DB 장애

- DB 장애: 로그인 503/AUTHENTICATION_UNAVAILABLE, 기존 세션 요청 503/DATABASE_UNAVAILABLE. 내부 DB 예외를 원인 없이 고정 예외로 바꿔 인증 필터 로그의 SQL·비밀 노출 차단
- DB 장애에도 유효 CSRF 로그아웃 가능
- 공개 health는 기존503/HealthResponse 계약 유지

## 검증

```bash
./scripts/verify-backend.sh
python scripts/verify-api.py
cd frontend
npm run build
npm run test:e2e
npm run test:auth
npm run test:storage
```

- 실제 DB 테스트는 salu_test 전용 생성 계정을 각 테스트 후 삭제
- 운영 jar에 테스트 API/테이블/보안 완화 없음
- 일반 mvnw verify는 실제 DB 테스트를 건너뛰므로 verify-backend 사용
- `test:e2e`는 서버 없는 화면 전용 검증, `test:auth`·`test:storage` 실행 전에 별도 터미널에서 `scripts/storage-test-server.sh` 시작
- 서버 8083·salu_test·/tmp/salu-storage-fixture.json 임시 계정 사용
- 테스트 종료 후 서버도 종료하면 회원/백업 fixture 삭제
- 파일 누락/오류는 skip이 아닌 실패
- 실제 비밀번호·token이 포함될 trace·영상·스크린샷은 저장하지 않음

- 검증 범위: 세션 ID 변경/이전 세션 replay 차단, CSRF 로그인·로그아웃 필수/이전 token 차단, 새로고침 로그인 유지, 로그아웃 후401, 잘못된 입력·중복 parameter·긴 다국어 비밀번호400, 계정 상태 차단/로그인 중 탈퇴 후 세션 무효화, 고정 실패 응답/해시 비노출, IP 제한/헤더 위조, DB 장애·복구, 모바일 화면
- 기존 참고 코드의 role/memberId 신뢰·CSRF 예외·평문 로그를 이식하지 않음

- 실제 DB 장애 검증은 개발 서버를 켠 상태에서 아래 명령 실행
- SALU 전용 로컬 MySQL을 잠시 중단하고 finally에서 재시작하므로 다른 SALU 테스트와 동시에 실행하지 않음

```bash
python scripts/verify-login-db-recovery.py --db-outage
```

## React 계정 경계

- `/api/auth/me`의 401만 비로그인으로 처리
- 503·연결 실패는 확인 불가이며 개인 초안을 삭제하지 않음
- 늦은 응답이 최신 인증 결과를 덮어쓰지 않도록 순서 검사
- 창 복귀 시 세션 재확인

- 로그인 성공 후 게스트 자료를 계정 공간으로 원자적으로 연결
- 로그아웃/계정 변경은 해당 자료를 숨기고 다른 공간 표시
- 로그아웃 실패를 성공으로 표시하지 않음
- 예시 메모리는 개인 자료와 분리
- 회원/CSRF/storageContext는 localStorage·sessionStorage 저장 금지

- CSRF_INVALID만 한 번 재조회·재전송
- ACCESS_DENIED·네트워크 실패는 자동 재전송 금지
- 제공자 로그인 전 기기 초안 저장을 기다림
- 소셜 연결은 CSRF·현재 principal/storageContext·provider·만료·OAuth state 검증, 다른 회원 신원을 이동하지 않음

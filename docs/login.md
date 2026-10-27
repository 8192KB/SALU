# SALU 인증 계약

이메일 회원가입·비밀번호 로그인과 Google OIDC/네이버 OAuth2는 같은 Spring 세션을 사용합니다. 개인 자료 연결은 [저장 계약](personal-storage.md)을 따릅니다.

- 새 가입과 실제 제공자 동의·콜백은 별도 실환경 검증 필요

## API

| 경로 | 동작 |
|---|---|
| GET /api/csrf | 세션 masked token/headerName, no-store |
| POST /api/auth/email-check | JSON email + CSRF; 200 `{available}`(가입한 이메일이면 false), 형식 오류 400. 가입 화면의 중복 확인 버튼용 |
| POST /api/auth/signup | JSON email/displayName/password(8자 이상) + CSRF; 201 가입 완료, 이후 기존 로그인 경로 사용; 중복 409; 실제 가입 검증은 별도 수행 |
| POST /api/auth/login | application/x-www-form-urlencoded email/password + CSRF header, 200은 id/email(nullable)/displayName/storageContext/role만, 실패 401/LOGIN_FAILED |
| GET /api/auth/me | 로그인 회원 id/email(nullable)/displayName/storageContext/role, 비로그인 401. displayName은 DB의 현재 이름 |
| PATCH /api/auth/me | JSON displayName(앞뒤 공백 제거 1~50자) + CSRF; 200 바뀐 회원 정보(GET과 같은 형식) |
| POST /api/auth/password | JSON currentPassword/newPassword(8자 이상) + CSRF; 204, 세션 ID 교체. 현재 비밀번호가 틀리면 400 `CURRENT_PASSWORD_INVALID`, 비밀번호가 없는 소셜 가입 계정은 409 `PASSWORD_NOT_SET`. 다른 기기의 세션은 끊지 않음 |
| POST /api/auth/logout | CSRF 필수, 세션 무효화·SALU_SESSION 삭제, 204; GET으로 로그아웃하지 않음 |

## 인증 처리

- React는 각 변경 요청 전에 CSRF 조회, 쿠키 자동 전송
- 성공 후 화면 전환을 토큰 재조회 때문에 지연시키지 않으며 다음 변경 요청 전에 새 토큰 조회
- 비밀번호는 전송 후 입력에서 제거, localStorage·로그 저장 없음
- 회원가입·비밀번호 변경은 비밀번호 확인 칸이 같아야 요청. 입력하는 동안 확인 칸에 일치 여부를 보여 줌
- 토큰 재조회가 일시 실패해도 이미 성공한 로그인/로그아웃을 실패로 바꾸지 않으며 다음 요청 전에 다시 조회

### 세션

- 세션 추적은 cookie만 허용(jsessionid URL 제외)
- 현재 cookie: HttpOnly/SameSite=Lax, 30분 세션
- HTTPS에서는 SALU_COOKIE_SECURE=true. 인증 성공 시 session ID 교체, 이전 CSRF 무효화
- 현재 계정 상태는 보호 요청에서 DB 재확인
- 로그인 조회는 단일 SELECT로 불필요한 쓰기 트랜잭션을 추가하지 않음

### 입력과 로그인 제한

- 로그인 query string 거부(비밀번호 URL 전송 금지), 중복 파라미터·이메일·BCrypt 72바이트 제한 검사
- 로그인·가입·이메일 확인·비밀번호 변경은 경로마다 IP당 30회/60초 후 429, 요청 X-Forwarded-For를 신뢰하지 않음
- 단일 개발 서버 범위의 방어이며 배포 전 프록시·분산 방어는 추가 검증 필요
- 요청 role/memberId는 권한 부여에 사용하지 않음
- 회원 역할은 `members.role`의 `USER`·`ADMIN`. 관리자 지정은 DB에서만 하고 `/api/admin/**`은 SecurityConfig에서 ADMIN만 허용. 응답의 `role`은 화면 표시용이며, DB 역할이 세션과 달라지면 다음 요청에서 세션을 끊고 401
- ACTIVE만 로그인, 존재하지 않음·틀린 비밀번호·비활성 모두 동일 실패

### DB 장애

- DB 장애: 로그인 503/AUTHENTICATION_UNAVAILABLE, 기존 세션 요청 503/DATABASE_UNAVAILABLE. 내부 DB 예외를 원인 없이 고정 예외로 바꿔 인증 필터 로그의 SQL·비밀 노출 차단
- DB 장애에도 유효 CSRF 로그아웃 가능
- 공개 health는 기존 503/HealthResponse 계약 유지

## 검증 기준

- 공통 검증 규칙(로컬 전용 검증 코드·테스트 DB·증거에 비밀 값 금지)은 [개발 계약](development-contract.md)의 인증·저장·검증
- 세션 ID 교체·이전 세션/CSRF 차단, 로그인 유지·로그아웃 후 401 확인
- 소셜 로그인·계정 연결의 OAuth state/nonce·ACTIVE 상태·연결 만료 확인
- 잘못된 입력·중복 parameter·긴 비밀번호·비활성 계정·인증 중 상태 변경 검사
- 고정 실패 응답·해시 비노출, IP 제한·헤더 위조, DB 장애·복구 확인
- 기존 코드의 role/memberId 신뢰·CSRF 예외·평문 로그를 이식하지 않음
- 실제 DB 장애 검증은 다른 검증과 분리, SALU 전용 DB만 중단하고 반드시 복구

## React 계정 경계

- `/api/auth/me`의 401만 비로그인으로 처리
- 503·연결 실패는 확인 불가이며 개인 초안을 삭제하지 않음
- 늦은 응답이 최신 인증 결과를 덮어쓰지 않도록 순서 검사
- 창 복귀 시 세션 재확인

- 로그인 성공 후 게스트 자료는 사용자가 고를 때만 계정 공간으로 원자적으로 연결([저장 계약](personal-storage.md))
- 로그아웃/계정 변경은 해당 자료를 숨기고 다른 공간 표시
- 로그아웃 실패를 성공으로 표시하지 않음
- 예시 메모리는 개인 자료와 분리
- 회원/CSRF/storageContext는 localStorage·sessionStorage 저장 금지

- CSRF_INVALID만 한 번 재조회·재전송
- ACCESS_DENIED·네트워크 실패는 자동 재전송 금지

## 소셜 로그인

- Google OIDC와 네이버 OAuth2는 이메일 로그인과 같은 세션·ROLE_MEMBER·ACTIVE·CSRF·세션 교체 계약 사용
- `/api/auth/oauth2/providers`는 client 설정이 완전한 제공자만 반환. client가 없으면 버튼을 숨기고 이메일 로그인만 씀
- `/api/auth/oauth2/authorize/{provider}` → `/api/auth/oauth2/callback/{provider}` → 고정 `/auth/complete`. 실패는 고정 `/login?socialError=1`. 화면은 출발 전 기기 초안 저장 완료를 기다림
- 신원은 provider+subject로 식별하고 이메일로 자동 병합하지 않음. 소셜 신규 회원의 이메일·비밀번호는 nullable
- `/account`의 계정 연결은 CSRF·현재 principal/storageContext·제공자·5분 만료·OAuth state를 검증하고, 다른 회원의 소셜 신원을 옮기지 않음

- 설정: `.env.example`의 SALU_GOOGLE/NAVER_CLIENT_ID·CLIENT_SECRET·PUBLIC_ORIGIN. 제공자 관리자 화면에 정확히 `{PUBLIC_ORIGIN}/api/auth/oauth2/callback/google` 또는 `/naver` 등록
- 비밀 값·등록 정보는 Git으로 공유하지 않음
- 실제 제공자 동의·콜백은 SALU client 설정 뒤 따로 검증. 테스트용 제공자 검증을 실제 Google·네이버 계정 검증으로 주장하지 않음
- 기준 문서: [Spring OAuth2/OIDC 구성](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html), [Google 웹 서버 로그인](https://developers.google.com/identity/protocols/oauth2/web-server), [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md)

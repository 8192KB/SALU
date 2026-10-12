# SALU 준비 단계 검증

> 당시 계획·승인 범위·검증 근거를 보존한 기록. 현재 구현 상태는 [문서 안내](../../README.md)와 점검표 기준.

## 2026-10-05 로그인 추가 검증

공통 기반 다음 작업으로 로컬 로그인·세션 조회·로그아웃 구현. Salon 보안 정적 재점검은 salon-security-audit.md에 범위·근거·한계 기록. 기존 Salon 파일·DB 수정 없음.

- verify-backend:21개 tests, failures0/errors0/skipped0, BUILD SUCCESS. 실제 salu_test HTTP 로그인5개 포함. 기존 공통/MySQL tx3개 유지
- React TypeScript·Vite build 성공. npm audit --omit=dev: 운영 의존성 알려진 취약점0(현재 registry 기준, 전체 보안 보증 아님)
- 실제 Chromium E2E5개 모두 통과, 로그인 계정 파일 지정해 skip 없음. 잘못된 비밀번호→성공→새로고침 유지→로그아웃·401, HttpOnly/SameSite 확인, 모바일 오류 확인
- API 스크립트 health·세션·CSRF·JSON401/403 통과
- 실제 salu_dev MySQL 중단: health503/DB DOWN, 로그인503 고정 오류, 기존 세션503, 유효CSRF 로그아웃204. DB 재시작 후 health200/로그인200/로그아웃204 복구
- 서버 재시작에서 Flyway V1 검증·No migration necessary. 신규 production migration 없음
- cookie만 세션 추적, login URL query 거부, SQL 인젝션 입력401 확인. 세션 ID 변경·이전 세션 replay401·이전 CSRF403, 탈퇴/정지 로그인 실패 동등성 및 기존 세션 탈퇴 후 무효화 실제 MySQL 검증
- 실제HTTP 반복 로그인429/Retry-After 및 health200 유지 검증. IP 제한30회/분·forged X-Forwarded-For 무시, 원문 DB 예외의 인증 필터 전달 차단, principal credential 삭제는 단위검증

개발 계정 dev@salu.local은 도구로 한 번 생성. 무작위 비밀번호는600/Git제외 파일만 사용, 출력 없음. 회원가입·OAuth·권한 승격·비밀번호 재설정·업무 기능은 이번 완료 범위 밖. 배포 프록시/다중 서버 대입 방어와 Salon 자체 공격 런타임 검증을 완료했다고 주장하지 않음.

## 공통 기반 보완 · 2026-10-05

재부팅 후 이전 /tmp MySQL·캐시·브라우저 소실 확인. 소스와 .env는 보존. 실행 파일과 DB는 ~/.local/share/salu, Chromium은 ~/.cache/ms-playwright로 복구. 실제 DB 파일은 /의 ext4에 위치하며 /tmp 사용 없음. Docker 설치·시스템 DB·Salon 수정 없음.

| 필수 확인 | 실제 결과 |
|---|---|
| 서버 빌드·공통 예외 | Maven Wrapper verify 성공, 백엔드 13개 통과(실제 MySQL/HTTP 통합 3개 포함) |
| 오류 중앙화 | Security와 MVC에서 ApiError 사용. 실제 400/404/409/500 및 Bean Validation·깨진 JSON 확인, 원문 예외 비노출 |
| 실제 트랜잭션 | MyBatis·Spring proxy·MySQL에서 정상 작업 2행 commit. runtime·checked rollbackFor·중복 key 실패 시 0행, HTTP 오류 후에도 부분 저장 없음 |
| 데이터 격리 | salu_dev에는 members·Flyway V1만 존재. salu_test에만 V1·검증 V900, 테스트 데이터 0행 |
| 일반 jar | GlobalExceptionHandler 포함, 검증용 Controller/Service와 V900 제외 |
| API·보안 | 실제 서버에서 health 200, SALU_SESSION·CSRF token, JSON 401/403 검증 통과 |
| React | TypeScript/Vite build 성공, 실제 Chromium E2E 3개 통과(연결·503/재시도·접속 실패/모바일 너비) |
| DB 장애·복구 | 실제 SALU MySQL 중단 후 health 503, 복구 후 API 재통과 |
| Flyway 재실행 | 일반 서버 재시작: V1 validation 성공, No migration necessary |
| 최종 실행 | React 5174·서버 8081·MySQL 3307 연결 정상 확인 |

현재 범위는 공통 기반. 회원가입/로그인과 기록·사진·상담 등 업무 기능은 구현하지 않음. 트랜잭션 예제와 HTTP 오류 발생용 경로는 src/test에만 존재. 이 검증으로 향후 업무 Service의 소유권·동시성·파일 복구까지 검증했다고 주장하지 않음.

재실행: [로컬 실행 환경](../../local-runtime.md). DB 시작 후 scripts/verify-backend.sh로 실제 DB 통합 검증, 서버/화면 실행 후 verify-api.py와 frontend E2E 사용. 기본 mvnw verify는 DB 통합 검증을 건너뛰므로 이를 대신하지 않음.

## 이전 준비 단계 기록 · 2026-10-04

아래 /tmp 경로와 실행 상태는 당시 기록이며 현재 실행 경로가 아님. 재부팅 후 소실되어 위 영구 사용자 경로로 대체.

검증일: 2026-10-04, Arch Linux. Java 17.0.20.1, Maven Wrapper 3.9.16, Node 26.7.0. 시스템 설정·Salon 코드·기존 `salu` DB 변경 없음.

## 결과

| 항목 | 확인 결과 |
|---|---|
| 서버 빌드 | `./mvnw verify` 성공. Spring Boot 4.1.1·MyBatis 4.1.0·MySQL connector·Flyway 포함 실행 jar 생성 |
| 백엔드 테스트 | 7개 통과. health 정상/DB 실패, JSON 401, CSRF 403, token endpoint, 환경변수 누락/잘못된 경로 |
| 프론트 빌드 | `npm run build` 성공. TypeScript 검사와 Vite production bundle 생성 |
| MySQL | 공식 MySQL 8.4.11, 별도 datadir, localhost 3307, `salu_dev` 연결 |
| 최초 migration | Flyway V1 적용 성공. `members`, `flyway_schema_history`만 생성, member 0개 |
| migration 재실행 | 최종 SALU 경로에서 재시작 성공. schema v1 검증, No migration necessary, 이력 1행 유지 |
| API 실연결 | `scripts/verify-api.py` 통과. health 200, 세션 cookie, masked token header 제출, JSON 401/403 |
| DB 실제 중단/복구 | 해당 MySQL만 종료 후 health 503/server UP/database DOWN 확인. 재시작 후 API 검증 재통과 |
| 환경변수 누락 | packaged jar가 `SALU_CONFIG_MISSING: SALU_DB_PASSWORD`와 종료 코드 1로 중단 |
| 초기 DB 접속 실패 | 비어 있는 13307로 시작 시 Flyway `Unable to obtain connection`·`Communications link failure` 확인, 정상 서버로 시작하지 않음 |
| 실제 브라우저 | Chromium E2E 3개 통과. 실제 Vite proxy 연결, 503 표시·재시도, 접속 실패 표시·390px 너비 |
| 화면 검토 | 데스크톱 실제 렌더링과 연결 정상 표시 확인 |
| Compose 설정 | 임시 공식 Compose v5.6.0에서 `config --quiet` 통과. Docker 컨테이너 실행은 미검증 |
| DB 사용자 범위 | `salu_app`은 `salu_dev.*`에만 권한. 기존 `salu` DB 권한 없음 |
| Git·Salon 보존 | SALU 자체 Git 저장소 확인, source staging·diff 검사 통과. .env·빌드 산출물 제외. Salon의 시작 시 변경 목록 유지 |

브라우저 DB 오류 테스트는 route 응답으로 상태와 재시도를 검사. 별도로 MySQL을 실제 중단해 백엔드 503과 복구를 검증. 기능별 회원/기록/상담 검증은 해당 기능을 구현할 때 추가.

## 이번 검증의 실행 경로

호스트 `mysqld`는 MariaDB이므로 기존 설치와 datadir 사용하지 않음. Docker daemon/Compose를 설치하거나 시작하지 않고 공식 MySQL minimal 바이너리를 별도 임시 경로에서 실행.

- MySQL 바이너리: `/tmp/salu-mysql-runtime/mysql-8.4.11-linux-glibc2.28-x86_64-minimal`
- 데이터·socket·로그: `/tmp/salu-mysql-runtime/instance`
- libaio 0.3.113: 공식 소스에서 `/tmp/salu-mysql-runtime/libaio`로 빌드
- ncurses 호환 경로: `/tmp/salu-mysql-runtime/compat-lib/libncurses.so.6`가 호스트 `libncursesw.so.6`을 가리킴. 이 호스트의 `libncurses.so`는 linker script여서 실행용 파일로 사용할 수 없음
- frontend browser: 기존 Chromium 1243 바이너리 사용. `SALU_CHROMIUM_PATH` 설정. 프로젝트 Playwright는 1.63.0
- npm/Maven dependency cache: `/tmp/salu-build-cache`

현재 임시 경로는 재부팅/임시 파일 정리 뒤 유지가 보장되지 않음. 계속 개발할 DB는 README의 Compose volume 또는 영구 `SALU_MYSQL_HOME`으로 새로 구성. 기존 데이터 삭제·전체 초기화 명령 없음.

현재 검증 DB 재시작:

```bash
cd /home/chuwe/soldesk/SALU
export SALU_MYSQL_BASEDIR=/tmp/salu-mysql-runtime/mysql-8.4.11-linux-glibc2.28-x86_64-minimal
export SALU_MYSQL_HOME=/tmp/salu-mysql-runtime/instance
export LD_LIBRARY_PATH=/tmp/salu-mysql-runtime/libaio/lib:/tmp/salu-mysql-runtime/compat-lib
./scripts/mysql-local.sh start
```

이미 실행 중이면 start 대신 status. 종료는 같은 환경에서 `./scripts/mysql-local.sh stop`. root/app 비밀번호는 Git에서 제외한 루트 `.env` 사용, 출력 없음.

Docker 설치와 서비스 시작은 호스트 지문 `sudo` 인증이 필요해 사용자 직접 실행 항목. Compose 파일 구성 검사와 실제 Docker volume/컨테이너 실행 검증을 구분.

## 이전 완료 상태

`/home/chuwe/soldesk/SALU`에 별도 Git 저장소 생성. 초기 소스는 staging 상태이며 commit/원격 저장소/게시 없음. 최종 경로에서 서버·프론트 빌드, API 검증과 Chromium E2E 3개 재통과.

2026-10-04 검증 종료 시 서버 `8081`, React `5174`, 검증용 MySQL `3307` 실행 확인. MySQL datadir는 위의 임시 경로이며 자동 시작 서비스로 등록하지 않음.

# NAS 조원 시연과 피드백

현재 배포: `20261012-fdda7e5`, https://salu.doyul.dev 정상. 최신 실행 기록은 문서 아래 날짜별 기록 참고. 2026-10-11 최초 계획: 발표 자료 제작은 조원 시연·피드백과 화면 수정 뒤 진행. 기존 PPTX/PDF는 이전 초안으로 보존.

## 공유 순서

1. Docker 이미지 빌드와 격리 환경 실행 확인
2. NAS에 SALU 전용 Compose·이미지·비밀 설정 설치
3. 기존 Nginx Proxy Manager에 SALU 호스트·HTTPS 연결
4. 조원에게 접속 주소와 Git 링크 공유
5. 막힌 화면·용어·버튼 중심으로 피드백 수집, 우선순위 결정·수정
6. 수정된 화면을 기준으로 7주차 발표 자료 제작

첫 시연은 로그인 없는 커트 기록·경과·예시 체험 중심. 개인 기록은 기기에 보관. 로그인 후 계정 자동 저장도 구현되어 있으나 회원가입은 미구현이므로, 당시에는 계정 발급이 필요했음. 현재 이메일 가입 UI·API는 구현되어 있으나 실제 새 가입 검증은 보류. 로컬 개발 계정 생성 스크립트는 NAS 계정 발급용으로 사용하지 않음.

## 구성

```text
https://salu.doyul.dev
  → 기존 Nginx Proxy Manager
      → salu-web:80 / React 정적 파일·SPA 경로
          → /api → backend:8081 / Spring·인증·개인 백업
              → db:3306 / SALU 전용 MySQL
```

[compose.nas.yml](../compose.nas.yml)은 별도 `salu-preview` 프로젝트. web만 기존 proxy network에 연결하며, backend/DB의 host port는 열지 않음. backend의 외부 제공자 통신은 SALU 전용 outbound network 사용. DB·사진 volume은 SALU 전용으로 생성. 기존 개발용 [compose.yml](../compose.yml), Nextcloud·기존 DB·proxy 컨테이너·volume 보존.

`frontend/Dockerfile`은 npm lockfile로 React를 빌드해 Nginx에 복사. `backend/Dockerfile`은 Maven Wrapper로 jar를 빌드하고 Java 17 JRE에서 실행. 테스트 코드·환경 파일·로컬 DB·사진은 이미지에 넣지 않음. Docker 이미지 빌드의 테스트 생략은 제품 테스트 통과를 의미하지 않음.

web은 SPA 재접속과 `/api` 동일 origin 전달, 사진 요청 6 MiB 한도 지원. backend는 DB health 통과 뒤, web은 backend health 통과 뒤 시작. [Docker Compose 시작 순서](https://docs.docker.com/compose/how-tos/startup-order/)와 [Nginx proxy 설정](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) 기준.

## 배포 전 확정할 값

- 목표 NAS: cwsn, 목표 주소 `https://salu.doyul.dev`
- 목표 설치 경로: `/home/chuwe/salu-preview` 제안
- 기존 proxy network: `nginx-proxy-manager_default`. 2026-10-11 NAS SSH 읽기 전용 조회로 존재 확인
- 실제 DNS·TLS·proxy 호스트 연결은 아직 확인/적용 전. SALU 컨테이너 설치·실행은 아래 NAS 실행 기록 참고
- NAS 환경 설정과 암호화 키는 새로 준비. 개발 DB나 기존 개인 자료 자동 이전 없음

NAS 원본 운영 문서: `~/dotfiles/docs/cwsn/containers.md`. 이 문서의 과거 구성 스냅샷을 현재 실행 결과로 간주하지 않음. 첫 NAS 배포는 구성·키·접속 범위를 검토한 뒤 수동 실행하는 기존 [개발 계약](development-contract.md) 적용.

## 설정과 이미지 준비

저장소 루트에서 `.env.nas.example`을 `.env.nas`로 복사하고 권한 600 설정. 비밀번호의 `CHANGE_ME`를 새 NAS용 값으로 교체. 파일 내용이나 `docker compose config`의 전체 출력을 Git·채팅에 올리지 않음. 구성 검사는 `config --quiet` 사용.

`SALU_IMAGE_TAG`는 이번 검증한 이미지의 구분값을 지정. 이후에는 검토·커밋한 버전별로 변경하고 이전 이미지를 보존.

서버 키 파일은 [개인 저장 계약](personal-storage.md)의 JSON 형식과 복구 절차 적용. 개발용 키를 공유하지 않고 NAS용 무작위 키 생성. `SALU_BACKUP_KEY_FILE`에 절대 경로 지정, 활성 ID는 `SALU_BACKUP_KEY_ID`와 일치. backend는 UID/GID **1000:1000**으로 실행하므로 파일이 이 사용자에게 읽혀야 함. 파일 소유자 1000, 권한 600 또는 400, 상위 디렉터리 700 적용. host UID가 다르면 관리자에게 권한 설정 요청. Compose file secret의 접근 권한은 host 파일 권한도 확인해야 함. [Docker secrets](https://docs.docker.com/compose/how-tos/use-secrets/) 참고.

`.env.nas`, 키, DB·사진 volume은 Git 제외. DB 복사본과 암호화 키의 별도 보관이 모두 있어야 서버 자료 복원 가능.

```bash
docker compose --env-file .env.nas -f compose.nas.yml config --quiet
docker compose --env-file .env.nas -f compose.nas.yml build
docker pull mysql:8.4.11
```

NAS N100과 현재 노트북은 amd64 기준. 준비한 이미지 태그를 사용해 임시 파일로 내보내고 NAS로 복사:

```bash
docker image save -o /tmp/salu-preview-images.tar \
  salu-web:preview salu-backend:preview mysql:8.4.11
```

위 `preview`는 실제 `SALU_IMAGE_TAG`로 교체. NAS에는 이미지 tar와 `compose.nas.yml`, 별도로 준비한 `.env.nas`·키 파일을 설치. `.env.nas`와 키는 공개 링크나 Git으로 전달하지 않음. NAS에서 이미지를 읽은 뒤 빌드를 생략하고 실행하므로 웹·백엔드 원본 폴더 없이도 실행 가능. NAS에서 직접 재빌드하려면 같은 버전의 소스와 Dockerfile도 필요.

## NAS 실행과 HTTPS

NAS Docker 사용 권한이 있는 터미널에서 먼저 proxy network 확인:

```bash
docker network inspect nginx-proxy-manager_default --format '{{.Name}}'
```

network 이름이 다르면 실제 값을 `.env.nas`에 반영. 기존 proxy network를 임의로 새로 만들거나 바꾸지 않음.

```bash
cd /home/chuwe/salu-preview
docker image load -i /tmp/salu-preview-images.tar
docker compose --env-file .env.nas -f compose.nas.yml config --quiet
docker compose --env-file .env.nas -f compose.nas.yml up -d --no-build --pull never --wait
docker compose --env-file .env.nas -f compose.nas.yml ps
```

기존 Nginx Proxy Manager에 **새 SALU proxy host** 추가: 도메인 `salu.doyul.dev`, 내부 HTTP 대상 `salu-web`, 포트 80. SALU web의 proxy network alias 사용. 유효한 인증서와 HTTPS 강제 적용. 외부 proxy의 요청 크기 제한도 사진 5 MiB 이상 수용하도록 확인.

`SALU_PUBLIC_ORIGIN=https://salu.doyul.dev`, `SALU_COOKIE_SECURE=true` 유지. 실제 제공자 client 설정·동의 검증 전 Google/네이버 값은 비워 두고 로컬 로그인만 제공. OAuth 제공자 이름만 설정해 버튼을 열지 않음.

외부 HTTPS에서 홈과 `/records/new` 직접 접속, 기록·사진·경과 저장 후 새로고침, 예시 종료 후 개인 자료 유지 확인. 계정을 발급한 경우 로그인·로그아웃·계정 자동 저장을 별도로 확인. 컨테이너 재시작 후 DB/키 복원도 계정 시연 전 점검.

갱신은 새 태그 이미지 load → `.env.nas` 태그 변경 → 같은 `up -d --no-build --pull never --wait`. 이전 태그로 앱 복구 가능하나 DB migration 호환성은 별도 확인. 데이터 volume을 지우는 `down -v`는 NAS 운영 절차에 사용하지 않음.

## 조원에게 공유할 내용

Git 링크: [8192KB/SALU](https://github.com/8192KB/SALU). 2026-10-11 `gh repo view`로 **PRIVATE** 확인. 조원이 초대를 수락했는지 확인. 개인 저장소 collaborator는 단순 읽기 전용 초대와 같지 않으므로 작업은 기능 브랜치·PR 방식으로 합의. [GitHub 초대 방법](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository), [개인 저장소 권한](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository).

최신 개발·발표 변경은 작업 트리에 남아 있으므로, Git 링크가 현재 로컬 화면과 같은 코드라는 뜻은 아님. 공유할 버전은 관련 변경 검토·검증·커밋·업로드 후 표시.

배포 후 사용자가 전달할 메시지 초안:

> SALU 기록 화면을 직접 써볼 수 있도록 공유합니다. 접속 주소: [검증 후 확정한 HTTPS 주소]. 코드: https://github.com/8192KB/SALU. 로그인 없이 커트 기록을 남기고, 같은 커트에 경과를 추가해 보세요. 막히거나 헷갈린 화면과 버튼, 기대했던 동작을 알려주세요. 피드백 반영 후 발표 자료를 만들 예정입니다.

피드백 질문:

1. 처음 들어왔을 때 무엇부터 해야 하는지 알 수 있었는가?
2. 커트 기록과 이후 경과의 차이, 같은 커트에 연결되는 방식이 이해되는가?
3. 어디에서 멈추거나 뒤로 돌아갔는가? 화면·버튼·기대 동작은 무엇인가?

답변은 Git Issue 또는 한 문서에 모아 **기능 오류 → 흐름·문구 혼란 → 시각 개선** 순서로 정리. 배포 주소·버전·기기·화면과 재현 순서를 함께 기록. 실제 메시지 전송이나 조원 초대는 이번 작업에서 수행하지 않음.

## 현재 상태와 검증

Docker 구성·로컬 격리 실행 검증 완료. NAS 배포·DNS/TLS 연결·Git 업로드·조원 초대·피드백 수집은 아직 수행 전. 원격 main과 로컬 HEAD는 `b32a080`으로 동일하며, 최신 개발·Docker 작업은 미커밋 상태.

2026-10-11 Docker Engine 29.8.2·Compose 5.6.0, amd64. 별도 `salu-container-check` 프로젝트·MySQL `salu_test`·임시 두 계정·독립 proxy network 사용. 웹은 `http://127.0.0.1:5190`에서만 열고 HTTPS cookie 설정을 로컬 HTTP 검증에 한해 false로 변경. 실제 NAS/public 설정은 true 유지.

Browser plugin not available: 기존 Playwright 사용. PC 1440×1000, 모바일 390×844.

| 확인 | 결과 |
|---|---|
| Compose·이미지 빌드·실행 | config --quiet, 웹/백엔드 빌드, 세 서비스 healthy |
| 페이지 정체성·첫 화면·오류 overlay | SALU 제목·소개 홈·직접 SPA URL 정상, 빈 화면/overlay 없음 |
| PC·모바일 조작 | 사진 포함 커트 작성 → 같은 커트에 경과 추가 → 완료 화면 → 새로고침 후 재조회 |
| 콘솔·반응형·사진 | 관련 앱 콘솔/실행 오류 없음, 가로 넘침 없음, 실제 사진 디코딩 확인 |
| 실제 계정 연결·백업 | 화면 로그인 후 게스트 기록·경과·사진 연결, 서버 저장 완료, 새 브라우저 환경에서 같은 계정의 세 자료 복원 |
| API·계정 분리 | 동일 origin health 200·비로그인 me 401·다른 계정의 항목 조회 404/목록 공백·CSRF 없는 PUT 403 |
| 일반 jar | 테스트 서버·fixture·IntegrationTest 제외 |
| 이미지 전달 파일 | 세 image tag의 tar manifest·SHA-256 확인, 약 391 MiB |

임시 스크립트의 기대값·사용 순서를 앱 계약과 대조해 보완: 실제 앱 제목 사용, 저장 완료 화면·로그인 홈 이동을 기다린 뒤 다음 조작, 커트 항목과 신규 작성 초안의 별도 백업 구분. MySQL CLI fixture 입력은 `--default-character-set=utf8mb4` 명시. 이 과정에서 제품 UI·인증·저장 코드는 수정하지 않음.

증거: `/tmp/salu-container-check/qa.json`, `home-{desktop,mobile}.png`, `record-{desktop,mobile}.png`. NAS 전달 묶음: `/tmp/salu-nas-preview-20261011/`의 image tar·checksum·Compose·환경 예시·실행 안내. 실제 비밀번호·키·테스트 DB는 전달 묶음에 포함하지 않음.

검증용 컨테이너·volume·network와 임시 계정/키 파일은 종료 후 정리. 따라서 5190은 현재 시연 주소가 아님. 기존 개발 환경·NAS 서비스 보존. NAS HTTPS·실제 모바일 기기/Safari·실제 소셜 제공자·운영 계정 발급과 Git 업로드는 미검증/미실행 범위.


## NAS 실행 기록 — 2026-10-11 최신 화면 반영

사용자 승인으로 SSH `local`(실제 hostname `cwsn`)에 설치. `/home/chuwe/salu-preview/compose.nas.yml`, 신규 `.env.nas`(600), NAS 전용 암호화 키(600, UID 1000) 사용. 개발 데이터와 계정 이전 없음.

- 웹/Spring 태그: `20261011-flow`. 웹 최신 소스 재빌드, 변경 없는 Spring 빌드 단계는 Docker 캐시 재사용
- MySQL: 공식 `mysql:8.4.11`, 전용 DB `salu_preview`, 전용 사용자 `salu_app`
- 프로젝트: `salu-preview`. 웹·Spring·MySQL 모두 healthy, Flyway 1·2·3 성공, 회원 수 0
- SALU 전용 volume `salu-preview_mysql_data`, `salu-preview_photos`; 기존 NAS 서비스·DB·volume 변경 없음
- 이미지 전송: SSH/SCP, gzip 약 375 MiB. NAS 파일 `/home/chuwe/salu-preview/images-20261011-flow.tar.gz`
- 압축 파일 SHA-256: `42e8a777d10d1ecd883d84b2dbd1e9687794a304b7558dac9cb940c222862335`, 양쪽 일치
- NPM 컨테이너에서 `salu-web` DNS 조회 성공. 내부 IP는 고정 설정값으로 사용하지 않음
- host port 미공개. NPM proxy host·DNS·인증서 설정은 수행하지 않음. `https://salu.doyul.dev`를 접속 완료 주소로 공유하지 않음
- Git commit/push·회원 발급·소셜 제공자 설정은 이번 배포 작업에 포함하지 않음

### Nginx 담당자 또는 NAS agent 전달

SALU 컨테이너는 이미 실행 중이며 다시 만들 필요 없음. 기존 Nginx Proxy Manager에 새 proxy host만 추가:

| 항목 | 값 |
|---|---|
| Domain | `salu.doyul.dev` |
| Scheme | `http` |
| Forward hostname | `salu-web` |
| Forward port | `80` |
| SSL | 해당 도메인 인증서, HTTPS 강제 |
| 사진 요청 | 5 MiB 사진을 포함하는 요청 수용(앱 Nginx 한도 6 MiB) |

기존 proxy host·Nextcloud·MySQL 설정 변경 없음. Spring/DB host port 추가 없음. `.env.nas`와 키 원문을 채팅·로그에 출력하지 않음. SALU는 현재 조원 시연용이며 회원가입 미구현. 계정 시연 전 개별 계정 발급과 외부 HTTPS의 로그인·계정 백업/복원 검증 필요.

HTTPS 연결 뒤 외부 PC·휴대폰에서 홈, `/records/new` 직접 접속, 사진 포함 기록·경과 저장/새로고침 확인. 로그인 검증은 HTTPS cookie Secure를 유지한 상태로 수행. 운영 보관 기간·탈퇴/삭제 정책 확정은 정식 공개 서비스 전 별도 범위.


NAS 브라우저 검증: Browser plugin not available → 기존 Playwright, 임시 SSH 터널 `127.0.0.1:5191` 사용. PC 1440×1000·모바일 390×844에서 SALU 홈/직접 작성 URL → 사진 포함 커트 저장 → 경과 추가 → 새로고침 후 재조회 성공. 제목·의미 있는 화면·오류 overlay 없음·가로 넘침 없음·사진 디코딩·콘솔/런타임 오류 0 확인. `/api/health` 200, 비로그인 `/api/auth/me` 401. 증거 `/tmp/salu-nas-release-20261011/qa.json`, `home-{desktop,mobile}.png`, `record-{desktop,mobile}.png`. 실제 외부 HTTPS·실물 모바일·로그인/계정 복원은 이번 NAS 검증에 포함하지 않음.

## 2026-10-12 업데이트 준비

현재 feature/personal-storage-backup 작업 브랜치에서 최신 앱·FR04·배포 구성 커밋/업로드, 발표 자료는 별도 커밋으로 보존. 조원 전달 문구는 [시연 안내문](team-preview-message.md).

- 기존 HTTPS `https://salu.doyul.dev` health 200 확인, NPM 변경 불필요.
- 최신 웹·Spring 이미지 재빌드 후 SSH로 전달. MySQL 이미지는 교체하지 않음. 기존 SALU DB·volume·백업 키 보존.
- 앱 교체 전 SALU DB dump·Compose·환경파일·암호화 키를 NAS의 권한 제한 release 디렉터리에 보관. 새 V4는 테이블 추가 migration, 이전 V1~V3 불변.
- 기존 설정의 빈 Google/Naver 값을 승인된 Git 제외 OAuth 설정으로 연결. 개발자 콘솔 callback 허용·외부 동의 검증은 계속 보류.
- 검증·커밋·이미지 태그·체크섬·배포 결과는 아래 최종 실행 기록에 추가.

## 2026-10-12 배포 완료

- 소스 기준 commit `fdda7e5`, 앱 변경 `e14fd7c`, 작업 브랜치 `feature/personal-storage-backup` GitHub push 완료. main 병합 없음.
- 새 이미지: `salu-web:20261012-fdda7e5`, `salu-backend:20261012-fdda7e5`, amd64. Docker image label에 revision fdda7e5 포함.
- 이미지 gzip 약 146 MiB, 양쪽 SHA-256 `59b717da5d7581f7a10ff0f150643cd5b8faba6c365fc76b1b4d34932a27328a` 일치. MySQL 이미지 재전송/교체 없음.
- NAS release 경로 `/home/chuwe/salu-preview/releases/20261012-fdda7e5`(700). 기존 DB dump·환경·Compose·암호화 키 복구본 보관. 비밀 파일 권한 600, Git 제외.
- Compose의 기존 DB 설정·proxy network·host port 미공개 검사를 통과한 뒤 `up -d --no-deps --no-build --pull never --wait backend web`로 두 앱만 교체. 이전 이미지 태그 20261011-flow 보존.
- 웹·Spring·MySQL healthy. V1~V4 성공. 기존 DB 컨테이너 ID와 volume 유지, 회원/개인 백업/사진 개수 변경 없음. 기존 암호화 키 bytes 동일 확인. 기존 Nextcloud·NPM 및 별도 DB 변경 없음.
- `/api/health` 200, server/database UP, 공개 `/api/salons`·`/api/designers` 200. 새 등록 전에는 빈 목록이 정상.
- Google/Naver 비밀 설정 연결 완료, 공개 providers는 google/naver. 콜백 등록·실제 외부 동의와 이메일 새 가입 검증은 보류. 키 연결·버튼 표시는 실제 소셜 로그인 성공 검증을 의미하지 않음.
- Browser plugin 미제공 → Playwright로 공개 HTTPS 검증. 390×844 폰, 820×1180 세로 태블릿, 1180×820 가로 태블릿, 1440×1000 PC. 로그인 없이 커트/사진/경과 저장·재접속·앱 달력 선택·각 저장 결과·커트 준비·메뉴 위치 확인. 관련 실행 오류/가로 넘침 없음. 사용자 DB로의 테스트 API 쓰기 없음. 실물 폰/Safari는 별도 확인 필요.
- 검증 증거 `/tmp/salu-release-20261012-fdda7e5/qa/result.json`, home/calendar/complete/record/login-{phone,tablet-portrait,tablet-landscape,desktop}.png. 실제 가입·제공자 동의·계정 복원은 이 NAS 화면 검증에 포함되지 않음(계정/복원은 별도 salu_test 통과).

### 이후 수정본 배포

1. 변경 코드 검토·해당 검증 → 기능 브랜치 commit/push.
2. 해당 commit SHA 태그로 web/backend 중 변경한 이미지 빌드. SQL 변경은 새 Flyway migration 추가, 적용된 파일 수정 금지.
3. SSH 전송과 체크섬 → 기존 DB/환경/키 복구본 → 태그 변경 → 필요한 앱만 재생성. DB volume 삭제·초기화 없음.
4. 공개 HTTPS의 새 화면·API와 DB 보존 확인 후 점검표/배포 기록 갱신, 조원에게 링크 전달.

앱 복구 시 release의 env.before/compose.before.yml과 이전 이미지 사용. V4를 이미 적용한 DB에 이전 backend의 Flyway 호환성은 별도 확인해야 하므로 무조건 태그 변경만으로 DB까지 복구됐다고 판단하지 않음. DB 복원은 이후 사용자 변경이 없는지 확인한 뒤 정식 복구 절차로 진행하며 적용 migration을 삭제하지 않음.

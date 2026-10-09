# SALU

개인 커트·경과 기록을 선택해 디자이너 상담과 커뮤니티 공개로 이어가는 서비스.

현재 범위는 Spring Boot 서버, React 화면, 독립 MySQL, 첫 Flyway migration, 세션·CSRF 기반, 로컬 로그인·로그아웃과 설계 정리. 회원가입·기록·상담 업무 기능은 다음 단계. [개발 기준](docs/development-contract.md)에 데이터 관계·접근 권한·Salon 선별 이식 목록과 이후 구현 순서 정리.

```text
SALU/
├── backend/   Java 17 · Spring Boot 4.1.1 · MyBatis 4.1.0 · Flyway
├── frontend/  React · Vite · TypeScript
├── docs/      개발 기준·검증 결과
├── scripts/   환경 설정·서버 실행·검증·독립 MySQL 실행
└── compose.yml
```

## 실행

필수: Java 17, Node 22.12+ 또는 24+, Python 3. DB는 구성된 로컬 MySQL 또는 Docker Compose 사용. Maven은 `backend/mvnw`로 설치/실행. 네트워크는 첫 의존성 다운로드에 필요.

### 1. 환경 설정

```bash
cd /home/chuwe/soldesk/SALU
python3 scripts/init-env.py
```

`.env.example`에서 `.env` 생성, DB용 비밀번호 두 개 자동 생성, 권한 600. 기존 `.env`가 있으면 보존. 비밀번호를 화면에 출력하지 않음. 필요한 값을 직접 수정할 수도 있음.

| 변수 | 기본/기준 |
|---|---|
| `SALU_DB_HOST`, `SALU_DB_PORT` | `127.0.0.1`, `3307` |
| `SALU_DB_USER` | `salu_app`, Compose와 로컬 실행 스크립트에서 생성하는 전용 사용자 |
| `SALU_DB_PASSWORD` | 필수, 서버와 DB에서 같은 값 |
| `SALU_MYSQL_ROOT_PASSWORD` | DB 최초 생성/관리용. 서버 접속에 사용하지 않음 |
| `SALU_SERVER_HOST`, `SALU_SERVER_PORT` | `127.0.0.1`, `8081` |
| `SALU_FRONTEND_PORT` | 개발 기본 `5174` |
| `SALU_COOKIE_SECURE` | 개발 `false`, HTTPS 배포 `true` |
| `SALU_PHOTO_ROOT` | 필수 절대 경로, 기본 `$HOME/.local/share/salu/photos`. 배포 폴더 밖 영구 저장 경로 |

DB 이름은 `salu_dev`로 고정. Salon의 기존 `salu`와 기존 초기화 SQL을 사용하지 않음. 사진 디렉터리는 이번 단계에서 생성하지 않으며 이후 사진 기능에서 저장/권한 검증 추가. 비밀값에는 `VITE_` 접두사 사용 금지.

### 2. 독립 DB 시작

재부팅 후 이전 /tmp 환경은 소실되어 사용자 경로에 로컬 MySQL 구성. 현재는 아래 명령으로 실행 가능.

```bash
./scripts/mysql-local.sh start
./scripts/mysql-local.sh status
```

파일은 `~/.local/share/salu`에 보존되며 자동 시작 서비스는 없음. [로컬 실행 환경](docs/local-runtime.md)에 재실행과 필수 검증 정리.

아래는 나중에 Docker Compose를 선택할 경우의 설치 절차.

현재 Arch 호스트에는 Compose가 없고 Docker 서비스 시작이 필요한 상태. 아래 설치/서비스 명령은 지문 인증이 필요한 `sudo` 작업이므로 사용자가 터미널에서 직접 실행.

```bash
sudo pacman -Syu docker docker-compose
sudo systemctl enable --now docker
sudo docker compose up -d --wait db
```

Docker 사용 권한이 이미 있으면 마지막 명령의 `sudo` 생략 가능. 데이터는 SALU 전용 Compose volume에 보존. `sudo docker compose stop db`로 DB만 종료. root 비밀번호를 바꾼다고 기존 volume의 계정 비밀번호가 자동 변경되지는 않으므로 기존 데이터가 있으면 DB에서 계정 비밀번호 변경 후 `.env` 갱신.

기존 SQL의 `DROP DATABASE salu`와 전체 seed를 실행하지 않음. 서버 첫 실행에서 Flyway가 빈 `salu_dev`에 `members` 생성. 이미 적용한 V1은 서버 재실행 시 검증만 수행.

### 3. 서버 실행

별도 터미널:

```bash
cd /home/chuwe/soldesk/SALU
./scripts/backend-dev.sh
```

서버: <http://127.0.0.1:8081/api/health>. 스크립트가 루트 `.env`를 환경변수로 읽고 Maven Wrapper 실행. IDE나 jar를 직접 실행할 때도 같은 환경변수 필요.

### 4. React 실행

별도 터미널:

```bash
cd /home/chuwe/soldesk/SALU/frontend
npm ci
npm run dev
```

화면: <http://127.0.0.1:5174>. `/api` 요청은 Vite proxy를 통해 서버로 전달. 서버 포트 설정은 루트 `.env`에서 읽음. 개발 서버가 포트 충돌로 다른 포트를 선택하지 않도록 `strictPort` 사용.

React 화면에 브라우저·서버·실제 DB 연결 상태 표시. DB 이름·계정·비밀번호 같은 서버 설정을 프론트 bundle에 넣지 않음.

## 빌드와 검증

```bash
cd /home/chuwe/soldesk/SALU/backend
./mvnw verify
cd ../frontend
npm ci
npm run build
```

DB의 실제 트랜잭션과 공통 HTTP 오류까지 검증:

```bash
cd /home/chuwe/soldesk/SALU
./scripts/verify-backend.sh
```

테스트 전용 salu_test 사용. 단순 mvnw verify는 이 DB 통합 테스트를 건너뛰므로 실행 검증을 대신하지 않음.

서버/DB 실행 후 API 검증:

```bash
cd /home/chuwe/soldesk/SALU
python3 scripts/verify-api.py
```

실제 화면·Vite proxy·DB 실패 표시·재시도·모바일 너비 검증:

```bash
cd /home/chuwe/soldesk/SALU/frontend
npx playwright install chromium
SALU_E2E_LOGIN_FILE=../.env.dev-login.json npm run test:e2e
```

E2E의 첫 테스트와 재시도 성공 검증은 실제 서버/DB 필요. DB 실패/서버 연결 실패 응답은 browser route로 재현. 기본 서버/화면 포트를 사용하는 기준이며 별도 실행 URL은 `SALU_API_URL`, `SALU_E2E_URL`로 변경 가능. 검증 결과: [준비 단계 검증](docs/verification.md).

`npm run preview`는 빌드된 정적 화면만 확인하며 `/api` proxy를 제공하지 않음. 배포에서 `frontend/dist`를 제공하는 서버에 `/api`를 Spring Boot로 보내는 같은 origin reverse proxy 필요. 이번 단계에는 배포 설정/게시 없음.

## 오류 확인

| 증상 | 확인/조치 |
|---|---|
| `설정 누락` 또는 `SALU_CONFIG_MISSING` | `SALU_DB_PASSWORD`·`SALU_PHOTO_ROOT` 누락 또는 example placeholder. `.env` 생성/수정 후 다시 실행 |
| `SALU_CONFIG_INVALID` | 사진 저장 위치를 절대 경로로 지정 |
| 서버 시작 중 Flyway/connection refused | DB 시작 상태, `3307`, `.env` 계정/비밀번호 확인. 기존 schema를 baseline 처리하지 않음 |
| 서버 시작 중 Access denied | DB 실제 계정 비밀번호와 `.env` 일치 여부 확인. 비밀번호 변경 후 기존 volume 초기화로 문제를 숨기지 않음 |
| 화면 서버 연결 실패·DB 확인 불가 | 서버 시작 로그 확인. 환경변수 누락/초기 DB 실패에서는 서버가 시작되지 않음 |
| health 503·DB 연결 실패 | 실행 중 DB 연결 중단. DB 복구 후 화면의 다시 확인 사용 |
| JSON 401 | 로그인 필요. 화면에서 등록된 계정으로 로그인 |
| JSON 403 `CSRF_INVALID` | `/api/csrf`에서 token 조회 후 받은 headerName으로 token 전송 |

## Docker 없이 로컬 MySQL 실행

검증용 대체 경로. 호스트 MariaDB의 기존 datadir를 사용하지 않고 공식 MySQL 8.4 바이너리와 SALU 전용 저장 경로 사용. `mysqld`·`mysql`·`mysqladmin`이 필요한 시스템 라이브러리를 찾을 수 있어야 함. `SALU_MYSQL_BASEDIR`는 공식 배포 파일을 풀어 놓은 절대 경로.

```bash
cd /home/chuwe/soldesk/SALU
./scripts/mysql-local.sh init
./scripts/mysql-local.sh start
./scripts/mysql-local.sh status
```

`init`은 빈 datadir만 생성하고 root·전용 계정·`salu_dev` 구성. 임시 초기화 서버는 네트워크를 열지 않으며 초기화 SQL 파일은 완료/오류 후 제거. 기존 datadir가 있으면 중단. `start`는 localhost와 `SALU_DB_PORT`만 사용. 로그는 `$SALU_MYSQL_HOME/mysql.log`. `./scripts/mysql-local.sh stop`은 해당 socket의 서버만 종료하고 데이터를 보존.

Compose와 로컬 MySQL을 같은 `3307`에서 동시에 시작하지 않음. 현재 영구 경로의 바이너리·라이브러리·재실행 방법은 [로컬 실행 환경](docs/local-runtime.md)에 기록. 이미 구성된 환경에서는 init을 다시 실행하지 않음.

## 로그인

로컬 로그인·현재 회원 조회·로그아웃 구현. [실행·개발 계정·검증](docs/login.md), [Salon 보안 재점검](docs/salon-security-audit.md). 회원가입은 다음 단계.

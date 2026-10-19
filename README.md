# SALU

커트 기록과 이후 경과를 남기고, 고른 자료로 다음 커트를 준비하거나 디자이너에게 상담을 요청하는 서비스입니다.

- 시험 주소: https://salu.doyul.dev
- 로그인 없이 둘러보기: [예시 체험](https://salu.doyul.dev/examples). 체험 내용은 메모리에만 있고 나가면 사라집니다

## 지금 되는 것

| 기능 | 내용 |
|---|---|
| 기록 | 커트·경과 기록과 사진(장당 5MB, 한 번에 6장까지) |
| 커트 준비 | 지난 기록에서 자료를 골라 원하는 점을 정리해 저장 |
| 기기 보관 | 로그인 없이 브라우저에 보관, ZIP으로 백업·복원 |
| 계정 | 이메일 가입·로그인, Google·네이버 로그인, 로그인 후 기록을 암호화해 자동 저장 |
| 미용실·디자이너 | 매장 등록, 내 디자이너 프로필 공개, 기록에 담당 디자이너 연결 |
| 상담 | 고객이 커트 1건의 자료를 첨부해 요청. 기록에서는 그 커트의 담당 디자이너에게, 준비 내용은 고른 디자이너에게 보냄. 디자이너가 `받은 상담`에서 답변한 뒤에는 같은 상담 안에서 메시지를 주고받음 |
| 알림 | 로그인하면 머리글 종 버튼에 안 읽은 수 표시. 새 상담·메시지 알림을 누르면 그 상담으로 이동 |

로그인한 동안에는 새 상담과 메시지가 새로고침 없이 바로 보입니다. 연결이 끊긴 사이에 온 것은 다시 연결되거나 화면에 들어올 때 보입니다.

서버 API만 준비되고 화면은 아직 없는 것: 디자이너 후기·찜·소속 이력, 커뮤니티·신고·관리자 처리. 계약은 아래 개발 문서의 API 계약에 있습니다. 아직 없는 것: 예약·결제, AI 기능, 앱. Google·네이버 로그인은 실제 계정 동의 과정을 아직 확인하지 않았습니다.

폴더·파일별 용도는 [파일 안내](docs/files.md)에 있습니다.

## 개발 환경

- 프론트엔드: React·TypeScript·Vite, Node 22.22+ 또는 24+
- 백엔드: Java 17·Spring Boot·MyBatis
- 설정 도구: Python 3
- 데이터베이스: MySQL 8.4 기준, 기존 서버 또는 Docker 사용

Docker를 선택한 Mac 환경에서는 [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)을 사용합니다. 기존 MySQL 서버가 있으면 Docker를 설치할 필요가 없습니다. 아래는 Linux·Mac 공통 명령 기준이며 Mac 실기기 실행은 아직 확인하지 않았습니다.

## 실행

처음 실행할 때 저장소 루트에서 환경 파일과 암호화 키 준비:

```bash
python3 scripts/init-env.py
python3 scripts/init-backup-key.py
```

기존 `.env`가 있으면 새로 만들지 말고 필요한 설정만 확인하세요. 환경 변수 항목은 [.env.example](.env.example)에 있습니다. 생성한 파일에는 비밀 값이 있으므로 공유하지 마세요.

### DB 연결: 둘 중 하나 선택

**기존 MySQL 사용**

이 방법을 선택하면 아래 Docker 실행 단계는 생략합니다.

이미 설치된 MySQL 서버를 그대로 사용합니다. 별도 서버를 설치하거나 기존 DB를 초기화할 필요는 없습니다. SALU는 `salu_dev` DB를 사용하므로, 관리 권한이 있는 계정으로 SALU 전용 DB와 계정을 준비하세요. 기존 전용 DB·계정이 있으면 CREATE 명령은 생략하되, 해당 계정에 `salu_dev.*` 권한이 있는지 확인하고 필요한 권한을 부여하세요.

```sql
CREATE DATABASE IF NOT EXISTS salu_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'salu_app'@'127.0.0.1'
  IDENTIFIED BY '<직접 정한 비밀번호>';
GRANT ALL PRIVILEGES ON salu_dev.* TO 'salu_app'@'127.0.0.1';
```

위 비밀번호 표시는 실행 전에 개인 값으로 바꾸세요. 예시는 같은 PC의 MySQL에 연결하는 경우입니다. 다른 서버를 사용한다면 접속 위치에 맞는 계정을 준비하세요.

`.env`에 실제 접속 정보를 설정:

```dotenv
SALU_DB_HOST=127.0.0.1
SALU_DB_PORT=3306
SALU_DB_USER=salu_app
SALU_DB_PASSWORD=<DB 계정 비밀번호>
```

비밀번호는 실제 값으로 바꾸고, 공백이나 특수문자가 있으면 작은따옴표로 감싸세요. 환경 파일을 만든 도구의 자동 생성 비밀번호와 DB에 설정한 비밀번호가 일치해야 합니다. 기존 MySQL을 사용할 때 `SALU_MYSQL_ROOT_PASSWORD`는 앱 연결에 쓰지 않습니다.

테이블은 Spring 첫 실행 때 Flyway가 생성·갱신합니다. SALU의 migration 외에 기존 서비스의 초기 SQL을 가져오거나 실행하지 마세요.

**Docker 사용 — MySQL이 없거나 별도 DB를 원하는 경우**

```bash
docker compose up -d --wait db
```

기본 포트는 3307이며 `.env`의 `SALU_DB_PORT`도 3307로 맞춥니다. 이미 사용 중이면 빈 포트로 변경하세요. 기존 DB나 데이터 volume을 삭제하지 마세요.

### 백엔드 시작

```bash
set -a
source .env
set +a
cd backend
./mvnw spring-boot:run
```

별도 터미널에서 프론트엔드 시작:

```bash
cd frontend
npm ci
npm run dev
```

- 프론트엔드: `http://127.0.0.1:5174`
- 백엔드: `http://127.0.0.1:8081`
- API 연결: Vite가 `/api` 요청을 백엔드로 전달
- 백엔드 없이 화면 확인: `npm run dev:prototype`

스크립트로 백엔드를 실행하려면 저장소 루트에서 `scripts/backend-dev.sh`를 사용할 수 있습니다. 기존 Salon의 DB·초기 SQL은 사용하지 마세요.

## 빌드

프론트엔드:

```bash
cd frontend
npm run build
npm run format:check
```

백엔드:

```bash
cd backend
./mvnw -Dmaven.test.skip=true package
```

## 개발 문서

- [파일 안내](docs/files.md): 폴더·파일별 용도
- [개발 계약](docs/development-contract.md): 구조·화면 흐름·권한·트랜잭션·검증
- [인증 계약](docs/login.md): 회원가입·세션·CSRF·소셜 로그인
- [저장 계약](docs/personal-storage.md): 기기 보관·ZIP·계정 백업·암호화 키
- [상담 API 계약](docs/consultation-api.md): 상담 요청·메시지·읽음
- [알림 API 계약](docs/notification-api.md): 알림과 실시간 신호
- [디자이너 API 계약](docs/designer-api.md): 후기·찜·소속 이력
- [커뮤니티 API 계약](docs/community-api.md): 글·댓글·신고·관리자
- [화면 흐름](docs/screen-flow.md): 화면 목록·이동과 새 화면 추가 순서

Git에는 실행 코드·공통 설정·위 문서만 올립니다. 테스트·검증 도구·NAS 배포 설정·진행 메모·발표 자료는 각자 로컬에 둡니다.

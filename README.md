# SALU

커트 기록과 이후 경과를 남기고, 필요한 자료를 골라 다음 커트와 디자이너 상담을 준비하는 서비스입니다.

## 주요 기능

- 로그인 없이 기록·사진·작성 중인 내용 보관
- ZIP 파일로 백업하고 복사본으로 복원
- 로그인 후 암호화된 자료를 계정에 자동 저장
- 미용실·공개 디자이너 프로필 등록, 조회, 선택

실제 상담 전송·후기·커뮤니티·앱은 아직 구현하지 않았습니다.

## 개발 환경

- 프론트엔드: React·TypeScript·Vite, Node 22.22+ 또는 24+
- 백엔드: Java 17·Spring Boot·MyBatis
- 설정 도구: Python 3
- 데이터베이스: Docker Compose로 실행하는 SALU 전용 MySQL

Mac에서는 [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/)을 사용합니다. 아래는 Linux·Mac 공통 명령 기준이며 Mac 실기기 실행은 아직 확인하지 않았습니다.

## 실행

처음 실행할 때 저장소 루트에서 환경 파일과 암호화 키 준비:

```bash
python3 scripts/init-env.py
python3 scripts/init-backup-key.py
```

기존 `.env`가 있으면 새로 만들지 말고 필요한 설정만 확인하세요. 환경 변수 항목은 [.env.example](.env.example)에 있습니다. 생성한 파일에는 비밀 값이 있으므로 공유하지 마세요.

DB 시작:

```bash
docker compose up -d --wait db
```

기본 DB 포트는 3307입니다. 이미 다른 DB가 사용 중이면 `.env`의 `SALU_DB_PORT`를 빈 포트로 바꾸세요. 기존 DB를 초기화하거나 데이터 volume을 삭제하지 마세요.

같은 터미널에서 백엔드 시작:

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

- [개발 계약](docs/development-contract.md): 구조·화면 흐름·권한·트랜잭션·검증
- [인증 계약](docs/login.md): 회원가입·세션·CSRF·소셜 로그인
- [저장 계약](docs/personal-storage.md): 기기 보관·ZIP·계정 백업·암호화 키

진행 메모·과거 검토·발표 자료·화면 캡처는 로컬에 보관합니다. Git에는 실행 코드·공통 개발 설정·필수 계약과 지침만 올립니다. NAS 전용 설정과 테스트·검증 도구는 로컬에 보관합니다.

# 로컬 실행 환경

2026-10-05 재부팅 후 이전 `/tmp/salu-mysql-runtime`, 의존성 캐시·브라우저 파일 소실 확인. SALU 소스·.env는 보존. 현재 MySQL은 사용자 영구 경로에 별도 구성하며 시스템 MariaDB·Salon DB 사용 없음.

## 일상 실행

```bash
cd /home/chuwe/soldesk/SALU
./scripts/mysql-local.sh start
./scripts/mysql-local.sh status
```

DB가 이미 실행 중이면 status만 사용. 다른 터미널에서 `./scripts/backend-dev.sh`, 프론트 디렉터리에서 `npm run dev`. 화면 주소 `http://127.0.0.1:5174`. DB 종료는 `./scripts/mysql-local.sh stop`, 서버·React 종료는 각각 터미널의 Ctrl+C.

자동 시작 서비스 등록 없음. 재부팅 후 파일은 보존되지만 프로세스는 위 명령으로 다시 실행. `init`은 처음 구성할 때만 사용하고 기존 datadir가 있으면 중단. DB 비밀번호는 기존 루트 .env 사용.

| 대상 | 현재 경로 |
|---|---|
| MySQL 8.4.11·libaio·호환 라이브러리 | `~/.local/share/salu/runtime` |
| DB data·socket·로그 | `~/.local/share/salu/mysql` |
| Maven 의존성 | `~/.m2/repository` |
| Chromium | `~/.cache/ms-playwright` |

`SALU_RUNTIME_HOME`, `SALU_MYSQL_HOME`, `SALU_MYSQL_BASEDIR`로 별도 절대 경로 지정 가능. 로컬 DB 스크립트가 필요한 library 경로를 구성하므로 기존 /tmp 경로를 export하지 않음. 사진 저장 설정은 별개이며 사진 기능은 아직 없음.

## 필수 검증 명령

DB 실행 후:

```bash
cd /home/chuwe/soldesk/SALU
./scripts/verify-backend.sh
python3 scripts/verify-api.py
cd frontend
npm run build
npm run test:e2e
```

verify-backend는 salu_test 전용 DB·계정을 최초 생성하고 재사용, 실제 HTTP·MySQL·@Transactional 커밋/롤백 검증 포함. 개발 DB로 fixture 작성/삭제 없음. 단순 `backend/mvnw verify`는 DB 통합 검증을 건너뛰므로 필수 실제 검증을 대신하지 않음. API·브라우저 검증에는 개발 서버 실행 필요.

## 실행 파일 복구

현재 이미 구성됨. 실행 파일이 나중에 삭제된 경우에만 공식 MySQL 8.4.11 minimal archive를 `~/.local/share/salu/runtime`에 내려받아 압축 해제. 데이터 폴더는 초기화/삭제하지 않음.

공식 배포 URL: `https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11-linux-glibc2.28-x86_64-minimal.tar.xz`. 확인한 MD5 `3358302178e35d893f14fc49be542847`.

이 Arch 호스트는 MySQL에 필요한 libaio.so.1이 없었으므로 공식 libaio 0.3.113 소스를 `runtime/libaio` prefix로 빌드. `runtime/compat-lib/libncurses.so.6`는 호스트 `/usr/lib/libncursesw.so.6` 연결. 시스템 패키지나 시스템 DB 설정은 변경하지 않음.

Chromium만 복구할 때는 `frontend`에서 `npx playwright install chromium`. Docker 전환은 선택 사항으로 README의 설치 절차 참고. 이번 공통 기반 작업에는 Docker 설치·배포·회원 기능 포함 없음.

## 로그인 확인

현재 로컬 로그인도 실행 가능. 개발 계정 생성·보관 파일과 전체 로그인 E2E 명령은 [login.md](login.md) 참고. 계정 파일을 프론트 환경변수나 Git에 넣지 않음.

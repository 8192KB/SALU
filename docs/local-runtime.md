# 로컬 실행 환경

2026-10-05 재부팅 후 이전 `/tmp/salu-mysql-runtime`, 의존성 캐시·브라우저 파일 소실 확인. SALU 소스·.env는 보존. 현재 MySQL은 사용자 영구 경로에 별도 구성하며 시스템 MariaDB·Salon DB 사용 없음.

## 일상 실행

```bash
cd /home/chuwe/soldesk/SALU
./scripts/mysql-local.sh start
./scripts/mysql-local.sh status
```

DB가 이미 실행 중이면 status만 사용. 다른 터미널에서 `./scripts/backend-dev.sh`, 프론트 디렉터리에서 `npm run dev`. 화면 주소는 로컬에서 `http://127.0.0.1:5174`, 내부망에서는 이 PC의 내부 IP와 `:5174`를 사용. Vite 개발·미리보기 서버는 `0.0.0.0`에 바인딩. DB 종료는 `./scripts/mysql-local.sh stop`, 서버·React 종료는 각각 터미널의 Ctrl+C.

자동 시작 서비스 등록 없음. 재부팅 후 파일은 보존되지만 프로세스는 위 명령으로 다시 실행. `init`은 처음 구성할 때만 사용하고 기존 datadir가 있으면 중단. DB 비밀번호는 기존 루트 .env 사용.

| 대상 | 현재 경로 |
|---|---|
| MySQL 8.4.11·libaio·호환 라이브러리 | `~/.local/share/salu/runtime` |
| DB data·socket·로그 | `~/.local/share/salu/mysql` |
| Maven 의존성 | `~/.m2/repository` |
| Chromium | `~/.cache/ms-playwright` |

`SALU_RUNTIME_HOME`, `SALU_MYSQL_HOME`, `SALU_MYSQL_BASEDIR`로 별도 절대 경로 지정 가능. 로컬 DB 스크립트가 필요한 library 경로를 구성하므로 기존 /tmp 경로를 export하지 않음. 사진은 현재 브라우저 IndexedDB와 계정 암호화 백업에 보관. 사진 도메인 API·외부 파일 보관은 후속 범위.

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


## 내부망 로그인 연결 확인

태블릿에서 웹은 열리지만 로그인 서버 오류가 나면 프론트 주소의 `/api/health`를 먼저 확인. Vite가 같은 주소의 `/api`를 로컬 Spring 8081로 연결하므로 Spring이 꺼져 있으면 502가 발생. backend의 외부 포트를 따로 열 필요 없음.

```bash
curl --noproxy '*' -i http://192.168.1.85:5174/api/health
curl --noproxy '*' -i http://192.168.1.85:5174/api/auth/me
```

2026-10-12 재확인: Spring 정지 상태에서 502 재현, 기존 `.env`로 `scripts/backend-dev.sh` 실행 후 health 200·비로그인 me 401 확인. 기존 DB·migration 변경 없음. 실행한 Spring은 태블릿 재확인을 위해 유지. 재부팅하거나 실행 터미널을 종료하면 다시 실행 필요.

## FR04 반영과 화면 캐시 복구

2026-10-12 최신 Spring·Vite를 재시작하여 내부망 `192.168.1.85:5174`에 반영. salu_dev에 V4 정식 migration 적용, 공개 디렉터리 API 및 health 연결 확인. 기존 개인 기록은 IndexedDB/계정 백업 그대로 사용.

파일 갱신 도중 Vite가 빈 TSX 변환 결과를 캐시하면 브라우저에 `DateField ... does not provide an export`가 나타날 수 있음. 실제 파일과 빌드가 정상인지 먼저 확인하고 해당 SALU Vite 프로세스를 정상 종료한 뒤 `npm run dev`로 재실행. DB 재설정이나 개인 브라우저 자료 삭제는 필요 없음.

현재 실행 로그: `/tmp/salu-fr04-runtime.log`, `/tmp/salu-fr04-frontend-runtime.log`. 테스트용 8083 서버와 임시 회원·매장은 검증 후 종료/정리. 실제 NAS에는 이번 변경 미반영.

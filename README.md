# SALU

개인 커트·경과 기록에서 필요한 자료를 골라 디자이너와 상담하는 서비스.

현재 React에서 **Spring 로그인·회원 확인·로그아웃** 연결. 커트·경과·사진·요청 자료는 메모리 예시이며 서버 저장·상담 전송은 다음 개발 단계.

## 먼저 볼 문서

- [7주차 발표 예시안](docs/presentations/week07/README.md): 검증 전 PPTX·PDF, 현재 구현과 기기 저장 방향·발표 범위 구분
- [기기 기록·PPT 대조·발표 범위 검토](docs/plans/2026-10-10-local-records-and-week7-review.md): 로그인 없는 개인 보관, 선택 계정 연결, 파일 복원과 후속 상담
- [로그인 연결과 검증](docs/login.md): 실제 계정·세션·CSRF·오류 복구
- [화면 계획](docs/prototype-plan.md): 기록·개인 준비·자료 선택·미리보기
- [후속 개발 계약](docs/development-contract.md): DB·권한·예정 API·사진·상담·공동 작업·배포
- [자료 조사 목록](docs/document-inventory.md): 캡스톤·Salon·SALU·임시 조사 문서의 대표 원본과 구버전 구분

사람이 읽는 진행 체크는 Obsidian `20 진행 중인 일/SALU 진행상황`에서 관리. 이 개인 노트는 직접 체크 가능하며 자동 발행 대상이 아님. 상세 안내는 `30 프로젝트/SALU`의 **SALU 개요 → SALU 개발계획 → SALU 벤치마킹** 순서. 원본은 `~/dotfiles/obsidian/managed/30 프로젝트/SALU/`이며 Vault 복사본을 직접 수정하지 않음.

## 실행

필수: Node 22.22+ (22 LTS) 또는 24+. 실제 로그인에는 Java 17·SALU 전용 MySQL·기존 `.env` 설정 필요.

서버 실행은 [로컬 실행 환경](docs/local-runtime.md) 기준. 이 호스트에서는 아래 명령 사용. DB가 이미 실행 중이면 `status`만 확인하고 기존 DB에 `init` 재실행 금지.

```bash
cd /home/chuwe/soldesk/SALU
./scripts/mysql-local.sh start
./scripts/backend-dev.sh
```

다른 터미널에서:

```bash
cd /home/chuwe/soldesk/SALU/frontend
npm ci
npm run dev
```

React <http://127.0.0.1:5174>, Spring <http://127.0.0.1:8081/api/health>. 같은 origin의 `/api`를 Vite가 Spring으로 전달. 상단 로그인 버튼 또는 `/login`에서 등록된 계정 사용. 회원가입·디자이너 권한 부여는 아직 없음.

로그인은 새로고침 후 유지되지만 **작성한 예시 기록은 새로고침·로그인·로그아웃 시 초기화**. 서버 장애는 비로그인으로 단정하지 않고 재확인 가능. 예시 기록을 실제 회원 데이터로 자동 업로드하지 않음.

### Spring 없이 화면만 확인

```bash
cd frontend
npm ci
npm run dev:prototype
```

명시적 화면 전용 모드. 로그인과 `/api` 호출 없음. 커트 → 경과 → 개인 요청 준비 → 미리보기 → 선택적 디자이너 연결 흐름 확인. 목록·기록에서 자료 재진입, 기록 수정·사진 확대·초기화 가능.

### 빌드와 미리보기

```bash
cd frontend
npm run build
npm run preview
```

빌드 결과 `frontend/dist`. 기본 빌드는 서버 연결 모드. Vite preview도 `/api` proxy 사용. 실제 배포에서는 같은 origin의 reverse proxy와 SPA fallback 필요. 외부 이미지·폰트 요청 없음.

## 검증

```bash
cd frontend
npx playwright install chromium
npm run build
npm run format:check
npm run test:e2e
SALU_E2E_LOGIN_FILE=../.env.dev-login.json npm run test:auth
```

`test:e2e`는 명시적 화면 전용 모드의 PC·모바일 44개(2026-10-10 재실행). `test:auth`는 실제 Spring·DB·등록된 계정 필요, 인증/복구 9개. 계정 파일이 없으면 완료로 건너뛰지 않고 실패. 실제 계정의 비밀번호·CSRF를 담을 trace·영상·스크린샷 저장 안 함. 자세한 결과는 [로그인 문서](docs/login.md)와 [현재 구현 검토](docs/features/FR01-current-state-review.md).

백엔드를 변경할 때에는 별도 통합 검증:

```bash
./scripts/verify-backend.sh
python3 scripts/verify-api.py
```

DB 통합 검증은 `salu_test` 전용. 이번 React 연결 결과를 업무 DB·상담 구현 완료로 표시하지 않음.

## 화면과 코드

[로그인 PC](docs/screenshots/login-desktop.png) · [로그인 모바일](docs/screenshots/login-mobile.png) · [기록 목록 PC](docs/screenshots/records-desktop.png) · [커트·경과 모바일](docs/screenshots/record-mobile.png) · [디자이너 PC](docs/screenshots/designer-desktop.png) · [상담 미리보기 모바일](docs/screenshots/preview-mobile.png)

가상 자료의 실제 브라우저 캡처. 개발 서버 실행 후 `frontend`의 `npm run capture`로 재생성. 화면·사용자·후기 예시는 운영/사용성 평가 결과가 아님.

```text
SALU/
├── frontend/    React · TypeScript · Vite
├── backend/     Java 17 · Spring Boot · MyBatis · 인증 기반
├── docs/        화면 계획·후속 개발 계약·검증·원본 지도
├── scripts/     로컬 Spring·MySQL 실행과 검증
└── compose.yml  개발 DB 설정 (앱 컨테이너는 후속)
```

기존 준비본은 첫 커밋 `8bcace5`. 이후 실제 기능 작업과 검증을 순서대로 커밋. GitHub 원격은 사용자가 만든 비공개 [8192KB/SALU](https://github.com/8192KB/SALU). 2026-10-10 현재 소스 이력과 발표·계획 문서를 main·feature/spring-auth에 업로드 확인. 조원 초대·NAS 배포는 아직 수행하지 않음. 후속 공동 작업은 기능 브랜치 → PR 검토 → main 통합.

`.env`·개발 계정 파일·DB 데이터·업로드 사진·빌드 결과는 Git/공유 제외. Salon의 DB·초기 SQL은 사용하거나 변경하지 않음. [Salon 참고 코드와 보안 점검](docs/salon-security-audit.md) 확인 후 필요한 로직만 선별.

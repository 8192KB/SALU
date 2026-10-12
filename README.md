# SALU

개인 커트·경과 기록에서 필요한 자료를 골라 디자이너와 상담하는 서비스.

시연 주소: **https://salu.doyul.dev**. 배포 버전 `20261012-fdda7e5`, 최신 통합 코드는 `main` 브랜치. [조원 전달 문구](docs/team-preview-message.md).

현재 React에서 **로그인 없이 기기 보관·ZIP 백업/복원·로그인 후 계정 자동 저장** 제공. 소개 홈과 개인 기록, 별도 예시 체험을 분리. Google·네이버 설정과 버튼은 연결했으며 실제 제공자 동의 검증은 보류. 상담 실제 전송·커뮤니티·앱은 후속 단계.

## 먼저 볼 문서

- [문서 안내](docs/README.md): 현재 기준·기능 계약·과거 기록의 위치
- [지적사항과 남은 확인](docs/issue-tracker.md): 구현·검증·실기기·NAS 상태
- [로컬 실행](docs/local-runtime.md) · [NAS 배포와 업데이트](docs/nas-preview.md)
- [조원 전달 문구](docs/team-preview-message.md) · [7주차 발표 초안](docs/presentations/week07/README.md)

사람이 읽는 진행 체크는 Obsidian `20 진행 중인 일/SALU 진행상황`에서 관리. 이 개인 노트는 직접 체크 가능하며 자동 발행 대상이 아님. 상세 안내는 `30 프로젝트/SALU`의 **SALU 개요 → SALU 개발계획 → SALU 벤치마킹** 순서. 원본은 `~/dotfiles/obsidian/managed/30 프로젝트/SALU/`이며 Vault 복사본을 직접 수정하지 않음.

## 실행

필수: Node 22.22+ (22 LTS) 또는 24+. 실제 로그인에는 Java 17·SALU 전용 MySQL·기존 `.env` 설정 필요.

서버 실행은 [로컬 실행 환경](docs/local-runtime.md) 기준. 이 호스트에서는 아래 명령 사용. DB가 이미 실행 중이면 `status`만 확인하고 기존 DB에 `init` 재실행 금지.

```bash
cd /home/chuwe/soldesk/SALU
./scripts/mysql-local.sh start
python3 scripts/init-backup-key.py
./scripts/backend-dev.sh
```

다른 터미널에서:

```bash
cd /home/chuwe/soldesk/SALU/frontend
npm ci
npm run dev
```

React <http://127.0.0.1:5174>, Spring <http://127.0.0.1:8081/api/health>. 같은 origin의 `/api`를 Vite가 Spring으로 전달. 상단 로그인 버튼 또는 `/login`에서 등록된 계정 사용. 이메일 회원가입 화면 제공(실제 가입 검증은 보류). 로그인 후 `/account/designer`에서 자신의 디자이너 프로필과 미용실 등록 가능. 가입만으로 디자이너 목록에 표시되지 않으며 공개 프로필 등록 필요. 프로필은 자가 등록이며 별도 검증/상담 권한 부여는 후속.

개인 기록과 사진·작성 초안은 새로고침 후에도 기기에 보관. 로그인하면 기기 자료를 계정 공간에 연결하고 이후 자동 서버 저장. 로그아웃하면 계정 자료를 숨기며 삭제하지 않음. 서버 장애 중 기기 작성 가능. 예시 자료는 서버에 업로드하지 않음.

### Spring 없이 화면만 확인

```bash
cd frontend
npm ci
npm run dev:prototype
```

명시적 화면 전용 모드. 로그인과 `/api` 호출 없음. `/` 소개 홈, `/records` 개인 기록, `/examples/records` 가상 자료 체험. 예시 진입·초기화·종료는 개인 작업 유지. 커트 → 경과 → 개인 요청 준비 → 미리보기 → 선택적 디자이너 연결 흐름 확인. 목록·기록에서 자료 재진입, 기록 수정·사진 확대·초기화 가능.

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
npm run test:auth
npm run test:storage
```

`test:e2e`는 Spring 없는 PC·모바일 화면/기기 보관 검증. 실제 인증과 자동 저장 검증 전, 별도 터미널에서 `./scripts/storage-test-server.sh` 실행. `test:auth`와 `test:storage`는 차례로 실행. 같은 서버에서 연속 로그인 요청이 분당 제한에 걸리면 1분 후 재실행하며 보안 제한을 낮추지 않음. 두 검증은 테스트 서버8083·salu_test·/tmp 임시 계정 사용. 기존 개발/Salon 회원이나 개인 자료를 테스트 fixture로 쓰지 않음. 인증 trace·영상·스크린샷 저장 없음. 최신 결과와 정확한 범위는 [점검표](docs/issue-tracker.md)와 [FR04](docs/features/FR04-clear-flow-and-public-directory.md), 과거 결과는 [FR01](docs/archive/reviews/FR01-current-state-review.md) 참고.

백엔드를 변경할 때에는 별도 통합 검증:

```bash
./scripts/verify-backend.sh
python3 scripts/verify-api.py
```

DB 통합 검증은 `salu_test` 전용. 개인 자료의 암호화 백업 API를 검증하며, 이를 상담 전송·기록 도메인 CRUD 전체 구현 완료로 표시하지 않음.

## 화면과 코드

[로그인 PC](docs/screenshots/login-desktop.png) · [로그인 모바일](docs/screenshots/login-mobile.png) · [기록 목록 PC](docs/screenshots/records-desktop.png) · [커트·경과 모바일](docs/screenshots/record-mobile.png) · [디자이너 PC](docs/screenshots/designer-desktop.png) · [상담 미리보기 모바일](docs/screenshots/preview-mobile.png)

위 이미지는 홈·흐름 개선 전 가상 화면의 브라우저 캡처. 현재 동선은 [화면 계획](docs/prototype-plan.md) 참고. 개발 서버 실행 후 `frontend`의 `npm run capture`로 재생성. 화면·사용자·후기 예시는 운영/사용성 평가 결과가 아님.

```text
SALU/
├── frontend/    React · TypeScript · Vite
├── backend/     Java 17 · Spring Boot · MyBatis · 인증 기반
├── docs/        화면 계획·후속 개발 계약·검증·원본 지도
├── scripts/     로컬 Spring·MySQL 실행과 검증
├── compose.yml      기존 개발 DB 설정
└── compose.nas.yml  웹·Spring·독립 DB의 NAS 시연 구성
```

기존 준비본은 첫 커밋 `8bcace5`. 이후 실제 기능 작업과 검증을 순서대로 커밋. GitHub 원격은 사용자가 만든 비공개 [8192KB/SALU](https://github.com/8192KB/SALU). 2026-10-12 최신 앱·발표·배포 문서를 `main`에 통합하고 완료한 기능 브랜치를 정리. NAS 배포 완료, 조원 초대는 별도. 이후 공동 작업은 최신 main에서 새 기능 브랜치 → PR 검토 → main 통합.

`.env`·개발 계정 파일·DB 데이터·업로드 사진·빌드 결과는 Git/공유 제외. Salon의 DB·초기 SQL은 사용하거나 변경하지 않음. [Salon 참고 코드와 보안 점검](docs/salon-security-audit.md) 확인 후 필요한 로직만 선별.

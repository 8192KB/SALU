# SALU

개인 커트·경과 기록에서 필요한 자료를 골라 디자이너와 상담하는 서비스.

현재 작업: PPT 기준 **초기 React 화면**. 가상 데이터를 메모리에 저장하며 새로고침하면 초기화. 실제 기록 DB·사진 업로드·상담 전송은 후속 구현.

## 먼저 볼 문서

- [초기 화면 계획](docs/prototype-plan.md): 화면·입력·이동·작업 순서·검증
- [후속 개발 계약](docs/development-contract.md): 백엔드 구조·DB·권한·예정 API·사진·상담·공동 작업·배포

기존 준비본은 Git 첫 커밋 `8bcace5`에 보관. 현재 backend에는 로그인·세션·CSRF·회원 조회·MySQL 연결 기반이 있으며, 초기 화면과는 아직 연결하지 않음.

## 초기 화면 실행

필수: Node 22.22+ (22 LTS) 또는 24+. Spring·MySQL·`.env` 불필요.

```bash
cd frontend
npm ci
npm run dev
```

기본 주소: <http://127.0.0.1:5174>. 커트 기록 → 경과 → 개인 요청 준비 → 미리보기 → 필요하면 디자이너 선택 순서. 디자이너를 먼저 선택하는 흐름도 지원. 만든 자료와 작성 중인 초안은 상단 `요청 자료`에서 다시 확인. 기록·경과 수정, 사진 확대, 담당 프로필 명시 연결 가능. 화면 상단에서 확인 후 가상 자료 초기화 가능.

```bash
npm run build
npm run preview
```

빌드 결과는 `frontend/dist`. 초기 화면은 외부 폰트·이미지·API 없이 실행. 나중에 실제 저장을 연결하면 같은 origin `/api` proxy 필요.

## 화면 검증

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

검증은 별도 개발 서버에서 실행. 기존 backend와 MySQL을 실행하지 않아도 진행 가능. 결과는 초기 화면 계획에 기록. 기존 로그인·DB 검증과 구분. `npm run format:check`로 코드 포맷 확인.

## 실제 화면 캡처

[PC 기록 목록](docs/screenshots/records-desktop.png) · [모바일 커트·경과](docs/screenshots/record-mobile.png) · [PC 디자이너 프로필](docs/screenshots/designer-desktop.png) · [모바일 상담 미리보기](docs/screenshots/preview-mobile.png)

개발 서버를 실행한 뒤 다른 터미널에서 `frontend`의 `npm run capture`로 재생성. 주소를 바꾸면 `SALU_CAPTURE_URL` 지정. 실제 동작 화면의 가상 자료 캡처이며 DB·전송 완료 증거는 아님. 요청 작성·목록·기록 수정·사진 확대 캡처는 [초기 화면 계획](docs/prototype-plan.md)의 구현 결과 참고.

## 저장소·작업 순서

```text
SALU/
├── frontend/  React · TypeScript · Vite · 초기 화면
├── backend/   Java 17 · Spring Boot · MyBatis · 기존 인증 기반
├── docs/      화면 계획·후속 개발 계약·기존 검증 기록
├── scripts/   기존 로컬 backend·MySQL 실행과 검증
└── compose.yml  독립 개발 DB 설정
```

개발 브랜치 `feature/prototype-flow`에서 작업. 기존 준비본 → 계획 → 레이아웃 → 기록·경과 → 상담 미리보기 → 검증 순서로 실제 커밋. 기능별 변경을 PR에서 검토한 뒤 main 통합.

조원이 처음 실행할 때는 저장소 checkout 후 `frontend`에서 `npm ci`, `npm run dev`. DB 접근 정보는 필요 없음. GitHub 비공개 저장소 생성·공유와 NAS 배포는 후속 단계.

## 기존 backend를 확인할 때

Java 17·Python 3·전용 MySQL 필요. backend를 수정할 때 아래 문서를 먼저 확인.

- [로컬 실행 환경](docs/local-runtime.md)
- [로그인·세션 계약](docs/login.md)
- [기존 공통 기반 검증](docs/verification.md)
- [Salon에서 참고할 코드와 보안 점검](docs/salon-security-audit.md)

```bash
python3 scripts/init-env.py
./scripts/mysql-local.sh start
./scripts/backend-dev.sh
```

서버 상태: <http://127.0.0.1:8081/api/health>. 위 MySQL 명령은 기존 호스트 설정용. 다른 PC의 설치 방식은 실행 환경 문서에서 확인. 기존 데이터가 있는 환경에서 `init` 재실행 금지.

```bash
./scripts/verify-backend.sh
python3 scripts/verify-api.py
```

DB 통합 검증은 전용 `salu_test` 사용. Maven 단독 검증에서 DB 테스트가 생략될 수 있으므로 실제 통합 검증 완료와 구분.

`.env`·개발 계정 파일·DB 데이터·업로드 사진·빌드 결과는 공유/Git 제외. Salon의 초기 SQL과 기존 DB를 SALU에 덮어쓰지 않음.

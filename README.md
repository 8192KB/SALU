# SALU

개인 커트·경과를 기록하고 필요한 자료를 골라 다음 커트와 디자이너 상담을 준비하는 서비스.

React·TypeScript·Vite, Java 17·Spring Boot·MyBatis·MySQL 사용. 로그인 없이 IndexedDB에 기록·사진·초안 보관, ZIP 복사본 복원, 로그인 후 암호화 계정 백업 제공. 자체 미용실·공개 디자이너 등록과 조회·선택 지원. 실제 상담 전송·후기·커뮤니티·네이티브 앱은 별도 구현 범위.

## 개발 기준

- [개발 계약](docs/development-contract.md): 코드 구조·화면/디렉터리·권한·트랜잭션·검증 기준
- [인증 계약](docs/login.md): 회원가입·세션·CSRF·소셜 로그인
- [개인 저장 계약](docs/personal-storage.md): IndexedDB·ZIP·서버 백업·암호화 키

## 로컬 실행

Node 22.22+ 또는 24+, Java 17, SALU 전용 MySQL 필요. 환경 변수는 [.env.example](.env.example) 참고. 비밀 값과 개인 자료는 Git 제외. 기존 DB에 초기화 명령을 재실행하지 않음.

저장소 루트에서:

```bash
./scripts/mysql-local.sh start
python3 scripts/init-backup-key.py
./scripts/backend-dev.sh
```

별도 터미널에서:

```bash
cd frontend
npm ci
npm run dev
```

React `http://127.0.0.1:5174`, Spring `http://127.0.0.1:8081`. Vite가 같은 origin의 `/api`를 Spring에 전달. Spring 없이 화면만 확인하려면 `npm run dev:prototype` 사용. 빌드는 `npm run build`.

MySQL 최초 준비·개발 계정 생성에는 `scripts/mysql-local.sh`, `scripts/create-dev-member.sh` 사용. 환경 변수와 기존 데이터 보존 여부를 확인한 뒤 실행. 기존 Salon DB·초기 SQL 사용 금지.

## 검증

프론트엔드에서 `npm run build`, `npm run format:check`, `npm run test:e2e` 실행. 실제 인증/저장은 별도 터미널에서 `scripts/storage-test-server.sh` 시작 후 `npm run test:auth`, `npm run test:storage`를 차례로 실행. 테스트 전용 `salu_test`와 임시 계정 사용.

백엔드 변경에는 `scripts/verify-backend.sh`로 실제 MySQL 통합 검증. 화면 테스트와 실제 인증·DB 검증을 구분하며, 검증하지 않은 기능을 완료로 표시하지 않음.

## 문서 공유 범위

Git에는 README·작업 지침·스킬과 위 개발 계약만 보관. 진행상황·할 일·검토 보고서·구버전·개인 운영 안내·발표 메모는 로컬 보관하며 `.gitignore`로 제외. 필수 문서를 추가할 때에는 ignore의 허용 목록도 명시적으로 갱신.

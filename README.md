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
- 데이터베이스: SALU 전용 MySQL
- 환경 변수: [.env.example](.env.example) 참고

## 실행

저장소 루트에서 DB와 백엔드 시작:

```bash
./scripts/mysql-local.sh start
python3 scripts/init-backup-key.py
./scripts/backend-dev.sh
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
- 프론트엔드 빌드: `npm run build`

MySQL 최초 준비는 `scripts/mysql-local.sh`, 개발 계정 생성은 `scripts/create-dev-member.sh`를 사용합니다. 기존 DB에 초기화를 다시 실행하거나 Salon의 DB·초기 SQL을 사용하지 마세요.

## 검증

| 대상 | 실행 방법 |
|---|---|
| 프론트엔드 빌드·형식 | `npm run build`, `npm run format:check` |
| 서버 없는 화면·기기 저장 | `npm run test:e2e` |
| 실제 인증·자동 백업 | `npm run test:auth`, `npm run test:storage` |
| 백엔드·실제 MySQL | `scripts/verify-backend.sh` |

`npm` 명령은 `frontend`에서 실행합니다. 인증·백업 테스트는 별도 터미널에서 `scripts/storage-test-server.sh`를 시작한 뒤 차례로 실행하세요. 테스트에는 전용 DB `salu_test`와 임시 계정을 사용합니다.

## 개발 문서

- [개발 계약](docs/development-contract.md): 구조·화면 흐름·권한·트랜잭션·검증
- [인증 계약](docs/login.md): 회원가입·세션·CSRF·소셜 로그인
- [저장 계약](docs/personal-storage.md): 기기 보관·ZIP·계정 백업·암호화 키

진행 메모·과거 검토·발표 자료·화면 캡처는 로컬에 보관합니다. Git에는 코드·테스트·개발 설정·필수 계약과 지침만 올립니다.

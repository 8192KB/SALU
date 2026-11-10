# SALU

커트 기록과 이후 경과를 남기고, 고른 자료로 다음 커트를 준비하거나 디자이너에게 상담을 요청하는 서비스입니다.

## 지금 되는 것

| 기능 | 내용 |
|---|---|
| 기록 | 커트·경과 기록과 사진(장당 5MB, 한 번에 6장까지) |
| 커트 준비 | 지난 기록에서 자료를 골라 원하는 점을 정리해 저장. 저장한 준비는 다시 고칠 수 있음 |
| 기기 보관 | 로그인 없이 브라우저에 보관, ZIP으로 백업·복원(이미 있는 같은 기록은 건너뜀) |
| 계정 | 이메일 가입·로그인, Google·네이버 로그인, 메일로 비밀번호 찾기, 로그인 후 기록을 암호화해 자동 저장 |
| 미용실·디자이너 | 매장 등록(주소 검색으로 위치), 디자이너 상세에 카카오맵 매장 위치, 내 디자이너 프로필 공개·상담 요금 설정, 기록에 담당 디자이너 연결. 디자이너 상세에 소속 이력, 로그인하면 디자이너 찜. 디자이너는 정해진 시술 항목에서 전문 분야를 고르고, 고객은 원하는 시술로 디자이너를 찾음(맞는 항목 수·후기 점수 순) |
| 상담 | 고객이 커트 1건의 자료를 첨부해 요청. 기록에서는 그 커트의 담당 디자이너에게, 준비 내용은 고른 디자이너에게 보냄. 디자이너가 `받은 상담`에서 답변한 뒤에는 같은 상담 안에서 메시지를 주고받음. 답변을 받은 고객은 상담마다 별점과 후기를 하나 남기고, 후기는 디자이너 프로필에 보임. 요금이 있는 디자이너는 토스페이먼츠(테스트 결제)로 결제한 뒤 요청이 가고, 답변 전 취소·72시간 무답변 자동 취소 때 환불 |
| AI 도우미 | 로그인하면 내 기록을 참고해 답하는 AI 상담(더보기), 상담 요청 글 다듬기. 서버에 모델 주소를 넣었을 때만 보임 |
| 커뮤니티 | 하단 메뉴 더보기에서 들어감. 내 커트 기록을 사례로 올리거나(올릴 사진은 직접 고름) 고민을 물어보고, 댓글·도움돼요·신고. 글은 로그인 없이 볼 수 있음 |
| 알림 | 로그인하면 머리글 종 버튼에 안 읽은 수 표시. 새 상담·메시지 알림을 누르면 그 상담으로 이동 |

로그인한 동안에는 새 상담과 메시지가 새로고침 없이 바로 보입니다.

관리자는 더보기의 `신고 처리`에서 신고된 글·댓글을 숨기거나 유지하고 회원을 제재·해제합니다. 관리자 지정은 DB에서만 합니다. 예약과 앱은 아직 없습니다.

폴더·파일별 용도는 [파일 안내](docs/files.md)에 있습니다.

## 구조와 흐름

코드를 처음 볼 때는 요청 하나가 어디를 거쳐 가는지부터 보면 됩니다.

```
화면(frontend/src) → /api 요청 → Controller → Service → Mapper → MySQL
```

서버 코드는 `backend/src/main/java/kr/salu/` 아래에 기능별 폴더(`consultation`, `ai`, `payment` 등)로 나뉘어 있고, 폴더 안에서 세 파일이 일을 나눕니다.

| 파일 | 하는 일 |
|---|---|
| `…Controller` | 요청을 받고 응답을 돌려줌 |
| `…Service` | 권한 확인과 업무 규칙. DB를 여러 번 바꾸는 작업은 여기서 하나로 묶어, 중간에 실패하면 전부 취소 |
| `…Mapper` | SQL. 쿼리는 Mapper 파일 안에 바로 적혀 있음 |

로그인 여부와 관리자 권한은 `config/SecurityConfig` 한 곳에서 검사하고, 오류 응답은 `common/error/GlobalExceptionHandler`가 같은 모양으로 만듭니다. 테이블은 `backend/src/main/resources/db/migration`의 SQL 파일에 번호 순서로 있고, 서버를 켤 때 자동으로 적용됩니다.

상담 답변이나 메시지처럼 상대가 바로 봐야 하는 변경은 DB 저장이 끝난 뒤 `realtime/RealtimePublisher`가 WebSocket으로 신호를 보내고, 신호를 받은 화면이 목록을 다시 불러옵니다.

### 기능별로 볼 곳

**커트 기록·경과**

기록은 먼저 브라우저 저장소(IndexedDB)에 들어갑니다. 화면은 `record-pages.tsx`, 저장은 `prototype/personal-store.ts`입니다. 로그인하면 `prototype/cloud-sync.tsx`가 서버로 백업하고, 서버의 `backup/BackupService`가 암호화해서 `personal_backup_items`에 넣습니다.

**상담 신청**

`consultation-flow.tsx`에서 보낸 요청을 `consultation/ConsultationService`가 받습니다. 상담 내용, 첨부 사진, 디자이너에게 갈 알림을 한 번에 저장하고 하나라도 실패하면 모두 취소합니다.

**디자이너 답변·메시지**

디자이너가 받은 목록은 `received-consultations.tsx`, 대화 화면은 `consultation-conversation.tsx`입니다. 서버는 같은 `ConsultationService`에서 상담 당사자인지 확인한 뒤 저장합니다.

**시술로 디자이너 찾기**

서버가 아니라 화면에서 계산합니다. `designer-specialties.tsx`의 `recommend`가 고객이 고른 시술과 맞는 항목 수, 그다음 후기 점수 순으로 디자이너를 정렬합니다.

**AI 상담**

화면은 `ai-assist.tsx`, 서버는 `ai` 폴더입니다. `AiService`가 질문을 먼저 거르고, `AiRecords`가 내 백업에서 질문과 관련된 기록과 최근 기록을 합쳐 5개까지 고르면 `AiClient`가 모델에 보냅니다. 대화 내용은 저장하지 않습니다.

**상담 요금 결제**

`payment.tsx`가 토스 결제창을 열고, 결제가 끝나면 서버의 `payment/PaymentService`가 토스에 승인을 요청합니다. 취소·환불도 같은 서비스에서 처리합니다.

## 개발 환경

- 프론트엔드: React·TypeScript·Vite, Node 22.22+ 또는 24+
- 백엔드: Java 17·Spring Boot·MyBatis
- 설정 도구: Python 3
- 데이터베이스: MySQL 8.4. 설치된 MySQL을 쓰거나 Docker로 띄웁니다

## 실행

처음 한 번, 저장소 루트에서 환경 파일과 암호화 키를 만듭니다. 환경 변수 항목은 [.env.example](.env.example)에 있습니다.

```bash
python3 scripts/init-env.py
python3 scripts/init-backup-key.py
```

### DB 준비: 둘 중 하나

**설치된 MySQL 쓰기**

SALU 전용 DB와 계정을 만듭니다.

```sql
CREATE DATABASE IF NOT EXISTS salu_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'salu_app'@'127.0.0.1'
  IDENTIFIED BY '<비밀번호>';
GRANT ALL PRIVILEGES ON salu_dev.* TO 'salu_app'@'127.0.0.1';
```

`.env`의 접속 정보를 이 계정에 맞춥니다.

```dotenv
SALU_DB_HOST=127.0.0.1
SALU_DB_PORT=3306
SALU_DB_USER=salu_app
SALU_DB_PASSWORD=<위에서 정한 비밀번호>
```

**Docker로 띄우기**

```bash
docker compose up -d --wait db
```

`127.0.0.1:3307`에 열리며 `.env` 기본값과 같습니다. 3307을 이미 쓰고 있으면 `.env`의 `SALU_DB_PORT`를 빈 포트로 바꿉니다.

테이블은 어느 쪽이든 백엔드를 처음 실행할 때 자동으로 만들어집니다.

### 백엔드와 프론트엔드 시작

```bash
set -a
source .env
set +a
cd backend
./mvnw spring-boot:run
```

다른 터미널에서:

```bash
cd frontend
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:5174`를 엽니다. `/api` 요청은 Vite가 백엔드(`http://127.0.0.1:8081`)로 넘깁니다. 백엔드 없이 화면만 보려면 `npm run dev:prototype`을 씁니다.

백엔드는 저장소 루트에서 `scripts/backend-dev.sh`로 실행해도 됩니다.

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
- [AI API 계약](docs/ai-api.md): AI 상담·상담 글 다듬기, 모델 연결
- [결제 API 계약](docs/payment-api.md): 상담 요금 결제·취소·환불
- [화면 흐름](docs/screen-flow.md): 화면 목록·이동과 새 화면 추가 순서
- [디자인 기준](DESIGN.md): 색·글자·배치·공통 패턴·문구. 화면을 다듬을 때 기준

Git에는 실행 코드·공통 설정·위 문서만 올리고, 테스트·검증 도구·NAS 배포 설정·진행 메모·발표 자료는 각자 로컬에 둡니다.

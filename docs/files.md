# 파일 안내

Git에 올라간 파일의 용도입니다. 2026-10-16 main 기준.

## 루트

| 파일 | 용도 |
|---|---|
| `README.md` | 기능 요약과 실행 방법 |
| `AGENTS.md` | AI 작업 지침(구조·트랜잭션·오류 처리 규칙) |
| `.env.example` | 환경 변수 목록. 실제 `.env`는 `scripts/init-env.py`로 만들고 공유하지 않음 |
| `compose.yml` | 개발용 MySQL을 Docker로 띄울 때 사용 |
| `.agents/skills/`, `skills-lock.json` | AI 화면 디자인 skill |
| `.github/workflows/ci.yml` | PR마다 프론트 빌드·형식 검사, 백엔드 jar 빌드 |
| `.github/CODEOWNERS` | 서버·DB·문서·지침 변경에 저장소 관리자 승인 요구 |
| `.github/pull_request_template.md` | PR 작성 때 흐름·서버 규칙 확인 목록 |

## scripts

| 파일 | 용도 |
|---|---|
| `init-env.py` | `.env` 생성 |
| `init-backup-key.py` | 계정 백업 암호화 키 생성 |
| `backend-dev.sh` | `.env`를 읽어 백엔드 실행 |
| `create-dev-member.sh`, `CreateDevMember.java` | 개발용 로그인 계정 생성 |

## docs

| 파일 | 용도 |
|---|---|
| `development-contract.md` | 구조·화면 흐름·권한·트랜잭션 규칙 |
| `login.md` | 회원가입·로그인·세션·CSRF·소셜 로그인 규칙 |
| `personal-storage.md` | 기기 보관·ZIP·계정 암호화 백업 규칙 |
| `consultation-api.md` | 상담 요청·메시지·읽음 API 경로·응답·오류 |
| `notification-api.md` | 알림 API와 실시간 신호(WebSocket·STOMP) 연결 |
| `designer-api.md` | 디자이너 후기·찜·소속 이력 API |
| `community-api.md` | 커뮤니티 글·댓글·도움돼요·신고·관리자 API |
| `screen-flow.md` | 화면 목록·이동과 새 화면 추가 순서 |
| `files.md` | 이 문서 |

## backend (`backend/src/main/java/kr/salu`)

Controller는 입력·응답, Service는 업무 규칙·권한·트랜잭션, Mapper는 SQL을 맡습니다.

| 위치 | 용도 |
|---|---|
| `SaluApplication.java` | 시작점 |
| `config/SecurityConfig.java` | URL별 로그인 필요 여부·CSRF·세션·보안 오류 응답 |
| `auth/` | 로그인·로그아웃·회원가입(`SignupController`·`SignupService`), CSRF 토큰(`CsrfController`), 로그인 시도 제한(`LoginGuard`), 정지 회원 세션 끊기(`ActiveSessionGuard`), 세션 회원 정보(`MemberPrincipal`·`SessionMember`) |
| `auth/social/` | Google·네이버 로그인과 기존 계정 연결 |
| `member/` | 회원 조회 SQL |
| `backup/` | 로그인 회원의 암호화 자동 백업. 암호화(`BackupCrypto`), 자료 형식 검사(`BackupPayloadValidator`), 요청 크기 제한(`BackupBodyLimit`) |
| `directory/` | 미용실 등록, 디자이너 공개 프로필 목록·상세·내 프로필, 찜, 소속 이력 |
| `consultation/` | 상담 보내기·보낸/받은 목록·상세·첨부 사진·답변, 대화 메시지·읽음 위치 |
| `review/` | 상담 후기 쓰기·고치기·지우기, 디자이너 후기 목록 |
| `notification/` | 알림 저장·목록·읽음. 업무 transaction 안에서만 만듦 |
| `realtime/` | WebSocket·STOMP 연결(`WebSocketConfig`)과 commit 뒤 신호 전송(`RealtimePublisher`) |
| `community/` | 커뮤니티 글·사진·댓글·도움돼요·신고, 관리자 신고 처리·제재(`CommunityAdmin*`) |
| `auth/StorageContext.java` | 다른 탭에서 계정이 바뀐 뒤의 저장 요청을 막는 헤더 검사 |
| `common/Inputs.java` | 글자 수·UUID·시각 형식 공통 검사 |
| `common/PhotoCheck.java` | 사진 형식·크기 검사(백업·상담·커뮤니티 공용) |
| `common/error/` | 모든 API의 공통 오류 응답(`{code, message}`) |
| `health/` | 서버·DB 상태 확인 |

| 위치 | 용도 |
|---|---|
| `resources/application.yml` | 서버 설정(DB·세션·업로드 크기) |
| `resources/db/migration/V1~V10` | DB 테이블. V1 회원, V2 백업·소셜, V3 백업 사진, V4 미용실·디자이너, V5 상담, V6 회원 역할, V7 알림, V8 상담 메시지, V9 후기·찜·소속 이력, V10 커뮤니티. 적용한 파일은 고치지 않고 새 번호로 추가 |
| `resources/personal-backup-schema.json` | 백업 자료 형식. `frontend/scripts/generate-backup-schema.mjs`로 생성 |
| `pom.xml`, `mvnw`, `Dockerfile` | 빌드·배포 이미지 |

## frontend (`frontend/src`)

| 파일 | 용도 |
|---|---|
| `main.tsx`, `App.tsx` | 시작점과 전체 화면 주소(라우트) |
| `workspace.tsx` | 실제 공간과 예시 체험(`/examples`) 주소 구분 |
| `main-navigation.tsx` | 하단·상단 메뉴, 메뉴별 마지막 화면 기억 |
| `back-trail.ts` | 화면 위 뒤로 링크가 직전 화면으로 돌아가게 함 |
| `home-page.tsx` | 홈 |
| `record-pages.tsx` | 커트 기록 목록·작성·상세, 경과 작성 |
| `request-pages.tsx`, `consultation-pages.tsx` | 커트 준비(자료 선택 → 요청 작성 → 확인 → 저장), 디자이너 목록·프로필 |
| `consultation-flow.tsx` | 상담 요청 보내기·상담 내역·상세 |
| `received-consultations.tsx` | 디자이너가 받은 상담 목록·상세·답변 |
| `consultation-store.tsx` | 상담 자료 저장소. 예시는 메모리, 실제 공간은 서버 |
| `consultation-api.ts` | 상담 API 호출 |
| `directory-page.tsx` | 내 디자이너 프로필·매장 등록 |
| `directory.ts`, `directory-cache.ts` | 미용실·디자이너 목록 불러오기와 캐시 |
| `storage-page.tsx` | 기록 저장 상태·ZIP 백업·복원 |
| `completion.tsx` | 저장·전달 완료 공통 화면 |
| `auth/` | 로그인·회원가입·내 계정 화면(`pages.tsx`), 로그인 상태(`context.tsx`), 인증·백업·디렉터리 API 호출(`api.ts`) |
| `components.tsx`, `fields.tsx`, `date-field.tsx`, `dialog.tsx`, `photo-viewer.tsx`, `animated-details.tsx`, `material-choice.tsx`, `feedback.tsx` | 공통 UI(제목·뒤로 링크·입력칸·달력·확인 창·사진 확대·접기·자료 선택 카드·알림) |
| `theme.tsx` | 밝게·어둡게 설정 |
| `styles.css`, `interface.css`, `consultation.css`, `theme.css` | 화면 스타일과 색 |

### `frontend/src/prototype` — 기록 자료와 저장

| 파일 | 용도 |
|---|---|
| `types.ts` | 기록·경과·사진·준비 자료 타입 |
| `storage-model.ts` | 저장 자료 형식(zod)과 변환 |
| `personal-store.ts` | 브라우저 IndexedDB 보관, 로그인 전 기록을 계정으로 옮기기 |
| `cloud-sync.tsx` | 로그인 후 서버 암호화 백업과 동기화 |
| `zip-backup.ts` | ZIP 백업 만들기·복원, 사진 크기 검사 |
| `memory-repository.ts` | 기록 추가·수정 규칙(입력 검사) |
| `context.tsx` | 기록·초안을 화면에 제공 |
| `request-flow.ts` | 커트 준비 초안과 주소 |
| `fixtures.ts` | 예시 체험 자료(지우 디자이너 등) |
| `dates.ts`, `ids.ts` | 날짜 표시, ID 생성 |

### 그 밖

| 파일 | 용도 |
|---|---|
| `public/images/` | 예시 체험 사진 |
| `scripts/generate-backup-schema.mjs` | 백업 자료 형식을 backend용 JSON schema로 생성 |
| `nginx.conf`, `Dockerfile` | 배포 이미지의 웹 서버 |
| `vite.config.ts`, `tsconfig*.json`, `.prettierrc.json` | 빌드·형식 설정 |

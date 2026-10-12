# 기기 보관·파일 백업·계정 자동 저장

2026-10-11 구현. 현재 계약의 원본. 2026-10-10 검토안의 수동 서버 백업 제안 대신, 사용자가 선택한 **로그인 없이 기기 보관 + 로그인 후 자동 서버 저장** 적용.

## 사용 흐름

- 개인 기록·경과·사진·새 기록 및 수정 초안·커트 준비 초안·완료 미리보기를 IndexedDB에 보관. 사진은 Blob, 화면의 `blob:` URL은 다시 생성. 기록 저장과 해당 초안 정리는 같은 트랜잭션.
- 홈·내 기록·커트 준비 메뉴 전환은 마지막 하위 화면과 폼 UI·스크롤을 유지. 활성 메뉴를 다시 누르면 목록/첫 화면으로 이동하되 초안은 삭제하지 않음. 화면 보관은 접속 중에만 유지하며 기기 자료 보관과 별개. 계정/예시 공간을 바꾸면 이전 공간의 화면은 폐기.
- 기기 저장이 완료된 뒤 완료 메시지 표시. 저장 실패 시 기존 기록과 현재 입력 유지. 계정 서버 장애가 있어도 기기 작성 가능.
- 로그인하면 게스트 자료의 ID와 참조를 새로 만들어 계정 공간으로 연결. 연결이 기기에 원자적으로 저장된 뒤 게스트 공간을 비움. 기존 계정 초안이 있으면 새 초안을 복구 목록에 보존. 예시 자료는 이 경로를 사용하지 않음.
- 이후 변경은 기기에 먼저 저장하고 서버로 자동 전송. 기록 근처에 기기 저장·서버 저장 중·서버에도 저장됨 표시. 기기 실패는 `기기 저장 확인 필요`, 서버 실패는 `서버 저장 대기`로 구분. 서버 상태는 자동 재시도 시작/완료에 맞춰 갱신하며, 변경 대기·충돌·기기 저장 실패가 남으면 서버 저장 완료로 표시하지 않음. 로그아웃하면 계정 공간을 숨기고 별도 게스트 공간 표시. 계정 자료는 삭제하지 않음.
- 같은 기기의 다른 탭은 저장 세대 번호와 BroadcastChannel로 변경 확인. 오래된 탭의 덮어쓰기 거부. 실패한 입력은 ZIP으로 내보낸 뒤 재접속 가능.
- 다른 기기의 같은 기록 변경은 revision 충돌로 보존. `기록 저장·백업 → 복구본 만들기`에서 로컬 변경을 새 ID의 복구본으로 추가하고 원래 항목에 서버 최신본 적용.

브라우저 데이터 삭제·시크릿 모드·저장 공간 부족까지 기기 보관이 보장되지는 않음. 보관 권한 요청과 ZIP/계정 저장 제공. PWA 설치·오프라인 첫 실행·네이티브 저장은 후속 단계.

## ZIP

`/backup`에서 전체 개인 자료 내보내기·복원. `manifest.json`, `records.json`, `photos/{id}` 포함. 버전 1, JSON과 사진 SHA-256 검증. ZIP 자체는 암호화하지 않으며 직접 보관할 개인 파일임.

압축 전후 128 MiB, 최대 512개 항목, 사진당 5 MiB 이하 JPEG·PNG·WebP. 경로·중복·버전·JSON 구조·ID 참조·누락 사진·이미지 형식/실제 디코딩을 모두 확인한 후 새 복사본 추가. 같은 파일을 다시 복원하면 다시 복사본 추가. 기존 자료 덮어쓰기 없음. 기기 commit 실패 시 부분 복원 없음.

## 서버 계약

| 경로 | 동작 |
|---|---|
| GET `/api/personal-backups` | 현재 소유자의 itemId·revision 목록 |
| GET `/api/personal-backups/{itemId}` | revision·mutationId·복호화된 개인 자료 |
| PUT `/api/personal-backups/{itemId}` | expectedRevision·mutationId·payload·photoIds 저장 |
| GET/PUT `/api/personal-backup-photos/{photoId}` | 소유자에게만 실제 사진 조회·보관 |

모든 백업 요청에 인증 응답의 `X-SALU-Storage-Context` 필수. 값은 인증마다 변경하고 프런트엔드 메모리에만 유지. CSRF 재조회 후에도 이전 계정의 요청은 409/STORAGE_CONTEXT_CHANGED. 소유자는 principal로 결정하며 memberId 입력은 사용하지 않음. PUT·POST는 기존 전체 CSRF 보호 유지.

기록별 cut·progress·photos·불변 previews·관련 수정/준비 초안을 한 revision 항목으로 묶음. 새 커트 작성 초안은 별도 항목. 기기 DB의 dirty 항목과 mutationId가 지속 재시도 큐 역할. 응답 유실 뒤 같은 mutation 재전송은 최초 revision 반환, 내용이 다른 mutation 재사용은 거부. 서버 최신 mutation이 로컬 대기 mutation과 같으면 재다운로드 충돌 대신 성공 확인.

Backend `backup` 패키지의 Controller/Service/Mapper, Flyway V2/V3. V1 원본 유지. 서버의 버전 1 구조는 프런트엔드 Zod에서 생성한 `personal-backup-schema.json`과 참조 검증 사용. 변경 시 `cd frontend && npm run schema:backup` 재생성. 항목 JSON 2 MiB, 계정당 최대 2,000항목/사진 128 MiB.

암호화한 기록·사진을 MySQL BLOB에 보관. AES-256-GCM, 매 암호화마다 새 96-bit nonce, AAD에 소유자·자료 종류·ID 포함. SQL과 사진 참조 갱신은 Service `@Transactional`로 묶음. 사진이 먼저 업로드되고 항목 저장이 실패하면 같은 ID로 재시도 가능. 7일 이상 연결되지 않은 사진은 다음 사진 업로드 때 같은 계정 안에서 정리. 연결된 사진은 정리하지 않음. 기존 외부 사진 경로는 후속 상담/업로드 계약을 위해 보존.

서버는 복호화 가능하며 E2EE는 아님. 공개 배포 시 HTTPS·`SALU_COOKIE_SECURE=true`·정확한 `SALU_PUBLIC_ORIGIN` 설정 필수. 로컬 loopback HTTP 검증은 별도.

## 암호화 키 준비와 복구

개발 환경: `python3 scripts/init-backup-key.py` 실행 후 서버 재시작. Git에서 제외된 `.env.backup-keys.json`(권한 600)과 `.env` 키 경로 설정. 기존 키 덮어쓰기·값 출력 없음. 설정하지 않으면 백업 API가 503을 반환하고 기기 자료는 유지.

공개 배포는 별도의 접근 제한된 JSON 키 파일과 `SALU_BACKUP_KEY_FILE` 절대 경로 사용. 파일은 key ID를 키로, 32바이트 무작위 키의 Base64 값을 값으로 보관. `SALU_BACKUP_KEY_ID`는 새 자료를 암호화할 key ID. 키 파일은 DB와 분리하여 별도 안전한 장소에 백업. DB만으로 암호문 복구 불가.

키 교체: 기존 키를 파일에 유지한 채 새 ID/키 추가 → active ID 변경 → 재시작. 기존 자료는 이전 key ID로 읽고 이후 저장은 새 키 사용. 복구: DB와 모든 사용 중인 key ID의 키 복원 → 동일 설정으로 시작 → 실제 소유 계정에서 기록·사진 확인. 적용된 migration 수정이나 DB 초기화 금지. 키 손실/변조 시 원문 복구 불가하며 실패를 성공으로 바꾸지 않음.

## 소셜 로그인

Google OIDC와 네이버 OAuth2는 기존 SALU 세션·ROLE_MEMBER·ACTIVE·CSRF·세션 교체 계약 사용. `/api/auth/oauth2/providers`가 완전한 client 설정이 있는 제공자만 반환. `/api/auth/oauth2/authorize/{provider}` → `/api/auth/oauth2/callback/{provider}` → 고정 `/auth/complete`. 실패는 고정 `/login?socialError=1`. 출발 전 기기 초안 저장 완료를 기다림.

`.env.example`의 SALU_GOOGLE/NAVER_CLIENT_ID·CLIENT_SECRET·PUBLIC_ORIGIN 설정. 제공자 관리자 화면에 정확히 `{PUBLIC_ORIGIN}/api/auth/oauth2/callback/google` 또는 `/naver` 등록. Salon의 코드 흐름만 참고하며 Salon secret과 등록을 복사하지 않음. client가 없는 상태에서는 로그인 버튼 비노출, 로컬 로그인 계속 사용.

신원은 provider+subject로 식별. 이메일로 자동 병합하지 않음. 소셜 신규 회원의 이메일·비밀번호는 nullable. `/account`의 명시적 연결은 CSRF·현재 principal/storageContext·제공자·5분 만료·OAuth state를 검증하고 다른 소유자의 소셜 신원을 이동하지 않음.

기준 문서: [Spring OAuth2/OIDC 구성](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html), [Google 웹 서버 로그인](https://developers.google.com/identity/protocols/oauth2/web-server), [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md). 실제 제공자 동의/콜백은 SALU client 설정 후 별도 검증 필요. 테스트용 제공자 검증을 실제 Google/네이버 계정 검증으로 주장하지 않음.

## 검증

`scripts/verify-backend.sh`: 실제 salu_test + 임시 fixture, 자동 테스트 트랜잭션 없이 커밋/롤백·암호문·복호화·소유권·revision·mutation·CSRF·세션·OAuth callback/state/nonce/ACTIVE 검증. 테스트 API/제공자/fixture는 src/test에만 배치.

별도 터미널에서 `scripts/storage-test-server.sh` 실행(8083, salu_test 임시 계정). 이후 frontend에서 `npm run test:auth`, `npm run test:storage`. fixture/키는 /tmp에 두고 서버 종료 시 회원과 백업을 함께 정리. 화면 검증 `npm run test:e2e`는 Spring 없이 기기 보관과 별도 예시를 검증. 인증 검사 trace/video/screenshot에 비밀번호나 CSRF 저장 없음.

현재 실행 결과는 [FR02](features/FR02-personal-storage-and-account-backup.md)의 검증 기록 참고. 저장 오류 표시 복구와 모바일 작성의 후속 검증은 [작성 흐름 개선](archive/plans/2026-10-11-mobile-writing-flow.md). 상담 전송·커뮤니티·네이티브 앱은 후속. 가입 API는 FR03 구현이며 실제 새 가입 검증은 보류.

### HTTP 시연 주소의 ID 생성

2026-10-12 일반 HTTP 호스트에서 기록 저장 실패 재현. `crypto.randomUUID`는 해당 환경에 없어 공통 `newId()`에서 `crypto.getRandomValues` 기반 UUID v4를 사용하도록 보완. 기존 기록 ID·ZIP·서버 저장 형식 유지. HTTPS·localhost에서는 기존 randomUUID 사용. 기록·사진·경과·준비·복원·동기화 모두 같은 생성 함수 적용. 상세 원인과 검증은 [집중 작업 흐름](archive/plans/2026-10-12-focused-task-flow.md#http-기록-저장-오류-보완) 참조. NAS `20261012-fdda7e5` 반영 완료.


2026-10-12 저장 상태 표시 보완: 다른 기기와 변경 충돌 시 ‘변경 확인 필요’로 표시하고 복구본 만들기로 안내. 기기 저장 실패는 계속 우선 표시하며, 미전송 자료·충돌이 남아 있으면 서버 저장 성공으로 표시하지 않음. 실제 두 브라우저 충돌 복구와 오류 우선순위 5개 검증 통과. ZIP 복원 초안은 현재 초안을 보존하며 선택한 초안의 작성 화면으로 직접 이동. 저장/API/암호화 형식 변경 없음. 상세 화면·검증 기록은 [화면 구분과 전체 검증](archive/plans/2026-10-12-screen-audit-and-theme.md).

2026-10-12 입력 성능 보완: 입력마다 전체 커트의 revision 항목을 다시 구성하던 처리를 줄임. 상태와 해당 커트의 초안 참조가 그대로인 항목은 기존 payload 사용. 재분류가 필요할 때도 경과·사진·준비본·요청을 한 번에 커트별로 묶음. 사진 URL이 바뀐 객체와 그 상위 경로만 복사하며, 저장 완료 시 이미 화면에서 쓰던 데이터 참조를 보존. 저장 상태 표시만 바뀌면 폼 context 값을 다시 만들지 않음. 한국 날짜 포매터는 재사용하되 호출 때마다 현재 시각을 읽음.

자동 기기 저장의 시작 시점과 트랜잭션·대기열·draftVersion·실패 시 입력 보존 계약 유지. 저장 중 추가 입력은 최신 초안을 화면에 유지하고 다음 기기 저장에 포함. IndexedDB schema·암호화 백업 API·로그인 계약 변경 없음. 전체 workspace를 IndexedDB에 기록하는 비용은 남아 있으므로 이 변경을 저장 구조 전체의 성능 보장으로 해석하지 않음.

성능 측정: 사용자 브라우저와 분리한 비영구 Playwright context에 커트 200개·경과 1,000개를 만들고 390×844 화면·CPU 4배 감속 조건에서 30자 입력. 전체 저장 준비의 동기 연산 합계 약 4,907ms → 196ms. 사용자 키 입력 한 번의 응답 시간이나 실제 태블릿 측정값이 아님. 같은 부하의 별도 CPU 분석에서 React 개발용 JSX 검사 비용도 확인했으며 개발 모드보다 빌드본의 긴 작업 시간이 작았음. 실제 태블릿 한글 IME·운영 NAS의 최신 수정본은 별도 확인 범위.

브라우저 검증: Browser plugin 미제공으로 기존 Playwright 사용. `/records/new` → 좋았던 점 연속 입력 → 기기 저장 완료에서 SALU 페이지·작성 폼·입력값 유지, 런타임 오류와 개발 오류 overlay 없음. 빌드본 모바일 화면 증거 `/tmp/salu-typing-production-mobile.png`. 좋았던 점·불편한 점의 이전 저장 완료를 지연한 동안에도 최신 입력·focus·커서·사진을 유지하고 재접속 후 복원하는 회귀 검증 추가. 기기 저장/복원 14개와 실제 Spring·salu_test 두 브라우저 자동 백업/충돌/오류 5개 통과. 미국 브라우저 시간대에서도 한국 자정 전후 새 초안 날짜 갱신 확인. 최종 `npm run test:e2e -- --workers=2 --timeout=30000` PC·모바일 106개 통과(7.2분), `npm run test:storage` 실제 서버 5개 통과(1.3분). 빌드·포맷·`git diff --check` 통과. NAS 재배포·Git 업로드는 이 작업에서 수행하지 않음.

2026-10-12 계정 보관 안내 정리: 상단 정상 저장 상태의 백업 링크와 기기 영구 보관 권한 버튼 제거. 기기 저장 자체는 유지. 내 기록·내 계정의 `기록 저장·백업`에서 로그인 전 저장 한계, 로그인/회원가입, 계정 자동 저장, ZIP 복사본을 구분. 자세한 범위와 검증 보류 항목은 [FR03](features/FR03-account-signup-and-storage-navigation.md).

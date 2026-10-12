# FR02 기기 보관과 계정 자동 저장

상태: 구현 및 아래 로컬·테스트 서버 검증 완료(2026-10-11). 실제 Google/네이버 계정 동의·콜백은 SALU용 client 설정 후 별도 검증 필요.

사용자 승인: 로그인 없이 사용, 전체 개인 자료·사진·작성 초안 보관, ZIP 복사 복원, 로그인 후 자동 서버 저장, 로그아웃 시 계정 자료 숨김. 앱은 후속 단계.

## 구현 계획

1. IndexedDB에 개인 기록·경과·사진 Blob·준비 초안·불변 미리보기·수정 초안을 원자적으로 보관한다. 예시는 메모리에서만 사용한다.
2. 버전 있는 JSON과 실제 사진을 ZIP으로 내보내고, 전체 검증 후 ID와 참조를 바꾼 복사본으로 추가한다. 실패 시 기존 자료를 유지한다.
3. 계정별 저장 공간과 지속 재시도 큐를 연결한다. 로그인 시 기기 자료를 연결하고 이후 자동 업로드한다. revision 충돌은 복구본으로 보존한다.
4. Spring에 소유권 검사, 세션 storageContext, 멱등 mutationId, AES-GCM 암호화 기록·사진 API를 추가한다. DB 변경은 Service 트랜잭션으로 처리한다.
5. Google OIDC·Naver OAuth2를 SALU 세션에 연결한다. provider/subject로 식별하고 이메일로 자동 병합하지 않는다. 명시적인 계정 연결을 제공한다. 설정 없는 제공자는 노출하지 않는다.
6. 실제 salu_test API·커밋/롤백·암호문·소유권 검사와 브라우저 재접속·ZIP·계정 전환·네트워크 복구 검증 후 관련 문서를 갱신한다.

## 계약

- 로컬 저장 완료 전 완료 메시지를 표시하지 않는다. 실패한 입력은 유지한다.
- 브라우저 데이터 삭제에 대한 보장은 하지 않는다. 파일 백업과 로그인 자동 저장을 제공한다.
- 백업 API는 인증 principal로 소유자를 결정한다. 클라이언트 memberId는 권한 자료로 쓰지 않는다.
- 공개 배포는 HTTPS·Secure 세션 쿠키를 사용한다. 외부 암호화 키는 Git·프런트엔드·로그에 넣지 않는다. E2EE는 범위에 없다.
- 원문 JSON·사진은 서버에서 암호화해 보관한다. DB에 함께 저장한 사진 암호문은 DB 트랜잭션으로 원자성을 유지한다.
- 실제 제공자 동의·콜백 검증은 SALU용 client 설정과 사용자 계정이 준비된 뒤 별도로 기록한다.

## 검증 기록

저장 상태와 모바일 작성의 후속 검증: [작성 흐름 개선](../plans/2026-10-11-mobile-writing-flow.md). 화면 80개·인증 11개·실제 Spring 백업 5개 통과. 기존 2개의 백업 검증에 변경 없는 서버 회복·PUT 대기·기기 저장 오류 보존 3개 추가. 아래 최초 구현/메뉴 보존 검증은 당시 결과로 보존.

2026-10-11, Java 17·Spring Boot 4.1.1·MySQL 8.4(3307)·Chromium. DB 검증은 `salu_test`와 임시 fixture 사용. 일반 개발 서버는 8081, 인증·자동 저장 브라우저 테스트 서버는 8083. 테스트 메서드의 자동 트랜잭션 롤백으로 Service 결과를 가리지 않음. 기존 FR01·인증·화면 검증 기록은 보존.

| 실행 | 결과와 확인 범위 |
|---|---|
| `scripts/verify-backend.sh` | 29개 통과, 실패/skip 없음. 실제 HTTP·DB commit/rollback·AES-GCM 암호문/복호화·소유권·없는 사진 참조·revision·mutation 재전송·storageContext·CSRF·ACTIVE·세션 교체·OAuth state/nonce/계정 연결 |
| `npm run test:e2e` | 62개 통과. 기존 PC/모바일 54개와 기기 보관 8개. 기록·경과·사진·미리보기·새/수정 초안 재접속, ZIP 신규 기기 복원·복사 ID 연결, 손상/누락/버전/저장 한도 실패 시 기존 자료 유지 |
| `npm run test:auth` | 실제 Spring 8083에 연결해 11개 통과. 로그인·세션·CSRF·로그아웃·장애 복구·모바일, 로그인 전 입력 유지. 통신 실패 일부는 브라우저 응답으로 재현 |
| `npm run test:storage` | 실제 Spring 8083·salu_test에 연결해 2개 통과. 게스트 기록·사진·작성 중 초안의 로그인 연결, 자동 저장·다른 기기 복원, 계정 A/B 분리·로그아웃 숨김, 서버 연결 실패 후 재시도·두 기기 충돌 복구·응답 유실 멱등성·이전 storageContext 거부 |
| `npm run build`, `npm run format:check` | TypeScript·Vite 빌드와 포맷 검사 통과 |
| `python3 scripts/verify-api.py` | 일반 실행 서버의 health·세션·CSRF·JSON 401/403 확인 |
| 일반 jar 검사 | `BOOT-INF/classes`에 테스트 fixture/API/서버/IntegrationTest 없음 |

화면 실검증은 `http://127.0.0.1:5174`에서 1440×1000·390×844로 진행. Browser plugin not available: 일반 Playwright 사용. 소개 홈 → 사진을 포함한 기록 작성·저장 → 새로고침 후 유지 → 보관·백업 화면 이동. URL/제목, 의미 있는 첫 화면, framework 오류 화면 없음, 관련 콘솔/실행 오류 없음, 가로 넘침 없음 확인.

화면 증거는 Git 밖 `/tmp/salu-home-{desktop,mobile}.png`, `/tmp/salu-storage-{desktop,mobile}.png`. 테스트 로그는 `/tmp/salu-db-verify.log`, `/tmp/salu-screen-tests.log`, `/tmp/salu-auth-tests.log`, `/tmp/salu-cloud-storage-tests.log`. Safari·실물 휴대폰·오프라인 최초 실행·실제 제공자 계정 검증은 미실시.

## 구현 결과와 결정

- `frontend/src/prototype/personal-store.ts`: 계정별 IndexedDB·원자적 저장·초안·사진·탭 변경 감지. `storage-model.ts`의 버전·참조 계약과 `zip-backup.ts`의 전체 ZIP 검증을 사용.
- `frontend/src/prototype/cloud-sync.tsx`: 지속 dirty/mutation 큐·재시도·충돌 복구·응답 유실 처리. 로그인/로그아웃의 메모리 초기화와 삭제 경고를 제거하고 `/backup`·`/account` 제공.
- `backend/.../backup`: principal/storageContext·ACTIVE 확인, shared schema·사진 실제 decode 검증, Service 트랜잭션과 AES-256-GCM. 기존 V1 수정 없이 V2/V3 추가.
- 외부 파일 저장안 대신 암호화 사진 BLOB를 DB에 보관. 사진 참조·항목·mutation의 원자성을 유지하기 위한 결정. 먼저 업로드된 미연결 사진은 재시도에 사용하며 7일 후 다음 사진 업로드 시 정리. 후속 상담/공개 파일 저장 계약은 별도.
- `backend/.../auth/social`: Google OIDC·네이버 OAuth2를 동일 SALU principal에 연결. 테스트 제공자의 실제 HTTP callback과 Google 서명·nonce 검증을 수행했으며 실제 제공자 검증을 대신한다고 주장하지 않음.
- `.env.backup-keys.json`은 개발용 외부 키 파일이며 Git 제외·권한 600. 값 출력/기존 키 덮어쓰기 없음. 공개 배포의 키 파일·HTTPS·Secure cookie·정확한 public origin은 배포 시 별도 설정.

현재 사용/설정/제한/복구 절차의 원본은 [personal-storage.md](../personal-storage.md). 네이티브 앱·PWA·로컬 가입·기록 도메인 CRUD·상담 실제 전송·커뮤니티는 후속 단계.

## 후속: 주 메뉴 복귀 동작

2026-10-11 사용자 요청: 홈·내 기록을 오가면 작성하던 화면을 이어 표시하고, 이미 선택된 메뉴를 다시 눌렀을 때 목록/첫 화면으로 이동.

이후 전체 선택·가격 조작·이전 담당자 재사용·프로필/문구 수정의 최종 화면 검증은 **80개 통과**. 아래 72개는 메뉴 보존 구현 당시의 결과로 보존. 최신 변경·검증·PPT 미구현 범위는 [프론트 검토](../plans/2026-10-11-frontend-polish-review.md) 참고.

`main-navigation.tsx`에서 메뉴별 마지막 URL(초안 query 포함)·스크롤을 보관. 고정된 portal 컨테이너를 활성 화면에 연결하고 비활성일 때 DOM에서 분리하여 같은 폼·입력·사진·펼친 정보와 진행 중 사진 확인을 유지. 각 메뉴의 마지막 화면 하나만 보관. 로그인/계정·개인/예시 범위 변경 때 화면 보관 폐기. 인증 페이지는 보관하지 않음. [React portal의 DOM 배치와 context 규칙](https://react.dev/reference/react-dom/createPortal) 적용.

숨긴 자료 선택/요청 화면의 effect는 현재 초안·단계·URL을 변경하지 않도록 활성 상태 확인. `workspace.tsx`의 화면 이동은 최신 가시성·화면 주소·실제 브라우저 주소를 확인. 비동기 저장 완료가 메뉴 이동과 겹치면 현재 URL을 유지하고 이전 메뉴의 복귀 대상을 완료 화면으로 갱신. 폐기되었거나 다른 화면으로 바뀐 상태의 이전 callback은 화면 이동에 사용하지 않음.

앞의 저장·서버 검증 기록과 별도의 최종 실행 결과:

- `npm run test:e2e -- --workers=4`: **72개 통과, 55.4초**. 기존 62개에 PC/모바일 메뉴 검증 10개 추가. 같은 폼 DOM·문장·사진·펼친 정보 유지, 요청 query/단계 유지, 사진 확인 중 이동, 저장 응답 지연과 메뉴 이동 겹침, 메뉴/뒤로 가기의 스크롤 복귀·재선택 확인. 미리보기 불변 검증은 새 메뉴 복귀 동작에 맞춰 유지.
- `npm run test:auth`: 실제 Spring 8083 연결 **11개 통과, 17.1초**. 인증 화면·로그아웃·입력 유지·실패 복구·모바일 회귀 확인.
- `npm run test:storage`: 실제 Spring 8083·salu_test 연결 **2개 통과, 16.5초**. 최종 코드의 로그인 연결·자동 저장·다른 기기 복원·계정 분리·로그아웃 숨김·장애/충돌/응답 유실 복구 회귀 확인. 테스트 서버 종료 시 임시 회원·백업·키 정리.
- `npm run build`, `npm run format:check`, `git diff --check`: 통과.
- 실제 개발 화면 `http://127.0.0.1:5174`, 1440×1000·390×844. Browser plugin not available, Playwright 사용. 소개 홈 → 기록 작성/사진/선택 정보 펼침 → 홈 → 내 기록에서 같은 작성 폼 복귀 → 내 기록 재선택 시 목록. URL·제목·실제 화면·동일 폼 DOM·가로 넘침 없음·오류 overlay 없음·관련 콘솔/실행 오류 없음 확인.
- 증거 `/tmp/salu-navigation-{desktop,mobile}.png`, `/tmp/salu-navigation-qa.jsonl`, `/tmp/salu-navigation-tests.log`, `/tmp/salu-navigation-auth.log`, `/tmp/salu-navigation-cloud.log`. 실제 Google/네이버·Safari·실물 기기 검증을 추가로 수행했다고 주장하지 않음.

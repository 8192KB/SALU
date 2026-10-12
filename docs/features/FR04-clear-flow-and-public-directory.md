# FR04 명확한 저장 흐름과 실제 디렉터리

상태: 로컬 구현·자동 검증 완료. 실기기 확인·NAS 배포 대기. 기준과 상태는 [지적사항 점검표](../issue-tracker.md).

## 구현 계획

1. 점검표 저장, 터치 하단/데스크톱 고정 메뉴, 제목·기능 구분 개선.
2. 네이티브 숨김 입력 대신 앱 달력. 직접 입력과 날짜 범위 유지.
3. IndexedDB 커밋 후 커트/경과 생성·수정과 준비의 공통 완료 화면. 실패·중복 제출·백그라운드 이동 보존.
4. SALU 미용실·공개 디자이너 디렉터리. 회원당 자신의 프로필 하나, Service 소유권/트랜잭션. V4 migration.
5. 실제 목록/상세/등록/선택 연결. 개인 자료에 ID와 이름·매장 스냅샷만 저장. 공개 캐시는 개인 백업에서 제외, 오프라인 직접 입력 유지.
6. 기존 ZIP/암호화 백업 호환, API/실제 salu_test/브라우저/반응형·다크 검증과 결과 기록.

## 계약

- 가입은 디자이너 등록과 별개. 자가 등록 프로필에 검증 표시 없음. 실제 상담·후기는 후속이며 준비 중 안내.
- 공개 조회는 비로그인 가능. 등록/수정은 인증·ACTIVE·CSRF와 실제 소유자 검사.
- 선택된 디자이너의 현 매장은 기존 매장이 비어 있을 때만 채움. 이름 자동 연결 금지. 과거 ID·이름은 이동/개명/비공개에도 보존.
- 데이터 모델에 optional salonId 추가, 기존 저장 버전 및 ZIP 유지. 공개 전체 프로필을 개인 자료에 저장하지 않음.
- 실제 소셜 동의·가입 동작 검증과 NAS 배포는 이번 승인 범위 밖. 화면/실제 API 검증과 분리 기록.

## 구현 결과

- 터치(`any-pointer: coarse`) 또는 폭 700px 이하: 방향과 관계없는 하단 메뉴. 나머지는 sticky 상단. 집중 작성·키보드·보관된 페이지 계약 유지.
- 한국어 직접 입력과 48px/24px 달력 버튼. 앱 Dialog 달력의 월/연도 이동·선택/오늘/범위·취소/키보드/초점 복귀 제공. 320px 날짜 셀 44px 이상.
- 커트·경과 생성/수정 및 준비 저장의 공통 Completion. IndexedDB 커밋 실패는 입력 유지, 성공은 명시적인 상세 이동 전까지 결과 표시. 프로필 결과는 서버 저장으로 별도 문구.
- `directory` Controller/Service/Mapper와 V4 추가. 공개 목록은 최대 500개(검색·페이지 분할은 후속). 자신만 등록/수정, unique member 제약, ACTIVE 공개 사용자 필터, CSRF, 현재 소속 변경의 트랜잭션 롤백 적용. 본인 API에 타인 ID 입력 경로 없음.
- `/account/designer` 소개·전문 분야·공개 범위·현재 매장 편집, 미용실 등록. `/designers` 실제 공개 목록·상세. 기록 선택 정보에서 등록 매장/디자이너·이전 담당자·직접 입력 제공. 이전 담당자 선택은 해당 과거 매장을 명시적으로 재사용하고, 공개 디자이너 선택의 자동 매장 채움은 빈 입력에만 적용.
- 개인 CutRecord/CutDraft optional salonId, RequestDraft optional designerSnapshot 추가. 공개 프로필 캐시는 개인 `state.designers: []`에서 분리. 기존 버전 1 ZIP 호환, ZIP 복사 시 공개 디자이너/미용실 ID는 유지. 과거 이름·소속은 프로필 수정/이동/비공개 후에도 보존.
- 실제 상담/후기는 구현하지 않았으며 공개 프로필에 준비 중으로 표시. 기존 예시 후기와 분리.

## API

| 요청 | 권한 / 동작 |
|---|---|
| GET /api/salons | 공개 미용실 목록 |
| POST /api/salons | ACTIVE 로그인·CSRF, 이름/지역/지점 등록 및 중복 차단 |
| GET /api/designers, /api/designers/{id} | ACTIVE 회원의 PUBLIC 프로필만 공개. 소유 회원 ID/이메일 노출 없음 |
| GET /api/my/designer-profile | principal 본인 프로필, 없으면 204 |
| POST /api/my/designer-profile | 본인 프로필 최초 등록, 중복 409 |
| PUT /api/my/designer-profile | 본인 프로필·현재 소속 변경, 없으면 404 |

프로필 입력: name, introduction, specialties(최대 10개 문자열 배열), visibility(PUBLIC/PRIVATE), nullable salonId. 응답 specialties는 쉼표 구분 문자열, 현재 매장 이름·지역·지점 포함. 서버의 현재 소속과 개인 기록의 시술 당시 매장 이름은 별도 의미.

## 검증

2026-10-12, 상세 실행 로그·캡처와 한계는 [점검표](../issue-tracker.md). 실제 salu_test 31개 backend 검증, 기존 인증 화면 13개, 자동 저장/디렉터리/ZIP·다른 기기 복원 6개 통과. 화면 118개 범위의 회귀 검증 후 실패 항목 수정·관련 24개 재검증 통과. Browser plugin 미제공으로 기존 Playwright 사용.

실제 Android/iOS Safari·한국어 IME·기기 키보드·사용자 NAS는 이번 자동 검증에 포함되지 않음. 200%는 720px/dpr2 재배치 모델로 확인했으며 OS 글꼴 확대 실기기 검증과 구분. 새 회원가입 실제 동작·Google/Naver 외부 동의 검증은 계속 사용자 보류.

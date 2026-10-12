# SALU 문서 안내

2026-10-12 기준. 현재 운영·개발 문서와 당시 계획·검증 기록을 분리. 최신 상태는 [지적사항 점검표](issue-tracker.md)에서 확인.

## 지금 확인할 문서

| 목적 | 문서 |
|---|---|
| 지적사항·구현·검증·남은 확인 | [점검표](issue-tracker.md) |
| 개발 환경 실행·복구 | [로컬 실행](local-runtime.md) |
| NAS 접속·수정본 배포·복구 | [NAS 운영](nas-preview.md) |
| 조원 시연·발표 | [전달 문구](team-preview-message.md), [7주차 자료](presentations/week07/README.md) |

## 개발할 때 읽을 계약

| 범위 | 기준과 상세 |
|---|---|
| 공통 구조·권한·트랜잭션·후속 설계 | [개발 기준](development-contract.md) |
| 화면 경로·입력·자료 선택·완료 흐름 | [화면 계약](prototype-plan.md), [FR04 디렉터리와 명확한 흐름](features/FR04-clear-flow-and-public-directory.md) |
| 기기 저장·ZIP·암호화 계정 백업 | [저장 계약](personal-storage.md), [FR02](features/FR02-personal-storage-and-account-backup.md) |
| 로그인·회원가입·소셜 연결 | [로그인](login.md), [FR03](features/FR03-account-signup-and-storage-navigation.md), [Salon 보안 점검](salon-security-audit.md) |

현재 개인 기록은 IndexedDB 보관, 로그인 후 암호화 백업. 실제 공개 미용실·디자이너 등록/조회/선택 구현. NAS HTTPS 배포 완료. 새 이메일 가입의 실제 검증과 Google·네이버 외부 동의/콜백 검증은 사용자 지시로 보류. 기록 도메인 CRUD·실제 상담 전송·후기·커뮤니티·앱은 후속 범위.

## 과거 기록 관리

[과거 기록 색인](archive/README.md)에서 초기 조사·완료된 계획·누적 구현/배포 기록 확인. 삭제하지 않고 Git에 보존하며, 당시의 ‘미구현’·‘배포 전’ 설명을 현재 상태로 읽지 않음. 승인된 계획과 검증 근거를 가리키는 기존 링크는 이동 후 경로로 갱신.

현재 동작·실행·복구 방법은 위 문서에 갱신. 긴 조사·실패 이력은 archive에 보존. 임시 로그, 개인 설정, 비밀 값, 중복 작업 복사본은 Git 제외. 발표 원본과 프로젝트 공유 스킬·라이선스는 보존.

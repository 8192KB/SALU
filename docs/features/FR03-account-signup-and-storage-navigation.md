# FR03 회원가입·간편 로그인·기록 보관 안내

2026-10-12 사용자 승인: 이메일 회원가입 추가, Salon처럼 구글·네이버 로그인 유지, `ssh local`에서 기존 키 탐색. 실제 제공자 로그인 동작 검증은 이후 진행으로 지정.

## 구현

- `/signup`에서 이름·이메일·비밀번호 입력. 비밀번호 12자 이상·UTF-8 72바이트 이하. 이메일과 이름은 양끝 공백 제거, 이메일은 소문자 정규화.
- `POST /api/auth/signup`에 전체 CSRF·JSON 입력 검증 적용. Controller는 입력과 201 응답, `SignupService`는 BCrypt와 트랜잭션, `MemberMapper`는 INSERT 담당. DB unique 충돌은 기존 공통 409 응답. 요청 role/memberId를 사용하지 않고 서버에서 ACTIVE 일반 회원 생성. 로그인과 가입의 IP 요청 제한은 별도 집계.
- 가입 성공 후 기존 세션 로그인 경로 사용. 해당 로그인에 세션 ID 교체·ACTIVE 확인·기존 기기 기록의 계정 연결과 암호화 자동 백업 계약 적용. 가입만 성공하고 로그인 실패하면 가입 완료 화면에서 로그인 재시도 제공. 비밀번호는 전송 후 폼에서 제거하며 DTO의 문자열 변환에도 포함하지 않음.
- 로그인·가입 화면 모두 설정된 Google/네이버 진입 제공. 동일한 이메일만으로 계정을 자동 합치지 않으며 기존 명시적 계정 연결 유지.
- 상단의 정상 저장 상태에서 백업 메뉴 제거. 저장 오류·충돌의 복구 진입은 유지. `내 기록`과 `내 계정`에서 `기록 저장·백업` 진입.
- `기기 보관 권한 요청` 버튼과 호출 제거. 로그인 전 안내: 이 브라우저에만 저장되고 브라우저 데이터를 지우면 사라질 수 있음. 로그인하면 현재 기록·사진도 계정에 보관. ZIP 백업/복원은 별도 선택으로 유지.

## 설정과 검증 경계

원격 Salon에는 실제 OAuth properties가 없었으나, `ssh local`의 기존 다른 프로젝트에서 구글·네이버의 실제 키를 확인. 원격 파일을 바꾸지 않고 로컬 SALU의 Git 제외 `.env`에 4개 OAuth 항목 연결, 권한600 적용. NAS용으로 OAuth 항목과 공개 주소만 담은 `.env.oauth.nas`를 별도 준비(Git 제외·권한600), 로컬 DB 설정은 포함하지 않음. 비밀값은 문서·출력·프론트 번들에 포함하지 않음.

NAS의 현재 공개 주소는 `https://salu.doyul.dev`, 배포 컨테이너의 OAuth 값은 아직 비어 있음. 이번 소스와 로컬 설정의 반영을 NAS 배포 완료로 해석하지 않음. 실제 제공자 연결 전에 사용하는 앱에 아래 callback을 등록해야 함.

- 배포 Google: `https://salu.doyul.dev/api/auth/oauth2/callback/google`
- 배포 네이버: `https://salu.doyul.dev/api/auth/oauth2/callback/naver`
- 로컬 Google: `http://127.0.0.1:5174/api/auth/oauth2/callback/google`
- 로컬 네이버: `http://127.0.0.1:5174/api/auth/oauth2/callback/naver`

기존 설정의 구글 redirect는 다른 프로젝트 주소였음. 키 존재와 SALU callback 허용은 별개. 사용자 지시에 따라 실제 Google/네이버 동의·callback 검증 보류. 이메일 소유 확인 메일·비밀번호 재설정은 이 구현에 포함하지 않음. 회원가입의 새 실제 DB/API·브라우저 검증도 후속이며, 기존 로그인·자동 백업 통과 기록을 새 가입 완료 검증으로 주장하지 않음.

현재 기본 검사: React 빌드, backend 단위 검증 통과. 실제 DB 통합 검증은 일반 Maven 실행에서 제외되는 기존 계약 유지. React 빌드·포맷·`git diff --check` 통과. 프론트 번들에 OAuth 값이 포함되지 않는지 검사. 새 코드와 키 설정으로 로컬 Spring 재시작 후 Vite proxy의 health200, 제공자 목록 google/naver 확인. 실제 가입·제공자 로그인·화면 조작 검증은 수행하지 않음. NAS 배포 및 원격 설정 변경 없음.

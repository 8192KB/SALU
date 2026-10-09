# Salon 보안 재점검과 로그인 이식

2026-10-05 현재 워킹트리 기준 정적 코드 점검. 기존 Salon 소스·DB 수정 없음. 문서 설명보다 실제 SecurityConfig/Controller/Service/SQL을 기준으로 판단.

## 범위와 한계

Controller·Service·Mapper·Mapper XML·JSP 145개 파일(73 Java, 24 XML, 48 JSP)의 위험 패턴 검색과 주요 입력→저장→출력/삭제/권한 경로 추적. 인증·가입·계정 상태·CSRF·세션·사진·커뮤니티·채팅·후기·프로필·쿠폰·점주/관리자 접근·예외·트랜잭션 설정 확인. SQL `${}` 보간, 정렬 문자열, 사용자 객체 JSON 반환, 사용자 입력의 HTML/script 출력도 검색.

Salon 자체의 실행 공격 테스트, 운영 프록시·배포 설정·Git 과거 이력 전체·모든 전이 의존성 CVE 검사는 수행하지 않음. 아래 ‘확인’은 코드 경로의 근거이며 실제 Salon에서 공격을 실행했다는 뜻이 아님. 미발견을 보안 문제 없음의 증명으로 사용하지 않음. SALU 로그인은 별도 실제 MySQL·HTTP·Chromium 검증 수행.

## 확인한 문제와 SALU 처리

경로는 `../Salon/` 기준.

| 항목 | 코드 근거 | SALU 처리/후속 기준 |
|---|---|---|
| 가입 role 조작 | `UserController.java:47-56` UserVO 직접 바인딩 → `UserService.java:43-51` → `UserMapper.xml:31-35` userType 저장. Validator는 role 제한 없음 | 가입 API 이식 제외. 현재 서버 principal에 ROLE_MEMBER만 부여. 요청 role/memberId로 권한 변경 불가. 다음 가입 DTO에 role 필드 금지 |
| 평문 비밀번호 로그 | `UserController.java:51`, `logback.xml:8-10` DEBUG | 로그 코드 복사 제외. SALU 인증 DTO·로그·오류에 원문/해시 제외 |
| 로그인·기존 화면 CSRF 누락 | `SecurityConfig.java:153-162` `/api/capstone/`만 CSRF 보호 | SALU 전체 unsafe 요청에 CSRF. 로그인·로그아웃도 적용, masked token/BREACH 기본 보호 유지 |
| 탈퇴 계정 인증 허용 | `UserMapper.xml:38-47` deleted_at 조건 없음, `CustomUserDetails.java:80-90` enabled=true | SALU ACTIVE만 로그인. 세션 요청 시 현재 DB 상태 재확인, SUSPENDED/WITHDRAWN/삭제 계정 세션 무효화 |
| 가입 계정 열거 | 공개 `UserController.java:65-69` 이메일 중복 여부 반환 | 공개 중복 조회 이식 제외. 로그인 실패는 존재하지 않음·비밀번호 오류·비활성 계정 모두 동일401/LOGIN_FAILED |
| 로그인 대입 방어 부재 | SecurityConfig/CustomUserDetails에 실패 제한 없음 | SALU 서버 IP당 60초/30회 제한, 429/Retry-After. map 1024개 제한, 시간 경과 제거. 요청의 X-Forwarded-For 신뢰 금지 |
| 임의 파일 삭제 경로 | `CommunityController.java:167-174` imageUrl 바인딩 → `PostServiceImpl.java:114-118` 요청 imageUrl 삭제 → `FileService.java:167-175` 경로 경계 검증 없음 | 이식 제외. 사진/게시글 구현 시 DB 소유 파일 ID에서 경로 도출, basename·정규화 경계 확인, 사용자 경로로 삭제 금지 |
| 지도 저장형 XSS 경로 | `CommonController.java:101-102,517-526` salon JSON → `views/common/salonmap.jsp:194` inline script. 점주 입력 `SalonService.java:132-149`에서 script 컨텍스트 인코딩 없음 | JSP/inline JSON 이식 제외. React text 출력 사용, 필요 데이터는 JSON API. HTML 삽입은 별도 정화 기준 확정 |
| 점주 채팅 목록 소유권 누락 | `OwnerController.java:91-95` 임의 selectedSalonId 저장 → `:502-505` 목록조회, `ChatService.java:96-100` 매장 owner 검사 없음 | 기존 매장 채팅 이식 제외. 상담 구현 시 목록·상세·메시지·STOMP 각각 참여자 검사 |
| 점주 JSP 인코딩 누락 | `views/owner/store.jsp:45,49`, `views/owner/staff.jsp:43,46,83` 사용자 문자열 raw 출력 | JSP 이식 제외. React 보간 기본 escaping 유지 |
| 공개 업로드 및 불충분 파일 검증 | `FileService.java:143-165` 확장자/client MIME, `dispatcher-servlet.xml:57-60` `/upload/**` 공개 | 원본 기록 비공개. signature/크기/소유권 검증, 공개 사본 별도, 영구 외부 경로 |
| DB 밖 작업의 원자성 착각 | UserService 프로필 파일 선삭제, CapstoneCardService insert 실패 cleanup만 처리, ChatService commit 전 STOMP 전송 | 로그인은 파일·외부 전송 없음. 해당 기능 전 after-commit·cleanup·재처리 기준과 실패 테스트 확정 |

## 추가 후보와 검토 결과

- OAuth: `CustomOAuth2UserService.java:37-64`에서 이메일 일치만으로 기존 계정 provider 자동 연동. provider의 이메일 소유/verified 보증과 명시적 계정 연결 검증이 없어 고위험 후보. 실제 탈취를 단정하지 않음. SALU OAuth 이식 제외
- `/owner/select-salon`은 GET 세션 변경 및 Referer 기반 redirect. 외부 redirect 가능 후보. SALU에 해당 경로 없음
- WebSocketConfig 허용 Origin `*`. CONNECT 인증/일부 메시지 참여자 검사는 존재하지만 SALU STOMP 이전에 Origin 및 SUBSCRIBE/SEND 참여자 범위를 다시 설계
- 공개 `/api/services`는 주석상 서버 간 내부 API지만 인증 없음. 노출되는 카탈로그 범위의 제품 결정 필요, SALU 이식 제외
- 24 XML에서 `${}` SQL 보간 미발견. 게시글 정렬은 고정 `<choose>` 분기. 이번 확인에서 리뷰 수정·작성, 프로필, 쿠폰의 다른 계정 IDOR 미발견. 별도 기능 이식 때 실제 두 계정 검증 필요
- 현재 Git 추적 properties는 app.properties 및 DB/OAuth/결제 example. 실제 DB/OAuth/결제 자격증명이 현재 추적된다는 증거 없음. CLAUDE의 ‘DB credential intentionally committed’ 문구는 현재와 불일치. 과거 이력 노출 여부는 별도 범위. 비밀 파일은 SALU 복사 제외

## 문서와 의존성

Salon CLAUDE는 기타 permitAll·CSRF 전역 disabled·오류 페이지 없음이라고 설명하지만 현재는 기본 인증 필요, capstone만 CSRF, web.xml의403/404/500/Throwable 오류 페이지가 존재. MVC ControllerAdvice와 일관된 API 오류 체계는 별개이며 부족. SALU는 Security filter와 MVC 모두 ApiError 사용.

Salon 선언 Spring5.3.39/Security5.8.13은 오래된 계열. 선언 버전만으로 모든 CVE 악용 가능성을 주장하지 않음. [Spring 지원 일정](https://spring.io/blog/2024/03/01/support-timeline-announcement-for-spring-framework-6-0-x-and-5-3-x/), [DataBinder 취약점 조건](https://spring.io/security/cve-2024-38820/), [WebFlux 인가 취약점 조건](https://spring.io/security/cve-2024-38821/) 확인. Salon은 Servlet MVC이며 WebFlux 조건 적용 근거 없음.

SALU 실제 jar Spring Security7.1.1 확인. 계정 비활성 상태를 이용한 타이밍 열거 관련 [공식 advisory CVE-2026-22746](https://spring.io/security/cve-2026-22746/)의5.8.13/7.0.0~7.0.4 범위와 구분. [Spring 세션 관리](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html), [CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html), [DaoAuthenticationProvider](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/dao-authentication-provider.html) 기준 적용.

## 현재 완료 범위

SALU 로컬 이메일/비밀번호 로그인·현재 회원 조회·POST 로그아웃·React 화면·개발 계정 도구. BCrypt/principal ID 식별이라는 구조만 참고하고 Salon 역할·가입·쿠폰·OAuth·JSP·DB/SQL 전체를 복사하지 않음. 회원가입·비밀번호 변경/재설정·이메일 검증·디자이너/관리자 권한은 다음 단계.

개발용 인메모리 IP 제한은 단일 서버 기준. 프록시 뒤에서는 같은 IP로 묶일 수 있고 다중 인스턴스·분산 대입·재시작에도 유지되는 방어가 아님. 배포 시 신뢰 proxy/edge rate limit·공유 저장소 전략을 추가 검증. 현재 DB 세션 상태 확인은 다음 보호 요청 시 수행하며 장기 작업 중 이미 진행한 처리를 되돌리지 않음.

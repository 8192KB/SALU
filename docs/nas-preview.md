# NAS 운영과 조원 시연

2026-10-12 기준. 접속 주소 **https://salu.doyul.dev**, 앱 태그 `20261012-fdda7e5`, 소스 `fdda7e5`. 최신 앱·발표·배포 문서는 GitHub `main`에 통합. 이후 문서 정리에는 앱 재배포 불필요. [이전 준비·배포 기록](archive/deployment/2026-10-12-nas-history.md) 보존.

## 실행 구성

```text
https://salu.doyul.dev
  → 기존 Nginx Proxy Manager
      → salu-web:80 / React·SPA
          → /api → backend:8081 / Spring
              → db:3306 / SALU 전용 MySQL
```

- NAS: SSH `local`, hostname `cwsn`, 설치 경로 `/home/chuwe/salu-preview`
- [compose.nas.yml](../compose.nas.yml): `salu-preview` 프로젝트, web/backend/db 별도 컨테이너
- 이미지: `salu-web:20261012-fdda7e5`, `salu-backend:20261012-fdda7e5`, `mysql:8.4.11`
- web만 기존 `nginx-proxy-manager_default` network 연결. backend/DB host port 미공개, 외부 제공자 통신은 전용 outbound network
- SALU 전용 DB/사진 volume. 기존 Nextcloud·다른 DB·proxy 설정과 분리
- NPM 대상 `salu-web:80`, HTTPS 강제. `SALU_PUBLIC_ORIGIN=https://salu.doyul.dev`, `SALU_COOKIE_SECURE=true`

React와 Spring은 각각 이미지로 빌드. MySQL은 공식 이미지와 영구 volume 사용. DB 데이터나 비밀 설정을 앱 이미지에 합치지 않음.

## 설정과 자료 보관

`.env.nas`는 [예시](../.env.nas.example)를 참고하되 실제 파일은 NAS에 별도 보관, 권한 600·Git 제외. 키 파일은 [저장 계약](personal-storage.md)의 형식·복구 절차 적용. backend UID/GID 1000:1000이 읽을 수 있도록 키 파일 소유자/권한과 상위 디렉터리 접근 확인. 기존 키를 업데이트 때 새로 생성하지 않음.

Google·네이버 비밀 설정 연결 및 버튼 활성화 완료. 실제 제공자 동의·콜백과 새 이메일 가입 검증은 보류. 키 연결과 버튼 표시를 실제 로그인 성공으로 기록하지 않음.

DB 복사본과 암호화 키를 함께 확보해야 계정 자료 복원 가능. 비밀번호·키·환경 파일·DB dump는 Git이나 조원 공유 파일에 포함하지 않음. `docker compose config` 전체 출력 대신 `config --quiet` 사용.

## 다음 수정본 배포

1. 최신 main에서 기능 브랜치 작업 → 변경 범위 검증 → commit/push → 검토 후 main 통합. 배포 소스 SHA 확정.
2. web/backend 중 변경한 이미지 재빌드, `SALU_IMAGE_TAG`를 확정 SHA 기반 새 태그로 지정. MySQL 이미지 재전송은 DB 버전 변경 시에만 필요.
3. 이미지 내보내기·압축 → SSH/SCP 전달 → 양쪽 체크섬 확인 → NAS에서 image load.
4. 기존 SALU DB dump·Compose·환경·암호화 키를 권한 제한 release 폴더에 보관. 기존 DB container/volume과 키 유지.
5. NAS `.env.nas` 태그 변경, 구성 검사 후 변경한 앱만 재생성.
6. HTTPS health·변경 화면·저장/재접속·DB 보존 확인, [점검표](issue-tracker.md)와 이 문서의 현재 버전 갱신.

두 앱을 모두 변경한 경우 NAS 실행:

```bash
cd /home/chuwe/salu-preview
docker compose --env-file .env.nas -f compose.nas.yml config --quiet
docker compose --env-file .env.nas -f compose.nas.yml up -d --no-deps --no-build --pull never --wait backend web
docker compose --env-file .env.nas -f compose.nas.yml ps
```

web만 변경했다면 마지막 up 대상도 web만 지정. backend 변경 시 새 migration 적용 여부 확인. SQL 변경은 새 Flyway migration 추가, 적용된 파일 수정 금지. 업데이트에 DB 초기화나 `down -v` 사용 금지.

## 복구

현재 release 복구본: `/home/chuwe/salu-preview/releases/20261012-fdda7e5`(700). 기존 DB dump, `env.before`, `compose.before.yml`, `backup-keys.before.json` 보관. 비밀 파일 권한 600. 이전 `20261011-flow` 이미지 보존.

앱 복구는 이전 환경·Compose·이미지를 사용하되 현재 DB schema와 backend Flyway 호환성부터 확인. V4 적용 DB에 이전 backend 호환성은 미검증이므로 태그 교체만으로 복구 완료라고 판단하지 않음. DB 복원은 배포 이후 사용자 변경 여부 확인 후 진행. 적용 migration 삭제/수정으로 되돌리지 않음.

## 현재 확인 결과와 남은 범위

| 확인 | 결과 |
|---|---|
| 웹·Spring·MySQL | healthy, health 200·server/database UP |
| DB·키 보존 | 기존 DB container/volume/키 유지, V1~V4 성공, 회원/백업/사진 개수 변경 없음 |
| 공개 디렉터리 | salons/designers 200. 공개 등록 전 빈 목록 정상 |
| 공개 HTTPS 브라우저 | 폰·태블릿 두 방향·PC 4환경에서 사진 포함 기록/경과, 달력, 저장 완료, 준비·재접속 확인 |
| 계정/복원 | 별도 salu_test 검증. 이번 NAS 브라우저 검증은 비로그인, 사용자 DB 테스트 쓰기 없음 |
| 보류·후속 | 새 가입/소셜 실제 동의, 실물 폰/Safari/IME, 상담·후기·커뮤니티·앱 |

Playwright 증거 `/tmp/salu-release-20261012-fdda7e5/qa/result.json`과 화면 캡처. `/tmp`는 영구 보존 경로가 아님. 전체 검증·실패 수정 범위는 [점검표](issue-tracker.md)와 FR04 참조. 이미지 전송 체크섬과 상세 실행 이력은 [배포 기록](archive/deployment/2026-10-12-nas-history.md#2026-10-12-배포-완료) 참조.

## 조원 공유

[조원 전달 문구](team-preview-message.md)를 복사해 접속 주소와 [GitHub 저장소](https://github.com/8192KB/SALU) 공유. 저장소는 비공개이므로 코드 열람에는 조원 초대 수락 필요. 직접 메시지 전송·초대는 수행하지 않음.

피드백은 시작 행동, 커트와 경과의 구분, 막힌 화면·버튼 중심으로 수집. 배포 버전·기기·재현 순서를 함께 적고 점검표에 반영. 발표 초안은 [7주차 자료](presentations/week07/README.md), 확정본은 피드백·화면 수정 뒤 갱신.

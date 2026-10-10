# SALU 7주차 발표 예시안

상태: 검증 전 발표 예시 · 2026-10-10 작성. 현재 구현과 후속 설계를 구분하며, 새 기기 저장 기능의 완료 발표본이 아님.

- [편집용 PPTX](SALU_7주차_발표_예시안.pptx)
- [확인용 PDF](SALU_7주차_발표_예시안.pdf)
- [PPT 대조·7주차 범위 검토](../../plans/2026-10-10-local-records-and-week7-review.md)
- [현재 구현과 검증 근거](../../features/FR01-current-state-review.md)

## 6장 구성

| 장 | 내용 | 표시한 상태 |
|---|---|---|
| 1 | 기록은 혼자 시작하고 필요할 때 상담으로 | 방향 검토 |
| 2 | 기록·경과·선택 자료·상담 준비의 실제 React 캡처 | 메모리 예시, 인증만 실제 Spring 연결 |
| 3 | 기록 작성 또는 커뮤니티 둘러보기의 첫 화면 | 도형으로 만든 설계 예시, 미구현 |
| 4 | 기기 보관·파일 복원·비공개 서버 백업·상담·공개 | 선택과 접근 범위의 설계 |
| 5 | 텍스트 저장·재접속·기존 상담 준비 연결 | 다음 구현·검증 목표, 아직 통과 결과 없음 |
| 6 | 8주차 시험·발표 없음, 이후 실제 상담 연결 | 사용자 확인 일정과 후속 후보 |

각 장에 발표자 노트 포함. 8주차 취소의 근거는 사용자 확인이며 정확한 발표일·시험일은 넣지 않음. 현재 캡처는 `docs/screenshots/record-mobile.png`, `preview-mobile.png`의 일부이며 가상 자료 사용.

## 실제 발표 전에 바꿀 부분

저장 구현과 흐름 검증 뒤 2장의 현재 상태, 5장의 목표/결과, 6장의 이후 범위를 실제 증거에 맞게 수정. 새로고침·브라우저 재시작·로그인/로그아웃 후 실제 기록 보존을 확인하기 전에는 저장 완료라고 설명하지 않음.

백업/복원은 별도 빈 보관함에서 가져오기까지 확인한 경우만 완료 표시. 사진을 포함하면 사진 본체 보존·재열람과 백업 제공 시 사진 복원을 확인. 미리보기는 실제 전송·디자이너 답변과 구분. 기존 인증 테스트 통과를 기록 DB 소유권이나 상담 참여자 검증으로 확대하지 않음.

## 다시 생성

Node와 PptxGenJS 4.0.1 사용. 앱의 npm 의존성과 분리해 임시 폴더에 설치:

```bash
npm install --prefix /tmp/salu-pptx-tools --no-audit --no-fund pptxgenjs@4.0.1
NODE_PATH=/tmp/salu-pptx-tools/node_modules node docs/presentations/week07/build-week7.cjs
```

저장소 루트에서 실행. [build-week7.cjs](build-week7.cjs)의 문구·도형을 수정하면 편집 가능한 PPTX 재생성. 폰트는 Noto Sans CJK KR이며 다른 환경은 해당 폰트 설치 또는 PowerPoint에서 대체 폰트 확인 필요.

확인용 PDF 생성 예:

```bash
libreoffice -env:UserInstallation=file:///tmp/salu-pptx-profile --headless \
  --convert-to pdf --outdir docs/presentations/week07 \
  docs/presentations/week07/SALU_7주차_발표_예시안.pptx
```

## 파일 확인

PPTX ZIP/XML, 슬라이드 6장·발표자 노트 6개 확인. LibreOffice에서 열어 PDF 6장으로 변환 후 전체 렌더링의 한글·배치·잘림 확인. 이는 발표 파일 형식 확인이며 새 저장·복원 기능의 제품 검증 결과가 아님.

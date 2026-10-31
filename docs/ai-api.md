# AI 도우미 API 계약

2026-10-28 기준 계약입니다. 서버는 `backend`의 `ai` 패키지, 화면은 `frontend/src/ai-assist.tsx`가 이 문서를 따릅니다. DB는 쓰지 않습니다. 경로·필드·오류를 바꿀 때는 코드보다 이 문서를 먼저 고칩니다.

## 한눈에 보기

| 하는 일 | 요청 | 쓸 수 있는 사람 |
|---|---|---|
| AI 도우미를 쓸 수 있는지 | `GET /api/ai/status` | 로그인한 회원 |
| 상담 요청 글 다듬기 | `POST /api/ai/request-draft` | 로그인한 회원 |
| 고민에 맞는 디자이너 찾기 | `POST /api/ai/designer-match` | 로그인한 회원 |

## 공통 규칙

- 모델은 서버가 OpenAI 호환 `POST {SALU_AI_BASE_URL}/v1/chat/completions`로 부릅니다. Ollama와 OpenAI가 같은 형식이라 환경 값 `SALU_AI_BASE_URL`·`SALU_AI_MODEL`·`SALU_AI_API_KEY`·`SALU_AI_REASONING_EFFORT`(기본 `none`, OpenAI gpt-5 계열은 `minimal`, 비우면 보내지 않음)만 바꿉니다. 추론을 끄지 않으면 로컬 모델이 수십 초 걸립니다. 주소가 비어 있으면 AI 도우미가 꺼진 상태입니다.
- 모델 호출은 DB transaction 밖에서 합니다. 결과는 제안일 뿐 서버에 저장하지 않고, 사용자가 `적용`을 눌러야 입력 칸에 들어갑니다.
- 서버는 사용자가 이번 요청에 직접 적은 글만 모델에 보냅니다. 개인 기록·사진·상담 내용은 보내지 않습니다. 디자이너 찾기에는 공개 디자이너 프로필(이름·전문 분야·소개)을 함께 보냅니다.
- 회원당 1분에 10번까지입니다(서버 한 대의 메모리). 예시 체험과 로그인 전에는 화면에 나오지 않습니다.
- `POST`에는 CSRF 헤더가 필요합니다. 응답에는 `Cache-Control: no-store`가 붙습니다.

## 쓸 수 있는지

`GET /api/ai/status` → `{ "enabled": true }`. `false`면 화면은 AI 버튼을 숨깁니다.

## 상담 요청 글 다듬기

```json
POST /api/ai/request-draft
{ "text": "옆머리 뜨는거 어케 해요" }
```

`text`는 공백이 아닌 1~2,000자. 응답은 `{ "text": "옆머리가 자꾸 떠요. 손질하는 방법이 궁금해요." }`. 모델은 적힌 사실만 해요체로 짧게 고치고 새 사실·질문을 지어내지 않게 지시합니다. 커트 준비에서 채운 여러 줄 글은 줄 수·순서와 줄 앞 `옆머리(물어보기):` 같은 표시를 그대로 두고 내용만 고칩니다. 결과는 2,000자에서 자릅니다.

## 고민에 맞는 디자이너 찾기

```json
POST /api/ai/designer-match
{ "concern": "곱슬이라 단발이 자꾸 부해져요" }
```

`concern`은 공백이 아닌 1~1,000자. 공개 디자이너 프로필 최대 50명 중에서 최대 3명을 고릅니다. 모델에는 ID 대신 목록 번호를 주고 서버가 번호를 ID로 되돌립니다.

```json
{ "items": [ { "designerId": "…", "name": "민준", "reason": "다운펌과 곱슬 손질을 주로 해요." } ] }
```

모델이 목록에 없는 번호를 내거나 같은 디자이너를 두 번 내면 서버가 버립니다. 맞는 디자이너가 없으면 `items`는 빈 배열입니다.

## 오류

| 상태 | code | 언제 |
|---|---|---|
| 400 | INVALID_REQUEST | 글이 비었거나 너무 긺 |
| 401 | AUTHENTICATION_REQUIRED | 로그인 전 |
| 429 | AI_RATE_LIMITED | 1분에 10번을 넘음 |
| 503 | AI_UNAVAILABLE | AI 도우미가 꺼져 있거나 모델이 응답하지 않음(시간 초과 60초)·형식이 틀림 |

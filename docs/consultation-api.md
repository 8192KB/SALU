# 상담 API 계약

2026-10-16 기준 구현된 계약입니다. 서버는 `backend`의 `consultation` 패키지와 Flyway `V5__consultations.sql`·`V8__consultation_messages.sql`, 화면은 `frontend/src/consultation-api.ts`가 이 문서를 따릅니다. 디자이너의 첫 답변은 지금도 6장 답변 API로 보내고, 그 뒤의 메시지와 읽음은 7~9장을 씁니다.

고객이 지난 커트 기록 하나를 골라 디자이너에게 상담을 요청하고, 같은 상담 안에서 고객과 디자이너가 메시지를 주고받는 기능의 서버 API입니다. 디자이너의 첫 메시지가 답변입니다. 화면과 서버를 나눠 만들 때 이 문서를 기준으로 맞춥니다. 경로·필드·오류를 바꿔야 하면 코드보다 이 문서를 먼저 고치고 함께 작업하는 사람에게 알립니다.

## 한눈에 보기

| 하는 일 | 요청 | 쓸 수 있는 사람 |
|---|---|---|
| 상담 요청 보내기 | `POST /api/consultations` | 로그인한 회원 |
| 보낸 상담 목록 | `GET /api/my/sent-consultations` | 로그인한 회원 |
| 받은 상담 목록 | `GET /api/my/received-consultations` | 디자이너 프로필이 있는 회원 |
| 상담 상세 | `GET /api/consultations/{id}` | 보낸 회원, 받은 디자이너 |
| 첨부 사진 | `GET /api/consultations/{id}/photo` | 보낸 회원, 받은 디자이너 |
| 답변 보내기(첫 메시지) | `POST /api/consultations/{id}/reply` | 받은 디자이너 |
| 메시지 목록 | `GET /api/consultations/{id}/messages` | 보낸 회원, 받은 디자이너 |
| 메시지 보내기 | `POST /api/consultations/{id}/messages` | 보낸 회원, 받은 디자이너 |
| 읽음 표시 | `POST /api/consultations/{id}/read` | 보낸 회원, 받은 디자이너 |

상담 후기는 [디자이너 API](designer-api.md), 새 상담·새 메시지 알림과 실시간 신호는 [알림 API](notification-api.md)에 있습니다.

흐름은 다음 순서입니다.

1. 고객이 디자이너 프로필에서 커트 기록을 고르고 이번 요청을 적어 보냅니다. `POST /api/consultations`
2. 디자이너가 받은 상담 목록에서 상담을 열어 봅니다. `GET /api/my/received-consultations`, `GET /api/consultations/{id}`
3. 디자이너가 첫 메시지(답변)를 보냅니다. 이때 상태가 `ANSWERED`로 바뀝니다. `POST /api/consultations/{id}/messages`
4. 고객과 디자이너가 같은 상담 안에서 메시지를 더 주고받습니다. 고객은 답변 전에도 메시지를 덧붙일 수 있습니다.
5. 상대가 보낸 메시지를 화면에 보여 준 뒤 읽음 위치를 올립니다. `POST /api/consultations/{id}/read`

## 공통 규칙

- 모든 API는 로그인이 필요합니다. 로그인하지 않았으면 `401 AUTHENTICATION_REQUIRED`입니다.
- `POST` 요청에는 헤더 두 개를 넣습니다. 둘 중 하나라도 없으면 각각 `403 CSRF_INVALID`, `400 INVALID_REQUEST`입니다.
  - CSRF: `GET /api/csrf` 응답의 `headerName`을 헤더 이름으로, `token`을 값으로 넣습니다.
  - `X-SALU-Storage-Context`: `GET /api/auth/me` 응답의 `storageContext`를 넣습니다. 다른 탭에서 로그인 계정이 바뀐 뒤 이전 계정의 기록이 새 계정 이름으로 보내지는 일을 막습니다.
- 회원 ID와 역할(고객·디자이너)은 요청에 넣지 않습니다. 서버가 로그인한 회원 정보로 판단합니다.
- 상담을 보낸 회원이나 받은 디자이너가 아니면 상세·사진은 `404`입니다. 상담이 있는지 없는지도 알려 주지 않기 위해서입니다.
- 시각은 UTC 기준 ISO 8601 문자열(`2026-10-14T03:12:45.123Z`)입니다. 화면에서 서울 시간으로 바꿔 보여 줍니다. 커트 날짜는 `YYYY-MM-DD`입니다.
- 오류 응답은 기존 API와 같은 `{ "code": "...", "message": "..." }`입니다. 화면 문구는 `message`가 아니라 `code`를 보고 정합니다.
- 응답에는 모두 `Cache-Control: no-store`가 붙습니다.
- 새 상담·새 메시지가 생기면 서버가 두 참여자에게 실시간 신호(`CONSULTATION`, 상담 ID)를 보냅니다. 신호에는 내용이 없으므로 화면은 신호를 받으면 상세·메시지를 다시 조회합니다. 연결 방법은 [알림 API](notification-api.md)에 있습니다. 연결이 끊긴 사이의 신호는 다시 오지 않으므로 다시 연결하거나 화면에 들어올 때도 조회합니다.

## 상담 한 건의 모양

보내기·목록·상세·답변 응답이 모두 이 모양을 씁니다. 목록은 이 객체의 배열입니다.

```json
{
  "id": "5b1e7c2a-3f4d-4e8a-9c61-0d2f7a8b9e10",
  "status": "ANSWERED",
  "designer": {
    "id": "2c9a4e6b-8d1f-4a3c-b7e5-6f0d1c2b3a49",
    "name": "지우",
    "salonName": "그린 헤어"
  },
  "customer": { "displayName": "하늘" },
  "attachment": {
    "cutDate": "2026-09-01",
    "service": "커트",
    "summary": "옆머리가 떠요",
    "photoUrl": "/api/consultations/5b1e7c2a-3f4d-4e8a-9c61-0d2f7a8b9e10/photo"
  },
  "request": "옆머리가 뜨는데 손질 방법이 궁금해요",
  "sentAt": "2026-10-14T03:12:45.123Z",
  "reply": {
    "content": "드라이할 때 옆머리를 아래로 눌러 말리면 덜 떠요. 다음 커트 때 옆머리 아래쪽 숱을 조금 정리해 볼게요.",
    "repliedAt": "2026-10-14T05:40:02.511Z"
  },
  "canReply": false,
  "lastMessageAt": "2026-10-14T05:40:02.511Z",
  "unreadCount": 0,
  "reviewId": null,
  "canReview": true
}
```

답변 전이면 `status`가 `REQUESTED`, `reply`가 `null`입니다. 받은 디자이너가 답변 전 상담을 볼 때만 `canReply`가 `true`입니다. `reply`는 디자이너의 첫 메시지이며, 그 뒤의 메시지는 메시지 목록으로 봅니다.

| 필드 | 뜻 |
|---|---|
| `id` | 상담 ID. 서버가 만듦 |
| `status` | `REQUESTED` 답변 전, `ANSWERED` 답변 있음 |
| `designer` | 보낼 때의 디자이너 이름·소속 매장. 소속이 없으면 `salonName`은 `null` |
| `customer.displayName` | 보낸 회원의 표시 이름. 이메일은 넣지 않음 |
| `attachment` | 보낼 때의 커트 기록 복사본. 원본 기록을 고쳐도 바뀌지 않음 |
| `attachment.summary` | 카드에 보이는 한 줄 설명. 좋았던 점, 없으면 가장 최근 불편한 점, 둘 다 없으면 `커트한 날의 기록` |
| `attachment.photoUrl` | 첨부 사진 주소. `<img src>`에 그대로 사용. 사진이 없으면 `null` |
| `request` | 고객이 적은 이번 요청 |
| `sentAt` | 보낸 시각 |
| `reply` | 디자이너의 첫 메시지와 그 시각. 답변 전이면 `null` |
| `canReply` | 지금 로그인한 회원이 첫 답변을 보낼 디자이너인지 |
| `lastMessageAt` | 마지막 메시지 시각. 메시지가 없으면 보낸 시각. 목록 정렬·표시에 사용 |
| `unreadCount` | 상대가 보낸 메시지 중 내가 아직 읽음 표시하지 않은 수 |
| `reviewId` | 이 상담의 후기 ID. 없으면 `null` |
| `canReview` | 지금 로그인한 회원이 후기를 쓸 수 있는지. 보낸 회원이고 답변을 받았고 후기가 없을 때만 `true` |

화면에는 상태를 이렇게 표시합니다. 고객 화면 문구는 지금 예시 상담 화면과 같습니다.

| `status` | 고객 화면 | 디자이너 화면 |
|---|---|---|
| `REQUESTED` | 답변 대기 | 답변 전 |
| `ANSWERED` | 답변 도착 | 답변 완료 |

TypeScript로 쓰면 다음과 같습니다.

```ts
export type ConsultationStatus = 'REQUESTED' | 'ANSWERED';

export type Consultation = {
  id: string;
  status: ConsultationStatus;
  designer: { id: string; name: string; salonName: string | null };
  customer: { displayName: string };
  attachment: {
    cutDate: string;
    service: string;
    summary: string;
    photoUrl: string | null;
  };
  request: string;
  sentAt: string;
  reply: { content: string; repliedAt: string } | null;
  canReply: boolean;
  lastMessageAt: string;
  unreadCount: number;
  reviewId: string | null;
  canReview: boolean;
};

export type ConsultationMessage = {
  id: number;
  sender: 'CUSTOMER' | 'DESIGNER';
  content: string;
  sentAt: string;
  mine: boolean;
};
```

## 1. 상담 요청 보내기

`POST /api/consultations`

글과 사진을 한 번에 보내려고 `multipart/form-data`를 씁니다. 서버는 둘을 한 트랜잭션으로 저장하므로 글이나 사진 한쪽만 남지 않습니다.

| 부분 이름 | 형식 | 필수 | 내용 |
|---|---|---|---|
| `consultation` | `application/json` | 필수 | 아래 JSON |
| `photo` | `image/jpeg`, `image/png`, `image/webp` | 선택 | 첨부할 커트 사진 1장, 5 MiB 이하 |

```json
{
  "requestKey": "a3f0c9d2-7b6e-4c1a-8e5f-2d4b6a8c0e17",
  "designerId": "2c9a4e6b-8d1f-4a3c-b7e5-6f0d1c2b3a49",
  "request": "옆머리가 뜨는데 손질 방법이 궁금해요",
  "attachment": {
    "cutDate": "2026-09-01",
    "service": "커트",
    "summary": "옆머리가 떠요"
  }
}
```

| 필드 | 규칙 |
|---|---|
| `requestKey` | UUID. 화면의 상담 초안 ID를 그대로 사용 |
| `designerId` | 공개 디자이너 프로필 ID. `GET /api/designers` 응답의 `id` |
| `request` | 앞뒤 공백을 뺀 1~2,000자 |
| `attachment.cutDate` | `YYYY-MM-DD`, 서울 기준 오늘 이하 |
| `attachment.service` | 1~60자 |
| `attachment.summary` | 1~2,000자 |

브라우저에서는 이렇게 보냅니다.

```ts
const form = new FormData();
// JSON 부분은 application/json Blob으로 넣어야 서버가 JSON으로 읽음
form.append('consultation', new Blob([JSON.stringify(body)], { type: 'application/json' }));
if (photo) form.append('photo', photo);

const response = await fetch('/api/consultations', {
  method: 'POST',
  credentials: 'same-origin',
  // Content-Type은 브라우저가 boundary를 붙여 정하므로 직접 넣지 않음
  headers: { [csrf.headerName]: csrf.token, 'X-SALU-Storage-Context': member.storageContext },
  body: form,
});
```

| 응답 | 언제 |
|---|---|
| `201` + 상담 한 건 | 새로 저장함 |
| `200` + 상담 한 건 | 같은 `requestKey`로 같은 내용을 다시 보냄. 처음 저장한 상담을 그대로 돌려줌 |
| `400 INVALID_REQUEST` | 필수 값 누락, 길이 초과, 날짜 오류, 내 디자이너 프로필에 보냄 |
| `404 RESOURCE_NOT_FOUND` | 디자이너 프로필이 없거나 비공개이거나 정지된 계정 |
| `409 RESOURCE_CONFLICT` | 같은 `requestKey`로 다른 내용을 보냄 |
| `409 STORAGE_CONTEXT_CHANGED` | 다른 탭에서 로그인 계정이 바뀜 |
| `413 UPLOAD_TOO_LARGE` | 사진이 5 MiB를 넘음 |
| `415 UNSUPPORTED_MEDIA_TYPE` | JPEG·PNG·WebP가 아니거나 열 수 없는 사진 |

버튼을 두 번 누르거나 응답을 받지 못해 다시 보내도 같은 `requestKey`면 상담은 한 건만 생깁니다. 화면은 `200`과 `201`을 같은 성공으로 처리합니다. 보낸 뒤 새 상담을 쓰려면 새 `requestKey`를 만듭니다.

## 2. 보낸 상담 목록

`GET /api/my/sent-consultations`

로그인한 회원이 보낸 상담을 최신순으로 최대 100건 돌려줍니다. 보낸 상담이 없으면 `[]`입니다.

## 3. 받은 상담 목록

`GET /api/my/received-consultations`

로그인한 회원의 디자이너 프로필로 들어온 상담을 최신순으로 최대 100건 돌려줍니다. 디자이너 프로필이 없으면 `[]`입니다. 프로필이 있는지는 기존 `GET /api/my/designer-profile`로 확인합니다. 프로필이 없으면 `204`입니다.

프로필을 비공개로 바꿔도 이미 받은 상담은 계속 보이고 답변할 수 있습니다. 새 요청만 받지 않습니다.

## 4. 상담 상세

`GET /api/consultations/{id}`

보낸 회원과 받은 디자이너만 볼 수 있습니다. 그 밖의 회원이 열거나 없는 ID면 `404 RESOURCE_NOT_FOUND`입니다.

## 5. 첨부 사진

`GET /api/consultations/{id}/photo`

사진 파일을 그대로 돌려줍니다. `Content-Type`은 `image/jpeg`·`image/png`·`image/webp` 중 하나이고 `X-Content-Type-Options: nosniff`가 붙습니다. 볼 수 있는 사람은 상세와 같고, 사진이 없는 상담도 `404`입니다.

`<img src>`로 불러올 때는 헤더를 넣을 수 없으므로 이 요청에는 `X-SALU-Storage-Context`를 요구하지 않습니다. 로그인 cookie로만 확인합니다.

## 6. 답변 보내기

`POST /api/consultations/{id}/reply`

헤더는 CSRF와 `X-SALU-Storage-Context`, 본문은 `application/json`입니다.

```json
{ "content": "드라이할 때 옆머리를 아래로 눌러 말리면 덜 떠요." }
```

`content`는 앞뒤 공백을 뺀 1~2,000자입니다. 디자이너의 첫 메시지를 보내는 API이며, 이미 답변한 상담에는 `409`입니다. 지금 화면과 맞추려고 남겼습니다. 대화 화면은 아래 메시지 보내기를 쓰면 되고, 디자이너의 첫 메시지도 같은 방식으로 답변이 됩니다.

| 응답 | 언제 |
|---|---|
| `200` + 상담 한 건 | 답변을 저장함. `status`는 `ANSWERED`, `canReply`는 `false`로 바뀜 |
| `400 INVALID_REQUEST` | 내용이 비었거나 2,000자를 넘음 |
| `403 ACCESS_DENIED` | 보낸 회원이 자기 상담에 답변하려 함 |
| `404 RESOURCE_NOT_FOUND` | 참여자가 아니거나 없는 상담 |
| `409 RESOURCE_CONFLICT` | 이미 답변한 상담 |

`409`를 받으면 상세를 다시 불러와 저장된 답변을 보여 줍니다. 응답을 받지 못해 다시 보낸 경우에도 같은 방법으로 확인합니다.

## 7. 메시지 목록

`GET /api/consultations/{id}/messages`

오래된 순서로 돌려줍니다. `after` 없이 부르면 마지막 200개, `?after={메시지 ID}`를 붙이면 그 뒤의 메시지를 최대 200개 돌려줍니다. 실시간 신호를 받았을 때는 화면에 있는 마지막 메시지 ID를 `after`로 넣어 새 메시지만 받습니다. 볼 수 있는 사람은 상세와 같고, 그 밖에는 `404`입니다.

```json
[
  { "id": 41, "sender": "CUSTOMER", "content": "사진 한 장 더 보낼게요", "sentAt": "2026-10-14T03:20:11.002Z", "mine": true },
  { "id": 42, "sender": "DESIGNER", "content": "옆머리를 눌러 말려 보세요", "sentAt": "2026-10-14T05:40:02.511Z", "mine": false }
]
```

| 필드 | 뜻 |
|---|---|
| `id` | 메시지 번호. 상담 안에서 늘어나는 순서 |
| `sender` | `CUSTOMER` 보낸 회원, `DESIGNER` 받은 디자이너 |
| `mine` | 지금 로그인한 회원이 보낸 메시지인지 |

## 8. 메시지 보내기

`POST /api/consultations/{id}/messages`

헤더는 CSRF와 `X-SALU-Storage-Context`, 본문은 `application/json`입니다.

```json
{ "clientKey": "7d1c2a3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "content": "다음 주에 방문할게요" }
```

| 필드 | 규칙 |
|---|---|
| `clientKey` | UUID. 화면이 메시지마다 새로 만듦. 응답을 못 받아 다시 보낼 때는 같은 값 |
| `content` | 앞뒤 공백을 뺀 1~2,000자 |

| 응답 | 언제 |
|---|---|
| `201` + 메시지 한 건 | 새로 저장함. 디자이너의 첫 메시지면 상담이 `ANSWERED`로 바뀜 |
| `200` + 메시지 한 건 | 같은 `clientKey`로 같은 내용을 다시 보냄. 처음 저장한 메시지를 돌려줌 |
| `400 INVALID_REQUEST` | `clientKey`가 UUID가 아님, 내용이 비었거나 2,000자를 넘음, 헤더 없음 |
| `404 RESOURCE_NOT_FOUND` | 참여자가 아니거나 없는 상담 |
| `409 RESOURCE_CONFLICT` | 같은 `clientKey`로 다른 내용을 보냄 |
| `409 STORAGE_CONTEXT_CHANGED` | 다른 탭에서 로그인 계정이 바뀜 |

보낸 사람은 자기 메시지까지 읽은 것으로 처리됩니다. 상대에게는 `CONSULTATION_MESSAGE` 알림이 쌓입니다. 디자이너의 첫 메시지(답변)만 `CONSULTATION_ANSWERED`입니다.

## 9. 읽음 표시

`POST /api/consultations/{id}/read`

헤더는 CSRF, 본문은 `{ "messageId": 42 }`입니다. 화면에 보여 준 마지막 메시지 ID를 넣습니다. 내 읽음 위치를 그 메시지까지 올리고 `204`를 돌려줍니다. 위치는 뒤로 가지 않으므로 오래된 ID를 보내도 그대로입니다. 이 상담의 메시지가 아니면 `400`, 참여자가 아니면 `404`입니다.

상담 목록·상세의 `unreadCount`가 이 위치를 기준으로 계산됩니다. 알림의 읽음과는 따로입니다.

## 오류 코드와 화면 처리

위 표에 없는 공통 오류도 함께 정리했습니다. 문구는 권장안입니다.

| 코드 | 상태 | 화면에서 할 일 |
|---|---|---|
| `AUTHENTICATION_REQUIRED` | 401 | 로그인 화면으로 안내. "로그인 후 상담을 이용할 수 있어요." |
| `CSRF_INVALID` | 403 | CSRF를 다시 받아 한 번만 재전송. 또 실패하면 "요청 확인 정보가 만료됐어요. 다시 시도해 주세요." |
| `ACCESS_DENIED` | 403 | "이 상담에 답변할 수 없어요." |
| `INVALID_REQUEST` | 400 | 입력 칸 아래에 원인 표시. 길이·필수 값은 보내기 전에 화면에서 먼저 검사 |
| `RESOURCE_NOT_FOUND` | 404 | "상담을 찾을 수 없어요." 보낼 때는 "지금은 이 디자이너에게 상담을 보낼 수 없어요." |
| `RESOURCE_CONFLICT` | 409 | 보낼 때는 "이미 보낸 요청이에요. 새로운 상담 요청을 작성해 주세요." 답변할 때는 상세를 다시 불러옴 |
| `STORAGE_CONTEXT_CHANGED` | 409 | "로그인 계정이 바뀌었어요. 화면을 새로고침해 주세요." |
| `UPLOAD_TOO_LARGE` | 413 | "사진은 5MB 이하만 보낼 수 있어요." |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | "JPEG, PNG, WebP 사진만 보낼 수 있어요." |
| `INTERNAL_ERROR`, `DATABASE_UNAVAILABLE` | 500, 503 | "잠시 후 다시 시도해 주세요." 입력 내용은 지우지 않음 |
| 연결 실패 | — | 자동으로 다시 보내지 않음. 입력을 유지하고 다시 보내기 안내 |

## 서버가 확인하는 것과 확인하지 않는 것

- 서버는 개인 커트 기록 원본을 읽지 못합니다. 기록은 기기와 암호화 백업에만 있습니다. 그래서 보내는 순간 화면이 넣은 복사본만 저장합니다.
- 고른 커트의 담당자가 이 디자이너인지는 화면에서 확인합니다. 서버는 디자이너 프로필이 공개 상태인지, 보내는 회원 자신의 프로필이 아닌지만 확인합니다.
- 디자이너 자격은 확인하지 않습니다. 로그인한 회원이 직접 등록한 프로필입니다.
- `/examples` 예시 체험은 이 API를 쓰지 않고 지금처럼 메모리에서만 동작합니다.
- 개인 암호화 백업에 저장된 것은 상담 전달이 아닙니다. 이 API가 `201` 또는 `200`을 돌려줬을 때만 디자이너에게 전달된 것입니다.

## 화면

| 주소 | 화면 |
|---|---|
| `/designers/{id}` | 디자이너 프로필. 이 디자이너가 담당한 커트 기록이 있으면 `상담 요청` |
| `/consultations/new` | 첨부할 커트 기록 선택과 이번 요청 입력. 준비 내용(`?preview=`)에서 오면 그 내용을 첨부하고 담당이 아닌 디자이너에게도 보냄. 로그인하지 않았으면 로그인 안내 |
| `/consultations`, `/consultations/{id}` | 보낸 상담 목록과 상세. 상세 아래쪽에서 디자이너와 메시지를 주고받음. 들어올 때·창으로 돌아올 때·실시간 신호를 받을 때·`새 답변 확인`으로 다시 조회 |
| `/consultations/received`, `/consultations/received/{id}` | 받은 상담 목록과 상세. 첫 답변은 답변 칸으로 보내고 완료 화면을 거침. 그 뒤에는 상세에서 메시지를 주고받음. 내 계정 화면의 `받은 상담`에서 들어감. 다시 조회하는 때는 보낸 상담과 같음 |

목록은 `lastMessageAt`이 최근인 상담부터 보여 주고, `unreadCount`가 있으면 이름 옆에 숫자로 표시합니다. 상대 메시지는 상세 화면이 보이는 동안에만 읽음 표시를 보냅니다.

첨부 사진은 고른 커트 기록(또는 준비 내용에서 고른 사진)의 첫 사진 한 장을 기기 저장소에서 읽어 함께 보냅니다.

## 이번 범위에 넣지 않은 것

- 메시지에 사진 첨부, 메시지 수정·삭제
- 사진 여러 장, 경과 기록 여러 개 첨부
- 100건이 넘는 상담 목록과 200개가 넘는 오래된 메시지의 페이지 나누기
- 보낸 상담 취소·삭제, 상담 종료 상태

이 기능을 넣을 때도 이 문서를 먼저 고칩니다.

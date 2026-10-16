# 알림·실시간 API 계약

2026-10-16 기준 구현된 계약입니다. 서버는 `backend`의 `notification`·`realtime` 패키지와 Flyway `V7__notifications.sql`이 이 문서를 따릅니다. 화면은 아직 연결하지 않았습니다. 경로·필드·종류를 바꿀 때는 코드보다 이 문서를 먼저 고칩니다.

## 한눈에 보기

| 하는 일 | 요청 | 쓸 수 있는 사람 |
|---|---|---|
| 최근 알림과 안 읽은 수 | `GET /api/my/notifications` | 로그인한 회원 |
| 안 읽은 수만 | `GET /api/my/notifications/unread-count` | 로그인한 회원 |
| 알림 하나 읽음 | `POST /api/my/notifications/{id}/read` | 알림을 받은 회원 |
| 모두 읽음 | `POST /api/my/notifications/read-all` | 로그인한 회원 |
| 실시간 신호 받기 | WebSocket `/api/ws`, STOMP 구독 `/user/queue/events` | 로그인한 회원 |

## 공통 규칙

- 모두 로그인이 필요합니다. `POST`에는 CSRF 헤더만 넣고 `X-SALU-Storage-Context`는 넣지 않습니다.
- 응답에는 `Cache-Control: no-store`가 붙습니다. 시각은 UTC ISO 8601 문자열입니다.
- 알림은 업무(상담 보내기, 메시지, 후기, 댓글)와 같은 transaction에서 저장합니다. 업무가 실패하면 알림도 남지 않습니다.
- 서버는 알림의 종류와 대상 ID만 저장합니다. 화면에 보일 문구와 눌렀을 때 갈 화면은 화면 쪽 한 곳에서 `type`으로 정합니다. 서버 응답에 주소나 문장을 넣지 않습니다.

## 알림 한 건의 모양

```json
{
  "id": 128,
  "type": "CONSULTATION_MESSAGE",
  "targetId": "5b1e7c2a-3f4d-4e8a-9c61-0d2f7a8b9e10",
  "actorName": "지우",
  "createdAt": "2026-10-16T09:12:45.123Z",
  "read": false
}
```

| `type` | 받는 사람 | `targetId` | `actorName` | 눌렀을 때 갈 화면(제안) |
|---|---|---|---|---|
| `CONSULTATION_REQUESTED` | 상담을 받은 디자이너 | 상담 ID | 보낸 고객 이름 | `/consultations/received/{id}` |
| `CONSULTATION_MESSAGE` | 상대 참여자 | 상담 ID | 보낸 사람 이름(상담 당시 이름) | 고객은 `/consultations/{id}`, 디자이너는 `/consultations/received/{id}` |
| `REVIEW_RECEIVED` | 후기를 받은 디자이너 | 상담 ID | 후기를 쓴 고객 이름 | `/consultations/received/{id}` |
| `COMMUNITY_COMMENT` | 글쓴이(자기 댓글은 제외) | 글 ID | 댓글 쓴 사람 이름 | `/community/{id}` |

`CONSULTATION_MESSAGE`는 받는 사람이 그 상담의 고객인지 디자이너인지에 따라 갈 화면이 다릅니다. 화면은 상담 상세를 불러와 판단하거나, 보낸 상담 목록에 그 ID가 있는지로 정합니다.

종류를 늘리려면 `NotificationService`의 상수와 `V7`의 CHECK 제약을 새 migration으로 함께 바꾸고, 이 표를 먼저 고칩니다.

```ts
export type NotificationType =
  | 'CONSULTATION_REQUESTED'
  | 'CONSULTATION_MESSAGE'
  | 'REVIEW_RECEIVED'
  | 'COMMUNITY_COMMENT';

export type Notification = {
  id: number;
  type: NotificationType;
  targetId: string;
  actorName: string | null;
  createdAt: string;
  read: boolean;
};

export type Inbox = { unreadCount: number; items: Notification[] };
```

## 1. 최근 알림

`GET /api/my/notifications`

최신순 50건과 전체 안 읽은 수를 돌려줍니다.

```json
{ "unreadCount": 3, "items": [ { "id": 128, "type": "CONSULTATION_MESSAGE", "targetId": "…", "actorName": "지우", "createdAt": "…", "read": false } ] }
```

## 2. 안 읽은 수

`GET /api/my/notifications/unread-count` → `{ "count": 3 }`

머리글의 알림 버튼처럼 수만 필요할 때 씁니다.

## 3. 읽음

- `POST /api/my/notifications/{id}/read` → `204`. 이미 읽은 알림도 `204`입니다. 다른 회원의 알림이거나 없는 ID면 `404`입니다.
- `POST /api/my/notifications/read-all` → `204`.

알림을 읽어도 상담 메시지의 읽음 위치는 바뀌지 않습니다. 상담 화면에서는 [상담 API](consultation-api.md)의 읽음 표시를 따로 부릅니다.

## 4. 실시간 신호

서버가 "무엇이 바뀌었는지"만 알려 주는 단방향 연결입니다. 화면은 신호를 받으면 해당 API로 다시 불러옵니다. 화면에서 서버로 메시지를 보내지 않습니다.

| 항목 | 값 |
|---|---|
| 연결 주소 | `/api/ws` (같은 출처의 `ws://` 또는 `wss://`) |
| 인증 | 로그인 cookie. 로그인하지 않았으면 연결 거절 |
| 구독 | `/user/queue/events` 하나만 허용. 다른 주소 구독·`SEND`는 거절 |
| heartbeat | 서버·화면 모두 20초 |
| 허용 출처 | 같은 출처와 `SALU_PUBLIC_ORIGIN` |

신호의 모양은 하나입니다.

```json
{ "type": "CONSULTATION", "id": "5b1e7c2a-3f4d-4e8a-9c61-0d2f7a8b9e10" }
```

| `type` | `id` | 화면에서 할 일 |
|---|---|---|
| `NOTIFICATION` | 새 알림 ID | 안 읽은 수(또는 알림 목록)를 다시 불러옴 |
| `CONSULTATION` | 상담 ID | 그 상담을 보고 있으면 메시지를 `after`로 이어 받고, 목록이면 목록을 다시 불러옴 |

- 신호는 DB commit 뒤에만 보냅니다. 저장에 실패한 변경은 신호가 가지 않습니다.
- 연결이 끊긴 동안의 신호는 다시 보내지 않습니다. 다시 연결하면 보고 있던 화면의 API를 한 번 다시 부릅니다.
- 로그아웃할 때는 화면이 연결을 끊습니다. 신호에는 내용이 없고, 내용은 로그인 확인을 거치는 API로만 받습니다.
- 개발 서버(Vite)는 `/api` 요청과 함께 WebSocket도 Spring으로 넘깁니다. NAS처럼 앞에 다른 웹 서버가 있으면 `/api/ws`에 `Upgrade`·`Connection` 헤더를 넘기도록 설정해야 합니다.

브라우저 연결은 `@stomp/stompjs` 같은 STOMP 클라이언트로 합니다. 연결·재연결·로그아웃 처리는 화면 공통 부품 하나로 두고, 기능 화면에서 따로 연결하지 않습니다.

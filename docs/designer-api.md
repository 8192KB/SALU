# 디자이너 API 계약

2026-10-16 기준 구현된 계약입니다. 디자이너 후기·찜·소속 이력을 다룹니다. 서버는 `backend`의 `review`·`directory` 패키지와 Flyway `V9__designer_reviews_favorites_history.sql`이 이 문서를 따릅니다. 화면은 아직 연결하지 않았습니다. 미용실·디자이너 프로필 등록과 목록은 [개발 계약](development-contract.md)의 공개 미용실·디자이너 항목에 있습니다.

## 한눈에 보기

| 하는 일 | 요청 | 쓸 수 있는 사람 |
|---|---|---|
| 디자이너 후기 목록·평균 | `GET /api/designers/{id}/reviews` | 누구나 |
| 상담의 후기 보기 | `GET /api/consultations/{id}/review` | 상담의 두 참여자 |
| 후기 쓰기 | `POST /api/consultations/{id}/review` | 답변을 받은 상담의 고객 |
| 후기 고치기 | `PUT /api/consultations/{id}/review` | 후기를 쓴 고객 |
| 후기 지우기 | `DELETE /api/consultations/{id}/review` | 후기를 쓴 고객 |
| 찜한 디자이너 목록 | `GET /api/my/favorite-designers` | 로그인한 회원 |
| 찜하기 | `PUT /api/my/favorite-designers/{designerId}` | 로그인한 회원 |
| 찜 풀기 | `DELETE /api/my/favorite-designers/{designerId}` | 로그인한 회원 |
| 소속 이력 | `GET /api/designers/{id}/affiliations` | 누구나 |

## 공통 규칙

- `{id}`가 디자이너면 공개 프로필 ID, 상담이면 상담 ID입니다. 둘 다 UUID입니다.
- 비공개 프로필이나 정지된 계정의 디자이너는 후기·소속 이력이 `404`입니다.
- 후기 쓰기·고치기·지우기에는 CSRF와 `X-SALU-Storage-Context`를 넣습니다. 찜에는 CSRF만 넣습니다.
- 응답에는 `Cache-Control: no-store`가 붙고, 오류는 `{ "code", "message" }`입니다. 화면 문구는 `code`로 정합니다.
- 디자이너 목록·상세(`GET /api/designers`, `GET /api/designers/{id}`) 응답에 `reviewCount`(후기 수)와 `averageRating`(소수 첫째 자리, 후기가 없으면 `null`)이 함께 옵니다.

## 1. 후기

후기는 답변을 받은 상담 1건당 1개입니다. 디자이너 개인 프로필에 붙으므로 디자이너가 소속을 바꿔도 그대로 남습니다.

- 쓸 수 있는 때: 상담의 고객이고, 상담이 `ANSWERED`이고, 아직 후기가 없을 때. 상담 응답의 `canReview`가 `true`인 경우와 같습니다.
- 상담당 하나는 DB의 UNIQUE로, 상담과 다른 디자이너·고객 값은 DB의 복합 FK로도 막습니다.
- 후기를 쓰면 디자이너에게 `REVIEW_RECEIVED` 알림이 갑니다.

```json
{
  "id": "0e7f…",
  "consultationId": "5b1e…",
  "designerId": "2c9a…",
  "author": { "displayName": "하늘" },
  "rating": 5,
  "content": "설명이 자세했어요",
  "createdAt": "2026-10-16T09:12:45.123Z",
  "updatedAt": "2026-10-16T09:12:45.123Z",
  "mine": true
}
```

| 필드 | 뜻 |
|---|---|
| `author.displayName` | 상담을 보낼 때의 고객 이름. 이메일은 넣지 않음 |
| `rating` | 1~5 정수 |
| `content` | 앞뒤 공백을 뺀 1~1,000자 |
| `mine` | 지금 로그인한 회원이 쓴 후기인지. 로그인하지 않았으면 `false` |

쓰기·고치기 본문은 `{ "rating": 5, "content": "설명이 자세했어요" }`입니다.

| 요청 | 성공 | 실패 |
|---|---|---|
| `POST …/review` | `201` + 후기 | `400` 값 오류·헤더 없음, `403` 받은 디자이너가 씀, `404` 참여자가 아님, `409` 답변 전이거나 이미 씀 |
| `PUT …/review` | `200` + 후기 | `400`, `403` 받은 디자이너, `404` 후기 없음·참여자 아님 |
| `DELETE …/review` | `204` | `403` 받은 디자이너, `404` 후기 없음·참여자 아님 |
| `GET /api/consultations/{id}/review` | `200` + 후기 | `404` 후기 없음·참여자 아님 |

`GET /api/designers/{id}/reviews`는 최신순 100건과 전체 수·평균을 돌려줍니다.

```json
{ "count": 12, "averageRating": 4.6, "items": [ { "id": "…", "author": { "displayName": "하늘" }, "rating": 5, "content": "…", "mine": false } ] }
```

## 2. 찜

- `PUT /api/my/favorite-designers/{designerId}` → `204`. 이미 찜했어도 `204`입니다. 공개 프로필이 아니면 `404`, 내 프로필이면 `400`입니다.
- `DELETE /api/my/favorite-designers/{designerId}` → `204`. 찜하지 않았어도 `204`입니다.
- `GET /api/my/favorite-designers` → 디자이너 목록과 같은 모양의 배열, 최근 찜한 순서. 나중에 비공개로 바뀐 디자이너는 목록에서 빠집니다.

## 3. 소속 이력

`GET /api/designers/{id}/affiliations`

최근 기간부터 돌려줍니다. 지금 소속은 `endedAt`이 `null`입니다. 소속이 없으면 모든 기간이 닫혀 있습니다.

```json
[
  { "salonId": "…", "salonName": "그린 헤어", "region": "서울", "branch": "강남점", "startedAt": "2026-10-16T09:00:00.000Z", "endedAt": null },
  { "salonId": "…", "salonName": "바람 헤어", "region": "서울", "branch": "", "startedAt": "2026-03-02T01:00:00.000Z", "endedAt": "2026-10-16T09:00:00.000Z" }
]
```

이력은 내 디자이너 프로필 저장(`PUT /api/my/designer-profile`)에서 소속이 바뀔 때 서버가 자동으로 남깁니다. 따로 쓰는 API는 없습니다. 열린 기간은 디자이너마다 하나만 있도록 DB가 막습니다. V9 적용 전부터 있던 소속은 프로필 마지막 수정 시각을 시작 시각으로 넣었습니다.

```ts
export type DesignerReview = {
  id: string;
  consultationId: string;
  designerId: string;
  author: { displayName: string };
  rating: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
};

export type DesignerReviews = { count: number; averageRating: number | null; items: DesignerReview[] };

export type Affiliation = {
  salonId: string;
  salonName: string;
  region: string;
  branch: string;
  startedAt: string;
  endedAt: string | null;
};
```

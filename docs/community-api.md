# 커뮤니티 API 계약

2026-10-23 기준 구현된 계약입니다. 서버는 `backend`의 `community` 패키지와 Flyway `V10__community.sql`·`V13__moderation_notifications.sql`이 이 문서를 따릅니다. 화면은 `frontend/src/community-api.ts`·`community-pages.tsx`가 1~3장을 따르고, 하단 메뉴 맨 오른쪽 더보기에서 들어갑니다([화면 흐름](screen-flow.md)). 4장 관리자는 `admin-api.ts`·`admin-pages.tsx`(더보기의 `신고 처리`)가 따릅니다.

공개한 커트 사례와 고민 질문을 올리고, 댓글·도움돼요·신고로 함께 보는 기능입니다. 개인 기록 원본은 서버가 읽지 못하므로, 글을 올릴 때 화면이 고른 커트 정보와 사진을 복사해 보냅니다.

## 한눈에 보기

| 하는 일 | 요청 | 쓸 수 있는 사람 |
|---|---|---|
| 글 목록·검색 | `GET /api/community/posts` | 누구나 |
| 글 상세 | `GET /api/community/posts/{id}` | 누구나 |
| 글 사진 | `GET /api/community/posts/{id}/photos/{position}` | 누구나 |
| 댓글 목록 | `GET /api/community/posts/{id}/comments` | 누구나 |
| 내 글 | `GET /api/my/community-posts` | 로그인한 회원 |
| 내 이용 제한 | `GET /api/my/community-status` | 로그인한 회원 |
| 글 쓰기 | `POST /api/community/posts` | 로그인한 회원(제재 중 제외) |
| 글 고치기·지우기 | `PUT`·`DELETE /api/community/posts/{id}` | 글쓴이 |
| 댓글 쓰기 | `POST /api/community/posts/{id}/comments` | 로그인한 회원(제재 중 제외) |
| 댓글 지우기 | `DELETE /api/community/comments/{id}` | 댓글 쓴 회원 |
| 도움돼요 | `PUT`·`DELETE /api/community/posts/{id}/reaction` | 로그인한 회원 |
| 신고 | `POST /api/community/posts/{id}/reports`, `POST /api/community/comments/{id}/reports` | 로그인한 회원(자기 글 제외) |
| 관리자 | `/api/admin/**` 아래 4장 | 관리자 |

## 공통 규칙

- 조회는 로그인 없이 됩니다. 쓰기는 로그인이 필요합니다.
- 글·댓글·신고를 만들거나 고치고 지울 때는 CSRF와 `X-SALU-Storage-Context`를 넣습니다. 도움돼요와 관리자 요청에는 CSRF만 넣습니다.
- 공개 응답에는 작성자의 표시 이름만 넣고 이메일·회원 ID는 넣지 않습니다.
- 숨김(`HIDDEN`)·삭제(`DELETED`)된 글과 그 사진·댓글은 공개 조회에서 `404`입니다. 내 글 목록에는 숨김 글이 `status`·`hiddenBy`와 함께 보입니다.
- 숨긴 댓글은 그 댓글을 쓴 회원에게만 `hidden: true`로 보입니다. 다른 사람에게는 빠지고 댓글 수에도 들어가지 않습니다.
- 수(댓글·도움돼요)는 저장된 표에서 셉니다. 별도 숫자 컬럼을 두지 않습니다.
- 응답의 TypeScript 타입은 `frontend/src/community-api.ts`에 있습니다.
- 제재 중인 회원이 글·댓글을 쓰면 `403 COMMUNITY_SUSPENDED`입니다. 도움돼요·신고는 할 수 있습니다. 화면은 글쓰기·댓글 입력을 열기 전에 `GET /api/my/community-status`로 확인해 막힌 이유와 기간을 먼저 보여 주고, `403 COMMUNITY_SUSPENDED`를 받으면 같은 API를 다시 불러 안내를 바꿉니다.
- 관리자가 숨기거나 신고가 쌓여 자동으로 숨겨지면 작성자에게 `COMMUNITY_POST_HIDDEN`·`COMMUNITY_COMMENT_HIDDEN`, 제재하면 `COMMUNITY_SUSPENDED` 알림이 갑니다([알림 API](notification-api.md)). 이미 숨겨진 것을 관리자가 확정할 때는 다시 보내지 않습니다.

## 1. 글

| `category` | 뜻 | 커트 정보 `cut` |
|---|---|---|
| `CASE` | 커트 사례 | 필수 |
| `QUESTION` | 고민·질문 | 선택 |

글 쓰기는 글과 사진을 한 번에 보내려고 `multipart/form-data`를 씁니다. 글과 사진은 한 transaction으로 저장합니다.

| 부분 이름 | 형식 | 필수 | 내용 |
|---|---|---|---|
| `post` | `application/json` | 필수 | 아래 JSON |
| `photos` | `image/jpeg`, `image/png`, `image/webp` | 선택 | 0~3장, 장당 5 MiB 이하. 보낸 순서가 `position` 0·1·2 |

```json
{
  "requestKey": "a3f0c9d2-7b6e-4c1a-8e5f-2d4b6a8c0e17",
  "category": "CASE",
  "title": "옆머리 숱 정리 후기",
  "content": "옆머리가 뜨는 분들 참고하세요",
  "cut": { "cutDate": "2026-09-01", "service": "커트", "summary": "옆머리 숱 정리" }
}
```

| 필드 | 규칙 |
|---|---|
| `requestKey` | UUID. 화면의 글 초안 ID. 같은 값으로 같은 내용을 다시 보내면 처음 글을 `200`으로 돌려주고, 다른 내용이면 `409` |
| `title` | 앞뒤 공백을 뺀 1~100자 |
| `content` | 앞뒤 공백을 뺀 1~5,000자 |
| `cut.cutDate` | `YYYY-MM-DD`, 서울 기준 오늘 이하 |
| `cut.service` | 1~60자 |
| `cut.summary` | 1~2,000자 |

| 응답 | 언제 |
|---|---|
| `201` + 글 | 새로 저장함 |
| `200` + 글 | 같은 `requestKey`로 같은 내용을 다시 보냄 |
| `400 INVALID_REQUEST` | 값 오류, 분류 오류, `CASE`인데 `cut` 없음, 사진 4장 이상 |
| `403 COMMUNITY_SUSPENDED` | 제재 중 |
| `409 RESOURCE_CONFLICT` | 같은 `requestKey`로 다른 내용 |
| `413 UPLOAD_TOO_LARGE` | 사진이 5 MiB를 넘음 |
| `415 UNSUPPORTED_MEDIA_TYPE` | JPEG·PNG·WebP가 아니거나 열 수 없는 사진 |

공개 사진은 개인 기록의 사진 주소를 다시 쓰지 않고 이 요청으로 새로 올립니다. 얼굴 가림은 아직 없으므로 화면에서 올릴 사진을 직접 고르게 합니다.

글 상세의 모양입니다.

```json
{
  "id": "9a1b…",
  "category": "CASE",
  "title": "옆머리 숱 정리 후기",
  "content": "옆머리가 뜨는 분들 참고하세요",
  "author": { "displayName": "하늘" },
  "cut": { "cutDate": "2026-09-01", "service": "커트", "summary": "옆머리 숱 정리" },
  "photoUrls": ["/api/community/posts/9a1b…/photos/0"],
  "commentCount": 2,
  "reactionCount": 5,
  "reacted": false,
  "mine": false,
  "status": "VISIBLE",
  "createdAt": "2026-10-16T09:12:45.123Z",
  "updatedAt": "2026-10-16T09:12:45.123Z"
}
```

`reacted`·`mine`은 로그인한 회원 기준이고, 로그인하지 않았으면 `false`입니다.

### 목록·검색

`GET /api/community/posts?category=CASE&service=커트&q=옆머리&before={글 ID}`

공개 글을 최신순으로 30건씩 돌려줍니다. 다음 쪽은 마지막 글의 `id`를 `before`에 넣습니다. 모든 조건은 선택입니다.

| 조건 | 뜻 |
|---|---|
| `category` | `CASE`·`QUESTION`. 다른 값은 `400` |
| `service` | 커트 정보의 시술 이름과 같은 글 |
| `q` | 제목·내용·커트 요약에 들어간 글. 1~50자, `%`·`_`도 글자 그대로 찾음 |

목록 항목은 상세에서 `content` 대신 앞 120자 `excerpt`, `photoUrls` 대신 첫 사진 `photoUrl`과 `photoCount`가 옵니다. `reacted`·`mine`·`updatedAt`은 없습니다.

목록 항목의 `hiddenBy`는 숨김 글에서만 값이 있고 그 밖에는 `null`입니다. 공개 목록에는 숨김 글이 없으므로 내 글 목록에서만 씁니다.

| `hiddenBy` | 뜻 | 화면 문구(제안) |
|---|---|---|
| `REPORTS` | 처리 전 신고가 5건 쌓여 자동으로 숨김. 관리자가 아직 보지 않음 | 숨김 · 신고가 쌓여 검토 중이에요 |
| `ADMIN` | 관리자가 숨기기로 정함 | 숨김 · 운영 기준에 따라 숨겼어요 |

### 내 이용 제한

`GET /api/my/community-status`

```json
{ "suspended": true, "endsAt": "2026-10-30T03:00:00.000Z", "reason": "반복 광고" }
```

| 필드 | 뜻 |
|---|---|
| `suspended` | 지금 글·댓글을 쓸 수 없는지 |
| `endsAt` | 제한이 끝나는 시각. 기간 없는 제재이거나 제한이 없으면 `null` |
| `reason` | 관리자가 적은 이유. 제한이 없으면 `null`. 관리자 화면에서 이 이유가 회원에게 보인다고 알림 |

제재가 여러 건이면 가장 늦게 끝나는 제재(기간 없음이 가장 늦음)를 돌려줍니다.

### 고치기·지우기

- `PUT /api/community/posts/{id}` 본문 `{ "title": "…", "content": "…" }` → `200` + 글. 분류·커트 정보·사진은 바꾸지 않습니다. 다른 회원이면 `403`, 공개 글이 아니면 `404`, 제재 중이면 `403 COMMUNITY_SUSPENDED`입니다.
- `DELETE /api/community/posts/{id}` → `204`. 글은 `DELETED` 상태로 남고 공개 조회에서 빠집니다. 다른 회원이면 `403`, 이미 지웠으면 `404`입니다.

## 2. 댓글·도움돼요

- `GET /api/community/posts/{id}/comments` → 오래된 순서로 공개 댓글 최대 300개.
- `POST /api/community/posts/{id}/comments` 본문 `{ "clientKey": "UUID", "content": "1~1,000자" }` → `201` + 댓글. 같은 `clientKey`·같은 내용은 `200`, 다른 내용은 `409`입니다. 글쓴이에게 `COMMUNITY_COMMENT` 알림이 갑니다(자기 글에 단 댓글은 제외).
- `DELETE /api/community/comments/{id}` → `204`. 다른 회원이면 `403`, 없거나 이미 지웠으면 `404`입니다.
- `PUT /api/community/posts/{id}/reaction` → `204`, `DELETE …/reaction` → `204`. 여러 번 눌러도 회원당 하나입니다.

```json
{ "id": 77, "author": { "displayName": "바다" }, "content": "저도 그래요", "mine": false, "hidden": false, "createdAt": "2026-10-16T09:20:00.000Z" }
```

`hidden`은 내가 쓴 댓글이 숨겨졌을 때만 `true`입니다. 숨긴 댓글은 지우기만 할 수 있습니다.

## 3. 신고

`POST /api/community/posts/{id}/reports`, `POST /api/community/comments/{id}/reports`

본문은 `{ "reason": "SPAM", "detail": "광고 링크" }`입니다.

| `reason` | 뜻 |
|---|---|
| `SPAM` | 광고·도배 |
| `ABUSE` | 욕설·비하 |
| `PRIVACY` | 개인정보 노출 |
| `ILLEGAL` | 불법 정보 |
| `OTHER` | 기타. `detail`(1~200자) 필수 |

- 성공은 `201`입니다. 자기 글·댓글이면 `400`, 같은 대상을 다시 신고하면 `409`입니다.
- 처리되지 않은 신고가 5건 쌓이면 관리자가 보기 전까지 자동으로 숨김(`HIDDEN`)이 됩니다.

## 4. 관리자

관리자 역할(`ADMIN`)인 회원만 씁니다. 역할은 화면 없이 DB에서만 정하고, `GET /api/auth/me`의 `role`로 화면에서 확인합니다. 관리자가 아니면 `403 ACCESS_DENIED`입니다. DB에서 역할이 바뀌면 다음 요청에서 다시 로그인해야 합니다.

| 하는 일 | 요청 |
|---|---|
| 처리할 신고 | `GET /api/admin/community/reports` |
| 글 내용과 신고(숨김·삭제 글 포함) | `GET /api/admin/community/posts/{id}` |
| 글 사진(숨김·삭제 글 포함) | `GET /api/admin/community/posts/{id}/photos/{position}` |
| 댓글 신고 | `GET /api/admin/community/comments/{id}/reports` |
| 글 처리 | `POST /api/admin/community/posts/{id}/decision` |
| 댓글 처리 | `POST /api/admin/community/comments/{id}/decision` |
| 회원 제재 기록 | `GET /api/admin/members/{memberId}/sanctions` |
| 제재 | `POST /api/admin/members/{memberId}/sanctions` |
| 제재 해제 | `POST /api/admin/sanctions/{id}/lift` |

- 글 내용의 `photoUrls`는 공개 경로가 아니라 이 관리자 사진 경로를 가리킵니다. 공개 경로는 숨김·삭제 글에 `404`이기 때문입니다.
- 처리할 신고는 대상별로 묶어 `{ "posts": [...], "comments": [...] }`로 돌려줍니다. 항목에는 `openCount`, `reasons`, `latestAt`, 그리고 제재에 쓸 `authorId`가 들어갑니다.
- 처리 본문은 `{ "action": "HIDE" }` 또는 `{ "action": "KEEP" }`입니다. `HIDE`는 숨기고 열린 신고를 받아들임(`ACCEPTED`), `KEEP`은 다시 보이게 하고 열린 신고와 앞서 받아들인 신고를 모두 기각(`DISMISSED`)합니다. 숨겼던 글을 다시 보이게 하면 신고 목록도 기각으로 바뀌어 실제 상태와 맞습니다. 작성자가 지운 글은 상태를 바꾸지 않고 신고만 정리합니다. 성공은 `204`입니다.
- 제재 본문은 `{ "days": 7, "reason": "반복 광고" }`입니다. `days`는 3·7·30 또는 `null`(기간 없음)이고, `reason`은 1~200자입니다. 자기 자신은 제재할 수 없습니다(`400`). 성공은 `201` + 제재 한 건입니다.
- 해제는 `204`, 이미 해제했으면 `409`입니다. 해제해도 기록은 남습니다.

## 이번 범위에 넣지 않은 것

- 얼굴 가림, 사진 편집
- 대댓글, 글 사진 바꾸기
- 머리 상태 같은 세부 조건 검색, 인기순 정렬
- 신고자에게 처리 결과 알림, 다시 보이게 했을 때 작성자 알림

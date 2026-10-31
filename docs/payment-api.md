# 상담 요금 결제 API 계약

2026-10-29 기준 계약입니다. 서버는 `backend`의 `payment` 패키지·`consultation` 패키지와 Flyway `V16__consultation_fee.sql`, 화면은 `frontend/src/payment.tsx`가 이 문서를 따릅니다. 상담 자체는 [상담 API 계약](consultation-api.md)을 따릅니다. 경로·필드·상태를 바꿀 때는 코드보다 이 문서를 먼저 고칩니다.

## 한눈에 보기

| 하는 일 | 요청 | 쓸 수 있는 사람 |
|---|---|---|
| 결제를 쓸 수 있는지·토스 클라이언트 키 | `GET /api/payments/config` | 누구나 |
| 결제 승인 | `POST /api/payments/confirm` | 상담을 보낸 회원 |
| 답변 전 상담 취소(결제했으면 환불) | `POST /api/consultations/{id}/cancel` | 상담을 보낸 회원 |
| 상담 요금 정하기 | `POST`·`PUT /api/my/designer-profile`의 `consultationFee` | 프로필 주인 |

## 규칙

- 디자이너가 프로필에 상담 요금(`consultationFee`, 0~100,000원, 1,000원 단위)을 정합니다. 0원이면 지금처럼 바로 보내집니다. 공개 프로필 응답에 `consultationFee`가 들어갑니다.
- 요금은 처음 상담하는 디자이너에게만 받습니다. 고객의 기록 중 하나라도 받는 디자이너를 담당 디자이너로 연결했으면(`attachment.linkedDesigner: true`, [상담 API 계약](consultation-api.md)) 그 상담은 무료(`fee` 0)이고, 화면은 담당 디자이너에게 요금·결제에 관한 말을 아예 보여 주지 않습니다. 요금이 0원인 디자이너도 요금 문구를 보이지 않습니다. 기록은 기기·암호화 백업에만 있어 서버가 담당자 연결을 확인할 수 없으므로 화면이 보낸 값을 그대로 씁니다. 고객이 아무 기록에나 디자이너를 연결해 요금을 피할 수 있다는 점은 알고 둡니다.
- 요금이 붙는 상담을 보내면 그때의 요금을 상담에 남기고(`fee`, 디자이너가 나중에 바꿔도 그대로), 상태는 `PAYMENT_PENDING`입니다. 이 상태의 상담은 디자이너 목록·상세에 보이지 않고 알림도 가지 않습니다.
- 결제는 토스페이먼츠 결제창(v2 SDK, 카드·간편결제) 테스트 키로 합니다. 결제창 SDK는 API 개별 연동 키(`test_ck_`·`test_sk_`)만 받고 결제위젯 키(`test_gck_`)는 받지 않습니다. 토스 개발자센터 계정의 테스트 키를 씁니다. 환경 값 `SALU_TOSS_CLIENT_KEY`·`SALU_TOSS_SECRET_KEY`가 비면 결제가 꺼진 상태이고, 요금이 있는 디자이너에게 보내기는 503 `PAYMENT_UNAVAILABLE`입니다. 시크릿 키는 서버에만 둡니다.
- 승인: 화면은 토스가 성공 주소에 붙여 준 `paymentKey`·`orderId`·`amount`를 서버로 보냅니다. 서버는 주문 번호·금액을 DB 값과 대조한 뒤 DB transaction 밖에서 토스 승인 API(`POST /v1/payments/confirm`)를 부릅니다. 승인되면 transaction 안에서 결제 `PAID`, 상담 `REQUESTED`(보낸 시각은 결제 시각), 디자이너 알림을 함께 저장합니다. 이 저장이 실패하면 토스 취소 API로 승인을 되돌립니다. 이미 승인된 같은 결제를 다시 보내면 성공으로 돌려줍니다.
- 취소: 디자이너가 첫 답변을 하기 전(`PAYMENT_PENDING`·`REQUESTED`)에만 고객이 취소합니다. transaction 안에서 상담을 `CANCELED`, 결제를 `REFUND_PENDING`으로 바꾼 뒤(첫 답변 저장과 같은 상담 행 잠금을 써서 둘 중 하나만 성공), commit 뒤 토스 취소 API(`POST /v1/payments/{paymentKey}/cancel`, `Idempotency-Key`)를 부르고 `CANCELED`로 바꿉니다. 환불 호출이 실패하면 `REFUND_PENDING`으로 남고 정기 작업이 1분마다 다시 시도합니다.
- 자동 취소(정기 작업, 1분마다): 결제한 상담이 72시간 안에 첫 답변을 받지 못하면 위 취소와 같은 방식으로 취소·환불합니다. 30분 넘게 결제하지 않은 `PAYMENT_PENDING` 상담은 `CANCELED`, 결제는 `EXPIRED`로 정리합니다.
- 취소된 상담은 양쪽 목록에 `CANCELED`로 남고 메시지를 보낼 수 없습니다(409).

## 상담 응답에 더해지는 필드

```json
{ "status": "PAYMENT_PENDING", "fee": 10000, "canCancel": true,
  "payment": { "orderId": "salu-…", "amount": 10000, "orderName": "민준 디자이너 상담", "status": "READY", "paid": false } }
```

- `status`: `PAYMENT_PENDING`·`REQUESTED`·`ANSWERED`·`CANCELED`
- `payment`은 보낸 회원에게만, 요금이 있는 상담에만. 결제 상태는 `READY`·`PAID`·`REFUND_PENDING`·`CANCELED`·`EXPIRED`
- `payment.paid`: 토스 승인을 받은 적이 있는지. 결제 뒤 환불한 주문도 `true`. 결제하기 전에 취소한 주문은 `CANCELED`이지만 `false`라 화면은 환불했다고 하지 않음
- `canCancel`: 보낸 회원이고 상태가 `PAYMENT_PENDING`·`REQUESTED`일 때

## 결제 승인

```json
POST /api/payments/confirm
{ "paymentKey": "tgen_…", "orderId": "salu-…", "amount": 10000 }
```

200 → 상담 응답. 주문이 없거나 남의 주문이면 404, 금액이 다르거나 이미 취소·만료됐으면 409 `PAYMENT_MISMATCH`, 토스가 승인을 거절하면 400 `PAYMENT_REJECTED`(토스 메시지는 그대로 보내지 않음), 토스에 닿지 않거나 키가 틀려 토스가 401·403을 주면 503 `PAYMENT_UNAVAILABLE`.

## 결제 설정

`GET /api/payments/config` → `{ "enabled": true, "clientKey": "test_ck_…" }`. 꺼져 있으면 `{ "enabled": false, "clientKey": null }`.

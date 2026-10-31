import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiFailure, directoryRequest } from './auth/api';
import { useAuth } from './auth/context';
import { useLoginPath } from './auth/pages';
import { Alert, Loading, PageHeading } from './components';
import { Dialog } from './dialog';
import { cancelConsultation, confirmPayment } from './consultation-api';
import { useConsultations } from './consultation-store';
import type { ConsultationThread } from './consultation-store';
import { loadScript } from './salon-map';
import type { DesignerProfile, PrototypeState } from './prototype/types';
import { Link, useNavigate } from './workspace';

// 상담 요금 결제(docs/payment-api.md). 토스페이먼츠 결제창을 열고, 돌아온 값을 서버가 승인함

// 기록에 담당 디자이너로 연결한 디자이너와의 상담은 무료. 이때는 요금 이야기를 화면에 꺼내지 않음
export const isLinkedDesigner = (state: PrototypeState, designerId: string) =>
  state.cuts.some((cut) => cut.designerProfileId === designerId);
export const chargedFee = (state: PrototypeState, designer: DesignerProfile) =>
  isLinkedDesigner(state, designer.id) ? 0 : (designer.consultationFee ?? 0);
type TossPayment = {
  requestPayment: (options: {
    method: 'CARD';
    amount: { currency: 'KRW'; value: number };
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }) => Promise<void>;
};
type TossPayments = ((clientKey: string) => {
  payment: (options: { customerKey: string }) => TossPayment;
}) & { ANONYMOUS: string };
declare global {
  interface Window {
    TossPayments?: TossPayments;
  }
}

export const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

let config: Promise<string | null> | null = null;
const clientKey = () => {
  config ??= directoryRequest<{ enabled: boolean; clientKey: string | null }>(
    '/api/payments/config',
  ).then(
    (value) => (value?.enabled && value.clientKey) || null,
    () => {
      config = null;
      return null;
    },
  );
  return config;
};

// 결제창을 열고 성공·실패 주소로 이동함. 사용자가 창을 닫으면 Error로 끝남
export async function startPayment(thread: ConsultationThread) {
  const payment = thread.payment;
  if (!payment || payment.status !== 'READY') throw new Error('결제할 상담이 아니에요.');
  const key = await clientKey();
  if (!key) throw new Error('지금은 결제를 진행할 수 없어요. 잠시 뒤 다시 시도해 주세요.');
  try {
    await loadScript('https://js.tosspayments.com/v2/standard');
  } catch {
    throw new Error('결제창을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  const Toss = window.TossPayments;
  if (!Toss) throw new Error('결제창을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  const back = (path: string) =>
    `${window.location.origin}${path}?${new URLSearchParams({ consultation: thread.id })}`;
  try {
    await Toss(key)
      .payment({ customerKey: Toss.ANONYMOUS })
      .requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: payment.amount },
        orderId: payment.orderId,
        orderName: payment.orderName,
        successUrl: back('/payments/success'),
        failUrl: back('/payments/fail'),
      });
  } catch (failure) {
    const code = (failure as { code?: string } | null)?.code;
    throw new Error(
      code === 'USER_CANCEL'
        ? '결제를 취소했어요. 상담 화면에서 다시 결제할 수 있어요.'
        : '결제창을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    );
  }
}

const detailPath = (id: string | null) =>
  id ? `/consultations/${encodeURIComponent(id)}` : '/consultations';

// 토스 결제창이 성공하면 돌아오는 화면. 한 번만 승인을 요청하고 완료 화면으로 바꿈
export function PaymentSuccess() {
  const [params] = useSearchParams();
  const { state } = useAuth();
  const { repository } = useConsultations();
  const navigate = useNavigate();
  const sent = useRef(false);
  const [error, setError] = useState('');
  const id = params.get('consultation');
  const member = state.status === 'authenticated' ? state.member : null;
  const loginPath = useLoginPath();
  useEffect(() => {
    if (!member || sent.current) return;
    sent.current = true;
    const input = {
      paymentKey: params.get('paymentKey') ?? '',
      orderId: params.get('orderId') ?? '',
      amount: Number(params.get('amount')),
    };
    confirmPayment(member, input).then(
      (value) => {
        repository?.accept?.(value);
        navigate(`/consultations/${encodeURIComponent(value.id)}/complete`, {
          replace: true,
          state: { celebrate: true },
        });
      },
      (failure: unknown) =>
        setError(
          failure instanceof ApiFailure || failure instanceof Error
            ? failure.message
            : '결제를 확인하지 못했어요.',
        ),
    );
  }, [member, params, repository, navigate]);
  if (state.status === 'guest')
    return (
      <PaymentResult
        title="로그인이 필요해요"
        message="결제한 계정으로 로그인하면 이 화면으로 돌아와 결제를 마저 확인해요."
        id={id}
        login={loginPath}
      />
    );
  if (!error) return <Loading>결제를 확인하고 있어요.</Loading>;
  return <PaymentResult title="결제를 마치지 못했어요" message={error} id={id} />;
}

// 결제창에서 실패·취소하면 돌아오는 화면. 토스가 붙인 메시지는 보이지 않고 안내만 함
export function PaymentFail() {
  const [params] = useSearchParams();
  const canceled = params.get('code') === 'PAY_PROCESS_CANCELED';
  return (
    <PaymentResult
      title={canceled ? '결제를 취소했어요' : '결제를 마치지 못했어요'}
      message={
        canceled
          ? '상담 화면에서 다시 결제할 수 있어요. 30분 안에 결제하지 않으면 요청이 취소돼요.'
          : '결제 수단을 확인한 뒤 상담 화면에서 다시 결제해 주세요.'
      }
      id={params.get('consultation')}
    />
  );
}

function PaymentResult({
  title,
  message,
  id,
  login,
}: {
  title: string;
  message: string;
  id: string | null;
  // 로그인하지 않았으면 결제 확인 주소로 돌아오는 로그인 링크
  login?: string;
}) {
  return (
    <div className="consultation-screen">
      <PageHeading title="상담 결제" />
      <section className="consultation-soft-panel" role="status">
        <h2>{title}</h2>
        <p>{message}</p>
        {login ? (
          <Link className="button primary" to={login}>
            로그인
          </Link>
        ) : (
          <Link className="button primary" to={detailPath(id)}>
            {id ? '보낸 상담 보기' : '상담 내역으로'}
          </Link>
        )}
      </section>
    </div>
  );
}

// 보낸 상담 상세의 결제 안내·결제하기·취소. 요금이 없는 상담은 취소만 보임
export function ConsultationPaymentPanel({ thread }: { thread: ConsultationThread }) {
  const { state } = useAuth();
  const { repository } = useConsultations();
  const member = state.status === 'authenticated' ? state.member : null;
  const [busy, setBusy] = useState<'' | 'pay' | 'cancel'>('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const payment = thread.payment;
  const fee = thread.fee ?? 0;
  const pay = async () => {
    setBusy('pay');
    setError('');
    try {
      await startPayment(thread);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '결제창을 열지 못했어요.');
    } finally {
      setBusy('');
    }
  };
  const cancel = async () => {
    if (!member) return;
    setConfirming(false);
    setBusy('cancel');
    setError('');
    try {
      repository?.accept?.(await cancelConsultation(member, thread.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '상담을 취소하지 못했어요.');
      void repository?.load?.(thread.id);
    } finally {
      setBusy('');
    }
  };
  const status =
    thread.status === 'PAYMENT_PENDING'
      ? `상담 요금 ${won(fee)}을 결제하면 디자이너에게 요청이 가요. 30분 안에 결제하지 않으면 요청이 취소돼요.`
      : thread.status === 'CANCELED'
        ? payment?.status === 'REFUND_PENDING'
          ? `취소한 상담이에요. 상담 요금 ${won(fee)}을 환불하고 있어요.`
          : payment?.status === 'CANCELED' && payment.paid
            ? `취소한 상담이에요. 상담 요금 ${won(fee)}을 환불했어요.`
            : payment?.status === 'EXPIRED'
              ? '30분 안에 결제하지 않아 취소된 상담이에요.'
              : '취소한 상담이에요.'
        : payment?.status === 'PAID'
          ? `상담 요금 ${won(fee)}을 결제했어요. 72시간 안에 답변이 없으면 자동으로 취소되고 환불돼요.`
          : '';
  if (!status && !thread.canCancel) return null;
  return (
    <section className="consultation-soft-panel consultation-payment">
      {status && <p>{status}</p>}
      <Alert message={error} />
      {thread.status === 'PAYMENT_PENDING' && payment?.status === 'READY' && (
        <button
          type="button"
          className="button primary full"
          disabled={Boolean(busy)}
          aria-busy={busy === 'pay'}
          onClick={() => void pay()}
        >
          {busy === 'pay' ? '결제창 여는 중' : `${won(fee)} 결제하기`}
        </button>
      )}
      {thread.canCancel && (
        <button
          type="button"
          className="text-link"
          disabled={Boolean(busy)}
          aria-busy={busy === 'cancel'}
          onClick={() => setConfirming(true)}
        >
          {busy === 'cancel' ? '취소하는 중' : '상담 취소'}
        </button>
      )}
      <Dialog open={confirming} title="상담을 취소할까요?" onClose={() => setConfirming(false)}>
        <p>
          {payment?.status === 'PAID'
            ? `디자이너가 답변하기 전이라 상담 요금 ${won(fee)}을 모두 환불해요.`
            : '디자이너에게 보낸 요청이 취소돼요.'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setConfirming(false)}>
            그대로 두기
          </button>
          <button type="button" className="button coral" onClick={() => void cancel()}>
            상담 취소
          </button>
        </div>
      </Dialog>
    </section>
  );
}

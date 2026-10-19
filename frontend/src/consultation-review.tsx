import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router';
import { Alert, BackLink, Missing, PageHeading } from './components';
import { Completion } from './completion';
import { Dialog } from './dialog';
import { Link, useNavigate } from './workspace';
import { useAuth } from './auth/context';
import type { SessionMember } from './auth/api';
import { getConsultation } from './consultation-api';
import type { Consultation } from './consultation-api';
import {
  deleteReview,
  fetchConsultationReview,
  fetchDesignerReviews,
  saveReview,
} from './designer-api';
import type { DesignerReview, DesignerReviews } from './designer-api';
import { sentTime } from './prototype/dates';
import { useLocalSignal } from './realtime';

const RATINGS = [1, 2, 3, 4, 5];

function useMember(): SessionMember | null {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.member : null;
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars" aria-label={`별점 ${rating}점`}>
      <span aria-hidden="true">
        {'★'.repeat(rating)}
        <span className="review-stars-empty">{'★'.repeat(5 - rating)}</span>
      </span>
    </span>
  );
}

function ReviewBody({ review }: { review: DesignerReview }) {
  return (
    <>
      <div className="review-meta">
        <Stars rating={review.rating} />
        <time dateTime={review.updatedAt}>{sentTime(review.updatedAt)}</time>
      </div>
      <p className="consultation-message">{review.content}</p>
    </>
  );
}

// 보낸 상담 상세의 후기 구역. 답변을 받은 뒤에만 보이고, 쓴 후기는 고치거나 지울 수 있음
export function ConsultationReviewPanel({
  consultation,
  onChange,
}: {
  consultation: { id: string; designerName: string; reviewId?: string | null; canReview?: boolean };
  // 후기를 지운 뒤 상담을 다시 불러와 쓰기 버튼을 되살림
  onChange: () => unknown;
}) {
  const member = useMember();
  const signal = useLocalSignal();
  const [review, setReview] = useState<DesignerReview | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { id, reviewId } = consultation;
  useEffect(() => {
    if (!member || !reviewId) {
      setReview(null);
      return;
    }
    let current = true;
    fetchConsultationReview(member, id).then(
      (value) => current && setReview(value),
      (failure: unknown) =>
        current &&
        setError(failure instanceof Error ? failure.message : '후기를 불러오지 못했어요.'),
    );
    return () => {
      current = false;
    };
  }, [member, id, reviewId]);
  if (!member || (!reviewId && !consultation.canReview)) return null;
  async function remove() {
    if (!member) return;
    setBusy(true);
    setError('');
    try {
      await deleteReview(member, id);
      setConfirm(false);
      setReview(null);
      await onChange();
      signal({ type: 'CONSULTATION', id });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '후기를 지우지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="consultation-soft-panel consultation-review">
      {reviewId ? (
        <>
          <h2>남긴 후기</h2>
          {review ? (
            <ReviewBody review={review} />
          ) : (
            !error && <p role="status">후기를 불러오고 있어요.</p>
          )}
          <Alert message={error} />
          {review && (
            <div className="review-actions">
              <Link className="button" to={`/consultations/${id}/review`}>
                고치기
              </Link>
              <button type="button" className="button" onClick={() => setConfirm(true)}>
                지우기
              </button>
            </div>
          )}
          <Dialog
            open={confirm}
            title="후기를 지울까요?"
            onClose={() => !busy && setConfirm(false)}
          >
            <p>지운 후기는 되돌릴 수 없어요. 지운 뒤에 다시 남길 수 있어요.</p>
            <Alert message={error} />
            <div className="dialog-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="button coral"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void remove()}
              >
                {busy ? '지우는 중' : '지우기'}
              </button>
            </div>
          </Dialog>
        </>
      ) : (
        <>
          <h2>{consultation.designerName} 디자이너의 상담은 어땠나요?</h2>
          <p>남긴 후기는 디자이너 프로필에서 다른 고객도 볼 수 있어요.</p>
          <Link className="button primary" to={`/consultations/${id}/review`}>
            후기 남기기
          </Link>
        </>
      )}
    </section>
  );
}

// 받은 상담 상세에서 디자이너가 그 상담의 후기를 읽음
export function ReceivedReview({ id, reviewId }: { id: string; reviewId: string | null }) {
  const member = useMember();
  const [review, setReview] = useState<DesignerReview | null>(null);
  useEffect(() => {
    if (!member || !reviewId) return;
    let current = true;
    fetchConsultationReview(member, id).then(
      (value) => current && setReview(value),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [member, id, reviewId]);
  if (!reviewId || !review) return null;
  return (
    <section className="consultation-soft-panel consultation-review">
      <h2>고객이 남긴 후기</h2>
      <ReviewBody review={review} />
    </section>
  );
}

// 디자이너 프로필의 후기 목록. 실제 공간에서만 서버 후기를 읽음
export function DesignerReviewList({ designerId }: { designerId: string }) {
  const [reviews, setReviews] = useState<DesignerReviews | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      fetchDesignerReviews(designerId).then(
        (value) => {
          setReviews(value);
          setError('');
        },
        (failure: unknown) =>
          setError(failure instanceof Error ? failure.message : '후기를 불러오지 못했어요.'),
      ),
    [designerId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="consultation-soft-panel consultation-profile-reviews">
      <h2>
        상담 후기
        {reviews?.averageRating != null && (
          <span className="review-average">
            <Stars rating={Math.round(reviews.averageRating)} /> {reviews.averageRating.toFixed(1)}{' '}
            · {reviews.count}개
          </span>
        )}
      </h2>
      {error ? (
        <>
          <Alert message={error} />
          <button type="button" className="button" onClick={() => void load()}>
            다시 불러오기
          </button>
        </>
      ) : !reviews ? (
        <p role="status">후기를 불러오고 있어요.</p>
      ) : reviews.items.length ? (
        reviews.items.map((review) => (
          <article key={review.id} className="review-item">
            <div>
              <strong>{review.author.displayName}님</strong>
              <div className="review-meta">
                <Stars rating={review.rating} />
                <time dateTime={review.createdAt}>{sentTime(review.createdAt)}</time>
              </div>
              <p>{review.content}</p>
            </div>
          </article>
        ))
      ) : (
        <p>아직 남겨진 후기가 없어요.</p>
      )}
    </section>
  );
}

export function ReviewWrite() {
  const { id = '' } = useParams();
  const member = useMember();
  const { state } = useAuth();
  const navigate = useNavigate();
  const signal = useLocalSignal();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [existing, setExisting] = useState<DesignerReview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!member) return;
    let current = true;
    (async () => {
      try {
        const value = await getConsultation(member, id);
        const review = value.reviewId ? await fetchConsultationReview(member, id) : null;
        if (!current) return;
        setConsultation(value);
        setExisting(review);
        if (review) {
          setRating(review.rating);
          setContent(review.content);
        }
      } catch (failure) {
        if (current)
          setLoadError(failure instanceof Error ? failure.message : '상담을 불러오지 못했어요.');
      }
    })();
    return () => {
      current = false;
    };
    // 로그인 확인 때마다 회원 객체가 새로 만들어지므로 계정 ID로만 다시 불러와 쓰던 내용을 덮지 않음
  }, [member?.id, id]);
  const back = <BackLink to={`/consultations/${id}`}>보낸 상담</BackLink>;
  if (state.status !== 'authenticated')
    return (
      <div className="consultation-screen">
        <PageHeading title="후기 남기기" back={back} />
        <Missing title="로그인이 필요해요" message="로그인 후 후기를 남길 수 있어요." />
      </div>
    );
  if (!consultation)
    return loadError ? (
      <Missing title="상담을 찾을 수 없어요" message={loadError} />
    ) : (
      <p role="status">상담을 불러오고 있어요.</p>
    );
  if (!existing && !consultation.canReview)
    return (
      <Missing
        title="후기를 남길 수 없는 상담이에요"
        message="답변을 받은 상담에만 후기를 하나 남길 수 있어요."
      />
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !member) return;
    const text = content.trim();
    if (!rating || !text) {
      setError(!rating ? '별점을 골라 주세요.' : '후기를 적어 주세요.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await saveReview(member, id, { rating, content: text }, Boolean(existing));
      signal({ type: 'CONSULTATION', id });
      navigate(`/consultations/${id}/review/complete`, {
        replace: true,
        state: { celebrate: true },
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '후기를 저장하지 못했어요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const name = consultation.designer.name;
  return (
    <div className="consultation-screen">
      <PageHeading
        title={existing ? '후기 고치기' : '후기 남기기'}
        description={`${name} 디자이너의 상담은 어땠나요?`}
        back={back}
      />
      <form onSubmit={submit} noValidate>
        <fieldset className="review-rating" disabled={busy}>
          <legend>별점</legend>
          {RATINGS.map((value) => (
            <label key={value} className={value <= rating ? 'on' : ''}>
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => {
                  setRating(value);
                  setError('');
                }}
              />
              <span aria-hidden="true">★</span>
              <span className="sr-only">{value}점</span>
            </label>
          ))}
        </fieldset>
        <label className="consultation-request-field">
          <span>후기</span>
          <textarea
            maxLength={1000}
            rows={5}
            placeholder="예: 손질 방법을 사진과 함께 자세히 알려 주셔서 좋았어요."
            value={content}
            disabled={busy}
            onChange={(event) => {
              setContent(event.target.value);
              setError('');
            }}
          />
        </label>
        <Alert message={error} />
        <div className="consultation-action">
          <p className="consultation-privacy">
            후기는 {name} 디자이너 프로필에 내 이름과 함께 보여요.
          </p>
          <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
            {busy ? '저장하는 중' : existing ? '고친 후기 저장' : '후기 남기기'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ReviewComplete() {
  const { id = '' } = useParams();
  const member = useMember();
  const [designerId, setDesignerId] = useState('');
  useEffect(() => {
    if (!member) return;
    getConsultation(member, id).then(
      (value) => setDesignerId(value.designer.id),
      () => {},
    );
  }, [member?.id, id]);
  return (
    <div className="consultation-sent">
      <Completion
        title="후기를 남겼어요"
        description="디자이너 프로필의 상담 후기에서 볼 수 있어요."
        primary="보낸 상담 보기"
        to={`/consultations/${id}`}
        secondary="디자이너 프로필 보기"
        secondaryTo={designerId ? `/designers/${designerId}` : '/designers'}
      >
        {null}
      </Completion>
    </div>
  );
}

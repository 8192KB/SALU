import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useParams } from 'react-router';
import { ApiFailure } from './auth/api';
import {
  Alert,
  BackLink,
  ErrorState,
  FieldFeedback,
  LoadFailure,
  loadProblem,
  Missing,
  PageHeading,
  Loading,
} from './components';
import type { LoadProblem } from './components';
import { Completion } from './completion';
import { Dialog } from './dialog';
import { useFeedback } from './feedback';
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
import { useLocalSignal, useOnReactivate } from './realtime';

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
      <div className="review-score">
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
  const notify = useFeedback();
  const [review, setReview] = useState<DesignerReview | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // 후기를 고치고 돌아오면 ID는 그대로라 다시 보일 때 새로 받음
  const [version, setVersion] = useState(0);
  useOnReactivate(() => setVersion((value) => value + 1));
  // 지운 뒤 상담을 다시 받기 전이나 다시 받지 못했을 때도 바로 쓰기 버튼을 보여 줌
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const { id, reviewId } = consultation;
  const reviewed = Boolean(reviewId) && reviewId !== deletedId;
  useEffect(() => {
    if (!member || !reviewId) {
      setReview(null);
      return;
    }
    let current = true;
    fetchConsultationReview(member, id).then(
      (value) => {
        if (!current) return;
        setReview(value);
        setError('');
      },
      (failure: unknown) =>
        current &&
        setError(failure instanceof Error ? failure.message : '후기를 불러오지 못했어요.'),
    );
    return () => {
      current = false;
    };
  }, [member, id, reviewId, version]);
  if (!member || (!reviewed && !consultation.canReview && !deletedId)) return null;
  async function remove() {
    if (!member || !reviewId) return;
    setBusy(true);
    setError('');
    try {
      await deleteReview(member, id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '후기를 지우지 못했어요.');
      return;
    } finally {
      setBusy(false);
    }
    setConfirm(false);
    setDeletedId(reviewId);
    setReview(null);
    notify('후기를 지웠어요');
    // 지우기는 이미 끝났으므로 상담을 다시 받지 못해도 오류로 보이지 않음
    void Promise.resolve(onChange()).catch(() => {});
    signal({ type: 'CONSULTATION', id });
  }
  return (
    <section className="consultation-soft-panel consultation-review">
      {reviewed ? (
        <>
          <h2>남긴 후기</h2>
          {review ? (
            <ReviewBody review={review} />
          ) : (
            !error && <Loading>후기를 불러오고 있어요.</Loading>
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
          <Link className="button" to={`/consultations/${id}/review`}>
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
        <Loading>후기를 불러오고 있어요.</Loading>
      ) : reviews.items.length ? (
        reviews.items.map((review) => (
          <article key={review.id} className="review-item">
            <div>
              <strong>{review.author.displayName}님</strong>
              <div className="review-score">
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
  const [loadError, setLoadError] = useState<LoadProblem | null>(null);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<'rating' | 'content' | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const memberRef = useRef(member);
  memberRef.current = member;
  // 마지막으로 입력칸에 채운 후기 ID. 메뉴를 오가며 보관된 화면이 다시 보일 때 후기가 지워졌거나
  // 새로 생겼으면 입력칸을 바꾸고, 같은 후기면 쓰던 내용을 그대로 둠
  const applied = useRef<string | null | undefined>(undefined);
  const load = useCallback(async () => {
    const account = memberRef.current;
    if (!account) return;
    try {
      const value = await getConsultation(account, id);
      const review = value.reviewId ? await fetchConsultationReview(account, id) : null;
      setConsultation(value);
      setLoadError(null);
      if (applied.current !== value.reviewId) {
        applied.current = value.reviewId;
        setExisting(review);
        setRating(review?.rating ?? 0);
        setContent(review?.content ?? '');
        setError('');
        setFieldError(null);
      }
    } catch (failure) {
      setLoadError(loadProblem(failure, '상담을 불러오지 못했어요.'));
    }
    // 로그인 확인 때마다 회원 객체가 새로 만들어지므로 계정 ID로만 다시 만듦
  }, [member?.id, id]);
  useEffect(() => {
    void load();
  }, [load]);
  useOnReactivate(load);
  const back = <BackLink to={`/consultations/${id}`}>보낸 상담</BackLink>;
  if (state.status === 'checking') return <Loading>로그인 상태를 확인하고 있어요.</Loading>;
  if (state.status !== 'authenticated')
    return (
      <div className="consultation-screen">
        <PageHeading title="후기 남기기" back={back} />
        <ErrorState kind="login" message="로그인하면 받은 상담에 후기를 남길 수 있어요." />
      </div>
    );
  if (!consultation)
    return loadError ? (
      <LoadFailure problem={loadError} title="상담을 찾을 수 없어요" onRetry={() => void load()} />
    ) : (
      <Loading>상담을 불러오고 있어요.</Loading>
    );
  // 후기는 상담을 보낸 회원만 남김. 받은 디자이너가 주소로 열면 고치기 화면을 보여 주지 않음
  if (consultation.viewerRole === 'DESIGNER')
    return (
      <div className="consultation-screen">
        <PageHeading
          title="후기 남기기"
          back={<BackLink to={`/consultations/received/${id}`}>받은 상담</BackLink>}
        />
        <ErrorState
          kind="denied"
          title="상담을 보낸 회원만 후기를 남길 수 있어요"
          message="받은 상담에서 고객이 남긴 후기를 볼 수 있어요."
        />
      </div>
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
    // 입력 확인 문구는 해당 칸 바로 아래에 보여 줌. 저장 실패는 버튼 위 상자에 보여 줌
    if (!rating || !text) {
      setFieldError(!rating ? 'rating' : 'content');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await saveReview(member, id, { rating, content: text }, Boolean(existing));
      // 저장한 후기를 기준으로 삼아, 나중에 지워지면 다시 들어올 때 지운 내용 없이 빈 칸으로 시작함
      applied.current = saved.id;
      setExisting(saved);
      signal({ type: 'CONSULTATION', id });
      navigate(`/consultations/${id}/review/complete`, {
        replace: true,
        state: { celebrate: true, edited: Boolean(existing) },
      });
    } catch (failure) {
      // 다른 탭에서 지운 후기를 고치려 했으면 쓰던 내용은 두고 새 후기로 남기게 바꿈
      if (existing && failure instanceof ApiFailure && failure.status === 404) {
        applied.current = null;
        setExisting(null);
        setError('이 후기는 이미 지워졌어요. 한 번 더 누르면 새 후기로 남겨요.');
        return;
      }
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
        <fieldset
          className="review-rating"
          disabled={busy}
          aria-describedby={fieldError === 'rating' ? 'review-rating-error' : undefined}
        >
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
                  setFieldError(null);
                }}
              />
              {/* 고르지 않은 별은 빈 별로 그려 몇 개를 골랐는지 한눈에 보이게 함 */}
              <span aria-hidden="true">{value <= rating ? '★' : '☆'}</span>
              <span className="sr-only">{value}점</span>
            </label>
          ))}
          <span className="review-rating-value" aria-hidden="true">
            {rating ? `${rating}점` : '골라 주세요'}
          </span>
        </fieldset>
        {fieldError === 'rating' && (
          <FieldFeedback id="review-rating-error" message="별점을 골라 주세요." />
        )}
        <label className="consultation-request-field">
          <span>후기</span>
          <textarea
            maxLength={1000}
            rows={5}
            placeholder="예: 손질 방법을 사진과 함께 자세히 알려 주셔서 좋았어요."
            value={content}
            disabled={busy}
            aria-invalid={fieldError === 'content' || undefined}
            aria-describedby={fieldError === 'content' ? 'review-content-error' : undefined}
            onChange={(event) => {
              setContent(event.target.value);
              setError('');
              setFieldError(null);
            }}
          />
        </label>
        {fieldError === 'content' && (
          <FieldFeedback id="review-content-error" message="후기를 적어 주세요." />
        )}
        <div className="review-form-error">
          <Alert message={error} />
        </div>
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
  const edited = Boolean((useLocation().state as { edited?: boolean } | null)?.edited);
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
        title={edited ? '후기를 고쳤어요' : '후기를 남겼어요'}
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

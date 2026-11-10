import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  Alert,
  BackLink,
  ErrorState,
  LoadFailure,
  loadProblem,
  Missing,
  PageHeading,
  Loading,
} from './components';
import type { LoadProblem } from './components';
import { Dialog } from './dialog';
import { Field } from './fields';
import { useFeedback } from './feedback';
import { Link } from './workspace';
import { useAuth } from './auth/context';
import { cutTitle, sentTime } from './prototype/dates';
import { CATEGORY_LABELS, REPORT_REASONS } from './community-api';
import {
  POST_STATUS,
  REPORT_STATUS,
  decide,
  fetchCommentReports,
  fetchPostReview,
  fetchHidden,
  fetchReports,
  fetchSanctions,
  liftSanction,
  sanction,
} from './admin-api';
import type {
  Decision,
  PostReview,
  Report,
  ReportedComment,
  ReportedPost,
  Sanction,
} from './admin-api';
import { useOnReactivate } from './realtime';

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const reasonList = (reasons: string[]) =>
  reasons.map((value) => REPORT_REASONS[value as keyof typeof REPORT_REASONS] ?? value).join(', ');

// 관리자 화면은 역할이 ADMIN일 때만 그림. 실제 권한은 서버가 /api/admin/**에서 다시 확인함
function AdminOnly({
  title,
  back,
  children,
}: {
  title: string;
  back?: ReactNode;
  children: ReactNode;
}) {
  const { state } = useAuth();
  if (state.status === 'authenticated' && state.member.role === 'ADMIN') return <>{children}</>;
  return (
    <div className="community-screen">
      <PageHeading title={title} back={back} />
      {state.status === 'checking' ? (
        <Loading>로그인 상태를 확인하고 있어요.</Loading>
      ) : state.status === 'authenticated' ? (
        <ErrorState
          nested
          kind="denied"
          title="관리자만 볼 수 있어요"
          message="이 계정에는 신고를 처리할 권한이 없어요."
        />
      ) : state.status === 'unavailable' ? (
        <ErrorState nested kind="offline" message={state.message} />
      ) : (
        <ErrorState nested kind="login" message="관리자 계정으로 로그인해 주세요." />
      )}
    </div>
  );
}

// 처리한 뒤 무엇이 바뀌었는지 알려 주는 문구. 이미 숨겨진 것을 확정하면 작성자 알림은 다시 가지 않음
function decisionNotice(action: Decision, status: string, kind: '글' | '댓글') {
  if (status === 'DELETED') return action === 'HIDE' ? '신고를 받아들였어요' : '신고를 기각했어요';
  if (action === 'HIDE')
    return status === 'VISIBLE'
      ? `${kind}을 숨겼어요. 작성자에게 알림을 보냈어요`
      : '숨긴 상태로 확정했어요';
  return status === 'HIDDEN' ? `${kind}을 다시 보이게 했어요` : '그대로 두고 신고를 기각했어요';
}

function DecisionButtons({
  target,
  status,
  open,
  onDone,
}: {
  target: { post: string } | { comment: number };
  status: string;
  // 처리 전 신고 수. 0이면 신고를 정리할 버튼은 두지 않음
  open: number;
  onDone: () => unknown;
}) {
  const notify = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const kind = 'post' in target ? '글' : '댓글';
  async function run(action: Decision) {
    setBusy(true);
    setError('');
    try {
      await decide(target, action);
      setConfirming(false);
      setRestoring(false);
      notify(decisionNotice(action, status, kind));
      await onDone();
    } catch (failure) {
      setConfirming(false);
      setRestoring(false);
      setError(errorText(failure, '처리하지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  }
  if (status === 'DELETED' && open === 0)
    return <p className="muted">작성자가 지웠고 처리할 신고가 없어요.</p>;
  return (
    <>
      {/* 작성자가 지운 글·댓글은 상태를 바꾸지 않고 열린 신고만 정리함 */}
      {status === 'DELETED' && (
        <p className="muted">작성자가 지웠어요. 처리하면 상태는 그대로 두고 신고만 정리해요.</p>
      )}
      <div className="admin-actions">
        {status === 'DELETED' ? (
          <>
            <button
              type="button"
              className="button coral"
              disabled={busy}
              onClick={() => void run('HIDE')}
            >
              신고 받아들이기
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void run('KEEP')}
            >
              신고 기각
            </button>
          </>
        ) : (
          <>
            {(status === 'VISIBLE' || open > 0) && (
              // 숨기기만 강조하면 결정이 그쪽으로 기울어서 유지와 같은 모양으로 둠. 빨간 버튼은 확인 창에만
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {status === 'HIDDEN' ? '숨김 확정' : '숨기기'}
              </button>
            )}
            {(status === 'HIDDEN' || open > 0) && (
              <button
                type="button"
                className="button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => (status === 'HIDDEN' ? setRestoring(true) : void run('KEEP'))}
              >
                {status === 'HIDDEN' ? '다시 보이기' : '유지'}
              </button>
            )}
          </>
        )}
      </div>
      <Alert message={error} />
      <Dialog
        open={confirming}
        title={status === 'HIDDEN' ? `숨긴 ${kind}로 확정할까요?` : `이 ${kind}을 숨길까요?`}
        onClose={() => !busy && setConfirming(false)}
      >
        <p>
          {status === 'HIDDEN'
            ? '처리 전 신고를 받아들이고 계속 숨겨요. 작성자에게 알림은 다시 가지 않아요.'
            : `다른 사람에게 보이지 않고 작성자에게 숨김 알림이 가요. 나중에 다시 보이게 할 수 있어요.`}
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            취소
          </button>
          <button
            type="button"
            className="button coral"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void run('HIDE')}
          >
            {busy ? '처리하는 중' : status === 'HIDDEN' ? '숨김 확정' : '숨기기'}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={restoring}
        title={`이 ${kind}을 다시 보이게 할까요?`}
        onClose={() => !busy && setRestoring(false)}
      >
        <p>다시 모두에게 보이고 신고는 기각으로 정리해요. 작성자에게 알림은 가지 않아요.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setRestoring(false)}
          >
            취소
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void run('KEEP')}
          >
            {busy ? '처리하는 중' : '다시 보이기'}
          </button>
        </div>
      </Dialog>
    </>
  );
}

function ReportList({ reports }: { reports: Report[] }) {
  return (
    <ul className="admin-reports">
      {reports.map((report, index) => (
        <li key={`${report.createdAt}-${index}`}>
          <strong>{REPORT_REASONS[report.reason] ?? report.reason}</strong>
          {report.detail && <p>{report.detail}</p>}
          <p className="community-meta">
            <span>{REPORT_STATUS[report.status] ?? report.status}</span>
            <time dateTime={report.createdAt}>{sentTime(report.createdAt)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}

function CommentItem({ item, onDone }: { item: ReportedComment; onDone: () => unknown }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  return (
    <li className="admin-item">
      <p className="admin-quote">{item.content}</p>
      <p className="community-meta">
        <span>{item.authorName}</span>
        <span>신고 {item.openCount}건</span>
        <span>{reasonList(item.reasons)}</span>
        <span>{POST_STATUS[item.status] ?? item.status}</span>
      </p>
      <div className="admin-links">
        <Link className="text-link" to={`/admin/posts/${item.postId}`}>
          댓글이 달린 글
        </Link>
        <Link
          className="text-link"
          to={`/admin/members/${item.authorId}?name=${encodeURIComponent(item.authorName)}`}
        >
          작성자 제재 기록
        </Link>
        {/* 버튼을 없애면 초점이 갈 곳이 사라지므로 펼친 뒤에는 접기로 바꿈 */}
        <button
          type="button"
          className="text-link"
          aria-expanded={open}
          onClick={() => {
            if (open) return setOpen(false);
            if (reports) return setOpen(true);
            fetchCommentReports(item.id).then(
              (value) => {
                setReports(value);
                setOpen(true);
              },
              (failure: unknown) => setError(errorText(failure, '신고 내용을 불러오지 못했어요.')),
            );
          }}
        >
          {open ? '신고 내용 접기' : '신고 내용 보기'}
        </button>
      </div>
      {open && reports && <ReportList reports={reports} />}
      <Alert message={error} />
      <DecisionButtons
        target={{ comment: item.id }}
        status={item.status}
        open={item.openCount}
        onDone={onDone}
      />
    </li>
  );
}

export function AdminReports() {
  type Lists = { posts: ReportedPost[]; comments: ReportedComment[] };
  const [data, setData] = useState<(Lists & { hidden: Lists }) | null>(null);
  const [error, setError] = useState<LoadProblem | null>(null);
  const { state } = useAuth();
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  const load = useCallback(
    () =>
      Promise.all([fetchReports(), fetchHidden()]).then(
        ([reports, hidden]) => {
          setData({ ...reports, hidden });
          setError(null);
        },
        (failure: unknown) => setError(loadProblem(failure, '신고를 불러오지 못했어요.')),
      ),
    [],
  );
  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);
  // 글 처리 화면에서 돌아오면 처리한 신고가 빠지도록 다시 받음
  useOnReactivate(admin ? load : undefined);
  const back = <BackLink to="/more">더보기</BackLink>;
  return (
    <AdminOnly title="신고 처리" back={back}>
      <div className="community-screen">
        <PageHeading
          title="신고 처리"
          description="신고가 5건 쌓인 글은 확인할 때까지 숨겨져요."
          back={back}
        />
        {error && data && <Alert message={error.message} />}
        {!data ? (
          error ? (
            <LoadFailure
              problem={error}
              title="신고를 찾을 수 없어요"
              onRetry={() => void load()}
            />
          ) : (
            <Loading>신고를 불러오고 있어요.</Loading>
          )
        ) : (
          <>
            <section className="admin-section">
              <h2>신고된 글 {data.posts.length}</h2>
              {data.posts.length ? (
                <ul>
                  {data.posts.map((item) => (
                    <li key={item.id} className="admin-item">
                      <Link to={`/admin/posts/${item.id}`}>
                        <strong>{item.title}</strong>
                      </Link>
                      <p className="community-meta">
                        <span>{item.authorName}</span>
                        <span>신고 {item.openCount}건</span>
                        <span>{reasonList(item.reasons)}</span>
                        <span>{POST_STATUS[item.status] ?? item.status}</span>
                        <time dateTime={item.latestAt}>{sentTime(item.latestAt)}</time>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">처리할 글 신고가 없어요.</p>
              )}
            </section>
            <section className="admin-section">
              <h2>신고된 댓글 {data.comments.length}</h2>
              {data.comments.length ? (
                <ul>
                  {data.comments.map((item) => (
                    <CommentItem key={item.id} item={item} onDone={load} />
                  ))}
                </ul>
              ) : (
                <p className="muted">처리할 댓글 신고가 없어요.</p>
              )}
            </section>
            <section className="admin-section">
              <h2>숨긴 글·댓글 {data.hidden.posts.length + data.hidden.comments.length}</h2>
              {data.hidden.posts.length + data.hidden.comments.length ? (
                <ul>
                  {data.hidden.posts.map((item) => (
                    <li key={item.id} className="admin-item">
                      <Link to={`/admin/posts/${item.id}`}>
                        <strong>{item.title}</strong>
                      </Link>
                      <p className="community-meta">
                        <span>{item.authorName}</span>
                        <time dateTime={item.latestAt}>{sentTime(item.latestAt)}</time>
                      </p>
                    </li>
                  ))}
                  {data.hidden.comments.map((item) => (
                    <CommentItem key={item.id} item={item} onDone={load} />
                  ))}
                </ul>
              ) : (
                <p className="muted">숨긴 글과 댓글이 없어요.</p>
              )}
            </section>
          </>
        )}
      </div>
    </AdminOnly>
  );
}

export function AdminPost() {
  const { id = '' } = useParams();
  const [review, setReview] = useState<PostReview | null>(null);
  const [error, setError] = useState<LoadProblem | null>(null);
  const { state } = useAuth();
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  const load = useCallback(
    () =>
      fetchPostReview(id).then(
        (value) => {
          if (!value) throw new Error('글을 불러오지 못했어요.');
          setReview(value);
          setError(null);
        },
        (failure: unknown) => setError(loadProblem(failure, '글을 불러오지 못했어요.')),
      ),
    [id],
  );
  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);
  const back = <BackLink to="/admin/reports">신고 처리</BackLink>;
  return (
    <AdminOnly title="신고된 글" back={back}>
      <div className="community-screen">
        <PageHeading title="신고된 글" back={back} />
        {error && review && <Alert message={error.message} />}
        {!review && error && (
          <LoadFailure
            nested
            problem={error}
            title="신고된 글을 찾을 수 없어요"
            onRetry={() => void load()}
          />
        )}
        {!review && !error && <Loading>글을 불러오고 있어요.</Loading>}
        {review && (
          <>
            <section className="consultation-soft-panel">
              <p className="community-meta">
                <span className="community-category">{CATEGORY_LABELS[review.post.category]}</span>
                <span>{review.post.author.displayName}</span>
                <time dateTime={review.post.createdAt}>{sentTime(review.post.createdAt)}</time>
                <span>{POST_STATUS[review.post.status] ?? review.post.status}</span>
              </p>
              <h2>{review.post.title}</h2>
              {review.post.cut && (
                <>
                  <p className="community-cut">
                    {cutTitle(review.post.cut.cutDate, review.post.cut.service)}
                  </p>
                  <p>{review.post.cut.summary}</p>
                </>
              )}
              <p className="community-content">{review.post.content}</p>
              {review.post.photoUrls.length > 0 && (
                <div className="community-photos">
                  {review.post.photoUrls.map((url, index) => (
                    <img key={url} src={url} alt={`신고된 글 사진 ${index + 1}`} />
                  ))}
                </div>
              )}
            </section>
            <section className="admin-section">
              <h2>신고 {review.reports.length}건</h2>
              <ReportList reports={review.reports} />
            </section>
            <DecisionButtons
              target={{ post: id }}
              status={review.post.status}
              open={review.reports.filter((report) => report.status === 'OPEN').length}
              onDone={load}
            />
            <Link
              className="text-link"
              to={`/admin/members/${review.authorId}?name=${encodeURIComponent(review.post.author.displayName)}`}
            >
              작성자 제재 기록
            </Link>
          </>
        )}
      </div>
    </AdminOnly>
  );
}

const DAYS: { value: number | null; label: string }[] = [
  { value: 3, label: '3일' },
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: null, label: '기간 없음' },
];

export function AdminMember() {
  const { id = '' } = useParams();
  const memberId = Number(id);
  const [search] = useSearchParams();
  const name = search.get('name');
  const [items, setItems] = useState<Sanction[] | null>(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reasonError, setReasonError] = useState('');
  const [lifting, setLifting] = useState<Sanction | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useFeedback();
  const { state } = useAuth();
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  // 서버는 관리자 자신의 제재를 거절하므로 양식 대신 이유를 보여 줌
  const self = state.status === 'authenticated' && state.member.id === String(memberId);
  const load = useCallback(
    () =>
      fetchSanctions(memberId).then(setItems, (failure: unknown) =>
        setError(errorText(failure, '제재 기록을 불러오지 못했어요.')),
      ),
    [memberId],
  );
  const active = items?.find((item) => item.active) ?? null;
  useEffect(() => {
    if (admin && Number.isSafeInteger(memberId)) void load();
  }, [admin, memberId, load]);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await sanction(memberId, days, reason.trim());
      setReason('');
      setDays(7);
      setConfirm(false);
      notify('제재했어요. 회원에게 알림을 보냈어요');
      await load();
    } catch (failure) {
      setError(errorText(failure, '제재하지 못했어요.'));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function lift() {
    if (!lifting) return;
    setBusy(true);
    setError('');
    try {
      await liftSanction(lifting.id);
      setLifting(null);
      notify('제재를 풀었어요. 바로 글과 댓글을 쓸 수 있어요');
      await load();
    } catch (failure) {
      setLifting(null);
      // 다른 관리자가 먼저 풀었으면 기록을 다시 받아 지금 상태를 보여 줌
      setError(errorText(failure, '해제하지 못했어요.'));
      await load();
    } finally {
      setBusy(false);
    }
  }
  const title = name ? `${name}님 제재 기록` : '회원 제재 기록';
  const back = <BackLink to="/admin/reports">신고 처리</BackLink>;
  if (!Number.isSafeInteger(memberId))
    return (
      <AdminOnly title={title} back={back}>
        <Missing title="회원을 찾을 수 없어요" />
      </AdminOnly>
    );
  return (
    <AdminOnly title={title} back={back}>
      <div className="community-screen">
        <PageHeading
          title={title}
          description="제재 중인 회원은 글과 댓글을 쓸 수 없어요."
          back={back}
        />
        <Alert message={error} />
        <section className="admin-section">
          <h2>기록</h2>
          {!items ? (
            !error && <Loading>제재 기록을 불러오고 있어요.</Loading>
          ) : items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="admin-item">
                  <strong>{item.reason}</strong>
                  <p className="community-meta">
                    <span>
                      {sentTime(item.createdAt)} ~{' '}
                      {item.endsAt ? sentTime(item.endsAt) : '기간 없음'}
                    </span>
                    {item.liftedAt && <span>{sentTime(item.liftedAt)} 해제</span>}
                    {item.active && <span>제재 중</span>}
                  </p>
                  {item.active && (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => setLifting(item)}
                    >
                      해제
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">제재 기록이 없어요.</p>
          )}
        </section>
        {self ? (
          <section className="admin-section">
            <h2>새 제재</h2>
            <p className="muted">내 계정은 제재할 수 없어요.</p>
          </section>
        ) : active ? (
          <section className="admin-section">
            <h2>새 제재</h2>
            <p className="muted">
              지금 제재 중이에요. 기간이나 이유를 바꾸려면 위 기록에서 해제한 뒤 다시 제재해 주세요.
            </p>
          </section>
        ) : (
          items && (
            <form
              className="admin-section"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                if (!reason.trim()) {
                  setReasonError('제재 이유를 적어 주세요.');
                  event.currentTarget
                    .querySelector<HTMLInputElement>('input[type=text], input:not([type])')
                    ?.focus();
                  return;
                }
                setError('');
                setConfirm(true);
              }}
              noValidate
            >
              <h2>새 제재</h2>
              <fieldset className="community-tabs" disabled={busy}>
                <legend>기간</legend>
                {DAYS.map((value) => (
                  <label key={value.label} className={days === value.value ? 'on' : ''}>
                    <input
                      type="radio"
                      name="days"
                      checked={days === value.value}
                      onChange={() => setDays(value.value)}
                    />
                    {value.label}
                  </label>
                ))}
              </fieldset>
              {/* 오류는 페이지 위가 아니라 이유 칸 아래에 보임(Field 공통 모양) */}
              <Field
                label="이유"
                hint="회원이 글쓰기·내 글 화면에서 그대로 봐요"
                error={reasonError}
              >
                <input
                  maxLength={200}
                  value={reason}
                  disabled={busy}
                  placeholder="예: 반복 광고"
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonError('');
                  }}
                />
              </Field>
              <button type="submit" className="button coral" disabled={busy}>
                제재
              </button>
            </form>
          )
        )}
        <Dialog
          open={confirm}
          title={name ? `${name}님을 제재할까요?` : '이 회원을 제재할까요?'}
          onClose={() => !busy && setConfirm(false)}
        >
          <p>
            {name ? `${name}님은` : '이 회원은'}{' '}
            {days === null ? '해제할 때까지' : `${days}일 동안`} 커뮤니티에 글과 댓글을 쓸 수
            없어요. 이유: {reason.trim()}
          </p>
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
              onClick={() => void submit()}
            >
              {busy ? '제재하는 중' : '제재'}
            </button>
          </div>
        </Dialog>
        <Dialog
          open={lifting !== null}
          title={name ? `${name}님의 제재를 풀까요?` : '제재를 풀까요?'}
          onClose={() => !busy && setLifting(null)}
        >
          <p>
            {name ? `${name}님은` : '이 회원은'} 바로 커뮤니티에 글과 댓글을 쓸 수 있어요. 제재
            기록은 남아요.
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setLifting(null)}
            >
              취소
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void lift()}
            >
              {busy ? '푸는 중' : '해제'}
            </button>
          </div>
        </Dialog>
      </div>
    </AdminOnly>
  );
}

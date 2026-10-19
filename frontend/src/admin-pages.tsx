import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Alert, BackLink, Missing, PageHeading } from './components';
import { Dialog } from './dialog';
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
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : (
        <Missing title="관리자만 볼 수 있어요" message="관리자 계정으로 로그인해 주세요." />
      )}
    </div>
  );
}

function DecisionButtons({
  target,
  status,
  onDone,
}: {
  target: { post: string } | { comment: number };
  status: string;
  onDone: () => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: Decision) {
    setBusy(true);
    setError('');
    try {
      await decide(target, action);
      await onDone();
    } catch (failure) {
      setError(errorText(failure, '처리하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {/* 작성자가 지운 글·댓글은 상태를 바꾸지 않고 열린 신고만 정리함 */}
      {status === 'DELETED' && (
        <p className="muted">작성자가 지웠어요. 처리하면 상태는 그대로 두고 신고만 정리해요.</p>
      )}
      <div className="admin-actions">
        <button
          type="button"
          className="button coral"
          disabled={busy}
          onClick={() => void run('HIDE')}
        >
          {status === 'DELETED' ? '신고 받아들이기' : '숨기기'}
        </button>
        <button type="button" className="button" disabled={busy} onClick={() => void run('KEEP')}>
          {status === 'DELETED' ? '신고 기각' : status === 'HIDDEN' ? '다시 보이기' : '유지'}
        </button>
      </div>
      <Alert message={error} />
    </>
  );
}

function ReportList({ reports }: { reports: Report[] }) {
  return (
    <ul className="admin-reports">
      {reports.map((report, index) => (
        <li key={`${report.createdAt}-${index}`}>
          <strong>{REPORT_REASONS[report.reason] ?? report.reason}</strong>
          {report.detail && <span> · {report.detail}</span>}
          <small>
            {REPORT_STATUS[report.status] ?? report.status} · {sentTime(report.createdAt)}
          </small>
        </li>
      ))}
    </ul>
  );
}

function CommentItem({ item, onDone }: { item: ReportedComment; onDone: () => unknown }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  return (
    <li className="admin-item">
      <p className="admin-quote">{item.content}</p>
      <p className="community-meta">
        {item.authorName} · 신고 {item.openCount}건 · {reasonList(item.reasons)} ·{' '}
        {POST_STATUS[item.status] ?? item.status}
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
        {!reports && (
          <button
            type="button"
            className="text-link"
            onClick={() =>
              fetchCommentReports(item.id).then(setReports, (failure: unknown) =>
                setError(errorText(failure, '신고 내용을 불러오지 못했어요.')),
              )
            }
          >
            신고 내용 보기
          </button>
        )}
      </div>
      {reports && <ReportList reports={reports} />}
      <Alert message={error} />
      <DecisionButtons target={{ comment: item.id }} status={item.status} onDone={onDone} />
    </li>
  );
}

export function AdminReports() {
  const [data, setData] = useState<{ posts: ReportedPost[]; comments: ReportedComment[] } | null>(
    null,
  );
  const [error, setError] = useState('');
  const { state } = useAuth();
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  const load = useCallback(
    () =>
      fetchReports().then(
        (value) => {
          setData(value);
          setError('');
        },
        (failure: unknown) => setError(errorText(failure, '신고를 불러오지 못했어요.')),
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
          description="처리 전 신고가 있는 글과 댓글이에요. 신고가 5건 쌓이면 확인 전까지 자동으로 숨겨져요."
          back={back}
        />
        <Alert message={error} />
        {!data ? (
          !error && <p role="status">신고를 불러오고 있어요.</p>
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
                        {item.authorName} · 신고 {item.openCount}건 · {reasonList(item.reasons)} ·{' '}
                        {POST_STATUS[item.status] ?? item.status} · {sentTime(item.latestAt)}
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
          </>
        )}
      </div>
    </AdminOnly>
  );
}

export function AdminPost() {
  const { id = '' } = useParams();
  const [review, setReview] = useState<PostReview | null>(null);
  const [error, setError] = useState('');
  const { state } = useAuth();
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  const load = useCallback(
    () =>
      fetchPostReview(id).then(
        (value) => {
          setReview(value);
          setError('');
        },
        (failure: unknown) => setError(errorText(failure, '글을 불러오지 못했어요.')),
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
        <Alert message={error} />
        {review && (
          <>
            <section className="consultation-soft-panel">
              <p className="community-meta">
                <span className="community-category">{CATEGORY_LABELS[review.post.category]}</span>
                {review.post.author.displayName} · {sentTime(review.post.createdAt)} ·{' '}
                {POST_STATUS[review.post.status] ?? review.post.status}
              </p>
              <h2>{review.post.title}</h2>
              {review.post.cut && (
                <p className="community-cut">
                  {cutTitle(review.post.cut.cutDate, review.post.cut.service)} ·{' '}
                  {review.post.cut.summary}
                </p>
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
            <DecisionButtons target={{ post: id }} status={review.post.status} onDone={load} />
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
  const [busy, setBusy] = useState(false);
  const { state } = useAuth();
  const admin = state.status === 'authenticated' && state.member.role === 'ADMIN';
  const load = useCallback(
    () =>
      fetchSanctions(memberId).then(setItems, (failure: unknown) =>
        setError(errorText(failure, '제재 기록을 불러오지 못했어요.')),
      ),
    [memberId],
  );
  useEffect(() => {
    if (admin && Number.isSafeInteger(memberId)) void load();
  }, [admin, memberId, load]);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await sanction(memberId, days, reason.trim());
      setReason('');
      setConfirm(false);
      await load();
    } catch (failure) {
      setError(errorText(failure, '제재하지 못했어요.'));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function lift(sanctionId: number) {
    setBusy(true);
    setError('');
    try {
      await liftSanction(sanctionId);
      await load();
    } catch (failure) {
      setError(errorText(failure, '해제하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }
  const title = name ? `${name}님 제재 기록` : '회원 제재 기록';
  const back = <BackLink to="/admin/reports">신고 처리</BackLink>;
  if (!Number.isSafeInteger(memberId)) return <Missing title="회원을 찾을 수 없어요" />;
  return (
    <AdminOnly title={title} back={back}>
      <div className="community-screen">
        <PageHeading
          title={title}
          description="제재 중에는 커뮤니티 글과 댓글을 쓸 수 없어요. 해제해도 기록은 남아요."
          back={back}
        />
        <Alert message={error} />
        <section className="admin-section">
          <h2>기록</h2>
          {!items ? (
            !error && <p role="status">제재 기록을 불러오고 있어요.</p>
          ) : items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="admin-item">
                  <strong>{item.reason}</strong>
                  <p className="community-meta">
                    {sentTime(item.createdAt)} ~ {item.endsAt ? sentTime(item.endsAt) : '기간 없음'}
                    {item.liftedAt && ` · ${sentTime(item.liftedAt)} 해제`}
                    {item.active && ' · 제재 중'}
                  </p>
                  {item.active && (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void lift(item.id)}
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
        <form
          className="admin-section"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!reason.trim()) {
              setError('제재 이유를 적어 주세요.');
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
          <label className="consultation-request-field">
            <span>이유</span>
            <input
              className="admin-input"
              maxLength={200}
              value={reason}
              disabled={busy}
              placeholder="예: 반복 광고"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button type="submit" className="button coral" disabled={busy}>
            제재
          </button>
        </form>
        <Dialog
          open={confirm}
          title="이 회원을 제재할까요?"
          onClose={() => !busy && setConfirm(false)}
        >
          <p>
            {DAYS.find((value) => value.value === days)?.label} 동안 커뮤니티 글과 댓글을 쓸 수
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
      </div>
    </AdminOnly>
  );
}

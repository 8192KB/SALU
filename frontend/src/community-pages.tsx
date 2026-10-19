import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Alert, BackLink, Icon, Missing, PageHeading, PhotoThumbnail } from './components';
import { Completion } from './completion';
import { Dialog } from './dialog';
import { Link, useNavigate, useWorkspace } from './workspace';
import { useAuth } from './auth/context';
import { useLoginPath } from './auth/pages';
import type { SessionMember } from './auth/api';
import { usePrototype } from './prototype/context';
import { cutTitle, sentTime } from './prototype/dates';
import { newId } from './prototype/ids';
import { useOnReactivate } from './realtime';
import {
  CATEGORY_LABELS,
  REPORT_REASONS,
  addComment,
  createPost,
  deleteComment,
  deletePost,
  getPost,
  listComments,
  listMyPosts,
  listPosts,
  report,
  setReaction,
  updatePost,
} from './community-api';
import type {
  CommunityComment,
  CommunityPost,
  CommunityPostSummary,
  PostCategory,
  ReportReason,
} from './community-api';

const PAGE_SIZE = 30;
const MAX_PHOTOS = 3;

function useMember(): SessionMember | null {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.member : null;
}
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function PostCard({ post }: { post: CommunityPostSummary }) {
  const body = (
    <>
      <div>
        <span className="community-category">{CATEGORY_LABELS[post.category]}</span>
        {post.status === 'HIDDEN' && <span className="community-hidden">숨김 · 신고 검토 중</span>}
        <h2>{post.title}</h2>
        <p>{post.excerpt}</p>
        {post.cut && (
          <p className="community-cut">{cutTitle(post.cut.cutDate, post.cut.service)}</p>
        )}
        <p className="community-meta">
          {post.author.displayName} · {sentTime(post.createdAt)} · 도움돼요 {post.reactionCount} ·
          댓글 {post.commentCount}
        </p>
      </div>
      {post.photoUrl && (
        <div className="community-thumb">
          <PhotoThumbnail src={post.photoUrl} alt="" />
          {post.photoCount > 1 && <span>+{post.photoCount - 1}</span>}
        </div>
      )}
    </>
  );
  // 숨겨진 내 글은 공개 상세가 없어 눌러도 열리지 않게 함
  return post.status === 'VISIBLE' ? (
    <Link className="community-card" to={`/community/${post.id}`}>
      {body}
    </Link>
  ) : (
    <div className="community-card hidden">{body}</div>
  );
}

export function CommunityList() {
  const member = useMember();
  const [search, setSearch] = useSearchParams();
  const category = (search.get('category') as PostCategory | null) ?? undefined;
  const service = search.get('service') ?? undefined;
  const q = search.get('q') ?? undefined;
  const [items, setItems] = useState<CommunityPostSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(q ?? '');
  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      try {
        const next = await listPosts({ category, service, q, before });
        setItems((previous) => (before && previous ? [...previous, ...next] : next));
        setHasMore(next.length === PAGE_SIZE);
        setError('');
      } catch (failure) {
        setError(errorText(failure, '글을 불러오지 못했어요.'));
      } finally {
        setBusy(false);
      }
    },
    [category, service, q],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useOnReactivate(() => load());
  const change = (key: string, value?: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearch(next, { replace: true });
  };
  return (
    <div className="community-screen">
      <PageHeading
        title="커뮤니티"
        description="커트 사례와 고민을 나누고 다른 사람의 경험을 참고해 보세요."
        back={<BackLink to="/more">더보기</BackLink>}
        action={
          <Link className="button primary" to="/community/new">
            글쓰기
          </Link>
        }
      />
      <div className="community-tabs" role="group" aria-label="분류">
        {([undefined, 'CASE', 'QUESTION'] as const).map((value) => (
          <button
            key={value ?? 'ALL'}
            type="button"
            aria-pressed={category === value}
            onClick={() => change('category', value)}
          >
            {value ? CATEGORY_LABELS[value] : '전체'}
          </button>
        ))}
      </div>
      <form
        className="community-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          change('q', query.trim().slice(0, 50) || undefined);
        }}
      >
        <input
          type="search"
          aria-label="검색어"
          placeholder="예: 옆머리"
          maxLength={50}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="button">
          검색
        </button>
      </form>
      {service && (
        <button type="button" className="chip community-filter" onClick={() => change('service')}>
          시술 · {service} <span aria-hidden="true">×</span>
          <span className="sr-only">조건 지우기</span>
        </button>
      )}
      {member && (
        <Link className="text-link community-mine-link" to="/community/mine">
          내 글 보기 <Icon name="arrow" size={16} />
        </Link>
      )}
      <Alert message={error} />
      {!items ? (
        !error && <p role="status">글을 불러오고 있어요.</p>
      ) : items.length ? (
        <div className="community-list">
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <section className="consultation-soft-panel">
          <h2>{q || service || category ? '찾는 글이 없어요' : '아직 올라온 글이 없어요'}</h2>
          <p>
            {q || service || category
              ? '검색어나 분류를 바꿔 보세요.'
              : '내 커트 기록을 사례로 올리거나 궁금한 점을 물어보세요.'}
          </p>
        </section>
      )}
      {hasMore && items && (
        <button
          type="button"
          className="button full"
          disabled={busy}
          onClick={() => void load(items.at(-1)?.id)}
        >
          {busy ? '불러오는 중' : '더 보기'}
        </button>
      )}
    </div>
  );
}

function ReportDialog({
  target,
  onClose,
}: {
  target: { post: string } | { comment: number } | null;
  onClose: () => void;
}) {
  const member = useMember();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // 부모가 그릴 때마다 대상 객체가 새로 만들어지므로 실제 대상이 바뀔 때만 입력을 비움
  const targetKey = target ? JSON.stringify(target) : '';
  useEffect(() => {
    setReason('');
    setDetail('');
    setError('');
    setDone(false);
  }, [targetKey]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || !target) return;
    if (!reason || (reason === 'OTHER' && !detail.trim())) {
      setError(!reason ? '신고 이유를 골라 주세요.' : '기타 이유를 적어 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await report(member, target, reason, detail.trim());
      setDone(true);
    } catch (failure) {
      setError(errorText(failure, '신고하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={target !== null}
      title={done ? '신고했어요' : '신고할까요?'}
      onClose={() => !busy && onClose()}
    >
      {done ? (
        <>
          <p>관리자가 확인한 뒤 처리해요. 신고가 쌓이면 확인 전까지 자동으로 숨겨져요.</p>
          <div className="dialog-actions">
            <button type="button" className="button primary" onClick={onClose}>
              확인
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <fieldset className="community-reasons" disabled={busy}>
            <legend>신고 이유</legend>
            {(Object.keys(REPORT_REASONS) as ReportReason[]).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => {
                    setReason(value);
                    setError('');
                  }}
                />
                {REPORT_REASONS[value]}
              </label>
            ))}
          </fieldset>
          {reason === 'OTHER' && (
            <label className="consultation-request-field">
              <span>기타 이유</span>
              <textarea
                maxLength={200}
                rows={2}
                value={detail}
                disabled={busy}
                onChange={(event) => setDetail(event.target.value)}
              />
            </label>
          )}
          <Alert message={error} />
          <div className="dialog-actions">
            <button type="button" className="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button type="submit" className="button coral" disabled={busy} aria-busy={busy}>
              {busy ? '신고하는 중' : '신고'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function Comments({ post, onCount }: { post: CommunityPost; onCount: (count: number) => void }) {
  const member = useMember();
  const loginPath = useLoginPath();
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ comment: number } | null>(null);
  const [removing, setRemoving] = useState<CommunityComment | null>(null);
  // 응답을 못 받은 댓글을 같은 내용으로 다시 보낼 때 한 번만 저장되게 같은 키를 씀
  const pending = useRef<{ key: string; content: string } | null>(null);
  const loadComments = useCallback(
    () =>
      listComments(post.id).then(setComments, (failure: unknown) =>
        setError(errorText(failure, '댓글을 불러오지 못했어요.')),
      ),
    [post.id],
  );
  useEffect(() => {
    void loadComments();
  }, [loadComments]);
  useOnReactivate(loadComments);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || busy) return;
    const content = draft.trim();
    if (!content) {
      setError('댓글을 적어 주세요.');
      return;
    }
    if (pending.current?.content !== content) pending.current = { key: newId(), content };
    setBusy(true);
    setError('');
    try {
      const saved = await addComment(member, post.id, pending.current.key, content);
      pending.current = null;
      setComments((value) => {
        const next = [...(value ?? []).filter((item) => item.id !== saved.id), saved];
        onCount(next.length);
        return next;
      });
      setDraft('');
    } catch (failure) {
      setError(errorText(failure, '댓글을 보내지 못했어요. 적은 내용은 그대로 있어요.'));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!member || !removing) return;
    setBusy(true);
    try {
      await deleteComment(member, removing.id);
      setComments((value) => {
        const next = (value ?? []).filter((item) => item.id !== removing.id);
        onCount(next.length);
        return next;
      });
      setRemoving(null);
    } catch (failure) {
      setError(errorText(failure, '댓글을 지우지 못했어요.'));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="community-comments">
      <h2>댓글 {comments?.length ?? post.commentCount}</h2>
      {comments?.length ? (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id}>
              <div className="community-comment-head">
                <strong>{comment.author.displayName}</strong>
                <time dateTime={comment.createdAt}>{sentTime(comment.createdAt)}</time>
              </div>
              <p>{comment.content}</p>
              {member &&
                (comment.mine ? (
                  <button type="button" className="text-link" onClick={() => setRemoving(comment)}>
                    지우기
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setReportTarget({ comment: comment.id })}
                  >
                    신고
                  </button>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        comments && <p className="muted">첫 댓글을 남겨 보세요.</p>
      )}
      {member ? (
        <form className="community-comment-form" onSubmit={submit} noValidate>
          <label className="consultation-request-field">
            <span className="sr-only">댓글</span>
            <textarea
              aria-label="댓글"
              maxLength={1000}
              rows={2}
              placeholder="예: 저도 옆머리가 떠서 고민이었어요."
              value={draft}
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                setError('');
              }}
            />
          </label>
          <Alert message={error} />
          <button type="submit" className="button primary" disabled={busy} aria-busy={busy}>
            {busy ? '보내는 중' : '댓글 남기기'}
          </button>
        </form>
      ) : (
        <p className="muted">
          <Link to={loginPath}>로그인</Link>하면 댓글을 남길 수 있어요.
        </p>
      )}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
      <Dialog
        open={removing !== null}
        title="댓글을 지울까요?"
        onClose={() => !busy && setRemoving(null)}
      >
        <p>지운 댓글은 되돌릴 수 없어요.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            취소
          </button>
          <button
            type="button"
            className="button coral"
            disabled={busy}
            onClick={() => void remove()}
          >
            지우기
          </button>
        </div>
      </Dialog>
    </section>
  );
}

export function CommunityDetail() {
  const { id = '' } = useParams();
  const member = useMember();
  const loginPath = useLoginPath();
  const navigate = useNavigate();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      getPost(id).then(
        (value) => {
          setPost(value);
          setLoadError('');
        },
        (failure: unknown) => setLoadError(errorText(failure, '글을 불러오지 못했어요.')),
      ),
    [id],
  );
  // 로그인 여부에 따라 도움돼요·내 글 표시가 달라 계정이 바뀌면 다시 받음
  useEffect(() => {
    void load();
  }, [load, member?.id]);
  // 글을 고치고 돌아오면 숨겨져 있던 이 화면이 다시 보이므로 새로 받음
  useOnReactivate(load);
  const back = <BackLink to="/community">커뮤니티</BackLink>;
  if (!post)
    return loadError ? (
      <div className="community-screen">
        <PageHeading title="커뮤니티 글" back={back} />
        <Missing title="글을 찾을 수 없어요" message={loadError} />
      </div>
    ) : (
      <p role="status">글을 불러오고 있어요.</p>
    );
  async function react() {
    if (!post || busy) return;
    const on = !post.reacted;
    setBusy(true);
    setError('');
    setPost({ ...post, reacted: on, reactionCount: post.reactionCount + (on ? 1 : -1) });
    try {
      await setReaction(post.id, on);
    } catch (failure) {
      setPost(post);
      setError(errorText(failure, '도움돼요를 바꾸지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!member || !post) return;
    setBusy(true);
    try {
      await deletePost(member, post.id);
      navigate('/community', { replace: true });
    } catch (failure) {
      setError(errorText(failure, '글을 지우지 못했어요.'));
      setRemoving(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="community-screen">
      <PageHeading title={post.title} back={back} />
      <p className="community-meta">
        <span className="community-category">{CATEGORY_LABELS[post.category]}</span>
        {post.author.displayName} · {sentTime(post.createdAt)}
        {post.updatedAt !== post.createdAt && ' · 고침'}
      </p>
      {post.cut && (
        <section className="consultation-soft-panel community-cut-panel">
          <h2>{cutTitle(post.cut.cutDate, post.cut.service)}</h2>
          <p>{post.cut.summary}</p>
          <Link
            className="text-link"
            to={`/community?service=${encodeURIComponent(post.cut.service)}`}
          >
            {post.cut.service} 글 더 보기 <Icon name="arrow" size={16} />
          </Link>
        </section>
      )}
      {post.photoUrls.length > 0 && (
        <div className="community-photos">
          {post.photoUrls.map((url, index) => (
            <img key={url} src={url} alt={`${post.title} 사진 ${index + 1}`} />
          ))}
        </div>
      )}
      <p className="community-content">{post.content}</p>
      <div className="community-actions">
        {member ? (
          <button
            type="button"
            className="button community-reaction"
            aria-pressed={post.reacted}
            disabled={busy}
            onClick={() => void react()}
          >
            <Icon name="heart" size={18} /> 도움돼요 {post.reactionCount}
          </button>
        ) : (
          <Link className="button community-reaction" to={loginPath}>
            <Icon name="heart" size={18} /> 도움돼요 {post.reactionCount}
          </Link>
        )}
        {post.mine ? (
          <>
            <Link className="button" to={`/community/${post.id}/edit`}>
              고치기
            </Link>
            <button type="button" className="button" onClick={() => setRemoving(true)}>
              지우기
            </button>
          </>
        ) : (
          member && (
            <button type="button" className="text-link" onClick={() => setReporting(true)}>
              신고
            </button>
          )
        )}
      </div>
      <Alert message={error} />
      <Comments
        post={post}
        onCount={(count) => setPost((value) => value && { ...value, commentCount: count })}
      />
      <ReportDialog
        target={reporting ? { post: post.id } : null}
        onClose={() => setReporting(false)}
      />
      <Dialog open={removing} title="글을 지울까요?" onClose={() => !busy && setRemoving(false)}>
        <p>지운 글과 댓글은 커뮤니티에서 보이지 않고 되돌릴 수 없어요.</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setRemoving(false)}
          >
            취소
          </button>
          <button
            type="button"
            className="button coral"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? '지우는 중' : '지우기'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

// 기록에서 고른 커트의 한 줄 설명. 상담 첨부와 같은 순서로 정함
function summaryOf(
  cut: { goodNote: string },
  progress: { discomfort: string; observedOn: string }[],
) {
  const latest = [...progress].sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0];
  return cut.goodNote || latest?.discomfort || '커트한 날의 기록';
}

export function CommunityWrite() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [search] = useSearchParams();
  const member = useMember();
  const { state: auth } = useAuth();
  const loginPath = useLoginPath();
  const example = useWorkspace() === 'example';
  const navigate = useNavigate();
  const { state } = usePrototype();
  const recordParam = search.get('record');
  const [category, setCategory] = useState<PostCategory>(
    recordParam || search.get('category') !== 'QUESTION' ? 'CASE' : 'QUESTION',
  );
  const [cutId, setCutId] = useState(
    recordParam && state.cuts.some((cut) => cut.id === recordParam) ? recordParam : '',
  );
  const [summary, setSummary] = useState('');
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(!editing);
  const pending = useRef<{ key: string; payload: string } | null>(null);
  const cut = state.cuts.find((value) => value.id === cutId);
  const progress = state.progress.filter((value) => value.cutId === cutId);
  const photos = state.photos.filter((photo) => photo.cutId === cutId);
  useEffect(() => {
    // 기록을 바꾸면 그 기록의 설명으로 채우고 고른 사진은 비움. 사진은 사용자가 직접 고름
    if (!cut) return;
    setSummary(summaryOf(cut, progress));
    setPhotoIds([]);
  }, [cutId]);
  useEffect(() => {
    if (!editing || !id) return;
    getPost(id).then(
      (post) => {
        if (!post.mine) {
          setLoadError('내가 쓴 글만 고칠 수 있어요.');
          return;
        }
        setCategory(post.category);
        setTitle(post.title);
        setContent(post.content);
        setLoaded(true);
      },
      (failure: unknown) => setLoadError(errorText(failure, '글을 불러오지 못했어요.')),
    );
  }, [editing, id]);
  const back = editing ? (
    <BackLink to={`/community/${id}`}>커뮤니티 글</BackLink>
  ) : (
    <BackLink to="/community">커뮤니티</BackLink>
  );
  const heading = (
    <PageHeading
      title={editing ? '글 고치기' : '글쓰기'}
      description={editing ? '제목과 내용만 고칠 수 있어요.' : undefined}
      back={back}
    />
  );
  if (example || auth.status !== 'authenticated' || !member)
    return (
      <div className="community-screen">
        {heading}
        <section className="consultation-soft-panel">
          <h2>{example ? '예시 체험에서는 글을 올릴 수 없어요' : '로그인이 필요해요'}</h2>
          <p>로그인하면 내 커트 기록을 사례로 올리거나 고민을 물어볼 수 있어요.</p>
          {!example && (
            <Link className="button primary" to={loginPath}>
              로그인
            </Link>
          )}
        </section>
      </div>
    );
  if (loadError) return <Missing title="글을 고칠 수 없어요" message={loadError} />;
  if (!loaded) return <p role="status">글을 불러오고 있어요.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !member) return;
    const values = { title: title.trim(), content: content.trim() };
    if (!values.title || !values.content) {
      setError(!values.title ? '제목을 적어 주세요.' : '내용을 적어 주세요.');
      return;
    }
    if (!editing && category === 'CASE' && !cut) {
      setError('사례로 올릴 커트 기록을 골라 주세요.');
      return;
    }
    if (!editing && cut && !summary.trim()) {
      setError('커트 설명을 적어 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing && id) {
        await updatePost(member, id, values);
        navigate(`/community/${id}`, { replace: true });
        return;
      }
      const input = {
        category,
        ...values,
        cut: cut ? { cutDate: cut.cutDate, service: cut.service, summary: summary.trim() } : null,
      };
      // 내용을 바꿔 다시 올리면 새 글이고, 같은 내용을 다시 보내면 같은 글로 처리되게 키를 정함
      const payload = JSON.stringify({ input, photoIds });
      if (pending.current?.payload !== payload) pending.current = { key: newId(), payload };
      let blobs: Blob[];
      try {
        blobs = await Promise.all(
          photoIds.map(async (photoId) => {
            const photo = photos.find((value) => value.id === photoId)!;
            return (await fetch(photo.url)).blob();
          }),
        );
      } catch {
        throw new Error('고른 사진을 읽지 못했어요. 기록 화면을 새로고침한 뒤 다시 올려 주세요.');
      }
      const saved = await createPost(member, { requestKey: pending.current.key, ...input }, blobs);
      navigate(`/community/${saved.id}/complete`, { replace: true, state: { celebrate: true } });
    } catch (failure) {
      setError(errorText(failure, '글을 올리지 못했어요. 적은 내용은 그대로 있어요.'));
    } finally {
      setBusy(false);
    }
  }
  const cuts = [...state.cuts].sort((a, b) => b.cutDate.localeCompare(a.cutDate));
  return (
    <div className="community-screen">
      {heading}
      <form className="community-form" onSubmit={submit} noValidate>
        {!editing && (
          <>
            <fieldset className="community-tabs" disabled={busy}>
              <legend>분류</legend>
              {(['CASE', 'QUESTION'] as const).map((value) => (
                <label key={value} className={category === value ? 'on' : ''}>
                  <input
                    type="radio"
                    name="category"
                    checked={category === value}
                    onChange={() => {
                      setCategory(value);
                      setError('');
                    }}
                  />
                  {CATEGORY_LABELS[value]}
                </label>
              ))}
            </fieldset>
            <fieldset className="consultation-choices community-records" disabled={busy}>
              <legend>
                {category === 'CASE' ? '사례로 올릴 커트 기록' : '함께 보여 줄 커트 기록(선택)'}
              </legend>
              {category === 'QUESTION' && (
                <label className={`consultation-choice${cutId === '' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="record"
                    checked={cutId === ''}
                    onChange={() => setCutId('')}
                  />
                  <span>기록 없이 쓰기</span>
                  <span className="consultation-choice-mark" aria-hidden="true">
                    {cutId === '' && <Icon name="check" size={16} />}
                  </span>
                </label>
              )}
              {cuts.length ? (
                cuts.map((value) => (
                  <label
                    key={value.id}
                    className={`consultation-choice${cutId === value.id ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="record"
                      checked={cutId === value.id}
                      onChange={() => {
                        setCutId(value.id);
                        setError('');
                      }}
                    />
                    <span>
                      <strong>{cutTitle(value.cutDate, value.service)}</strong>
                      <small>{value.goodNote || value.salonName}</small>
                    </span>
                    <span className="consultation-choice-mark" aria-hidden="true">
                      {cutId === value.id && <Icon name="check" size={16} />}
                    </span>
                  </label>
                ))
              ) : (
                <p className="muted">
                  아직 커트 기록이 없어요. <Link to="/records/new">기록부터 남기기</Link>
                </p>
              )}
            </fieldset>
            {cut && (
              <>
                <label className="consultation-request-field">
                  <span>커트 설명</span>
                  <textarea
                    maxLength={2000}
                    rows={2}
                    value={summary}
                    disabled={busy}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </label>
                {photos.length > 0 && (
                  <fieldset className="community-photo-choices" disabled={busy}>
                    <legend>
                      올릴 사진 <small>{MAX_PHOTOS}장까지, 고른 사진만 공개돼요</small>
                    </legend>
                    <div>
                      {photos.map((photo, index) => {
                        const checked = photoIds.includes(photo.id);
                        return (
                          <label key={photo.id} className={checked ? 'selected' : ''}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && photoIds.length >= MAX_PHOTOS}
                              onChange={() =>
                                setPhotoIds((value) =>
                                  checked
                                    ? value.filter((item) => item !== photo.id)
                                    : [...value, photo.id],
                                )
                              }
                            />
                            <img src={photo.url} alt={photo.caption || `사진 ${index + 1}`} />
                            <span className="consultation-choice-mark" aria-hidden="true">
                              {checked && <Icon name="check" size={14} />}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="consultation-privacy">
                      얼굴이 나온 사진은 가려지지 않으니 올리기 전에 한 번 더 확인해 주세요.
                    </p>
                  </fieldset>
                )}
              </>
            )}
          </>
        )}
        <label className="consultation-request-field">
          <span>제목</span>
          <input
            maxLength={100}
            value={title}
            disabled={busy}
            placeholder="예: 옆머리 숱 정리 후기"
            onChange={(event) => {
              setTitle(event.target.value);
              setError('');
            }}
          />
        </label>
        <label className="consultation-request-field">
          <span>내용</span>
          <textarea
            maxLength={5000}
            rows={6}
            value={content}
            disabled={busy}
            placeholder="예: 옆머리가 뜨는 분들 참고하세요. 드라이할 때 아래로 눌러 말리니 덜 떠요."
            onChange={(event) => {
              setContent(event.target.value);
              setError('');
            }}
          />
        </label>
        <Alert message={error} />
        <div className="consultation-action">
          {!editing && (
            <p className="consultation-privacy">글은 로그인하지 않은 사람도 볼 수 있어요.</p>
          )}
          <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
            {busy ? '올리는 중' : editing ? '고친 글 저장' : '글 올리기'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CommunityComplete() {
  const { id = '' } = useParams();
  return (
    <div className="consultation-sent">
      <Completion
        title="글을 올렸어요"
        description="커뮤니티에서 다른 사람이 볼 수 있어요. 댓글이 달리면 알림으로 알려 드려요."
        primary="올린 글 보기"
        to={`/community/${id}`}
        secondary="커뮤니티로"
        secondaryTo="/community"
      >
        {null}
      </Completion>
    </div>
  );
}

export function MyPosts() {
  const member = useMember();
  const loginPath = useLoginPath();
  const [items, setItems] = useState<CommunityPostSummary[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!member) return;
    return listMyPosts(member).then(setItems, (failure: unknown) =>
      setError(errorText(failure, '내 글을 불러오지 못했어요.')),
    );
    // 로그인 확인 때마다 회원 객체가 새로 만들어지므로 계정 ID로만 다시 받음
  }, [member?.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useOnReactivate(load);
  return (
    <div className="community-screen">
      <PageHeading title="내 글" back={<BackLink to="/community">커뮤니티</BackLink>} />
      {!member ? (
        <section className="consultation-soft-panel">
          <h2>로그인이 필요해요</h2>
          <Link className="button primary" to={loginPath}>
            로그인
          </Link>
        </section>
      ) : error ? (
        <Alert message={error} />
      ) : !items ? (
        <p role="status">내 글을 불러오고 있어요.</p>
      ) : items.length ? (
        <div className="community-list">
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <section className="consultation-soft-panel">
          <h2>아직 올린 글이 없어요</h2>
          <Link className="button" to="/community/new">
            글쓰기
          </Link>
        </section>
      )}
    </div>
  );
}

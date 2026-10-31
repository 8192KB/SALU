import type { ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { Icon, Missing, SuccessMark } from './components';
import { PhotoButton } from './fields';
import { PhotoPlaceholder } from './components';
import { stepsBackTo } from './back-trail';
import { Link, scopedTo, useNavigate, useWorkspace } from './workspace';
import { usePrototype } from './prototype/context';
import { useDirectory } from './directory';
import { cutTitle, displayDate } from './prototype/dates';

export function Completion({
  title,
  children,
  primary,
  to,
  secondary,
  secondaryTo,
  description,
  after,
}: {
  title: string;
  children: ReactNode;
  primary: string;
  to: string;
  secondary?: string;
  secondaryTo?: string;
  description?: string;
  // 주 버튼·보조 링크 다음에 둘 덜 중요한 동작
  after?: ReactNode;
}) {
  const location = useLocation();
  const mode = useWorkspace();
  const navigate = useNavigate();
  const { storage } = usePrototype();
  // 예시 체험은 제목만으로 결과가 분명해 '저장했어요'를 덧붙이지 않음. 로그인한 계정 공간은 저장 뒤
  // 자동으로 서버에 올리므로 올리는 중임을, 로그인 전 공간은 이 기기에만 있음을 알림
  const note =
    description ??
    (mode === 'example'
      ? undefined
      : storage && storage.scope !== 'guest'
        ? '이 기기에 저장했고 계정에도 자동으로 올려요.'
        : '이 기기에만 저장했어요. 로그인하면 계정에도 보관할 수 있어요.');
  return (
    <section className="preparation-complete" aria-label="저장 결과">
      <SuccessMark className="completion-check" celebrate={Boolean(location.state?.celebrate)} />
      <h1 tabIndex={-1}>{title}</h1>
      {note && <p className="completion-description">{note}</p>}
      {children}
      <Link
        className="button primary full"
        to={to}
        replace
        onClick={(event) => {
          // 고치기 전 화면으로 돌아가면 같은 화면이 기록에 두 번 남지 않게 뒤로 감
          const steps = stepsBackTo(scopedTo(to, mode) as string);
          if (!steps || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          navigate(-steps);
        }}
      >
        {primary} <Icon name="arrow" />
      </Link>
      {secondary && secondaryTo && (
        <Link className="text-link" to={secondaryTo}>
          {secondary}
        </Link>
      )}
      {after}
    </section>
  );
}
export function RecordComplete() {
  const { id, progressId } = useParams();
  const { state } = usePrototype();
  const directory = useDirectory(state);
  const location = useLocation();
  const cut = state.cuts.find((value) => value.id === id);
  const progress = state.progress.find((value) => value.cutId === id && value.id === progressId);
  if (!cut || (progressId && !progress)) return <Missing title="저장한 기록을 찾을 수 없어요" />;
  const photo = state.photos.find((value) => value.cutId === id && value.progressId === progressId);
  const edited = location.state?.operation === 'update';
  const consult = directory.designers.find((value) => value.id === location.state?.consult);
  // 담당으로 연결된 디자이너면 바로 상담 신청, 아니면 그 디자이너 프로필에서 이 기록으로 이어 감
  const share = Boolean(location.state?.share) && !progress && !consult;
  const consultTo = consult
    ? cut.designerProfileId === consult.id
      ? `/consultations/new?${new URLSearchParams({ designer: consult.id, record: cut.id })}`
      : `/designers/${consult.id}?${new URLSearchParams({ record: cut.id })}`
    : '';
  return (
    <Completion
      title={
        progress
          ? edited
            ? '경과 기록을 수정했어요'
            : '경과를 추가했어요'
          : edited
            ? '커트 기록을 수정했어요'
            : '커트 기록을 남겼어요'
      }
      primary={
        consult && !progress
          ? `${consult.name} 디자이너에게 상담 신청`
          : share
            ? '이 기록으로 사례 글 쓰기'
            : progress
              ? '기록과 경과 보기'
              : '기록 보기'
      }
      to={
        consult && !progress
          ? consultTo
          : share
            ? `/community/new?${new URLSearchParams({ record: cut.id })}`
            : `/records/${id}`
      }
      secondary={(consult && !progress) || share ? '기록 보기' : '내 기록으로'}
      secondaryTo={(consult && !progress) || share ? `/records/${id}` : '/records'}
    >
      <div className="completed-summary">
        <div className="prepared-cut-photo">
          {photo ? <PhotoButton photo={photo} cutDate={cut.cutDate} /> : <PhotoPlaceholder />}
        </div>
        <div>
          <strong>{cutTitle(cut.cutDate, cut.service)}</strong>
          <p>
            {progress
              ? progress.discomfort || progress.styling || progress.question
              : cut.goodNote || '커트한 날의 기록'}
          </p>
          <span>
            {displayDate(progress?.observedOn ?? cut.cutDate, true)} ·{' '}
            {progress ? '경과 기록' : '커트 기록'}
          </span>
        </div>
      </div>
    </Completion>
  );
}

import type { ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { Icon, Missing, SuccessMark } from './components';
import { PhotoButton } from './fields';
import { PhotoPlaceholder } from './components';
import { Link, useWorkspace } from './workspace';
import { usePrototype } from './prototype/context';
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
      <Link className="button primary full" to={to} replace>
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
  const location = useLocation();
  const cut = state.cuts.find((value) => value.id === id);
  const progress = state.progress.find((value) => value.cutId === id && value.id === progressId);
  if (!cut || (progressId && !progress)) return <Missing title="저장한 기록을 찾을 수 없어요" />;
  const photo = state.photos.find((value) => value.cutId === id && value.progressId === progressId);
  const edited = location.state?.operation === 'update';
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
      primary={progress ? '기록과 경과 보기' : '기록 보기'}
      to={`/records/${id}`}
      secondary="내 기록으로"
      secondaryTo="/records"
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

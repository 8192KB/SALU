import { useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { usePrototype } from './prototype/context';
import { PageHeading, BackLink, Icon, Alert } from './components';
import { displayDate, validDate } from './prototype/dates';
import { useAuth } from './auth/context';
import { Dialog } from './dialog';
import { isBlankCutDraft } from './prototype/memory-repository';
import { photoIds } from './prototype/storage-model';

export function StorageNotice({ compact = false }: { compact?: boolean }) {
  const { storage } = usePrototype();
  if (!storage) return null;
  return <PersonalStorageNotice storage={storage} compact={compact} />;
}
function PersonalStorageNotice({
  storage,
  compact,
}: {
  compact: boolean;
  storage: NonNullable<ReturnType<typeof usePrototype>['storage']>;
}) {
  const view = useSyncExternalStore(storage.subscribe, storage.getSnapshot);
  const onBackup = useLocation().pathname === '/backup';
  const labels = {
    local: '기기에 저장됨',
    saving: '기기에 저장 중',
    syncing: '서버 저장 중',
    synced: '서버에도 저장됨',
    conflict: '변경 확인 필요',
    error: view.errorSource === 'cloud' ? '서버 저장 대기' : '기기 저장 확인 필요',
  };
  return (
    <div className={`storage-notice${compact ? ' compact' : ''}`}>
      {/* 입력할 때마다 바뀌는 저장 중·저장됨은 읽지 않고, 확인이 필요한 상태만 알림 */}
      <span className="sr-only" role="status">
        {view.status === 'error' || view.status === 'conflict' ? labels[view.status] : ''}
      </span>
      <span className="storage-state">
        <Icon
          name={
            view.status === 'conflict'
              ? 'warning'
              : view.status === 'local' || view.status === 'synced'
                ? 'check'
                : 'reset'
          }
          size={14}
        />
        {labels[view.status]}
      </span>
      {view.error && !view.conflicts && !onBackup && <Link to="/backup">저장 상태 확인</Link>}
      {view.error && <Alert message={view.error} />}
      {view.conflicts > 0 && (
        <div className="warning-notice">
          <Icon name="warning" size={18} />
          {onBackup ? (
            <a href="#conflicts">변경 충돌 {view.conflicts}건 · 복구본 만들기</a>
          ) : (
            <Link to="/backup#conflicts">변경 충돌 {view.conflicts}건 · 복구본 만들기</Link>
          )}
        </div>
      )}
    </div>
  );
}
export function BackupPage() {
  const { storage } = usePrototype();
  return storage ? <PersonalBackupPage storage={storage} /> : null;
}
function PersonalBackupPage({
  storage,
}: {
  storage: NonNullable<ReturnType<typeof usePrototype>['storage']>;
}) {
  const navigate = useNavigate();
  const { state: auth } = useAuth();
  const view = useSyncExternalStore(storage.subscribe, storage.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showRecords, setShowRecords] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Awaited<
    ReturnType<typeof storage.readBackup>
  > | null>(null);
  const [removeDraft, setRemoveDraft] = useState<number | null>(null);
  const act = async (task: () => Promise<unknown>, success: string, records = false) => {
    setBusy(true);
    setError('');
    setMessage('');
    setShowRecords(false);
    try {
      await task();
      if (success) setMessage(success);
      setShowRecords(records);
    } catch (error) {
      setError(error instanceof Error ? error.message : '처리하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="backup-page">
      <PageHeading
        back={<BackLink to="/records">내 기록으로</BackLink>}
        title="기록 저장·백업"
        description="사진과 작성 중인 내용까지 함께 보관해요."
      />
      <div className="backup-feedback" aria-live="polite">
        <Alert message={error} />
        {message && (
          <div className="success-notice" role="status">
            <Icon name="check" />
            <p>{message}</p>
            {showRecords && (
              <Link className="text-link" to="/records">
                기록 보기
              </Link>
            )}
          </div>
        )}
        {busy && (
          <p className="working-notice" role="status">
            <span className="button-spinner" aria-hidden="true" />
            백업을 처리하고 있어요
          </p>
        )}
      </div>
      <section className="panel">
        <h2>{storage.scope === 'guest' ? '로그인하고 기록 보관' : '계정에 자동 저장'}</h2>
        {storage.scope === 'guest' ? (
          <>
            <p>
              로그인 전 기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 기록이 사라질 수
              있어요.
            </p>
            <p>로그인하면 지금 작성한 기록과 사진도 계정에 보관해요.</p>
            <div className="backup-actions">
              <Link className="button primary" to="/login">
                로그인
              </Link>
              {auth.status !== 'prototype' && (
                <Link className="button" to="/signup">
                  회원가입
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <p>
              기기에 저장한 기록과 사진을 계정에도 자동으로 보관해요. 같은 계정으로 다른 기기에서도
              이어서 사용할 수 있어요.
            </p>
            {view.errorSource === 'cloud' && (
              <>
                <p>{view.error}</p>
                <button type="button" className="button" onClick={() => storage.requestSync()}>
                  지금 다시 저장
                </button>
              </>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>파일 백업</h2>
        <p>
          기록·경과·사진·커트 준비를 ZIP 파일로 받을 수 있어요. 복원하면 기존 기록 옆에 새 복사본을
          추가해요.
        </p>
        <div className="backup-actions">
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const blob = await storage.exportBackup();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `SALU-${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }, '백업 파일을 만들었어요.')
            }
          >
            ZIP 백업 받기
          </button>
          <label className="button">
            백업 복원
            <input
              aria-label="SALU 백업 파일"
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file)
                  void act(async () => setPendingRestore(await storage.readBackup(file)), '');
              }}
            />
          </label>
        </div>
      </section>
      <Dialog
        open={Boolean(pendingRestore)}
        title="백업 파일을 복사본으로 추가할까요?"
        onClose={() => setPendingRestore(null)}
      >
        {pendingRestore && (
          <p>
            기록 {pendingRestore.bundle.state.cuts.length}건·사진{' '}
            {photoIds(pendingRestore.bundle).length}장을 새 복사본으로 추가해요. 이미 같은 기록이
            있으면 두 벌이 되고, 기존 기록은 바뀌지 않아요.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setPendingRestore(null)}>
            취소
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              const restore = pendingRestore!;
              setPendingRestore(null);
              void act(
                () => storage.importBackup(restore),
                `기존 기록은 그대로 두고 복사본 ${restore.bundle.state.cuts.length}건을 추가했어요.`,
                restore.bundle.state.cuts.length > 0,
              );
            }}
          >
            복사본 추가
          </button>
        </div>
      </Dialog>
      {view.conflicts > 0 && (
        <section className="panel" id="conflicts">
          <h2>다른 기기의 변경과 충돌했어요</h2>
          <p>이 기기의 내용은 새 복구본에 남기고, 원래 기록에는 서버의 최신 내용을 가져와요.</p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void act(() => storage.resolveConflicts(), '복구본을 만들었어요.', true)}
          >
            복구본 만들기
          </button>
        </section>
      )}
      {view.bundle.drafts.recoveredCuts.length > 0 && (
        <section className="panel recovered-drafts">
          <h2>복원한 작성 초안</h2>
          {view.bundle.drafts.recoveredCuts.map((draft, i) => (
            <div className="backup-actions" key={i}>
              <button
                className="button"
                onClick={() => {
                  storage.updateDrafts((d) => ({
                    ...d,
                    // 비어 있는 현재 초안은 복원 목록으로 옮기지 않음
                    recoveredCuts: d.recoveredCuts
                      .filter((_, index) => index !== i)
                      .concat(isBlankCutDraft(d.cutDraft) ? [] : [d.cutDraft]),
                    cutDraft: draft,
                  }));
                  navigate('/records/new');
                }}
              >
                {validDate(draft.cutDate) ? displayDate(draft.cutDate) : '날짜 미정'} ·{' '}
                {draft.service || '커트 기록'} 이어 작성
              </button>
              <button type="button" className="button" onClick={() => setRemoveDraft(i)}>
                지우기
              </button>
            </div>
          ))}
          <Dialog
            open={removeDraft !== null}
            title="복원한 작성 초안을 지울까요?"
            onClose={() => setRemoveDraft(null)}
          >
            <p>지운 초안은 되돌릴 수 없어요. 저장한 기록은 그대로 있어요.</p>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setRemoveDraft(null)}>
                취소
              </button>
              <button
                type="button"
                className="button coral"
                onClick={() => {
                  const index = removeDraft;
                  setRemoveDraft(null);
                  storage.updateDrafts((d) => ({
                    ...d,
                    recoveredCuts: d.recoveredCuts.filter((_, i) => i !== index),
                  }));
                }}
              >
                초안 지우기
              </button>
            </div>
          </Dialog>
        </section>
      )}
    </div>
  );
}

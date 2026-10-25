import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useAuth } from './auth/context';
import { ApiFailure, directoryRequest } from './auth/api';
import { useLoginPath } from './auth/pages';
import { Alert, BackLink, PageHeading, focusFirstError, Loading } from './components';
import { Field } from './fields';
import { Link } from './workspace';
import { usePrototype } from './prototype/context';
import { useDirectory } from './directory';
import { refreshDirectory, salonLabel } from './directory-cache';
import type { PublicProfile, Salon } from './directory-cache';
import { Completion } from './completion';

// 서버 오류 코드를 이 화면에서 할 수 있는 일로 바꿈
function directoryError(error: unknown, fallback: string, conflict: string) {
  if (!(error instanceof ApiFailure)) return error instanceof Error ? error.message : fallback;
  if (error.status === 401) return '로그인이 끝났어요. 다시 로그인한 뒤 저장해 주세요.';
  if (error.status === 409) return conflict;
  if (error.status === 400)
    return '입력을 확인해 주세요. 전문 분야는 쉼표로 나눠 10개까지, 항목마다 40자까지 쓸 수 있어요.';
  return error.message;
}

export function DirectoryEditor() {
  const { state: auth, refresh } = useAuth();
  const loginPath = useLoginPath();

  const { state } = usePrototype();
  const directory = useDirectory(state);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [form, setForm] = useState({
    name: '',
    introduction: '',
    specialties: '',
    salonId: '',
    visibility: 'PUBLIC',
  });
  const [salon, setSalon] = useState({ name: '', region: '', branch: '' });
  const [error, setError] = useState('');
  const [salonError, setSalonError] = useState('');
  const [salonResult, setSalonResult] = useState('');
  const [addingSalon, setAddingSalon] = useState(false);
  const [busy, setBusy] = useState(false);
  const salonEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void createSalon();
  };
  const [complete, setComplete] = useState(false);
  const generation = useRef(0);
  const load = async () => {
    const current = ++generation.current;
    setReady(false);
    setLoadingError('');
    try {
      const own = await directoryRequest<PublicProfile>('/api/my/designer-profile');
      if (current !== generation.current) return;
      setProfile(own);
      if (own)
        setForm({
          name: own.name,
          introduction: own.introduction,
          specialties: own.specialties,
          salonId: own.salonId ?? '',
          visibility: own.visibility,
        });
      setReady(true);
    } catch (error) {
      if (current === generation.current)
        setLoadingError(error instanceof Error ? error.message : '프로필을 불러오지 못했어요.');
    }
  };
  useEffect(() => {
    // 같은 주소에서 완료 화면으로 바뀌므로 제목으로 초점을 옮겨 저장 결과를 알림
    if (complete) document.querySelector<HTMLElement>('main h1')?.focus();
  }, [complete]);
  useEffect(() => {
    if (auth.status === 'authenticated') void load();
    return () => {
      generation.current++;
    };
  }, [auth.status]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    if (busy) return;
    const specialties = form.specialties
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (specialties.length > 10 || specialties.some((value) => value.length > 40)) {
      setError('전문 분야는 쉼표로 나눠 10개까지, 항목마다 40자까지 쓸 수 있어요.');
      focusFirstError(element);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await directoryRequest<PublicProfile>(
        '/api/my/designer-profile',
        profile ? 'PUT' : 'POST',
        {
          ...form,
          salonId: form.salonId || null,
          specialties,
        },
      );
      setProfile(result);
      setComplete(true);
      void refreshDirectory();
    } catch (error) {
      setError(
        directoryError(
          error,
          '프로필을 저장하지 못했어요.',
          '프로필이 이미 바뀌었어요. 화면을 새로 불러온 뒤 다시 저장해 주세요.',
        ),
      );
      if (error instanceof ApiFailure && error.status === 401) void refresh();
      focusFirstError(element);
    } finally {
      setBusy(false);
    }
  };
  // 매장 등록 칸은 프로필 양식 안, 소속 매장 바로 아래에 펼침. 양식 안이라 Enter는 직접 받아 등록함
  const createSalon = async () => {
    if (busy) return;
    if (!salon.name.trim() || !salon.region.trim()) {
      setSalonError('매장 이름과 지역을 적어 주세요.');
      return;
    }
    setBusy(true);
    setSalonError('');
    setSalonResult('');
    try {
      const result = await directoryRequest<Salon>('/api/salons', 'POST', salon);
      if (result) {
        setForm((previous) => ({ ...previous, salonId: result.id }));
        setSalon({ name: '', region: '', branch: '' });
        setAddingSalon(false);
        setSalonResult(
          `‘${salonLabel(result)}’ 매장을 등록하고 골라 뒀어요. 아래 ‘프로필 저장’을 눌러야 프로필에 반영돼요.`,
        );
        await refreshDirectory();
      }
    } catch (error) {
      setSalonError(
        directoryError(
          error,
          '매장을 등록하지 못했어요.',
          '이름·지역·지점이 같은 매장이 이미 있어요. 위의 소속 매장 목록에서 골라 주세요.',
        ),
      );
      if (error instanceof ApiFailure && error.status === 401) void refresh();
    } finally {
      setBusy(false);
    }
  };
  if (auth.status === 'checking') return <Loading>로그인 상태를 확인하고 있어요.</Loading>;
  if (auth.status !== 'authenticated')
    return (
      <section className="empty-state">
        <PageHeading title="내 디자이너 프로필" back={<BackLink to="/account">내 계정</BackLink>} />
        <p>로그인하고 디자이너로 등록해 주세요.</p>
        <Link className="button primary" to={loginPath}>
          로그인
        </Link>
      </section>
    );
  if (complete && profile)
    return (
      <Completion
        title="프로필을 저장했어요"
        description={
          profile.visibility === 'PUBLIC'
            ? '고객이 디자이너 찾기에서 볼 수 있어요.'
            : '비공개라 디자이너 찾기에 보이지 않아요.'
        }
        primary={profile.visibility === 'PUBLIC' ? '프로필 보기' : '내 계정으로'}
        to={profile.visibility === 'PUBLIC' ? `/designers/${profile.id}` : '/account'}
        secondary="디자이너 목록으로"
        secondaryTo="/designers"
        after={
          <button className="text-link" type="button" onClick={() => setComplete(false)}>
            프로필 다시 고치기
          </button>
        }
      >
        <div className="completed-summary">
          <div>
            <strong>{profile.name} 디자이너</strong>
            {/* 공개 여부는 위 설명에 있으므로 카드는 저장한 소속을 보여 줌 */}
            <p>
              {[profile.salonName, profile.branch].filter(Boolean).join(' ') || '소속 매장 없음'}
            </p>
          </div>
        </div>
      </Completion>
    );
  return (
    <div className="directory-editor">
      <PageHeading
        title="내 디자이너 프로필"
        back={<BackLink to="/account">내 계정</BackLink>}
        description="소개와 소속 매장을 직접 등록해 주세요."
      />
      {!ready ? (
        <section className="panel">
          {loadingError ? (
            <>
              <Alert message={loadingError} />
              <button type="button" className="button" onClick={() => void load()}>
                다시 불러오기
              </button>
            </>
          ) : (
            <Loading>프로필을 불러오고 있어요.</Loading>
          )}
        </section>
      ) : (
        <>
          <form className="panel directory-form" onSubmit={save}>
            <h2>디자이너 소개</h2>
            <p className="form-note">
              SALU는 디자이너 자격을 따로 확인하지 않아요. 소개는 직접 적은 그대로 보여요.
            </p>
            <fieldset disabled={busy}>
              <Field label="활동 이름">
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="소개">
                <textarea
                  required
                  maxLength={2000}
                  rows={4}
                  value={form.introduction}
                  onChange={(event) => setForm({ ...form, introduction: event.target.value })}
                />
              </Field>
              <Field label="전문 분야" hint="쉼표로 구분 · 최대 10개">
                <input
                  maxLength={410}
                  value={form.specialties}
                  onChange={(event) => setForm({ ...form, specialties: event.target.value })}
                />
              </Field>
              <Field label="현재 소속 매장">
                <select
                  value={form.salonId}
                  onChange={(event) => {
                    setForm({ ...form, salonId: event.target.value });
                    setSalonResult('');
                  }}
                >
                  <option value="">소속 없음</option>
                  {directory.salons.map((salon) => (
                    <option value={salon.id} key={salon.id}>
                      {salonLabel(salon)}
                    </option>
                  ))}
                </select>
              </Field>
              {salonResult && (
                <p className="working-notice" role="status">
                  {salonResult}
                </p>
              )}
              {addingSalon ? (
                <div className="salon-inline" role="group" aria-labelledby="salon-inline-heading">
                  <h3 id="salon-inline-heading">목록에 없는 매장 등록</h3>
                  <p className="form-note">등록한 매장은 다른 사용자도 선택할 수 있어요.</p>
                  <Field label="매장 이름">
                    <input
                      maxLength={100}
                      value={salon.name}
                      onKeyDown={salonEnter}
                      onChange={(event) => setSalon({ ...salon, name: event.target.value })}
                    />
                  </Field>
                  <Field label="지역">
                    <input
                      maxLength={100}
                      placeholder="예: 서울 마포구"
                      value={salon.region}
                      onKeyDown={salonEnter}
                      onChange={(event) => setSalon({ ...salon, region: event.target.value })}
                    />
                  </Field>
                  <Field label="지점" hint="선택">
                    <input
                      maxLength={100}
                      value={salon.branch}
                      onKeyDown={salonEnter}
                      onChange={(event) => setSalon({ ...salon, branch: event.target.value })}
                    />
                  </Field>
                  {salonError && <Alert message={salonError} />}
                  <div className="salon-inline-actions">
                    <button
                      type="button"
                      className="button"
                      aria-busy={busy}
                      onClick={() => void createSalon()}
                    >
                      매장 등록하고 고르기
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setAddingSalon(false);
                        setSalonError('');
                      }}
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-link salon-inline-open"
                  onClick={() => {
                    setAddingSalon(true);
                    setSalonResult('');
                  }}
                >
                  찾는 매장이 목록에 없나요? 매장 등록
                </button>
              )}
              <Field label="공개 범위">
                <select
                  value={form.visibility}
                  onChange={(event) => setForm({ ...form, visibility: event.target.value })}
                >
                  <option value="PUBLIC">공개 · 목록에서 볼 수 있어요</option>
                  <option value="PRIVATE">비공개 · 나만 볼 수 있어요</option>
                </select>
              </Field>
            </fieldset>
            {error && <Alert message={error} />}
            <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
              {busy ? '저장 중' : '프로필 저장'}
            </button>
          </form>
          {directory.error && <Alert message={directory.error} />}
        </>
      )}
    </div>
  );
}

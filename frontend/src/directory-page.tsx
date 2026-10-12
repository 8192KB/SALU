import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from './auth/context';
import { directoryRequest } from './auth/api';
import { Alert, BackLink, PageHeading, focusFirstError } from './components';
import { Field } from './fields';
import { Link } from './workspace';
import { usePrototype } from './prototype/context';
import { useDirectory } from './directory';
import { refreshDirectory, salonLabel } from './directory-cache';
import type { PublicProfile, Salon } from './directory-cache';
import { Completion } from './completion';

export function DirectoryEditor() {
  const { state: auth } = useAuth();
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
  const [busy, setBusy] = useState(false);
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
    if (auth.status === 'authenticated') void load();
    return () => {
      generation.current++;
    };
  }, [auth.status]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await directoryRequest<PublicProfile>(
        '/api/my/designer-profile',
        profile ? 'PUT' : 'POST',
        {
          ...form,
          salonId: form.salonId || null,
          specialties: form.specialties
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        },
      );
      setProfile(result);
      setComplete(true);
      void refreshDirectory();
    } catch (error) {
      setError(error instanceof Error ? error.message : '프로필을 저장하지 못했어요.');
      focusFirstError(element);
    } finally {
      setBusy(false);
    }
  };
  const createSalon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSalonError('');
    setSalonResult('');
    try {
      const result = await directoryRequest<Salon>('/api/salons', 'POST', salon);
      if (result) {
        setForm((previous) => ({ ...previous, salonId: result.id }));
        setSalonResult(`${salonLabel(result)} 등록 완료`);
        await refreshDirectory();
      }
    } catch (error) {
      setSalonError(error instanceof Error ? error.message : '매장을 등록하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  if (auth.status !== 'authenticated')
    return (
      <section className="empty-state">
        <h1>내 디자이너 프로필</h1>
        <p>로그인하고 디자이너로 등록해 주세요.</p>
        <Link className="button primary" to="/login">
          로그인
        </Link>
      </section>
    );
  if (complete && profile)
    return (
      <Completion
        title="프로필을 저장했어요"
        description="프로필을 서버에 저장했어요."
        primary={profile.visibility === 'PUBLIC' ? '프로필 보기' : '내 계정으로'}
        to={profile.visibility === 'PUBLIC' ? `/designers/${profile.id}` : '/account'}
        secondary="디자이너 목록으로"
        secondaryTo="/designers"
      >
        <div className="completed-summary">
          <div>
            <strong>{profile.name} 디자이너</strong>
            <p>
              {profile.visibility === 'PUBLIC'
                ? 'SALU 공개 목록에 표시돼요.'
                : '나만 볼 수 있는 비공개 프로필이에요.'}
            </p>
          </div>
        </div>
        <button className="text-link" type="button" onClick={() => setComplete(false)}>
          다시 수정
        </button>
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
            <p role="status">프로필을 불러오고 있어요.</p>
          )}
        </section>
      ) : (
        <>
          <form className="panel directory-form" onSubmit={save}>
            <h2>디자이너 소개</h2>
            <p className="form-note">
              직접 등록한 프로필이에요. SALU에서 자격을 확인한 표시는 제공하지 않아요.
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
                  onChange={(event) => setForm({ ...form, salonId: event.target.value })}
                >
                  <option value="">소속 없음</option>
                  {directory.salons.map((salon) => (
                    <option value={salon.id} key={salon.id}>
                      {salonLabel(salon)}
                    </option>
                  ))}
                </select>
              </Field>
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
          <form className="panel directory-form" onSubmit={createSalon}>
            <h2>목록에 없는 매장 등록</h2>
            <p className="form-note">등록한 매장은 다른 사용자도 선택할 수 있어요.</p>
            <fieldset disabled={busy}>
              <Field label="매장 이름">
                <input
                  required
                  maxLength={100}
                  value={salon.name}
                  onChange={(event) => setSalon({ ...salon, name: event.target.value })}
                />
              </Field>
              <Field label="지역">
                <input
                  required
                  maxLength={100}
                  placeholder="예: 서울 마포구"
                  value={salon.region}
                  onChange={(event) => setSalon({ ...salon, region: event.target.value })}
                />
              </Field>
              <Field label="지점" hint="선택">
                <input
                  maxLength={100}
                  value={salon.branch}
                  onChange={(event) => setSalon({ ...salon, branch: event.target.value })}
                />
              </Field>
            </fieldset>
            {salonError && <Alert message={salonError} />}{' '}
            {salonResult && <p role="status">{salonResult}</p>}
            <button type="submit" className="button full" disabled={busy}>
              매장 등록
            </button>
          </form>
          {directory.error && <Alert message={directory.error} />}
        </>
      )}
    </div>
  );
}

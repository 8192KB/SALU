import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useAuth } from './auth/context';
import { ApiFailure, directoryRequest } from './auth/api';
import { useLoginPath } from './auth/pages';
import { Alert, BackLink, Icon, PageHeading, focusFirstError, Loading } from './components';
import { Field } from './fields';
import { Link } from './workspace';
import { usePrototype } from './prototype/context';
import { useDirectory } from './directory';
import { refreshDirectory, salonLabel } from './directory-cache';
import type { PublicProfile, Salon } from './directory-cache';
import { Completion } from './completion';
import { AddressSearch, mapAvailable } from './salon-map';
import { MAX_SPECIALTIES, SpecialtyChoices, isSpecialty } from './designer-specialties';
import type { PickedAddress } from './salon-map';
// 서버는 거절 이유를 400 하나로 알려 줌. 길이는 화면에서 먼저 막으므로 400은 화면마다 남은 원인을 안내함
function directoryError(error: unknown, fallback: string, conflict: string, invalid: string) {
  if (!(error instanceof ApiFailure)) return error instanceof Error ? error.message : fallback;
  if (error.status === 401) return '로그인이 끝났어요. 다시 로그인한 뒤 저장해 주세요.';
  if (error.status === 409) return conflict;
  if (error.status === 400) return invalid;
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
    specialties: [] as string[],
    salonId: '',
    visibility: 'PUBLIC',
    consultationFee: '0',
  });
  const [salon, setSalon] = useState({ name: '', region: '', branch: '' });
  // 새 매장 주소, 그리고 주소 검색을 연 곳(새 매장 칸 또는 고른 매장의 위치 넣기)
  const [salonAddress, setSalonAddress] = useState<PickedAddress | null>(null);
  const [searching, setSearching] = useState<'new' | 'selected' | null>(null);
  const [locationNote, setLocationNote] = useState('');
  const [error, setError] = useState('');
  const [salonError, setSalonError] = useState('');
  const salonName = useRef<HTMLInputElement>(null);
  const salonRegion = useRef<HTMLInputElement>(null);
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
          specialties: own.specialties
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          salonId: own.salonId ?? '',
          visibility: own.visibility,
          consultationFee: String(own.consultationFee ?? 0),
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
    // 정해진 항목만 저장함. 예전에 직접 적은 분야는 여기서 빠짐
    const specialties = form.specialties.filter(isSpecialty);
    const fee = Number(form.consultationFee || 0);
    if (!Number.isInteger(fee) || fee < 0 || fee > 100000 || fee % 1000) {
      setError('상담 요금은 0원부터 100,000원까지 1,000원 단위로 적어 주세요.');
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
          consultationFee: fee,
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
          '입력을 확인해 주세요. 고른 소속 매장이 목록에서 사라졌다면 화면을 새로 불러와 다시 골라 주세요.',
        ),
      );
      if (error instanceof ApiFailure && error.status === 401) void refresh();
      focusFirstError(element);
    } finally {
      setBusy(false);
    }
  };
  const pickNewAddress = useCallback((value: PickedAddress) => {
    setSalonAddress(value);
    setSalon((previous) =>
      previous.region.trim() ? previous : { ...previous, region: value.region },
    );
    setSearching(null);
  }, []);
  // 위치가 없는 기존 매장은 등록한 회원만 위치를 넣을 수 있음(서버가 남의 매장은 404)
  const pickSelectedAddress = useCallback(
    async (value: PickedAddress) => {
      setSearching(null);
      setLocationNote('');
      try {
        await directoryRequest<Salon>(
          `/api/salons/${encodeURIComponent(form.salonId)}/location`,
          'PUT',
          { address: value.address, latitude: value.latitude, longitude: value.longitude },
        );
        setLocationNote('매장 위치를 넣었어요.');
        await refreshDirectory();
      } catch (error) {
        setLocationNote(
          error instanceof ApiFailure && error.status === 404
            ? '이 매장은 처음 등록한 회원만 위치를 넣을 수 있어요.'
            : directoryError(
                error,
                '매장 위치를 넣지 못했어요.',
                '',
                '주소나 위치를 다시 골라 주세요.',
              ),
        );
        if (error instanceof ApiFailure && error.status === 401) void refresh();
      }
    },
    [form.salonId, refresh],
  );
  const selectedSalon = directory.salons.find((value) => value.id === form.salonId);
  // 매장 등록 칸은 프로필 양식 안, 소속 매장 바로 아래에 펼침. 양식 안이라 Enter는 직접 받아 등록함
  const createSalon = async () => {
    if (busy) return;
    if (!salon.name.trim() || !salon.region.trim()) {
      setSalonError('매장 이름과 지역을 적어 주세요.');
      (salon.name.trim() ? salonRegion : salonName).current?.focus();
      return;
    }
    setBusy(true);
    setSalonError('');
    setSalonResult('');
    try {
      const location = salonAddress
        ? {
            address: salonAddress.address,
            latitude: salonAddress.latitude,
            longitude: salonAddress.longitude,
          }
        : {};
      const result = await directoryRequest<Salon>('/api/salons', 'POST', {
        ...salon,
        ...location,
      });
      if (result) {
        setForm((previous) => ({ ...previous, salonId: result.id }));
        setSalon({ name: '', region: '', branch: '' });
        setSalonAddress(null);
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
          '이름, 지역, 지점이 같은 매장이 이미 있어요. 위의 소속 매장 목록에서 골라 주세요.',
          '매장 이름, 지역, 지점을 다시 확인해 주세요.',
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
      // 제목은 다른 화면처럼 왼쪽에 두고 안내만 패널로 묶음(가운데 정렬 안에 넣으면 뒤로 링크·제목·본문이 따로 놂)
      <>
        <PageHeading title="내 디자이너 프로필" back={<BackLink to="/account">내 계정</BackLink>} />
        <section className="consultation-soft-panel">
          <p>로그인하고 디자이너로 등록해 주세요.</p>
          <Link className="button primary" to={loginPath}>
            로그인
          </Link>
        </section>
      </>
    );
  if (complete && profile)
    return (
      <Completion
        title="프로필을 저장했어요"
        description={
          profile.visibility === 'PUBLIC'
            ? '디자이너 찾기에 보여요.'
            : '비공개라 디자이너 찾기에 보이지 않아요.'
        }
        primary={profile.visibility === 'PUBLIC' ? '프로필 보기' : '내 계정으로'}
        to={profile.visibility === 'PUBLIC' ? `/designers/${profile.id}` : '/account'}
        secondary={profile.visibility === 'PUBLIC' ? '디자이너 찾기로' : undefined}
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
      <PageHeading title="내 디자이너 프로필" back={<BackLink to="/account">내 계정</BackLink>} />
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
              <SpecialtyChoices
                legend="전문 분야"
                hint={`잘하는 시술을 ${MAX_SPECIALTIES}개까지 골라 주세요. 고객이 원하는 시술을 고르면 맞는 디자이너로 추천돼요.`}
                values={form.specialties.filter(isSpecialty)}
                max={MAX_SPECIALTIES}
                onChange={(values) =>
                  setForm({
                    ...form,
                    specialties: [
                      ...values,
                      ...form.specialties.filter((value) => !isSpecialty(value)),
                    ],
                  })
                }
              />
              {form.specialties.some((value) => !isSpecialty(value)) && (
                <p className="form-note">
                  예전에 적은 분야:{' '}
                  {form.specialties.filter((value) => !isSpecialty(value)).join(', ')}. 저장하면
                  빠져요.
                </p>
              )}
              <Field label="현재 소속 매장">
                <select
                  value={form.salonId}
                  onChange={(event) => {
                    setForm({ ...form, salonId: event.target.value });
                    setSalonResult('');
                  }}
                >
                  <option value="">소속 없음</option>
                  {/* 매장 목록을 받기 전이나 받지 못했을 때도 지금 소속이 '소속 없음'으로 보이지 않게 함 */}
                  {form.salonId && !directory.salons.some((salon) => salon.id === form.salonId) && (
                    <option value={form.salonId}>
                      {profile?.salonId === form.salonId && profile.salonName
                        ? [profile.salonName, profile.branch].filter(Boolean).join(' · ')
                        : '지금 소속 매장'}
                    </option>
                  )}
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
              {selectedSalon?.address && (
                <p className="form-note">매장 주소: {selectedSalon.address}</p>
              )}
              {mapAvailable &&
                selectedSalon &&
                !selectedSalon.address &&
                searching !== 'selected' && (
                  <button
                    type="button"
                    className="text-link salon-inline-open"
                    onClick={() => {
                      setSearching('selected');
                      setLocationNote('');
                    }}
                  >
                    이 매장 위치 넣기
                  </button>
                )}
              {searching === 'selected' && (
                <AddressSearch
                  onPick={(value) => void pickSelectedAddress(value)}
                  onCancel={() => setSearching(null)}
                />
              )}
              {locationNote && (
                <p className="working-notice" role="status">
                  {locationNote}
                </p>
              )}
              {addingSalon ? (
                <div className="salon-inline" role="group" aria-labelledby="salon-inline-heading">
                  <h3 id="salon-inline-heading">목록에 없는 매장 등록</h3>
                  <p className="form-note">등록한 매장은 다른 사용자도 선택할 수 있어요.</p>
                  {mapAvailable && (
                    <div className="salon-address">
                      <span className="field-label">주소</span>
                      {searching === 'new' ? (
                        <AddressSearch
                          onPick={pickNewAddress}
                          onCancel={() => setSearching(null)}
                        />
                      ) : (
                        <>
                          {salonAddress && <p>{salonAddress.address}</p>}
                          <button
                            type="button"
                            className="button"
                            onClick={() => setSearching('new')}
                          >
                            {salonAddress ? '주소 다시 검색' : '주소 검색'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <Field label="매장 이름">
                    <input
                      ref={salonName}
                      maxLength={100}
                      value={salon.name}
                      onKeyDown={salonEnter}
                      onChange={(event) => setSalon({ ...salon, name: event.target.value })}
                    />
                  </Field>
                  <Field label="지역">
                    <input
                      ref={salonRegion}
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
                        setSalonAddress(null);
                        setSearching(null);
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
              <Field label="상담 요금(원)" hint="1,000원 단위. 0원이면 무료">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100000}
                  step={1000}
                  value={form.consultationFee}
                  onChange={(event) => setForm({ ...form, consultationFee: event.target.value })}
                />
              </Field>
              <p className="form-note">
                요금이 있으면 고객이 결제한 뒤에 상담이 와요. 72시간 안에 첫 답변을 하지 않으면
                자동으로 취소되고 환불돼요.
              </p>
              <fieldset className="visibility-choice">
                <legend>공개 범위</legend>
                <div className="choice-pills">
                  {(
                    [
                      ['PUBLIC', '공개'],
                      ['PRIVATE', '비공개'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="visibility"
                        value={value}
                        checked={form.visibility === value}
                        onChange={() => setForm({ ...form, visibility: value })}
                      />
                      <span>
                        {form.visibility === value && <Icon name="check" size={16} />}
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="form-note">
                  {form.visibility === 'PUBLIC'
                    ? '디자이너 찾기에 보여요.'
                    : '디자이너 찾기에 보이지 않아요.'}
                </p>
              </fieldset>
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

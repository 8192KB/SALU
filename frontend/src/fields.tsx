import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AREAS } from './prototype/types';
import type { Area, PhotoDraft, RecordPhoto } from './prototype/types';
import { Icon } from './components';
import { usePrototype } from './prototype/context';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className={`field ${error ? 'invalid' : ''}`}><span>{label} {hint && <small>{hint}</small>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
export function AreaChoices({ values, onChange, error }: { values: Area[]; onChange: (values: Area[]) => void; error?: string }) {
  return <fieldset><legend>부위</legend><div className="choice-pills">{(Object.entries(AREAS) as [Area, string][]).map(([key, label]) => <label key={key}><input type="checkbox" aria-label={label} checked={values.includes(key)} onChange={() => onChange(values.includes(key) ? values.filter(value => value !== key) : [...values, key])}/><span>{values.includes(key) && '✓ '}{label}</span></label>)}</div>{error && <p className="field-error">{error}</p>}</fieldset>;
}
export function PhotoList({ photos, onRemove }: { photos: (PhotoDraft | RecordPhoto)[]; onRemove?: (photo: PhotoDraft) => void }) {
  if (!photos.length) return null;
  return <div className="photo-list">{photos.map(photo => <figure key={photo.id}><img src={photo.url} alt={photo.caption}/><figcaption>{photo.caption}</figcaption>{onRemove && <button className="photo-remove" type="button" aria-label={`${photo.caption} 제거`} onClick={() => onRemove(photo)}>×</button>}</figure>)}</div>;
}
export function PhotoPicker({ photos, onChange }: { photos: PhotoDraft[]; onChange: (photos: PhotoDraft[]) => void }) {
  const { repository } = usePrototype();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return <div><div className="photo-uploader"><Icon name="photo" size={30}/><div><strong>사진으로 남기기</strong><p>JPEG · PNG · WebP / 장당 5 MiB, 최대 6장</p><label><span className="sr-only">사진 추가</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => {
    const files = Array.from(event.target.files ?? []); event.target.value = '';
    if (!files.length) return;
    setBusy(true); setError('');
    try { const prepared = await repository.preparePhotos(files, photos.length); if (active.current) onChange([...photos, ...prepared]); else prepared.forEach(repository.releasePhoto); }
    catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : '사진을 다시 선택해 주세요.'); }
    finally { if (active.current) setBusy(false); }
  }}/></label></div></div>{busy && <p className="muted" role="status">사진 확인 중</p>}{error && <p className="field-error" role="alert">{error}</p>}<PhotoList photos={photos} onRemove={photo => { repository.releasePhoto(photo); onChange(photos.filter(value => value.id !== photo.id)); }}/></div>;
}

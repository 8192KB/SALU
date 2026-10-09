import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AREAS } from './prototype/types';
import type { Area, PhotoDraft, RecordPhoto } from './prototype/types';
import { Icon } from './components';
import { usePrototype } from './prototype/context';
import { photoOrigin } from './prototype/request-flow';
import { displayDate } from './prototype/dates';
import { PhotoButton } from './photo-viewer';
export { PhotoButton } from './photo-viewer';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const labelId = useId();
  const description = [hint ? `${labelId}-hint` : '', error ? `${labelId}-error` : '']
    .filter(Boolean)
    .join(' ');
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        ...(children.props['aria-label'] || children.props['aria-labelledby']
          ? {}
          : { 'aria-labelledby': labelId }),
        'aria-describedby':
          [children.props['aria-describedby'], description].filter(Boolean).join(' ') || undefined,
        'aria-invalid': Boolean(error) || children.props['aria-invalid'] || undefined,
      })
    : children;
  return (
    <label className={`field ${error ? 'invalid' : ''}`}>
      <span>
        <span id={labelId}>{label}</span> {hint && <small id={`${labelId}-hint`}>{hint}</small>}
      </span>
      {control}
      {error && (
        <span id={`${labelId}-error`} className="field-error">
          {error}
        </span>
      )}
    </label>
  );
}

export function AreaChoices({
  values,
  onChange,
  error,
}: {
  values: Area[];
  onChange: (values: Area[]) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend>부위</legend>
      <div className="choice-pills">
        {(Object.entries(AREAS) as [Area, string][]).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              aria-label={label}
              checked={values.includes(key)}
              onChange={() =>
                onChange(
                  values.includes(key) ? values.filter((value) => value !== key) : [...values, key],
                )
              }
            />
            <span>
              {values.includes(key) && '✓ '}
              {label}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
export function PhotoList({
  photos,
  onRemove,
  cutDate,
  removeDisabled = false,
}: {
  photos: (PhotoDraft | RecordPhoto)[];
  onRemove?: (photo: PhotoDraft) => void;
  cutDate?: string;
  removeDisabled?: boolean;
}) {
  if (!photos.length) return null;
  return (
    <div className="photo-list">
      {photos.map((photo) => (
        <figure key={photo.id}>
          <PhotoButton photo={photo} cutDate={cutDate} />
          <figcaption>
            {cutDate && 'date' in photo && (
              <strong className="photo-moment">
                {photoOrigin(photo, cutDate)} · {displayDate(photo.date)}
              </strong>
            )}
            {photo.caption}
          </figcaption>
          {onRemove && (
            <button
              className="photo-remove"
              type="button"
              disabled={removeDisabled}
              aria-label={`${photo.caption} 제거`}
              onClick={() => onRemove(photo)}
            >
              ×
            </button>
          )}
        </figure>
      ))}
    </div>
  );
}
export function PhotoPicker({
  photos,
  onChange,
  onBusyChange,
}: {
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { repository } = usePrototype();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <div>
      <div className="photo-uploader">
        <Icon name="photo" size={30} />
        <div>
          <strong>사진으로 남기기</strong>
          <p>JPEG · PNG · WebP / 장당 5 MiB, 최대 6장</p>
          <label>
            <span className="sr-only">사진 추가</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (!files.length) return;
                setBusy(true);
                onBusyChange?.(true);
                setError('');
                try {
                  const prepared = await repository.preparePhotos(files, photos.length);
                  if (active.current) onChange([...photos, ...prepared]);
                  else prepared.forEach(repository.releasePhoto);
                } catch (failure) {
                  if (active.current)
                    setError(
                      failure instanceof Error ? failure.message : '사진을 다시 선택해 주세요.',
                    );
                } finally {
                  if (active.current) {
                    setBusy(false);
                    onBusyChange?.(false);
                  }
                }
              }}
            />
          </label>
        </div>
      </div>
      {busy && (
        <p className="muted" role="status">
          사진 확인 중
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <PhotoList
        photos={photos}
        removeDisabled={busy}
        onRemove={(photo) => {
          repository.releasePhoto(photo);
          onChange(photos.filter((value) => value.id !== photo.id));
        }}
      />
    </div>
  );
}

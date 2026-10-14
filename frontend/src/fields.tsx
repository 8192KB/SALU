import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FieldFeedback } from './components';
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
      <span className="field-label">
        <span id={labelId}>{label}</span> {hint && <small id={`${labelId}-hint`}>{hint}</small>}
      </span>
      {control}
      {error && <FieldFeedback id={`${labelId}-error`} message={error} />}
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
  const areas = (Object.keys(AREAS) as Area[]).filter((area) => area !== 'WHOLE');
  const selected = values.includes('WHOLE') ? areas : values;
  const allSelected = areas.every((area) => selected.includes(area));
  const errorId = useId();
  // 오류를 체크박스에 연결해 화면 낭독기가 듣고, 첫 오류 찾기가 이 칸으로 초점을 옮김
  const invalid = error ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {};
  return (
    <fieldset>
      <legend>부위</legend>
      <div className="choice-pills">
        <label>
          <input
            type="checkbox"
            aria-label="전체"
            {...invalid}
            checked={allSelected}
            ref={(input) => {
              if (input) input.indeterminate = selected.length > 0 && !allSelected;
            }}
            onChange={(event) => onChange(event.target.checked ? ['WHOLE', ...areas] : [])}
          />
          <span>{allSelected && '✓ '}전체 선택</span>
        </label>
        {areas.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              aria-label={AREAS[key]}
              {...invalid}
              checked={selected.includes(key)}
              onChange={() => {
                const next = selected.includes(key)
                  ? selected.filter((value) => value !== key)
                  : [...selected, key];
                onChange(areas.every((area) => next.includes(area)) ? ['WHOLE', ...areas] : next);
              }}
            />
            <span>
              {selected.includes(key) && '✓ '}
              {AREAS[key]}
            </span>
          </label>
        ))}
      </div>
      {error && <FieldFeedback id={errorId} message={error} />}
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
          <label className="photo-picker-button">
            <span>사진 추가</span>
            <input
              className="sr-only"
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

// 한 줄 칸에서 Enter(폰 키보드의 ‘이동’)를 눌러도 좋았던 점·사진을 넣기 전에 기록이 저장되지 않게 함
export function preventEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  const target = event.target;
  if (
    event.key === 'Enter' &&
    !event.nativeEvent.isComposing &&
    target instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'submit', 'button', 'file'].includes(target.type)
  )
    event.preventDefault();
}

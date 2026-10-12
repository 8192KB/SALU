import { useEffect, useState } from 'react';
import type { PhotoDraft, RecordPhoto } from './prototype/types';
import { photoOrigin } from './prototype/request-flow';
import { displayDate } from './prototype/dates';
import { PhotoPlaceholder } from './components';
import { Dialog } from './dialog';

export function PhotoButton({
  photo,
  cutDate,
}: {
  photo: PhotoDraft | RecordPhoto;
  cutDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo.url]);
  const moment =
    cutDate && 'date' in photo ? `${photoOrigin(photo, cutDate)} · ${displayDate(photo.date)}` : '';
  return (
    <>
      <button
        className="photo-open"
        type="button"
        aria-label={`${photo.caption} 확대`}
        onClick={() => setOpen(true)}
      >
        {failed ? (
          <PhotoPlaceholder failed />
        ) : (
          <img src={photo.url} alt={photo.caption} onError={() => setFailed(true)} />
        )}
        <span aria-hidden="true" className="photo-open-hint">
          확대 보기
        </span>
      </button>
      <Dialog open={open} title="사진 확대" className="photo-dialog" onClose={() => setOpen(false)}>
        {failed ? (
          <PhotoPlaceholder failed />
        ) : (
          <img
            className="photo-original"
            src={photo.url}
            alt={photo.caption}
            onError={() => setFailed(true)}
          />
        )}
        <p>
          {moment && (
            <strong>
              {moment}
              <br />
            </strong>
          )}
          {photo.caption}
        </p>
      </Dialog>
    </>
  );
}

import type { ReactNode } from 'react';
import { AnimatedDetails } from './animated-details';

export function MaterialChoice({
  name,
  title,
  summary,
  checked,
  onChange,
  image,
  detail,
  detailLabel,
}: {
  name: string;
  title: ReactNode;
  summary: string;
  checked: boolean;
  onChange: () => void;
  image?: ReactNode;
  detail?: ReactNode;
  detailLabel?: string;
}) {
  return (
    <article className={`material-choice${checked ? ' selected' : ''}`}>
      <div className="material-choice-main">
        {image && <div className="material-choice-image">{image}</div>}
        <label className="material-choice-label">
          <div className="material-choice-content">
            <strong>{title}</strong>
            <p>{summary}</p>
          </div>
          <input type="checkbox" aria-label={name} checked={checked} onChange={onChange} />
        </label>
      </div>
      {detail && (
        <AnimatedDetails className="material-choice-details" summary={detailLabel ?? '자세히 보기'}>
          {detail}
        </AnimatedDetails>
      )}
    </article>
  );
}

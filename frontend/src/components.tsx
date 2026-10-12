import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from './workspace';

export function Icon({
  name,
  size = 20,
}: {
  name:
    | 'home'
    | 'cut'
    | 'arrow'
    | 'back'
    | 'plus'
    | 'check'
    | 'photo'
    | 'chat'
    | 'user'
    | 'reset'
    | 'calendar'
    | 'warning';
  size?: number;
}) {
  const paths = {
    warning: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2" />
      </>
    ),
    cut: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m8.5 7.5 12 12M8.5 16.5l12-12M13 12l7.5-7.5" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7M4 12h12" />,
    back: <path d="m15 5-7 7 7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    photo: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1" />
        <path d="m4 17 5-5 4 4 3-3 5 5" />
      </>
    ),
    chat: <path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0ZM7 8h9M7 12h6" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 1 8M3 3v7h7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function PageHeading({
  title,
  description,
  action,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="heading-content">
        {back && <div className="heading-back-row">{back}</div>}
        <div className="heading-title-row">
          <h1 tabIndex={-1}>{title}</h1>
        </div>
        {description && <p className="subtext">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="heading-back" to={to}>
      <Icon name="back" />
      <span>{children}</span>
    </Link>
  );
}

export function Missing({
  title = '자료를 찾을 수 없어요',
  message = '내 기록에서 자료를 다시 선택해 주세요.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <section className="empty-state">
      <span className="empty-symbol">
        <Icon name="photo" size={30} />
      </span>
      <h1 tabIndex={-1}>{title}</h1>
      <p>{message}</p>
      <Link className="button primary" to="/records">
        내 기록으로
      </Link>
    </section>
  );
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? 'large' : ''}`} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

export function Alert({ message }: { message: string }) {
  return message ? (
    <div className="form-error" role="alert" tabIndex={-1}>
      <Icon name="warning" />
      <div>
        <strong>확인이 필요해요</strong>
        <p>{message}</p>
      </div>
    </div>
  ) : null;
}

export function FieldFeedback({ id, message }: { id?: string; message: string }) {
  return (
    <span id={id} className="field-error">
      <Icon name="warning" size={16} />
      <span>{message}</span>
    </span>
  );
}
export function PhotoPlaceholder({ failed = false }: { failed?: boolean }) {
  return (
    <span className="photo-placeholder">
      <Icon name="photo" size={26} />
      <span>{failed ? '사진을 불러오지 못했어요' : '사진 없음'}</span>
    </span>
  );
}
export function focusFirstError(form: HTMLFormElement) {
  requestAnimationFrame(() => {
    const target = form.querySelector<HTMLElement>(
      '[aria-invalid="true"], .invalid input, .invalid textarea, .field-error, .form-error',
    );
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    target?.focus({ preventScroll: true });
  });
}

export function PhotoThumbnail({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img src={src} alt={alt} onError={() => setFailed(true)} />
  ) : (
    <PhotoPlaceholder failed={failed} />
  );
}

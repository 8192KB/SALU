import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function Icon({ name, size = 20 }: { name: 'cut' | 'arrow' | 'plus' | 'check' | 'photo' | 'chat' | 'user' | 'reset'; size?: number }) {
  const paths = {
    cut: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.5 7.5 12 12M8.5 16.5l12-12M13 12l7.5-7.5"/></>,
    arrow: <path d="m9 5 7 7-7 7M4 12h12"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    photo: <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m4 17 5-5 4 4 3-3 5 5"/></>,
    chat: <path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0ZM7 8h9M7 12h6"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></>,
    reset: <><path d="M3 10a9 9 0 1 1 1 8M3 3v7h7"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 tabIndex={-1}>{title}</h1>{description && <p className="subtext">{description}</p>}</div>{action}</div>;
}

export function Missing({ title = '자료를 찾을 수 없습니다', message = '새로고침하거나 초기화하면 새로 작성한 자료는 사라집니다.' }: { title?: string; message?: string }) {
  return <section className="empty-state"><span className="empty-symbol"><Icon name="photo" size={30}/></span><h1 tabIndex={-1}>{title}</h1><p>{message}</p><Link className="button primary" to="/">내 기록으로</Link></section>;
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`avatar ${large ? 'large' : ''}`} aria-hidden="true">{name.slice(0, 1)}</span>;
}

export function Alert({ message }: { message: string }) {
  return message ? <div className="form-error" role="alert">{message}</div> : null;
}

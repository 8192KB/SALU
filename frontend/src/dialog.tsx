import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  title,
  onClose,
  children,
  className = '',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} className={`dialog ${className}`} onClose={onClose}>
      {open && (
        <>
          <div className="dialog-heading">
            <h2 id={titleId}>{title}</h2>
            <button className="dialog-close" type="button" aria-label="닫기" onClick={onClose}>
              ×
            </button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

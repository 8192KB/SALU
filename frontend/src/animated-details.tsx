import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function AnimatedDetails({
  summary,
  children,
  className,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const animation = useRef<Animation | null>(null);
  const pointerFocus = useRef(false);
  const targetOpen = useRef(defaultOpen);
  const [expanded, setExpanded] = useState(defaultOpen);
  const contentId = useId();
  useLayoutEffect(() => {
    if (details.current) details.current.open = targetOpen.current;
  }, []);
  useEffect(() => () => animation.current?.cancel(), []);
  const settle = () => {
    const element = details.current;
    const current = animation.current;
    if (!element || !current) return;
    element.open = targetOpen.current;
    element.style.overflow = '';
    animation.current = null;
    current.cancel();
  };

  return (
    <details
      ref={details}
      className={className}
      data-expanded={expanded}
      onPointerDownCapture={() => {
        pointerFocus.current = true;
      }}
      onFocusCapture={(event) => {
        const pointer = pointerFocus.current;
        pointerFocus.current = false;
        if (pointer || details.current?.querySelector('summary')?.contains(event.target)) return;
        // 입력 초점 뒤에 높이가 더 변하면 브라우저가 맞춘 스크롤 위치가 어긋남
        settle();
      }}
      onClickCapture={(event) => {
        pointerFocus.current = false;
        // pointerdown과 click 사이에 버튼 위치가 바뀌지 않도록 클릭 확정 뒤 정착
        if (!details.current?.querySelector('summary')?.contains(event.target as Node)) settle();
      }}
    >
      <summary
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={(event) => {
          event.preventDefault();
          const element = details.current;
          if (!element) return;
          const opening = !targetOpen.current;
          targetOpen.current = opening;
          setExpanded(opening);
          const startHeight = element.getBoundingClientRect().height;
          animation.current?.cancel();
          if (opening) element.open = true;
          const styles = getComputedStyle(element);
          const endHeight = opening
            ? element.getBoundingClientRect().height
            : event.currentTarget.getBoundingClientRect().height +
              parseFloat(styles.paddingTop) +
              parseFloat(styles.paddingBottom) +
              parseFloat(styles.borderTopWidth) +
              parseFloat(styles.borderBottomWidth);
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !element.animate) {
            element.open = opening;
            element.style.overflow = '';
            animation.current = null;
            return;
          }
          element.style.overflow = 'hidden';
          const current = element.animate(
            [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
            { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both' },
          );
          animation.current = current;
          current.onfinish = () => {
            if (animation.current !== current) return;
            element.open = opening;
            element.style.overflow = '';
            animation.current = null;
            current.cancel();
          };
        }}
      >
        <span>{summary}</span>
        <span className="disclosure-chevron" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="m9 5 7 7-7 7" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div id={contentId} className="disclosure-content" inert={!expanded}>
        {children}
      </div>
    </details>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './components';

const FeedbackContext = createContext<(message: string) => void>(() => {});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<{ id: number; message: string } | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((message: string) => {
    setFeedback({ id: ++sequence.current, message });
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <div className="feedback-region" role="status" aria-live="polite" aria-atomic="true">
        {feedback ? (
          <div className="feedback-toast" key={feedback.id}>
            <Icon name="check" size={18} />
            <span>{feedback.message}</span>
          </div>
        ) : null}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackContext);
}

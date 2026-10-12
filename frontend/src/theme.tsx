import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from './dialog';

type Preference = 'system' | 'light' | 'dark';
const storageKey = 'salu.theme';
const ThemeContext = createContext<{
  preference: Preference;
  change: (value: Preference) => void;
} | null>(null);

function readPreference(): Preference {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // 저장이 제한된 환경에서는 현재 세션에만 적용
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(readPreference);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#121a19' : '#f7f9f8');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreference(readPreference());
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);
  return (
    <ThemeContext.Provider
      value={{
        preference,
        change: (value) => {
          setPreference(value);
          try {
            localStorage.setItem(storageKey, value);
          } catch {
            /* 세션 설정 유지 */
          }
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeSettings() {
  const theme = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  if (!theme) return null;
  return (
    <>
      <button
        type="button"
        className="theme-settings-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16" />
          <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
        </svg>
        <span>화면 설정</span>
      </button>
      <Dialog open={open} title="화면 설정" onClose={() => setOpen(false)}>
        <fieldset className="theme-options">
          <legend>화면 밝기</legend>
          {(
            [
              ['system', '기기 설정 따르기'],
              ['light', '밝은 화면'],
              ['dark', '어두운 화면'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme.preference === value}
                onChange={() => theme.change(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions">
          <button className="button primary" type="button" onClick={() => setOpen(false)}>
            완료
          </button>
        </div>
      </Dialog>
    </>
  );
}

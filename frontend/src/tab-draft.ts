import { useEffect, useRef, useState } from 'react';

// 보내기 전 짧은 입력(글·후기·답변)을 이 탭에 남김. 세션이 끊겨 다시 로그인하거나 새로고침해도 이어 씀
// sessionStorage를 못 쓰는 브라우저면 화면 안에서만 유지함

export function readTabDraft<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

// null이면 지움. 보냈거나 입력을 다 지웠을 때
export function writeTabDraft(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰면 이 화면 안에서만 유지함
  }
}

// 직접 로그아웃하면 이 탭에 남긴 입력을 지움. 세션이 끊긴 경우에는 다시 로그인해 이어 쓰도록 남김
export function clearTabDrafts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (/^salu-(?:[\w-]+-draft|consult-drafts)-/.test(key)) sessionStorage.removeItem(key);
  } catch {
    // 저장소를 못 쓰면 남긴 입력도 없음
  }
}

// 글자만 있는 입력(댓글·메시지)을 탭에 남기는 state. key가 없으면 화면 안에서만 유지함
export function useTabDraftText(key: string | null) {
  const [text, setText] = useState('');
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!key || restored.current === key) return;
    restored.current = key;
    const saved = readTabDraft<unknown>(key);
    if (typeof saved === 'string') setText(saved);
  }, [key]);
  useEffect(() => {
    if (key && restored.current === key) writeTabDraft(key, text.trim() ? text : null);
  }, [key, text]);
  return [text, setText] as const;
}

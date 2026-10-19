import { useEffect, useState } from 'react';
import { Alert, Icon } from './components';
import { useWorkspace } from './workspace';
import { setFavorite, useFavorites } from './designer-favorites';
import { fetchAffiliations } from './designer-api';
import type { DesignerProfile } from './prototype/types';

// 디자이너 상세의 찜 버튼. 로그인한 실제 공간에서만 보이고 내 프로필에는 보이지 않음
export function FavoriteButton({ designer }: { designer: DesignerProfile }) {
  const favorites = useFavorites();
  const example = useWorkspace() === 'example';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (example || !favorites?.loaded || favorites.ownId === designer.id) return null;
  const on = favorites.ids.has(designer.id);
  return (
    <div className="favorite">
      <button
        type="button"
        className="button favorite-button"
        aria-pressed={on}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await setFavorite(designer.id, !on);
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : '찜을 바꾸지 못했어요.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="heart" size={18} />
        {on ? '찜한 디자이너' : '찜하기'}
      </button>
      <Alert message={error} />
    </div>
  );
}

const monthFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
});
// 예시 디자이너와 같은 '2026. 03' 모양으로 맞춤
const month = (value: string) =>
  monthFormatter
    .formatToParts(new Date(value))
    .filter((part) => part.type === 'year' || part.type === 'month')
    .map((part) => part.value)
    .join('. ');

type Period = { key: string; salonName: string; period: string };

// 디자이너 상세의 소속 이력. 실제 공간은 서버가 프로필 저장 때 남긴 기간, 예시는 예시 자료
export function AffiliationHistory({ designer }: { designer: DesignerProfile }) {
  const example = useWorkspace() === 'example';
  const [periods, setPeriods] = useState<Period[] | null>(null);
  useEffect(() => {
    if (example) return;
    let current = true;
    fetchAffiliations(designer.id).then(
      (items) =>
        current &&
        setPeriods(
          items.map((item) => ({
            key: `${item.salonId}-${item.startedAt}`,
            salonName: [item.salonName, item.branch].filter(Boolean).join(' '),
            period: `${month(item.startedAt)} – ${item.endedAt ? month(item.endedAt) : '현재'}`,
          })),
        ),
      // 이력을 못 받아도 프로필의 현재 소속은 그대로 보임
      () => current && setPeriods([]),
    );
    return () => {
      current = false;
    };
  }, [example, designer.id]);
  const list: Period[] = example
    ? designer.affiliations.map((value) => ({
        key: value.period,
        salonName: value.salonName,
        period: value.period,
      }))
    : (periods ?? []);
  if (!list.length) return null;
  return (
    <section className="consultation-soft-panel affiliation-history">
      <h2>소속 이력</h2>
      <ul>
        {list.map((value) => (
          <li key={value.key}>
            <strong>{value.salonName}</strong>
            <span>{value.period}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { DesignerProfile } from './prototype/types';

// 전문 분야로 고를 수 있는 시술 항목(docs/development-contract.md `공개 미용실·디자이너`).
// 서버 DirectoryService.SPECIALTIES와 같은 목록. 같은 이름으로 모아야 고객이 고른 항목과 맞춰 볼 수 있음
export const SPECIALTIES = [
  '남성 커트',
  '여성 커트',
  '레이어드 커트',
  '숏컷',
  '앞머리',
  '곱슬 커트',
  '펌',
  '다운펌',
  '매직·스트레이트',
  '염색',
  '탈색',
  '클리닉',
  '두피 케어',
] as const;
export const MAX_SPECIALTIES = 5;
const known = new Set<string>(SPECIALTIES);
export const isSpecialty = (value: string) => known.has(value);

// 후기가 적은 디자이너가 한두 개 만점으로 앞서지 않게 후기 3개를 평균 4.0점으로 미리 넣고 평균을 냄
const PRIOR_COUNT = 3;
const PRIOR_AVERAGE = 4;
export const reviewScore = (designer: DesignerProfile) => {
  const count = designer.rating?.count ?? 0;
  const average = designer.rating?.average ?? 0;
  return (average * count + PRIOR_AVERAGE * PRIOR_COUNT) / (count + PRIOR_COUNT);
};

export type Recommended = { designer: DesignerProfile; matched: string[] };

// 고른 항목이 하나라도 있는 디자이너만 남기고 맞는 개수 → 후기 점수 → 후기 수 → 이름 순. 같은 입력이면 늘 같은 순서
export function recommend(designers: DesignerProfile[], picked: string[]): Recommended[] {
  return designers
    .map((designer) => ({
      designer,
      matched: picked.filter((value) => designer.specialties.includes(value)),
    }))
    .filter((item) => item.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        reviewScore(b.designer) - reviewScore(a.designer) ||
        (b.designer.rating?.count ?? 0) - (a.designer.rating?.count ?? 0) ||
        a.designer.name.localeCompare(b.designer.name, 'ko'),
    );
}

export function SpecialtyChoices({
  legend,
  values,
  onChange,
  max,
  hint,
}: {
  legend: string;
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
  hint?: string;
}) {
  const full = max !== undefined && values.length >= max;
  return (
    <fieldset className="specialty-choices">
      <legend>{legend}</legend>
      {hint && <p className="form-note">{hint}</p>}
      <div className="choice-pills">
        {SPECIALTIES.map((value) => {
          const checked = values.includes(value);
          return (
            <label key={value}>
              <input
                type="checkbox"
                aria-label={value}
                checked={checked}
                // 다 고르면 고르지 않은 항목만 잠금. 고른 항목은 언제든 뺄 수 있음
                disabled={full && !checked}
                onChange={() =>
                  onChange(
                    checked
                      ? values.filter((item) => item !== value)
                      : SPECIALTIES.filter((item) => item === value || values.includes(item)),
                  )
                }
              />
              <span>
                {checked && '✓ '}
                {value}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function today() {
  const parts = seoulDateFormatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function daysAfter(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
export function displayDate(value: string, includeYear = false) {
  if (!validDate(value)) return value;
  const [year, month, day] = value.split('-');
  return `${includeYear || year !== today().slice(0, 4) ? `${year}년 ` : ''}${Number(month)}월 ${Number(day)}일`;
}
const sentFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'medium',
  timeStyle: 'short',
});
export const sentTime = (date: string) => sentFormatter.format(new Date(date));
const clockFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  timeStyle: 'short',
});
// 말풍선·알림처럼 시각이 줄줄이 반복되는 곳. 오늘이면 시각만, 올해면 월·일과 시각, 그 밖은 전체
export function shortTime(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;
  const parts = seoulDateFormatter.formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const now = today();
  if (day === now) return clockFormatter.format(value);
  if (day.slice(0, 4) === now.slice(0, 4))
    return `${Number(get('month'))}월 ${Number(get('day'))}일 ${clockFormatter.format(value)}`;
  return sentFormatter.format(value);
}
// 기록 이름(cutTitle)에 월·일이 이미 있어 카드 위 작은 줄은 올해가 아닐 때 연도만 보여 줌
export function otherYear(date: string) {
  const year = date.slice(0, 4);
  return validDate(date) && year !== today().slice(0, 4) ? `${year}년` : '';
}
export function cutTitle(date: string, service: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일 ${service}`;
}

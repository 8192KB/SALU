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
export function cutTitle(date: string, service: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일 ${service}`;
}

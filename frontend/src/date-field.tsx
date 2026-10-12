import { useEffect, useId, useRef, useState } from 'react';
import { Dialog } from './dialog';
import { Icon, FieldFeedback } from './components';
import { displayDate, validDate, today } from './prototype/dates';

function dateValue(input: string) {
  const text = input.trim();
  const parts = text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/);
  if (parts) return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  return input;
}

export function DateField({
  label,
  value,
  onChange,
  error,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  min?: string;
  max?: string;
}) {
  const id = useId();
  const calendarButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [yearText, setYearText] = useState(today().slice(0, 4));
  useEffect(() => setYearText(month.slice(0, 4)), [month]);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const description = error ? `${id}-error` : undefined;
  const close = () => {
    setOpen(false);
    calendarButton.current?.focus();
  };
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(`${month}-01T00:00:00Z`);
  const first = start.getUTCDay();
  const last = new Date(start);
  last.setUTCMonth(monthNumber);
  last.setUTCDate(0);
  const count = last.getUTCDate();
  const shift = (amount: number) => {
    const date = new Date(start);
    date.setUTCMonth(monthNumber - 1 + amount);
    if (date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999)
      setMonth(date.toISOString().slice(0, 7));
  };
  return (
    <div className={`field date-field ${error ? 'invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="date-control">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={20}
          placeholder="연도 · 월 · 일"
          value={
            editing ? text : /^\d{4}-\d{2}-\d{2}$/.test(value) ? displayDate(value, true) : value
          }
          onFocus={(event) => {
            setText(event.target.value);
            setEditing(true);
          }}
          onChange={(event) => {
            setText(event.target.value);
            onChange(dateValue(event.target.value));
          }}
          onBlur={() => setEditing(false)}
          aria-describedby={description}
          aria-invalid={Boolean(error) || undefined}
        />
        <button
          ref={calendarButton}
          className="date-picker-button"
          type="button"
          aria-label={`${label} 달력 열기`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setMonth((validDate(value) ? value : today()).slice(0, 7));
            setOpen(true);
          }}
        >
          <Icon name="calendar" size={24} />
        </button>
      </div>
      <Dialog open={open} title={`${label} 선택`} onClose={close} className="calendar-dialog">
        <div className="calendar-month">
          <button type="button" className="button" aria-label="이전 달" onClick={() => shift(-1)}>
            <Icon name="back" />
          </button>
          <label>
            <span className="sr-only">연도</span>
            <input
              aria-label="연도"
              type="number"
              min="1"
              max="9999"
              value={yearText}
              onBlur={() => setYearText(month.slice(0, 4))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              onChange={(event) => {
                setYearText(event.target.value);
                const next = Number(event.target.value);
                if (event.target.value.length === 4 && next >= 1 && next <= 9999)
                  setMonth(
                    `${String(next).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`,
                  );
              }}
            />
            년
          </label>
          <select
            aria-label="월"
            value={monthNumber}
            onChange={(event) =>
              setMonth(`${String(year).padStart(4, '0')}-${event.target.value.padStart(2, '0')}`)
            }
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}월
              </option>
            ))}
          </select>
          <button type="button" className="button" aria-label="다음 달" onClick={() => shift(1)}>
            <span className="calendar-next-icon">
              <Icon name="back" />
            </span>
          </button>
        </div>
        <div className="calendar-grid" role="group" aria-label={`${year}년 ${monthNumber}월`}>
          {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
            <span className="calendar-weekday" key={day}>
              {day}
            </span>
          ))}
          {Array.from({ length: first }, (_, index) => (
            <span key={`empty-${index}`} />
          ))}
          {Array.from({ length: count }, (_, index) => {
            const date = `${month}-${String(index + 1).padStart(2, '0')}`;
            return (
              <button
                key={date}
                type="button"
                className={`calendar-day${date === value ? ' selected' : ''}${date === today() ? ' today' : ''}`}
                disabled={Boolean((min && date < min) || (max && date > max))}
                aria-label={displayDate(date, true)}
                aria-pressed={date === value}
                aria-current={date === today() ? 'date' : undefined}
                onClick={() => {
                  onChange(date);
                  close();
                }}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={close}>
            취소
          </button>
        </div>
      </Dialog>
      {error && <FieldFeedback id={description} message={error} />}
    </div>
  );
}

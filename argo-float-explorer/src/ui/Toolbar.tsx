import { MONTHS } from './months';

interface Props {
  month: number | 'all';
  onMonthChange: (month: number | 'all') => void;
  visibleCount: number;
  totalCount: number;
  onResetView: () => void;
}

export function Toolbar({ month, onMonthChange, visibleCount, totalCount, onResetView }: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <h1>Argo Float Explorer</h1>
        <p>Indian Ocean · 2019 · synthetic profiles</p>
      </div>

      <div className="toolbar__controls">
        <label htmlFor="month">Month</label>
        <select
          id="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">All 2019</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name} 2019
            </option>
          ))}
        </select>

        <span className="count">
          {visibleCount}/{totalCount} profiles
        </span>

        <button type="button" className="btn" onClick={onResetView}>
          Reset view
        </button>
      </div>
    </header>
  );
}

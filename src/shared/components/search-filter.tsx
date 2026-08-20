import { useEffect, useRef, useState, type ReactNode } from 'react';

const DEBOUNCE_MS = 250;

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional right-aligned mono hint (e.g. "3 of 12"). */
  hint?: ReactNode;
}

/** The app's one list filter: loop icon inside the input, shared layout and
 *  spacing on every list page. */
export default function SearchFilter({
  value,
  onChange,
  placeholder = 'Filter…',
  hint,
}: SearchFilterProps) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  };

  return (
    <div className="okdp-filter-bar">
      <div className="okdp-search-wrapper">
        <i className="pi pi-search search-icon"></i>
        <input
          className="okdp-search-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => commit(e.target.value)}
        />
      </div>
      {hint != null && <div className="filter-hint">{hint}</div>}
    </div>
  );
}

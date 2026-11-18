import React from 'react';
import { pctDelta } from '../lib/stats.js';
import { fmt1 } from '../lib/format.js';

export function Kpi({ label, value, unit, hint, delta }) {
  return (
    <article className="kpi">
      <span>{label}</span>
      <strong>
        {value}
        {unit && <em>{unit}</em>}
      </strong>
      {delta !== undefined ? delta : hint && <small>{hint}</small>}
    </article>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Variazione in percentuale con il termine di confronto accanto. */
export function Delta({ cur, prev, text }) {
  const p = pctDelta(cur, prev);
  if (p === null) return <small className="delta">{text || 'Nessun confronto disponibile'}</small>;
  const flat = Math.abs(p) < 1;
  const cls = flat ? 'flat' : p > 0 ? 'up' : 'down';
  const sign = flat ? '=' : p > 0 ? '▲' : '▼';
  return (
    <small className="delta">
      <span className={`pill ${cls}`}>
        {sign} {fmt1(Math.abs(p))}%
      </span>
      {text}
    </small>
  );
}

/** Selettore a pulsanti, per scegliere una sola voce. */
export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map(([color, text, line]) => (
        <span key={text}>
          <i className={line ? 'ln' : ''} style={{ background: color }} />
          {text}
        </span>
      ))}
    </div>
  );
}

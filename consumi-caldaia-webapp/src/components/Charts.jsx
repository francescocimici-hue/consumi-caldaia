import React from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, ScatterChart, Bar, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts';
import { MONTHS, MONTHS_LONG, monthly, tempMap, monthKey, cumulativeSpend } from '../lib/stats.js';
import { euro, euro0, fmt, fmt1 } from '../lib/format.js';

// Colori letti dal tema (definiti in styles.css), cosi' i grafici seguono chiaro e scuro.
const PALETTE = ['var(--y3)', 'var(--y2)', 'var(--y1)', 'var(--y4)', 'var(--y5)'];
/** L'anno piu' recente prende il colore principale, i precedenti i successivi. */
export const yearColor = (years, y) => PALETTE[Math.min(years.length - 1 - years.indexOf(y), PALETTE.length - 1)];

const tick = { fill: 'var(--muted)', fontSize: 11 };
const tooltipBox = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)', fontSize: 12 };

export function MonthlyChart({ records, temps, years, year, metric, showTemp }) {
  const series = years.map(y => ({ y, v: monthly(records, y)[metric] }));
  const tm = tempMap(temps);
  const data = MONTHS.map((m, i) => {
    const row = { m };
    series.forEach(s => { row[`y${s.y}`] = s.v[i] || null; });
    row.t = tm[monthKey(year, i)] ?? null;
    return row;
  });
  const money = metric === 'sp';
  return (
    <div className="chart" role="img" aria-label={`Grafico mensile di ${money ? 'spesa' : 'ballini'} per anno`}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="16%">
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="m" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
          <YAxis yAxisId="v" tick={tick} tickLine={false} axisLine={false} width={money ? 44 : 32} tickFormatter={v => fmt(v)} />
          {showTemp && (
            <YAxis yAxisId="t" orientation="right" domain={[0, 30]} ticks={[0, 10, 20, 30]} tickFormatter={v => `${v}°`}
              tick={{ ...tick, fill: 'var(--ember)' }} tickLine={false} axisLine={false} width={34} />
          )}
          <Tooltip
            cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }}
            contentStyle={tooltipBox}
            formatter={(v, name) => (name.startsWith('T media') ? `${fmt1(v)} °C` : money ? euro(v) : `${fmt(v)} ballini`)}
          />
          {series.map(s => (
            <Bar key={s.y} yAxisId="v" dataKey={`y${s.y}`} name={String(s.y)} fill={yearColor(years, s.y)}
              fillOpacity={s.y === year ? 1 : 0.55} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          ))}
          {showTemp && (
            <Line yAxisId="t" dataKey="t" name={`T media ${year}`} stroke="var(--ember)" strokeWidth={2}
              dot={{ r: 3, fill: 'var(--surface)', stroke: 'var(--ember)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CumulativeChart({ records, years, todayISO }) {
  const cum = years.map(y => ({ y, v: cumulativeSpend(records, y, todayISO) }));
  const data = MONTHS.map((m, i) => {
    const row = { m };
    cum.forEach(c => { row[`y${c.y}`] = c.v[i] ?? null; });
    return row;
  });
  return (
    <div className="chart" role="img" aria-label="Spesa accumulata da gennaio, per anno">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="m" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval="preserveStartEnd" />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={v => fmt(v)} />
          <Tooltip contentStyle={tooltipBox} formatter={v => euro0(v)} />
          {cum.map(c => (
            <Line key={c.y} dataKey={`y${c.y}`} name={String(c.y)} stroke={yearColor(years, c.y)} strokeWidth={2.2}
              dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TempScatter({ points, years, regression }) {
  const trend = regression
    ? [
        { x: 4, y: Math.max(0, regression.intercept + regression.slope * 4) },
        { x: 29, y: Math.max(0, regression.intercept + regression.slope * 29) }
      ]
    : null;
  return (
    <div className="chart" role="img" aria-label="Ballini al mese in funzione della temperatura media">
      <ResponsiveContainer width="100%" height={250}>
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 14 }}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis type="number" dataKey="t" name="Temperatura" domain={[0, 30]} ticks={[0, 5, 10, 15, 20, 25, 30]} tickFormatter={v => `${v}°`}
            tick={tick} tickLine={false} axisLine={{ stroke: 'var(--line)' }}
            label={{ value: 'Temperatura media del mese', position: 'insideBottom', offset: -8, fill: 'var(--muted)', fontSize: 11 }} />
          <YAxis type="number" dataKey="bags" name="Ballini" domain={[0, 'auto']} tick={tick} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: 'var(--line)' }}
            contentStyle={tooltipBox}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ ...tooltipBox, padding: '6px 10px' }}>
                  <b>{MONTHS_LONG[p.month]} {p.year}</b>
                  <div>{fmt(p.bags)} ballini a {fmt1(p.t)} °C</div>
                </div>
              );
            }}
          />
          {trend && <ReferenceLine segment={[{ x: trend[0].x, y: trend[0].y }, { x: trend[1].x, y: trend[1].y }]} stroke="var(--muted)" strokeDasharray="5 4" strokeWidth={1.5} />}
          {years.map(y => (
            <Scatter key={y} name={String(y)} data={points.filter(p => p.year === y)} fill={yearColor(years, y)} fillOpacity={0.85} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Tracks the rendered width so SVG text stays at its real size instead of scaling with a viewBox. */
function useWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

type Tip = { x: number; y: number; title: string; rows: [string, string | number][] } | undefined
function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
    <strong>{tip.title}</strong>
    {tip.rows.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
  </div>
}

export type Series = { key: string; label: string; color: string }

function Legend({ series }: { series: Series[] }) {
  return <div className="legend">{series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
}

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return <details className="table-view">
    <summary>View as table</summary>
    <div className="table-wrap" style={{ marginTop: '.5rem' }}><table className="data">
      <thead><tr>{head.map((cell, index) => <th key={cell} className={index ? 'num' : ''}>{cell}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={String(row[0])}>{row.map((cell, index) => <td key={index} className={index ? 'num' : ''}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
  </details>
}

/** Horizontal stacked bars: one row per category, segments per series (e.g. pendency by department). */
export function StackedBars({ rows, series, label }: { rows: { label: string; values: Record<string, number> }[]; series: Series[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>()
  const labelWidth = Math.min(190, Math.round(width * 0.36))
  const rowHeight = 30
  const plot = width - labelWidth - 44
  const max = Math.max(1, ...rows.map(row => series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0)))
  const height = rows.length * rowHeight + 8
  return <div className="stack-sm">
    <Legend series={series} />
    <div className="chart" ref={ref} onMouseLeave={() => setTip(undefined)}>
      <svg width={width} height={height} role="img" aria-label={label}>
        <line x1={labelWidth} x2={labelWidth} y1={0} y2={height - 4} stroke="var(--axis)" />
        {rows.map((row, index) => {
          const y = index * rowHeight + 6
          let x = labelWidth
          const total = series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0)
          const segments = series.map(item => ({ item, value: row.values[item.key] ?? 0 })).filter(segment => segment.value > 0)
          return <g key={row.label}
            onMouseMove={event => {
              const box = ref.current!.getBoundingClientRect()
              setTip({ x: event.clientX - box.left, y: y, title: row.label, rows: [...series.map(item => [item.label, row.values[item.key] ?? 0] as [string, number]), ['Total', total]] })
            }}>
            <rect x={0} y={y - 4} width={width} height={rowHeight} fill="transparent" />
            <text x={labelWidth - 8} y={y + 13} textAnchor="end" fontSize="12" fill="var(--ink)">{row.label.length > 26 ? row.label.slice(0, 25) + '…' : row.label}</text>
            {segments.map((segment, part) => {
              const w = Math.max(2, segment.value / max * plot - (part < segments.length - 1 ? 2 : 0))
              const rect = <rect key={segment.item.key} x={x} y={y} width={w} height={18} fill={segment.item.color}
                rx={part === segments.length - 1 ? 4 : 0} />
              x += w + 2
              return rect
            })}
            <text x={x + 4} y={y + 13} fontSize="12" fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</text>
          </g>
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
    <TableView head={['Category', ...series.map(item => item.label), 'Total']}
      rows={rows.map(row => [row.label, ...series.map(item => row.values[item.key] ?? 0), series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0)])} />
  </div>
}

/** Multi-series line chart over days with a crosshair tooltip. */
export function TrendLines({ points, series, label }: { points: { label: string; values: Record<string, number> }[]; series: Series[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number>()
  const height = 210
  const pad = { l: 34, r: 16, t: 12, b: 26 }
  const max = Math.max(2, ...points.flatMap(point => series.map(item => point.values[item.key] ?? 0)))
  const niceMax = Math.ceil(max / 2) * 2
  const x = (index: number) => pad.l + index * (width - pad.l - pad.r) / Math.max(1, points.length - 1)
  const y = (value: number) => pad.t + (1 - value / niceMax) * (height - pad.t - pad.b)
  const ticks = [0, niceMax / 2, niceMax]
  return <div className="stack-sm">
    <Legend series={series} />
    <div className="chart" ref={ref} onMouseLeave={() => setHover(undefined)}
      onMouseMove={event => {
        const box = ref.current!.getBoundingClientRect()
        const index = Math.round((event.clientX - box.left - pad.l) / ((width - pad.l - pad.r) / Math.max(1, points.length - 1)))
        setHover(Math.max(0, Math.min(points.length - 1, index)))
      }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map(tick => <g key={tick}>
          <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" />
          <text x={pad.l - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--chart-muted)">{tick}</text>
        </g>)}
        {points.map((point, index) => {
          const step = Math.ceil(points.length / 7)
          const last = points.length - 1
          return (index === last || (index % step === 0 && last - index >= step * 0.75)) &&
          <text key={point.label} x={x(index)} y={height - 6} textAnchor={index === last ? 'end' : 'middle'} fontSize="11" fill="var(--chart-muted)">{point.label}</text>
        })}
        {hover !== undefined && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--axis)" strokeDasharray="3 3" />}
        {series.map(item => <g key={item.key}>
          <polyline fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            points={points.map((point, index) => `${x(index)},${y(point.values[item.key] ?? 0)}`).join(' ')} />
          {hover !== undefined && <circle cx={x(hover)} cy={y(points[hover].values[item.key] ?? 0)} r={4.5} fill={item.color} stroke="#fff" strokeWidth={2} />}
        </g>)}
      </svg>
      {hover !== undefined && <Tooltip tip={{ x: x(hover), y: pad.t + 10, title: points[hover].label, rows: series.map(item => [item.label, points[hover].values[item.key] ?? 0]) }} />}
    </div>
    <TableView head={['Day', ...series.map(item => item.label)]} rows={points.map(point => [point.label, ...series.map(item => point.values[item.key] ?? 0)])} />
  </div>
}

/** Single-series ranked horizontal bars with end labels (e.g. SLA compliance %). */
export function RankedBars({ rows, label, format = (value: number) => String(value), max, color = 'var(--series-1)', note }: {
  rows: { label: string; value: number; detail?: string }[]; label: string; format?: (value: number) => string; max?: number; color?: string; note?: ReactNode
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip>()
  const labelWidth = Math.min(190, Math.round(width * 0.36))
  const plot = width - labelWidth - 56
  const top = max ?? Math.max(1, ...rows.map(row => row.value))
  const rowHeight = 28
  return <div className="stack-sm">
    <div className="chart" ref={ref} onMouseLeave={() => setTip(undefined)}>
      <svg width={width} height={rows.length * rowHeight + 6} role="img" aria-label={label}>
        <line x1={labelWidth} x2={labelWidth} y1={0} y2={rows.length * rowHeight} stroke="var(--axis)" />
        {rows.map((row, index) => {
          const y = index * rowHeight + 5
          const w = Math.max(2, row.value / top * plot)
          return <g key={row.label} onMouseMove={event => {
            const box = ref.current!.getBoundingClientRect()
            setTip({ x: event.clientX - box.left, y, title: row.label, rows: [[label, format(row.value)], ...(row.detail ? [['Detail', row.detail] as [string, string]] : [])] })
          }}>
            <rect x={0} y={y - 4} width={width} height={rowHeight} fill="transparent" />
            <text x={labelWidth - 8} y={y + 12} textAnchor="end" fontSize="12" fill="var(--ink)">{row.label.length > 26 ? row.label.slice(0, 25) + '…' : row.label}</text>
            <rect x={labelWidth} y={y} width={w} height={16} rx={4} fill={color} />
            <text x={labelWidth + w + 6} y={y + 12} fontSize="12" fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{format(row.value)}</text>
          </g>
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
    {note}
    <TableView head={['Category', label]} rows={rows.map(row => [row.label, format(row.value)])} />
  </div>
}

export const statusSeries: Series[] = [
  { key: 'OPEN', label: 'Pending', color: 'var(--series-1)' },
  { key: 'IN_PROGRESS', label: 'In progress', color: 'var(--series-2)' },
  { key: 'RESOLVED', label: 'Disposed', color: 'var(--series-3)' },
]

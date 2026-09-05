import type { ReactNode } from 'react'
import { formatEur } from '@/lib/money'

/**
 * Charts, built as plain HTML/CSS — no charting library, no client JS.
 *
 * Palette taken from the data-viz reference instance and validated with its
 * checker in BOTH modes before use:
 *
 *   light  #2a78d6 / #eb6834  — CVD ΔE 24.7, normal ΔE 33.6, contrast ≥3:1
 *   dark   #3987e5 / #d95926  — CVD ΔE 26.8, normal ΔE 31.8, contrast ≥3:1
 *
 * Dark values are declared under both the media query and the [data-theme]
 * scope, so an explicit theme choice wins in either direction.
 *
 * Every chart here also ships visible direct labels and, where the numbers
 * matter, a table — identity and value are never carried by colour alone.
 */
export function VizStyles() {
  return (
    <style>{`
      .viz {
        --viz-series-1: #2a78d6;
        --viz-series-2: #eb6834;
        --viz-track:    #e1e0d9;
        --viz-muted:    #898781;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) .viz {
          --viz-series-1: #3987e5;
          --viz-series-2: #d95926;
          --viz-track:    #2c2c2a;
          --viz-muted:    #898781;
        }
      }
      :root[data-theme="dark"] .viz {
        --viz-series-1: #3987e5;
        --viz-series-2: #d95926;
        --viz-track:    #2c2c2a;
      }
    `}</style>
  )
}

export type BarItem = {
  id: string
  label: string
  sublabel?: string
  cents: number
}

export type BarRow = {
  id: string
  label: string
  cents: number
  hint?: string
  /** The rows that add up to `cents`. Omit to make the bar non-expandable —
   *  which is how a private wallet's lump stays a lump. */
  items?: BarItem[]
  /** Optional chart shown above the rows when the bar is expanded. Same rule
   *  as `items`: a row without them cannot be opened, so a private wallet's
   *  lump never gets one. */
  chart?: ReactNode
}

/**
 * Magnitude comparison across a handful of named groups.
 *
 * Horizontal bars because the labels are long words, not dates. One hue —
 * length carries the magnitude, so a second colour would encode nothing.
 * 4px rounded data-end, values direct-labelled.
 *
 * A row with `items` expands to the individual expenses behind it, so "where
 * did 440,66 € go?" is answered in place. Built on <details>, so it costs no
 * client JS, is keyboard-operable for free, and survives with JS disabled. The
 * whole row is the <summary> — per the interaction spec the mark is the hit
 * target, not some separate chevron nobody aims at.
 *
 * Expanding never GATES a value: the bar's own total and percentage stay
 * visible collapsed, and the breakdown only elaborates them.
 *
 * A row WITHOUT items cannot be opened. That is the privacy guarantee doing its
 * job — the other person's personal wallet arrives as one aggregate figure and
 * there is no per-row data here to reveal even by accident.
 */
export function GroupBars({
  rows,
  emptyMessage = 'Nothing spent this cycle.',
}: {
  rows: BarRow[]
  emptyMessage?: string
}) {
  const max = Math.max(...rows.map((row) => row.cents), 1)
  const total = rows.reduce((sum, row) => sum + row.cents, 0)

  if (total === 0) {
    return <p className="mt-3 text-sm text-neutral-500">{emptyMessage}</p>
  }

  return (
    <div className="viz mt-3 space-y-3">
      {rows.map((row) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{row.label}</span>
              <span className="shrink-0 tabular-nums text-sm font-medium">
                {formatEur(row.cents)}
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  {Math.round((row.cents / total) * 100)}%
                </span>
              </span>
            </div>
            <div
              className="mt-1 h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--viz-track)' }}
              role="img"
              aria-label={`${row.label}: ${formatEur(row.cents)}`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((row.cents / max) * 100, 1.5)}%`,
                  background: 'var(--viz-series-1)',
                }}
              />
            </div>
            {row.hint && (
              <p className="mt-0.5 text-xs text-neutral-500">{row.hint}</p>
            )}
          </>
        )

        if (!row.items?.length) {
          return <div key={row.id}>{body}</div>
        }

        return (
          <details key={row.id} className="group">
            <summary className="cursor-pointer list-none rounded-lg outline-offset-2 hover:opacity-80 focus-visible:outline-2">
              {body}
              <span className="mt-0.5 block text-xs text-neutral-500">
                {row.items.length}{' '}
                {row.items.length === 1 ? 'expense' : 'expenses'}
                <span className="group-open:hidden"> · show</span>
                <span className="hidden group-open:inline"> · hide</span>
              </span>
            </summary>

            {row.chart && <div className="mt-2">{row.chart}</div>}

            <ul className="mt-1.5 space-y-1 border-l border-neutral-200 pl-3 dark:border-neutral-800">
              {row.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-xs text-neutral-500">
                    {item.label}
                    {item.sublabel && (
                      <span className="ml-1.5 text-neutral-400">
                        {item.sublabel}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs">
                    {formatEur(item.cents)}
                  </span>
                </li>
              ))}
              {/* Restating the total is the point: it shows the parts actually
                  add up to the bar rather than asking you to trust it. */}
              <li className="flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-1 dark:border-neutral-800">
                <span className="text-xs font-medium">Total</span>
                <span className="shrink-0 tabular-nums text-xs font-medium">
                  {formatEur(row.cents)}
                </span>
              </li>
            </ul>
          </details>
        )
      })}
    </div>
  )
}

/**
 * Two series over time: money in against money out, per pay cycle.
 *
 * Grouped columns rather than a dual axis — both series are euros on one
 * scale, which is the only honest way to put them together. A legend is
 * present because there are two series, and each pair is direct-labelled
 * underneath, so colour is never the sole carrier of identity.
 */
export function CycleColumns({
  cycles,
}: {
  cycles: { label: string; inCents: number; outCents: number }[]
}) {
  const max = Math.max(...cycles.flatMap((c) => [c.inCents, c.outCents]), 1)

  return (
    <div className="viz mt-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--viz-series-1)' }}
          />
          In
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--viz-series-2)' }}
          />
          Out
        </span>
      </div>

      <div className="mt-3 flex items-end gap-2 overflow-x-auto pb-1">
        {cycles.map((cycle) => {
          const net = cycle.inCents - cycle.outCents
          return (
            <div key={cycle.label} className="min-w-16 flex-1">
              {/* 2px gap between adjacent fills, per the mark spec. */}
              <div className="flex h-28 items-end justify-center gap-[2px]">
                <div
                  className="w-1/2 rounded-t"
                  style={{
                    height: `${Math.max((cycle.inCents / max) * 100, 1)}%`,
                    background: 'var(--viz-series-1)',
                  }}
                  role="img"
                  aria-label={`${cycle.label} in: ${formatEur(cycle.inCents)}`}
                />
                <div
                  className="w-1/2 rounded-t"
                  style={{
                    height: `${Math.max((cycle.outCents / max) * 100, 1)}%`,
                    background: 'var(--viz-series-2)',
                  }}
                  role="img"
                  aria-label={`${cycle.label} out: ${formatEur(cycle.outCents)}`}
                />
              </div>
              <p className="mt-1.5 truncate text-center text-xs text-neutral-500">
                {cycle.label.split(' ')[0].slice(0, 3)}
              </p>
              <p
                className={`text-center text-xs tabular-nums ${
                  net < 0 ? 'text-red-600' : 'text-neutral-500'
                }`}
              >
                {net >= 0 ? '+' : ''}
                {Math.round(net / 100)}
              </p>
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Figures under each cycle are the net in euros.
      </p>
    </div>
  )
}

export type DaySpend = {
  /** ISO date, one entry per day of the cycle, in order. */
  date: string
  /** Spent on that day. Zero is a real value here, not a gap. */
  cents: number
}

/**
 * A cycle's spending as a running total.
 *
 * CUMULATIVE, not per-day, and that is the whole point. Expenses are discrete
 * events — six shops in thirty-one days — so a line through daily amounts
 * would dive to zero and back twenty-five times, drawing spending on the
 * Tuesdays you spent nothing. A running total only ever rises, every day has a
 * real value, and the SLOPE is the daily rate.
 *
 * It replaced a sentence that read "at this rate you'll finish around 2.480 €".
 * Same question, but a projection stated as a number invites you to believe a
 * precision it does not have. The line shows the rate and lets you extend it
 * yourself, which is the honest version.
 *
 * `referenceCents` draws a dashed horizontal line — the budget, or income for
 * the whole-cycle chart. Where the climbing line meets it is the day the money
 * runs out, visible days before it happens.
 *
 * Server-rendered SVG: no charting library, no client JS, same as every other
 * chart here. Text lives in HTML around the SVG rather than inside it, so it
 * stays at the page's font size instead of scaling with the viewBox.
 */
export function CumulativeLine({
  days,
  daysElapsed,
  referenceCents = 0,
  referenceLabel,
  label,
  note,
}: {
  days: DaySpend[]
  /** How many days have actually happened. The line stops here, so a live
   *  cycle does not draw a flat run into a future that has not occurred. */
  daysElapsed: number
  referenceCents?: number
  referenceLabel?: string
  /** Describes the series for screen readers, e.g. "Groceries". */
  label: string
  note?: string
}) {
  if (days.length === 0) return null

  // The x-axis is the WHOLE cycle even when half of it is still to come —
  // otherwise a line drawn on day 3 fills the width and looks like a finished
  // month. The empty right-hand side is the days you have left.
  const drawn = days.slice(0, Math.max(daysElapsed, 1))
  // Built with a loop rather than a mutating map callback: the React compiler
  // rejects reassigning a variable from inside one during render.
  const points: { date: string; cents: number }[] = []
  for (const day of drawn) {
    const previous = points.at(-1)?.cents ?? 0
    points.push({ date: day.date, cents: previous + day.cents })
  }
  const totalCents = points.at(-1)?.cents ?? 0

  // Headroom so the line does not touch the top edge, and so a reference line
  // just above the current total is still on the canvas.
  const peak = Math.max(totalCents, referenceCents, 1)
  const top = peak * 1.08

  // PAD keeps the 2px stroke and the end dot inside the viewBox. Without it a
  // cycle on day one draws its dot exactly on the origin and SVG clips three
  // quarters of it away.
  const W = 320
  const H = 110
  const PAD = 4
  const x = (index: number) =>
    days.length === 1
      ? W - PAD
      : PAD + (index / (days.length - 1)) * (W - PAD * 2)
  const y = (cents: number) => H - PAD - (cents / top) * (H - PAD * 2)

  // Starts at zero on day one: the cycle opens having spent nothing, and
  // beginning the line at the first expense would hide when it happened.
  const path = [
    `M ${x(0).toFixed(2)} ${y(0).toFixed(2)}`,
    ...points.map((p, i) => `L ${x(i).toFixed(2)} ${y(p.cents).toFixed(2)}`),
  ].join(' ')
  const base = (H - PAD).toFixed(2)
  const area = `${path} L ${x(points.length - 1).toFixed(2)} ${base} L ${x(0).toFixed(2)} ${base} Z`

  const refY = referenceCents > 0 ? y(referenceCents) : null
  const crossed = referenceCents > 0 && totalCents > referenceCents

  /**
   * X-axis ticks, weekly. Every date cannot be labelled — thirty-one of them
   * across a phone's width is 11px per label — so the axis is marked at the
   * cycle's start, each following week, and its last day, which is enough to
   * place any point on the line to within a day or two. Exact dates are in the
   * expense list underneath; this is an axis, not a table.
   */
  const tickIndexes = [
    ...Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => i * 7),
    days.length - 1,
  ]
    .filter((index, i, all) => all.indexOf(index) === i)
    // Drop a weekly tick that would collide with the final one.
    .filter(
      (index) => index === days.length - 1 || days.length - 1 - index >= 4,
    )
  const ticks = tickIndexes.map((index, i, all) => {
    const date = new Date(`${days[index].date}T00:00:00Z`)
    const previous =
      i === 0 ? null : new Date(`${days[all[i - 1]].date}T00:00:00Z`)
    // The month is repeated only when it changes, or on the two ends. A cycle
    // spans two months, so bare day numbers alone would be ambiguous.
    const showMonth =
      i === 0 ||
      i === all.length - 1 ||
      previous === null ||
      previous.getUTCMonth() !== date.getUTCMonth()
    return {
      index,
      percent: (x(index) / W) * 100,
      label: showMonth ? shortDay(days[index].date) : String(date.getUTCDate()),
    }
  })

  /**
   * The days money actually left, marked on the line. Only when there are few
   * enough to read: past a dozen the dots merge into the stroke and the chart
   * is worse for them. A whole cycle's spending is always past that, which is
   * correct — that chart is about the shape, not the individual days.
   */
  const spendDays = points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => drawn[point.index].cents > 0)
  const showSpendDays = spendDays.length > 0 && spendDays.length <= 12

  return (
    <div className="viz">
      {referenceLabel && referenceCents > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span
            className="inline-block h-0 w-4 border-t border-dashed"
            style={{ borderColor: 'var(--viz-series-2)' }}
          />
          {referenceLabel} {formatEur(referenceCents)}
        </p>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1.5 h-auto w-full"
        role="img"
        aria-label={`${label}: ${formatEur(totalCents)} spent over ${daysElapsed} ${daysElapsed === 1 ? 'day' : 'days'}, as a running total${
          referenceCents > 0
            ? `, against ${referenceLabel ?? 'a limit'} of ${formatEur(referenceCents)}`
            : ''
        }`}
      >
        {/* Baseline. Zero is where the axis is, so it is drawn, not implied. */}
        <line
          x1="0"
          y1={H - PAD}
          x2={W}
          y2={H - PAD}
          stroke="var(--viz-track)"
          strokeWidth="1"
        />
        {/* One faint rule per tick, so a step in the line can be read back to
            a date instead of eyeballed against the ends. */}
        {ticks.slice(1, -1).map((tick) => (
          <line
            key={tick.index}
            x1={x(tick.index).toFixed(2)}
            y1={PAD}
            x2={x(tick.index).toFixed(2)}
            y2={H - PAD}
            stroke="var(--viz-track)"
            strokeWidth="1"
          />
        ))}
        {refY !== null && (
          <line
            x1="0"
            y1={refY.toFixed(2)}
            x2={W}
            y2={refY.toFixed(2)}
            stroke="var(--viz-series-2)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        )}
        <path d={area} fill="var(--viz-series-1)" fillOpacity="0.12" />
        <path
          d={path}
          fill="none"
          stroke="var(--viz-series-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* A dot per day money went out, so the flat stretches read as "nothing
            happened" rather than "no data". */}
        {showSpendDays &&
          spendDays.map((point) => (
            <circle
              key={point.date}
              cx={x(point.index).toFixed(2)}
              cy={y(point.cents).toFixed(2)}
              r="2"
              fill="var(--viz-series-1)"
            >
              {/* <title> is the SVG-native tooltip: hover detail for free, no
                  client JS, and read out by screen readers.

                  ONE STRING child, built beforehand. React 19 supports only a
                  single string here — a fragment of expressions renders as an
                  empty <title> and the text is silently dropped. */}
              <title>{`${shortDay(point.date)} · ${formatEur(
                drawn[point.index].cents,
              )} · running total ${formatEur(point.cents)}`}</title>
            </circle>
          ))}
        {/* Where the line has got to today. The one point worth marking: it is
            the number every other figure on the page is talking about. */}
        <circle
          cx={x(points.length - 1).toFixed(2)}
          cy={y(totalCents).toFixed(2)}
          r="3"
          fill="var(--viz-series-1)"
        />
      </svg>

      {/* Tick labels are HTML positioned over the SVG's own x-scale rather
          than <text> inside it: text in the viewBox would scale with the chart
          and stop matching the page's font size. */}
      <div className="relative mt-1 h-4 text-xs text-neutral-500">
        {ticks.map((tick, i) => (
          <span
            key={tick.index}
            className="absolute whitespace-nowrap tabular-nums"
            style={
              i === 0
                ? { left: 0 }
                : i === ticks.length - 1
                  ? { right: 0 }
                  : { left: `${tick.percent}%`, transform: 'translateX(-50%)' }
            }
          >
            {tick.label}
          </span>
        ))}
      </div>

      {/* Restating the end value in figures, because the dot's height is a
          position and positions are not readable to the cent. */}
      <p className="mt-0.5 tabular-nums text-xs text-neutral-500">
        {formatEur(totalCents)}
        {referenceCents > 0 && (
          <span className={crossed ? 'text-amber-600' : ''}>
            {' '}
            {crossed
              ? `· ${formatEur(totalCents - referenceCents)} over`
              : `· ${formatEur(referenceCents - totalCents)} left`}
          </span>
        )}
      </p>

      {note && <p className="mt-1 text-xs text-neutral-500">{note}</p>}
    </div>
  )
}

function shortDay(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

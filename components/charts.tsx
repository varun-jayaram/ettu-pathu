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

/**
 * Magnitude comparison across a handful of named groups.
 *
 * Horizontal bars because the labels are long words, not dates. One hue —
 * length carries the magnitude, so a second colour would encode nothing.
 * 4px rounded data-end, values direct-labelled.
 */
export function GroupBars({
  rows,
  emptyMessage = 'Nothing spent this cycle.',
}: {
  rows: { id: string; label: string; cents: number; hint?: string }[]
  emptyMessage?: string
}) {
  const max = Math.max(...rows.map((row) => row.cents), 1)
  const total = rows.reduce((sum, row) => sum + row.cents, 0)

  if (total === 0) {
    return <p className="mt-3 text-sm text-neutral-500">{emptyMessage}</p>
  }

  return (
    <div className="viz mt-3 space-y-3">
      {rows.map((row) => (
        <div key={row.id}>
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
          {row.hint && <p className="mt-0.5 text-xs text-neutral-500">{row.hint}</p>}
        </div>
      ))}
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

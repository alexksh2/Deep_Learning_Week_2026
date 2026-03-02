"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip as RechartsTooltip, Legend, Cell,
} from "recharts"
import { Loader2, AlertCircle } from "lucide-react"

// ── Instrument catalogue ──────────────────────────────────────────────────────

interface InstrumentOption {
  ticker: string
  name: string
  strategy: string
}

const INSTRUMENTS: InstrumentOption[] = [
  { ticker: "USMV",  name: "iShares MSCI USA Min Vol Factor ETF",               strategy: "Low Volatility" },
  { ticker: "MTUM",  name: "iShares MSCI USA Momentum Factor ETF",              strategy: "Momentum" },
  { ticker: "QUAL",  name: "iShares MSCI USA Quality Factor ETF",               strategy: "Quality" },
  { ticker: "SPLV",  name: "Invesco S&P 500 Low Volatility ETF",                strategy: "Low Volatility" },
  { ticker: "SPHQ",  name: "Invesco S&P 500 Quality ETF",                       strategy: "Quality" },
  { ticker: "IWM",   name: "iShares Russell 2000 ETF",                          strategy: "Size" },
  { ticker: "IWC",   name: "iShares Micro-Cap ETF",                             strategy: "Size / Illiquidity" },
  { ticker: "IWN",   name: "iShares Russell 2000 Value ETF",                    strategy: "Value / Size" },
  { ticker: "PRFZ",  name: "Invesco FTSE RAFI US 1500 Small-Mid ETF",           strategy: "Fundamental / Illiquidity" },
  { ticker: "DBV",   name: "Invesco DB G10 Currency Harvest Fund",              strategy: "Carry" },
  { ticker: "FXA",   name: "Invesco CurrencyShares Australian Dollar Trust",    strategy: "Carry" },
  { ticker: "XMLV",  name: "Invesco S&P MidCap Low Volatility ETF",             strategy: "Low Volatility" },
  { ticker: "XSLV",  name: "Invesco S&P SmallCap Low Volatility ETF",           strategy: "Low Volatility" },
]

const FACTOR_LIST = ["MKT", "SMB", "HML", "MOM", "BAB", "QMJ", "RMW", "CARRY", "ILLIQ"]

const FACTOR_COLORS: Record<string, string> = {
  MKT:   "#6366f1",
  SMB:   "#f59e0b",
  HML:   "#10b981",
  MOM:   "#3b82f6",
  BAB:   "#8b5cf6",
  QMJ:   "#ec4899",
  RMW:   "#14b8a6",
  CARRY: "#f97316",
  ILLIQ: "#ef4444",
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FactorLoading {
  beta: number; se: number | null; tstat: number | null; pval: number | null
}
interface Check1 {
  alpha: number | null; alpha_pval: number | null; alpha_tstat: number | null
  r_squared: number | null; adj_r2: number | null
  factors: Record<string, FactorLoading>
}
interface Check2Row {
  date: string; alpha?: number | null
  [factor: string]: number | null | string | undefined
}
interface ETFResult {
  name: string; strategy: string; target_factors: string[]
  expense_ratio: number; n_obs: number
  check1: Check1
  check2: Check2Row[]
  cumulative_return: { date: string; value: number | null }[]
  price_history:     { date: string; price: number | null }[]
}
interface FactorCorrelation {
  factors: string[]
  matrix:  (number | null)[][]
}

// ── Correlation heatmap ───────────────────────────────────────────────────────

function corrColor(v: number | null): string {
  if (v === null) return "#888"
  // blue (-1) → white (0) → red (+1)
  if (v >= 0) {
    const r = Math.round(255 - 16  * v)
    const g = Math.round(255 - 187 * v)
    const b = Math.round(255 - 187 * v)
    return `rgb(${r},${g},${b})`
  }
  const t = -v
  const r = Math.round(255 - 196 * t)
  const g = Math.round(255 - 125 * t)
  const b = Math.round(255 - 9   * t)
  return `rgb(${r},${g},${b})`
}

function CorrelationHeatmap({ data }: { data: FactorCorrelation }) {
  const { factors, matrix } = data
  const n         = factors.length
  const CELL      = 46
  const LABEL_W   = 40
  const LABEL_H   = 36
  const W         = LABEL_W + n * CELL
  const H         = LABEL_H + n * CELL

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ display: "block", margin: "0 auto" }}
      >
        {/* Column labels (top) */}
        {factors.map((f, j) => (
          <text
            key={`col-${f}`}
            x={LABEL_W + j * CELL + CELL / 2}
            y={LABEL_H - 6}
            textAnchor="middle"
            fontSize={10}
            fontFamily="monospace"
            fill="currentColor"
            opacity={0.7}
          >
            {f}
          </text>
        ))}

        {/* Row labels (left) */}
        {factors.map((f, i) => (
          <text
            key={`row-${f}`}
            x={LABEL_W - 5}
            y={LABEL_H + i * CELL + CELL / 2 + 4}
            textAnchor="end"
            fontSize={10}
            fontFamily="monospace"
            fill="currentColor"
            opacity={0.7}
          >
            {f}
          </text>
        ))}

        {/* Cells */}
        {matrix.map((row, i) =>
          row.map((v, j) => {
            const x   = LABEL_W + j * CELL
            const y   = LABEL_H + i * CELL
            const abs = Math.abs(v ?? 0)
            return (
              <g key={`${i}-${j}`}>
                <rect
                  x={x} y={y} width={CELL} height={CELL}
                  fill={corrColor(v)}
                  stroke="white" strokeWidth={0.8}
                  rx={2}
                />
                <text
                  x={x + CELL / 2}
                  y={y + CELL / 2 + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="monospace"
                  fill={abs > 0.55 ? "white" : "#374151"}
                >
                  {v !== null ? v.toFixed(2) : ""}
                </text>
              </g>
            )
          })
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <span className="text-[10px] text-muted-foreground">−1</span>
        <div
          className="h-2 w-32 rounded"
          style={{
            background: "linear-gradient(to right, rgb(59,130,246), white, rgb(239,68,68))",
          }}
        />
        <span className="text-[10px] text-muted-foreground">+1</span>
      </div>
    </div>
  )
}

// ── Chart tooltips ────────────────────────────────────────────────────────────

function LoadingTooltip({ active, payload, targetFactors }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const isTarget = targetFactors.includes(d.factor)
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-[11px] shadow-sm space-y-0.5">
      <p className="font-semibold font-mono">{d.factor}</p>
      <p>β = {d.beta.toFixed(4)}</p>
      {d.se    !== null && <p>SE = {d.se.toFixed(4)}</p>}
      {d.tstat !== null && <p>t = {d.tstat.toFixed(2)}</p>}
      {d.pval  !== null && <p>p = {d.pval.toFixed(4)}</p>}
      {isTarget && <p className="text-chart-2 font-medium">★ target factor</p>}
    </div>
  )
}

function RollingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-[11px] shadow-sm space-y-0.5">
      <p className="font-semibold text-muted-foreground font-mono">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {p.value?.toFixed(4) ?? "—"}
        </p>
      ))}
    </div>
  )
}

function FactorAxisTick({
  x,
  y,
  payload,
  targetFactors,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  targetFactors: string[]
}) {
  const value = payload?.value ?? ""
  const isTarget = targetFactors.includes(value)
  return (
    <text
      x={x}
      y={y}
      dx={-6}
      dy={4}
      textAnchor="end"
      fill={isTarget ? "var(--color-chart-2)" : "var(--color-foreground)"}
      fontFamily="monospace"
      fontSize={11}
      fontWeight={isTarget ? 700 : 500}
    >
      {value}
      {isTarget ? " ★" : ""}
    </text>
  )
}

function RollingLegend({
  payload,
  targetFactors,
}: {
  payload?: Array<{ value?: string; color?: string }>
  targetFactors: string[]
}) {
  if (!payload?.length) return null

  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
      {payload.map((entry) => {
        const factor = entry.value ?? ""
        const isTarget = targetFactors.includes(factor)
        return (
          <span
            key={factor}
            className="inline-flex items-center gap-1.5 font-mono"
            style={{
              color: isTarget ? "var(--color-chart-2)" : "var(--color-muted-foreground)",
              fontWeight: isTarget ? 700 : 400,
            }}
          >
            <span
              className="inline-block h-0.5 w-3 rounded"
              style={{ backgroundColor: entry.color ?? "currentColor" }}
            />
            {factor}
            {isTarget ? " ★" : ""}
          </span>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [selectedTicker, setSelectedTicker]                 = useState("USMV")
  const [manualTicker, setManualTicker]                     = useState("")
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [result, setResult]                 = useState<ETFResult | null>(null)
  const [factorCorr, setFactorCorr]         = useState<FactorCorrelation | null>(null)
  const [activeTicker, setActiveTicker]     = useState<string>("")

  async function runAnalysis() {
    const tickerToAnalyze = manualTicker.trim().toUpperCase() || selectedTicker
    if (!tickerToAnalyze) {
      setError("Enter an ETF ticker")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res  = await fetch(`/api/analysis/smart-beta?tickers=${encodeURIComponent(tickerToAnalyze)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Analysis failed"); return }

      const etfResult = data[tickerToAnalyze]
      if (!etfResult) { setError(`No result returned for ${tickerToAnalyze}`); return }

      setResult(etfResult)
      setFactorCorr(data["_factor_correlation"] ?? null)
      setActiveTicker(tickerToAnalyze)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Derived chart data ──────────────────────────────────────────────────────

  const loadingBarData = result
    ? FACTOR_LIST
        .filter(f => result.check1.factors[f] !== undefined)
        .map(f => ({
          factor: f,
          beta:   result.check1.factors[f].beta,
          se:     result.check1.factors[f].se,
          tstat:  result.check1.factors[f].tstat,
          pval:   result.check1.factors[f].pval,
          sig:    (result.check1.factors[f].pval ?? 1) < 0.05,
        }))
    : []

  const rollingFactors = result
    ? FACTOR_LIST.filter(f =>
        result.check2.some(row => row[f] !== null && row[f] !== undefined)
      )
    : []

  const rollingData = result?.check2.map(row => ({
    date: row.date.slice(0, 7),
    ...Object.fromEntries(rollingFactors.map(f => [f, row[f] ?? null])),
  })) ?? []

  const priceData = result?.price_history ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Smart Beta Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Factor loadings (OLS), rolling 36-month beta stability, and factor correlation matrix.
          Sources: Ken French library, FRED, Yahoo Finance.
        </p>
      </div>

      {/* Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedTicker} onValueChange={setSelectedTicker}>
          <SelectTrigger className="w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSTRUMENTS.map((instrument) => (
              <SelectItem key={instrument.ticker} value={instrument.ticker}>
                <span className="font-mono font-semibold mr-2">{instrument.ticker}</span>
                <span className="text-muted-foreground text-xs">{instrument.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={manualTicker}
          onChange={(event) => setManualTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))}
          placeholder="Manual ticker (e.g. USMV)"
          className="w-56 font-mono"
        />
        <Button onClick={runAnalysis} disabled={loading || (!selectedTicker && !manualTicker.trim())} size="sm">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Running…</>
            : "Analyse"}
        </Button>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">
          Loading from cache or downloading from Ken French + FRED + Yahoo Finance…
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <>
          {/* Metadata strip */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg font-bold">{activeTicker}</span>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
              ETF
            </span>
            <span className="text-sm text-muted-foreground">{result.name}</span>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              N={result.n_obs}mo · ER {(result.expense_ratio * 100).toFixed(2)}%
              · R² {result.check1.r_squared?.toFixed(3)}
              · adj-R² {result.check1.adj_r2?.toFixed(3)}
              {result.check1.alpha !== null && (
                <> · α {(result.check1.alpha * 12 * 100).toFixed(2)}%p.a.
                  {result.check1.alpha_pval !== null && ` (p=${result.check1.alpha_pval.toFixed(3)})`}
                </>
              )}
            </span>
          </div>

          {/* Price history + factor loadings side by side on wide screens */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Instrument price history */}
            {priceData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Price History (base 100)
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Monthly adjusted-close, rebased to 100 at inception.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={priceData} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                        <defs>
                          <linearGradient id="px-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="var(--color-chart-2)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0}   />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                          interval="preserveStartEnd" minTickGap={60}
                          tickFormatter={d => d.slice(0, 7)} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                          tickFormatter={v => v.toFixed(0)} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: "6px", fontSize: 11 }}
                          formatter={(v: any) => [v?.toFixed(1), "Price"]}
                          labelFormatter={l => l.slice(0, 7)}
                        />
                        <Area type="monotone" dataKey="price"
                          stroke="var(--color-chart-2)" strokeWidth={1.5}
                          fill="url(#px-grad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Factor loadings */}
            <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Factor Loadings (Full-Sample OLS)
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                  Newey-West HAC SEs. Filled = significant (p&lt;5%). ★ = target factor (bolded).
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={loadingBarData} layout="vertical"
                      margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                      <XAxis type="number" domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        tickFormatter={v => v.toFixed(2)} />
                      <YAxis
                        type="category"
                        dataKey="factor"
                        width={58}
                        tick={(props) => <FactorAxisTick {...props} targetFactors={result.target_factors} />}
                      />
                      <ReferenceLine x={0} stroke="var(--color-border)" strokeWidth={1.5} />
                      <RechartsTooltip content={<LoadingTooltip targetFactors={result.target_factors} />} cursor={{ fill: "transparent" }} />
                      <Bar dataKey="beta" radius={[0, 3, 3, 0]} maxBarSize={20}>
                        {loadingBarData.map(d => (
                          <Cell
                            key={d.factor}
                            fill={
                              result.target_factors.includes(d.factor) ? "var(--color-chart-2)"
                              : d.sig   ? FACTOR_COLORS[d.factor] ?? "var(--color-chart-1)"
                              :           "var(--color-muted-foreground)"
                            }
                            fillOpacity={d.sig ? 1 : 0.3}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rolling 36-month betas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Rolling 36-Month Factor Betas
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Each window = 36 months of OLS. ★ = target factor (bolded).
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rollingData} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date"
                      tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                      interval="preserveStartEnd" minTickGap={60} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                      tickFormatter={v => v.toFixed(2)} />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1.5} />
                    <RechartsTooltip content={<RollingTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      content={(props) => (
                        <RollingLegend payload={props.payload as Array<{ value?: string; color?: string }>} targetFactors={result.target_factors} />
                      )}
                    />
                    {rollingFactors.map(f => (
                      <Line key={f} type="monotone" dataKey={f}
                        stroke={FACTOR_COLORS[f] ?? "#888"}
                        strokeWidth={result.target_factors.includes(f) ? 2.5 : 1.25}
                        dot={false} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Factor correlation heatmap */}
          {factorCorr && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Factor Correlation Matrix
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  Pearson correlations across the full sample. Blue = negative, Red = positive.
                </p>
              </CardHeader>
              <CardContent className="flex justify-center py-2">
                <CorrelationHeatmap data={factorCorr} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && !error && !result && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <p className="text-sm text-muted-foreground">Select an ETF or enter a manual ticker, then click Analyse.</p>
          <p className="text-xs text-muted-foreground mt-1">
            First run: ~20–30 s to download. Subsequent runs load from parquet cache instantly.
          </p>
        </div>
      )}
    </div>
  )
}

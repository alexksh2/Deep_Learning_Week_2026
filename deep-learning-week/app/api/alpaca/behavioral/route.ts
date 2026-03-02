import { NextResponse } from "next/server"
import { isConfigured, getOrders } from "@/lib/alpaca"
import type { AlpacaOrder } from "@/lib/alpaca"
import type { MasteryTrend } from "@/lib/types"

export interface BehavioralSignals {
  fatFingerRisk:       number
  fatFingerTrend:      MasteryTrend
  revengeTradeRisk:    number
  revengeTradeTrend:   MasteryTrend
  stopLossDiscipline:  number
  stopLossTrend:       MasteryTrend
  slippageSensitivity: number
  slippageTrend:       MasteryTrend
  // derived readiness sub-scores
  riskDiscipline:      number
  executionQuality:    number
  composite:           number
  explanation:         string
}

function trend(recent: number, prior: number): MasteryTrend {
  if (recent > prior + 3) return "up"
  if (recent < prior - 3) return "down"
  return "flat"
}

function groupByDate(orders: AlpacaOrder[]): Record<string, AlpacaOrder[]> {
  const byDate: Record<string, AlpacaOrder[]> = {}
  for (const o of orders) {
    const date = (o.filled_at ?? o.created_at).split("T")[0]
    if (!byDate[date]) byDate[date] = []
    byDate[date].push(o)
  }
  return byDate
}

function computeSignals(orders: AlpacaOrder[]): BehavioralSignals {
  const byDate = groupByDate(orders)
  const dates = Object.keys(byDate).sort()
  const totalDays = dates.length || 1

  // Split dates into recent (last 5) and prior (5 before that) for trends
  const recentDates = new Set(dates.slice(-5))
  const priorDates  = new Set(dates.slice(-10, -5))

  // ── Fat Finger Risk (0–100, higher = worse) ────────────────────────
  // Orders where qty > 2× the user's own median order qty are flagged.
  // fat_finger_risk = flagged_orders / total_orders × 100 (scaled ×2 for sensitivity)
  const allQtys = orders.map(o => parseFloat(o.qty)).filter(q => q > 0).sort((a, b) => a - b)
  const medianQty = allQtys.length
    ? allQtys[Math.floor(allQtys.length / 2)]
    : 0

  function fatFingerCount(subset: AlpacaOrder[]): number {
    if (!medianQty) return 0
    return subset.filter(o => parseFloat(o.qty) > medianQty * 2).length
  }

  const fatFingerRisk = orders.length === 0 ? 0
    : Math.min(Math.round((fatFingerCount(orders) / orders.length) * 200), 100)

  function fatFingerScore(dateset: Set<string>): number {
    const subset = orders.filter(o => dateset.has((o.filled_at ?? o.created_at).split("T")[0]))
    if (!subset.length) return 0
    return Math.min(Math.round((fatFingerCount(subset) / subset.length) * 200), 100)
  }
  const fatFingerTrend = trend(fatFingerScore(recentDates), fatFingerScore(priorDates))

  // ── Revenge Trade Risk (0–100, higher = worse) ─────────────────────
  // market orders placed within 5 min of a prior fill on the same symbol
  const filled = orders
    .filter(o => o.status === "filled" && o.filled_at)
    .sort((a, b) => a.filled_at!.localeCompare(b.filled_at!))

  let burstCount = 0
  for (let i = 1; i < filled.length; i++) {
    const prev = filled[i - 1]
    const curr = filled[i]
    const diffMs = new Date(curr.filled_at!).getTime() - new Date(prev.filled_at!).getTime()
    if (curr.symbol === prev.symbol && diffMs < 5 * 60_000 && curr.type === "market") {
      burstCount++
    }
  }
  const revengeTradeRisk = Math.min(Math.round((burstCount / Math.max(filled.length, 1)) * 500), 100)

  // Trend: recent burst rate vs prior burst rate
  function burstRate(dateset: Set<string>) {
    const subset = filled.filter(o => dateset.has((o.filled_at ?? o.created_at).split("T")[0]))
    let bursts = 0
    for (let i = 1; i < subset.length; i++) {
      const prev = subset[i - 1]
      const curr = subset[i]
      const diffMs = new Date(curr.filled_at!).getTime() - new Date(prev.filled_at!).getTime()
      if (curr.symbol === prev.symbol && diffMs < 5 * 60_000 && curr.type === "market") bursts++
    }
    return Math.min(Math.round((bursts / Math.max(subset.length, 1)) * 500), 100)
  }
  const revengeTradeTrend = trend(burstRate(recentDates), burstRate(priorDates))

  // ── Stop-Loss Discipline (0–100, higher = better) ──────────────────
  // Among days where the user placed at least one market or limit order (i.e. actively traded),
  // what % also had a stop or stop_limit order placed.
  const activeTradingDates = dates.filter(d =>
    byDate[d].some(o => o.type === "market" || o.type === "limit")
  )
  const daysWithStops = activeTradingDates.filter(d =>
    byDate[d].some(o => (o.type === "stop" || o.type === "stop_limit") && o.status === "filled")
  ).length
  const stopLossDiscipline = activeTradingDates.length === 0
    ? 0
    : Math.round((daysWithStops / activeTradingDates.length) * 100)

  function stopDisciplineScore(dateset: Set<string>): number {
    const activeDays = [...dateset].filter(d =>
      byDate[d]?.some(o => o.type === "market" || o.type === "limit")
    )
    if (!activeDays.length) return 50
    const withStops = activeDays.filter(d =>
      byDate[d]?.some(o => (o.type === "stop" || o.type === "stop_limit") && o.status === "filled")
    ).length
    return Math.round((withStops / activeDays.length) * 100)
  }
  const stopLossTrend = trend(stopDisciplineScore(recentDates), stopDisciplineScore(priorDates))

  // ── Slippage (avg bps on filled limit orders; score 0–100, higher = better) ──
  // slippage_bps = abs(filled_avg_price − limit_price) / limit_price × 10,000
  // Cap at 50 bps as worst case, invert to a score: score = 100 − min(avgBps / 50 × 100, 100)
  const MAX_BPS = 50

  function avgSlippageBps(subset: AlpacaOrder[]): number | null {
    const filledLimits = subset.filter(
      o => (o.type === "limit" || o.type === "stop_limit") &&
           o.status === "filled" &&
           o.filled_avg_price != null &&
           o.limit_price != null
    )
    if (!filledLimits.length) return null
    const totalBps = filledLimits.reduce((sum, o) => {
      const fill  = parseFloat(o.filled_avg_price!)
      const limit = parseFloat(o.limit_price!)
      return sum + (Math.abs(fill - limit) / limit) * 10_000
    }, 0)
    return totalBps / filledLimits.length
  }

  const overallBps = avgSlippageBps(orders)
  const slippageSensitivity = overallBps == null
    ? 50  // no limit orders yet — neutral
    : Math.round(100 - Math.min(overallBps / MAX_BPS * 100, 100))

  function slippageScore(dateset: Set<string>): number {
    const subset = orders.filter(o => dateset.has((o.filled_at ?? o.created_at).split("T")[0]))
    const bps = avgSlippageBps(subset)
    return bps == null ? 50 : Math.round(100 - Math.min(bps / MAX_BPS * 100, 100))
  }
  const slippageTrend = trend(slippageScore(recentDates), slippageScore(priorDates))

  // ── Derived readiness scores ────────────────────────────────────────
  const riskDiscipline   = Math.round((stopLossDiscipline + (100 - revengeTradeRisk)) / 2)
  const executionQuality = Math.round((slippageSensitivity + (100 - fatFingerRisk)) / 2)
  const composite        = Math.round((riskDiscipline + executionQuality) / 2)

  const weaknesses: string[] = []
  if (fatFingerRisk > 20)      weaknesses.push("oversized order events detected")
  if (revengeTradeRisk > 50)   weaknesses.push("rapid re-entry patterns")
  if (stopLossDiscipline < 50) weaknesses.push("inconsistent stop placement")
  if (slippageSensitivity < 40) weaknesses.push("poor limit-order fill quality")

  const explanation = weaknesses.length
    ? `Composite reflects: ${weaknesses.join(", ")}.`
    : "Behavioral signals are within healthy ranges."

  return {
    fatFingerRisk,
    fatFingerTrend,
    revengeTradeRisk,
    revengeTradeTrend,
    stopLossDiscipline,
    stopLossTrend,
    slippageSensitivity,
    slippageTrend,
    riskDiscipline,
    executionQuality,
    composite,
    explanation,
  }
}

const FALLBACK: BehavioralSignals = {
  fatFingerRisk: 0, fatFingerTrend: "flat",
  revengeTradeRisk: 0, revengeTradeTrend: "flat",
  stopLossDiscipline: 0, stopLossTrend: "flat",
  slippageSensitivity: 0, slippageTrend: "flat",
  riskDiscipline: 0, executionQuality: 0, composite: 0,
  explanation: "No order history yet.",
}

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(FALLBACK)
  }
  try {
    const orders = await getOrders("all", 500) as AlpacaOrder[]
    return NextResponse.json(computeSignals(orders))
  } catch {
    return NextResponse.json(FALLBACK)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { isConfigured, alpacaFetch } from "@/lib/alpaca"

interface PortfolioHistory {
  timestamp: number[]
  equity: number[]
  profit_loss: number[]
}

export interface PerformancePoint {
  date: string
  equity: number
  pnl: number
  drawdown: number
}

function toDateKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().split("T")[0]
}

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }

  try {
    const params = req.nextUrl.searchParams
    const period = params.get("period") ?? "1M"
    const timeframe = params.get("timeframe") ?? "1D"

    const history = await alpacaFetch<PortfolioHistory>(
      `/v2/account/portfolio/history?period=${encodeURIComponent(period)}&timeframe=${encodeURIComponent(timeframe)}`,
    )

    const byDate = new Map<string, { equity: number; pnl: number }>()
    const timestamps = history.timestamp ?? []
    const equities = history.equity ?? []
    const pnls = history.profit_loss ?? []

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i]
      const equity = equities[i]
      const pnl = pnls[i]
      if (!Number.isFinite(ts) || !Number.isFinite(equity) || !Number.isFinite(pnl)) continue
      byDate.set(toDateKey(ts), { equity, pnl })
    }

    const ordered = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))

    let peak = Number.NEGATIVE_INFINITY
    const points: PerformancePoint[] = ordered.map(([date, value]) => {
      peak = Math.max(peak, value.equity)
      return {
        date,
        equity: value.equity,
        pnl: value.pnl,
        drawdown: value.equity - peak,
      }
    })

    return NextResponse.json(points)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

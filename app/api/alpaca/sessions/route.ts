import { NextResponse } from "next/server"
import { isConfigured, getOrders, alpacaFetch } from "@/lib/alpaca"
import type { AlpacaOrder } from "@/lib/alpaca"

interface PortfolioHistory {
  timestamp: number[]
  profit_loss: number[]
}

export interface SessionSummary {
  date: string         // YYYY-MM-DD
  instruments: string[]
  numTrades: number    // filled orders only
  pnl: number          // daily profit_loss from portfolio history
  canceledCount: number
}

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    // Fetch last 500 closed orders + 1 month portfolio history in parallel
    const [orders, history] = await Promise.all([
      getOrders("closed", 500) as Promise<AlpacaOrder[]>,
      alpacaFetch<PortfolioHistory>("/v2/account/portfolio/history?period=1M&timeframe=1D"),
    ])

    // Build daily PnL map from portfolio history { "YYYY-MM-DD": pnl }
    const pnlByDate: Record<string, number> = {}
    history.timestamp.forEach((ts, i) => {
      const date = new Date(ts * 1000).toISOString().split("T")[0]
      pnlByDate[date] = history.profit_loss[i] ?? 0
    })

    // Group orders by date
    const byDate: Record<string, AlpacaOrder[]> = {}
    for (const order of orders) {
      const date = (order.filled_at ?? order.created_at).split("T")[0]
      if (!byDate[date]) byDate[date] = []
      byDate[date].push(order)
    }

    // Build session summaries, newest first
    const sessions: SessionSummary[] = Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, dayOrders]) => {
        const filled = dayOrders.filter(o => o.status === "filled")
        const symbols = [...new Set(dayOrders.map(o => o.symbol))]
        return {
          date,
          instruments: symbols,
          numTrades: filled.length,
          canceledCount: dayOrders.length - filled.length,
          pnl: pnlByDate[date] ?? 0,
        }
      })

    return NextResponse.json(sessions)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

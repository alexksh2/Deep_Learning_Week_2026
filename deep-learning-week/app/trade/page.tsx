"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  Info,
  Shield,
  Crosshair,
  Eye,
} from "lucide-react"
import {
  behavioralMetrics,
  tradingReadiness,
  coachingInsights,
} from "@/lib/mock"
import type { MasteryTrend } from "@/lib/types"
import type { SessionSummary } from "@/app/api/alpaca/sessions/route"
import type { PerformancePoint } from "@/app/api/alpaca/performance/route"

function TrendArrow({ trend }: { trend: MasteryTrend }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-chart-2" />
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

export default function TradePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [performance, setPerformance] = useState<PerformancePoint[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [performanceLoading, setPerformanceLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadTradeData() {
      try {
        const [sessionsRes, perfRes] = await Promise.all([
          fetch("/api/alpaca/sessions"),
          fetch("/api/alpaca/performance?period=1M&timeframe=1D"),
        ])

        if (!active) return

        if (sessionsRes.ok) {
          const data = await sessionsRes.json()
          setSessions(Array.isArray(data) ? data : [])
        } else {
          setSessions([])
        }

        if (perfRes.ok) {
          const data = await perfRes.json()
          setPerformance(Array.isArray(data) ? data : [])
        } else {
          setPerformance([])
        }
      } finally {
        if (active) {
          setSessionsLoading(false)
          setPerformanceLoading(false)
        }
      }
    }

    loadTradeData()
    return () => {
      active = false
    }
  }, [])

  const equityData = performance.map((point) => ({
    date: point.date,
    pnl: point.pnl,
  }))

  const drawdownData = performance.map((point) => ({
    date: point.date,
    drawdown: point.drawdown,
  }))

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trade</h1>
          <p className="text-sm text-muted-foreground">
            Paper trading metrics, behavioral coaching, and session review.
          </p>
        </div>

        {/* Trading Readiness */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Trading Readiness</h2>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs max-w-64">
                    {tradingReadiness.explanation}
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-3xl font-bold tabular-nums font-mono">
                {tradingReadiness.composite}
              </span>
            </div>
            <Progress value={tradingReadiness.composite} className="h-2 mb-4" />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Risk Discipline", value: tradingReadiness.riskDiscipline, icon: Shield },
                { label: "Execution Quality", value: tradingReadiness.executionQuality, icon: Crosshair },
                { label: "Regime Awareness", value: tradingReadiness.regimeAwareness, icon: Eye },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-semibold tabular-nums font-mono">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Equity Curve (PnL)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {performanceLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading Alpaca performance…
                  </div>
                ) : equityData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No Alpaca equity history available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 11,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="var(--color-chart-2)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Drawdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {performanceLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading Alpaca performance…
                  </div>
                ) : drawdownData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No Alpaca drawdown data available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={drawdownData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 11,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="drawdown"
                        stroke="var(--color-destructive)"
                        fill="var(--color-destructive)"
                        fillOpacity={0.1}
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Behavioral Signals */}
        <div>
          <h2 className="text-sm font-medium mb-3">Behavioral Signals</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Overtrading Index",
                value: behavioralMetrics.overtradingIndex,
                trend: behavioralMetrics.overtradingTrend,
                interpretation: "Elevated. Your trade count in recent sessions exceeds optimal thresholds.",
                bad: true,
              },
              {
                label: "Revenge Trade Risk",
                value: behavioralMetrics.revengeTradeRisk,
                trend: "up" as MasteryTrend,
                interpretation: "High. Pattern of increasing position size after losses detected.",
                bad: true,
              },
              {
                label: "Stop-Loss Discipline",
                value: behavioralMetrics.stopLossDiscipline,
                trend: behavioralMetrics.stopLossTrend,
                interpretation: "Below target. Stop-loss was moved or ignored in 1 of 5 recent sessions.",
                bad: true,
              },
              {
                label: "Slippage Sensitivity",
                value: behavioralMetrics.slippageSensitivity,
                trend: behavioralMetrics.slippageTrend,
                interpretation: "Moderate. Market orders during wide spreads contributing to excess costs.",
                bad: false,
              },
            ].map((signal) => (
              <Card key={signal.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">{signal.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums font-mono">
                      {signal.value}
                    </span>
                    <TrendArrow trend={signal.trend} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="mt-2 text-[10px] text-muted-foreground line-clamp-2 cursor-help">
                        {signal.interpretation}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-56">
                      {signal.interpretation}
                    </TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Sessions */}
        <div>
          <h2 className="text-sm font-medium mb-3">Recent Sessions</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Instruments</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right">Canceled</TableHead>
                  <TableHead className="text-right">Daily PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No sessions yet. Place orders in the simulator to see activity here.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => (
                    <TableRow key={session.date}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {new Date(session.date).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {session.instruments.map((inst) => (
                            <Badge key={inst} variant="secondary" className="text-[10px] font-mono">
                              {inst}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {session.numTrades}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {session.canceledCount}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm tabular-nums ${
                          session.pnl > 0 ? "text-chart-2" : session.pnl < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {session.pnl === 0 ? "—" : `${session.pnl > 0 ? "+" : ""}$${session.pnl.toFixed(2)}`}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}

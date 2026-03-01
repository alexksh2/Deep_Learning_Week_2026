"use client"

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
  tradingSessions,
  behavioralMetrics,
  tradingReadiness,
  coachingInsights,
} from "@/lib/mock"
import type { MasteryTrend } from "@/lib/types"

function TrendArrow({ trend }: { trend: MasteryTrend }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-chart-2" />
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

export default function TradePage() {
  // Combine all equity curves for the PnL chart
  const equityData = tradingSessions
    .slice()
    .reverse()
    .flatMap((s, si) =>
      s.equityCurve.map((v, i) => ({
        idx: si * 20 + i,
        pnl: v,
      }))
    )

  const drawdownData = tradingSessions
    .slice()
    .reverse()
    .flatMap((s, si) =>
      s.drawdownCurve.map((v, i) => ({
        idx: si * 20 + i,
        drawdown: v,
      }))
    )

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
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="idx" tick={false} />
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Drawdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drawdownData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="idx" tick={false} />
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
                  <TableHead>Session</TableHead>
                  <TableHead>Instruments</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                  <TableHead className="text-right">Max DD</TableHead>
                  <TableHead>Violations</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tradingSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(session.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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
                    <TableCell
                      className={`text-right font-mono text-sm tabular-nums ${
                        session.pnl >= 0 ? "text-chart-2" : "text-destructive"
                      }`}
                    >
                      {session.pnl >= 0 ? "+" : ""}${session.pnl}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">
                      ${session.maxDrawdown}
                    </TableCell>
                    <TableCell>
                      {session.ruleViolations.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="text-[10px] font-mono"
                        >
                          {session.ruleViolations.length}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
                        <Link href={`/trade/review/${session.id}`}>
                          Review
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}

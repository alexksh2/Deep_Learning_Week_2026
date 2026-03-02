"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { RefreshCw, ArrowUpRight, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { LineChart, Line, ResponsiveContainer } from "recharts"
import {
  todaysPlan,
  masteryData,
  coachingInsights,
  getTopicLabel,
} from "@/lib/mock"
import type { MasteryTrend, MasteryBadge } from "@/lib/types"
import { useNotifications, type AppNotification, type NotificationCategory } from "@/contexts/NotificationContext"

function TrendIcon({ trend }: { trend: MasteryTrend }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-chart-2" />
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

function MasteryBadgeEl({ badge }: { badge: MasteryBadge }) {
  const variants: Record<MasteryBadge, string> = {
    Mastered: "bg-chart-2/15 text-chart-2 border-chart-2/20",
    Improving: "bg-chart-4/15 text-chart-4 border-chart-4/20",
    "At Risk": "bg-destructive/15 text-destructive border-destructive/20",
    "Needs Review": "bg-chart-1/15 text-chart-1 border-chart-1/20",
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${variants[badge]}`}>
      {badge}
    </span>
  )
}

function formatNotificationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const deltaMs = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute

  if (deltaMs < hour) {
    const mins = Math.max(1, Math.floor(deltaMs / minute))
    return `${mins}m ago`
  }

  if (deltaMs < 24 * hour) {
    return `${Math.floor(deltaMs / hour)}h ago`
  }

  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function categoryLabel(category: NotificationCategory) {
  if (category === "trade") return "Trade"
  if (category === "learning") return "Learning"
  return "System"
}

function categoryTone(category: NotificationCategory) {
  if (category === "trade") return "border-chart-2/30 bg-chart-2/10 text-chart-2"
  if (category === "learning") return "border-chart-1/30 bg-chart-1/10 text-chart-1"
  return "border-border bg-muted/70 text-muted-foreground"
}

function sourceLabel(source: AppNotification["source"]) {
  if (source === "spaced-rep") return "Spaced Rep"
  if (source === "quiz") return "Quiz"
  if (source === "course") return "Course"
  if (source === "trade") return "Trade"
  if (source === "review") return "Review"
  return "System"
}

export default function DashboardPage() {
  const [plan, setPlan] = useState(todaysPlan)
  const { notifications, markAsRead } = useNotifications()

  const recentNotifications = useMemo(() => notifications.slice(0, 12), [notifications])

  function togglePlan(id: string) {
    setPlan((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Where you are and what to do next.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Today's Plan */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{"Today's Plan"}</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={() => togglePlan(item.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={item.link}
                      className="text-sm font-medium hover:underline"
                    >
                      {item.label}
                    </Link>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-mono">
                      <Clock className="h-3 w-3" />
                      {item.estimatedMinutes} min
                    </div>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Coaching Insights */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Coaching Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {coachingInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3"
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      insight.severity === "critical"
                        ? "text-destructive"
                        : insight.severity === "warning"
                        ? "text-chart-1"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{insight.text}</p>
                    <Link
                      href={`/trade/review/${insight.evidenceSessionId}`}
                      className="inline-flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View evidence
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Mastery Overview */}
        <div>
          <h2 className="text-sm font-medium mb-3">Mastery Overview</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {masteryData.map((m) => (
              <Card key={m.topicId} className="p-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {getTopicLabel(m.topicId)}
                    </span>
                    <MasteryBadgeEl badge={m.badge} />
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tabular-nums">{m.score}</span>
                      <span className="text-xs text-muted-foreground">/ 100</span>
                      <TrendIcon trend={m.trend} />
                    </div>
                    <div className="h-8 w-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={m.sparkline.map((v, i) => ({ v, i }))}>
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke={m.trend === "down" ? "var(--color-destructive)" : "var(--color-chart-2)"}
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                        <span>Confidence: {(m.confidenceCalibration * 100).toFixed(0)}%</span>
                        <span>|</span>
                        <span>Forget risk: {(m.forgettingRisk * 100).toFixed(0)}%</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-60">
                      <p>Confidence calibration measures how well your confidence aligns with actual performance. Forgetting risk estimates likelihood of score decay without review.</p>
                    </TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-sm font-medium mb-3">Recent Activity</h2>
          <Card>
            <CardContent className="space-y-2 p-3">
              {recentNotifications.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No recent activity yet.
                </div>
              ) : (
                recentNotifications.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => markAsRead(item.id)}
                    className={`block rounded-md border px-3 py-2 transition-colors hover:bg-muted/60 ${
                      item.read ? "border-transparent bg-transparent" : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${categoryTone(item.category)}`}>
                          {categoryLabel(item.category)}
                        </Badge>
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {sourceLabel(item.source)}
                        </Badge>
                        {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-foreground/80" />}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{formatNotificationTime(item.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium leading-tight">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}

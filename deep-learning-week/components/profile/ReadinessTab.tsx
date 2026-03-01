"use client"

import { useState } from "react"
import { Info, Loader2, Check, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer, Legend,
} from "recharts"
import { tradingReadiness, readinessTrend, interviewPacks, profileRecommendations } from "@/lib/mock"

const breakdown = [
  { label: "Theory Mastery",             score: 70, key: "theory",         tip: "Composite of quiz scores and mastery signals across all topics." },
  { label: "Implementation Reliability", score: 55, key: "implementation",  tip: "Consistency of correct Python/quant implementations in drills and courses." },
  { label: "Execution Discipline",       score: 47, key: "execution",       tip: "Stop-loss adherence, trade count control, and absence of rule violations in paper trading." },
  { label: "Communication Clarity",      score: 60, key: "communication",   tip: "Quality of explanations in short-answer quiz responses. Proxy for interview verbal clarity." },
]

const gapData = breakdown.map(b => ({ name: b.label.split(" ")[0], gap: 100 - b.score, score: b.score }))

const impactColor: Record<string, string> = {
  High:   "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Low:    "border-zinc-500/20 bg-zinc-500/5 text-zinc-500",
}

const diagnosticChecklist = [
  { item: "Probability & statistics mastery signals", done: true },
  { item: "Time series quiz performance", done: true },
  { item: "Execution discipline from last 5 sessions", done: true },
  { item: "Stop-loss adherence history", done: false },
  { item: "Regime detection accuracy", done: false },
  { item: "Interview pack completion rates", done: false },
  { item: "Spaced repetition retention estimates", done: false },
]

export function ReadinessTab() {
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagDone, setDiagDone] = useState(false)

  const runDiagnostic = () => {
    setDiagLoading(true)
    setDiagDone(false)
    setTimeout(() => {
      setDiagLoading(false)
      setDiagDone(true)
    }, 2200)
  }

  const scoreColor = (s: number) => s >= 70 ? "text-emerald-600 dark:text-emerald-400" : s >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"

  return (
    <div className="space-y-5">
      {/* Readiness Index */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Readiness Index</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{tradingReadiness.explanation}</p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold tabular-nums ${scoreColor(tradingReadiness.composite)}`}>
                {tradingReadiness.composite}
              </p>
              <p className="text-[11px] text-muted-foreground">/ 100</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          {breakdown.map(b => (
            <div key={b.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{b.label}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[200px]">{b.tip}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className={`text-xs font-medium tabular-nums ${scoreColor(b.score)}`}>{b.score}</span>
              </div>
              <Progress value={b.score} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Readiness trend — last 8 weeks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={readinessTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[40, 70]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <RechartTooltip contentStyle={{ fontSize: 11, borderRadius: 6, padding: "4px 8px" }} />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} name="Composite" />
                <Line type="monotone" dataKey="theory" stroke="#a3a3a3" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Theory" />
                <Line type="monotone" dataKey="execution" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Execution" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Top gaps by component
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={gapData} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, 60]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                <RechartTooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6, padding: "4px 8px" }}
                  formatter={(v: number) => [`Gap: ${v} pts`, ""]}
                />
                <Bar dataKey="gap" fill="#f87171" radius={[0, 3, 3, 0]} name="Gap" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Interview Pack */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Interview Pack</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-2.5">
          {interviewPacks.map(pack => {
            const pct = Math.round(((pack.total - pack.remaining) / pack.total) * 100)
            return (
              <div key={pack.category} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs">{pack.category}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {pack.total - pack.remaining}/{pack.total} completed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={pct} className="h-1.5 flex-1" />
                  <span className={`text-[11px] font-medium tabular-nums ${scoreColor(pct)}`}>{pct}%</span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Recommended Next Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border">
          {profileRecommendations.map(rec => (
            <div key={rec.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium leading-tight">{rec.title}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 ${impactColor[rec.impact]}`}>
                    {rec.impact}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{rec.estimatedMinutes}min</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground/70">Because:</span> {rec.because}
              </p>
              <a
                href={rec.evidenceLink}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                onClick={e => e.preventDefault()}
              >
                <ExternalLink className="h-2.5 w-2.5" />
                View evidence
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Run diagnostic */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 text-xs"
        onClick={() => { setDiagOpen(true); setDiagDone(false) }}
      >
        Run full diagnostic
      </Button>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Full Readiness Diagnostic</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {diagnosticChecklist.map(({ item, done }, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                  diagLoading && !done ? "border-muted animate-pulse bg-muted" :
                  (diagDone || done) ? "border-emerald-500 bg-emerald-500/10" : "border-muted bg-muted/40"
                }`}>
                  {(diagDone || done) && <Check className="h-2.5 w-2.5 text-emerald-600" />}
                </div>
                <span className={`text-xs ${diagLoading && !done ? "text-muted-foreground" : ""}`}>{item}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            {!diagDone ? (
              <Button size="sm" onClick={runDiagnostic} disabled={diagLoading} className="gap-1.5">
                {diagLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {diagLoading ? "Running…" : "Run diagnostic"}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setDiagOpen(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

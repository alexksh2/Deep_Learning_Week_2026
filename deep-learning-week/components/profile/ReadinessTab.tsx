"use client"

import { useEffect, useMemo, useState } from "react"
import { Info, Loader2, Check, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { useAuth } from "@/contexts/AuthContext"

interface ResumeAnalysisPayload {
  exists?: boolean
  analyzedAt?: string
  analysis?: {
    assessment?: {
      overall_score?: number
      quant_relevance?: string
      strengths?: string[]
      gaps?: string[]
    }
  }
}

interface SessionSummary {
  date: string
  instruments: string[]
  numTrades: number
  pnl: number
  canceledCount: number
}

interface BehavioralSignals {
  riskDiscipline: number
  executionQuality: number
  stopLossDiscipline: number
  composite: number
  explanation: string
}

interface InterviewResultRecord {
  id: string
  interviewer: string
  category: string
  questionCount: number
  answeredCount: number
  averageScore: number
  strongAnswers: number
  needsWorkAnswers: number
  durationMinutes: number
  completedAt: string
}

interface ReadinessPoint {
  week: string
  score: number
  theory: number
  implementation: number
  execution: number
  communication: number
}

interface NextAction {
  id: string
  title: string
  estimatedMinutes: number
  impact: "High" | "Medium" | "Low"
  because: string
  evidenceLink: string
}

const impactColor: Record<string, string> = {
  High: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Low: "border-zinc-500/20 bg-zinc-500/5 text-zinc-500",
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function dateLabel(value?: string): string {
  if (!value) return "N/A"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "N/A"
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function ReadinessTab() {
  const { user } = useAuth()
  const [diagOpen, setDiagOpen] = useState(false)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagDone, setDiagDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [resume, setResume] = useState<ResumeAnalysisPayload | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [behavioral, setBehavioral] = useState<BehavioralSignals | null>(null)
  const [interviewResults, setInterviewResults] = useState<InterviewResultRecord[]>([])

  useEffect(() => {
    let active = true

    async function loadReadinessSignals() {
      setLoading(true)
      setLoadError("")

      try {
        const requests: Promise<Response>[] = [
          fetch("/api/alpaca/sessions", { cache: "no-store" }),
          fetch("/api/alpaca/behavioral", { cache: "no-store" }),
        ]

        if (user?.email) {
          requests.push(
            fetch(`/api/profile/resume/analysis?email=${encodeURIComponent(user.email)}`, { cache: "no-store" }),
            fetch(`/api/interview/results?email=${encodeURIComponent(user.email)}&limit=25`, { cache: "no-store" }),
          )
        }

        const responses = await Promise.all(requests)
        if (!active) return

        const sessionsRes = responses[0]
        const behavioralRes = responses[1]
        const resumeRes = responses[2]
        const interviewRes = responses[3]

        if (sessionsRes?.ok) {
          const payload = await sessionsRes.json()
          setSessions(Array.isArray(payload) ? payload as SessionSummary[] : [])
        } else {
          setSessions([])
        }

        if (behavioralRes?.ok) {
          const payload = await behavioralRes.json()
          if (payload && typeof payload === "object") {
            setBehavioral(payload as BehavioralSignals)
          } else {
            setBehavioral(null)
          }
        } else {
          setBehavioral(null)
        }

        if (resumeRes?.ok) {
          const payload = await resumeRes.json()
          setResume(payload && typeof payload === "object" ? payload as ResumeAnalysisPayload : null)
        } else {
          setResume(null)
        }

        if (interviewRes?.ok) {
          const payload = await interviewRes.json()
          setInterviewResults(Array.isArray(payload) ? payload as InterviewResultRecord[] : [])
        } else {
          setInterviewResults([])
        }
      } catch (error) {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : "Failed to load readiness signals.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadReadinessSignals()
    return () => {
      active = false
    }
  }, [user?.email])

  const computed = useMemo(() => {
    const resumeRaw = resume?.analysis?.assessment?.overall_score
    const resumeScore = typeof resumeRaw === "number" ? clamp(Math.round(resumeRaw * 10), 0, 100) : null

    const interviewScoreValues = interviewResults.map((result) => clamp(Math.round(result.averageScore * 20), 0, 100))
    const implementation = interviewScoreValues.length > 0
      ? Math.round(average(interviewScoreValues) ?? 0)
      : 45

    const communicationValues = interviewResults.map((result) => {
      const strongRatio = result.answeredCount > 0 ? (result.strongAnswers / result.answeredCount) * 100 : 0
      return clamp(Math.round((result.averageScore * 20 + strongRatio) / 2), 0, 100)
    })
    const communication = communicationValues.length > 0
      ? Math.round(average(communicationValues) ?? 0)
      : 45

    const tradeFallback = (() => {
      if (sessions.length === 0) return 45
      const profitable = sessions.filter((session) => session.pnl > 0).length
      const positiveRate = profitable / sessions.length
      const totalCanceled = sessions.reduce((sum, session) => sum + session.canceledCount, 0)
      const totalFilled = sessions.reduce((sum, session) => sum + session.numTrades, 0)
      const cancelRate = totalCanceled / Math.max(totalFilled + totalCanceled, 1)
      return clamp(Math.round(positiveRate * 70 + (1 - cancelRate) * 30), 0, 100)
    })()

    const execution = behavioral
      ? clamp(
          Math.round((behavioral.riskDiscipline + behavioral.executionQuality + behavioral.stopLossDiscipline) / 3),
          0,
          100,
        )
      : tradeFallback

    const theory = resumeScore ?? 45

    const composite = clamp(
      Math.round(theory * 0.3 + implementation * 0.25 + execution * 0.3 + communication * 0.15),
      0,
      100,
    )

    const breakdown = [
      {
        label: "Theory Mastery",
        score: theory,
        key: "theory",
        tip: "Derived from resume assessment score from the Resume Analyser output.",
      },
      {
        label: "Implementation Reliability",
        score: implementation,
        key: "implementation",
        tip: "Derived from recorded interview answer scores across sessions.",
      },
      {
        label: "Execution Discipline",
        score: execution,
        key: "execution",
        tip: "Derived from live trade sessions and Alpaca behavioral signals.",
      },
      {
        label: "Communication Clarity",
        score: communication,
        key: "communication",
        tip: "Derived from interview scoring consistency and strong-answer ratio.",
      },
    ]

    const gapData = breakdown.map((item) => ({
      name: item.label.split(" ")[0],
      gap: 100 - item.score,
      score: item.score,
    }))

    const sortedInterviews = [...interviewResults].sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    const trendBase = sortedInterviews.slice(-8).map((result) => {
      const impl = clamp(Math.round(result.averageScore * 20), 0, 100)
      const strongRatio = result.answeredCount > 0 ? (result.strongAnswers / result.answeredCount) * 100 : 0
      const comm = clamp(Math.round((impl + strongRatio) / 2), 0, 100)
      return {
        week: dateLabel(result.completedAt),
        theory,
        implementation: impl,
        execution,
        communication: comm,
      }
    })

    const readinessTrend: ReadinessPoint[] = trendBase.length > 0
      ? trendBase.map((point) => ({
          ...point,
          score: clamp(
            Math.round(point.theory * 0.3 + point.implementation * 0.25 + point.execution * 0.3 + point.communication * 0.15),
            0,
            100,
          ),
        }))
      : [{
          week: "Now",
          theory,
          implementation,
          execution,
          communication,
          score: composite,
        }]

    const recommendationList: NextAction[] = []
    if (resumeScore == null) {
      recommendationList.push({
        id: "resume-missing",
        title: "Run Resume Analyser",
        estimatedMinutes: 8,
        impact: "High",
        because: "Readiness has no resume-derived signal yet. Resume score drives theory confidence.",
        evidenceLink: "/profile/resume",
      })
    }
    if (interviewResults.length < 3) {
      recommendationList.push({
        id: "interview-volume",
        title: "Complete 3 mock interviews",
        estimatedMinutes: 25,
        impact: "High",
        because: "Interview sample size is too small for stable implementation and communication scoring.",
        evidenceLink: "/profile/interview",
      })
    }
    if (implementation < 65 || communication < 65) {
      recommendationList.push({
        id: "interview-weakness",
        title: "Re-run low-scoring interview category",
        estimatedMinutes: 20,
        impact: "Medium",
        because: "Interview-derived readiness is below target. Focus on weak categories until average exceeds 3.5/5.",
        evidenceLink: "/profile/interview",
      })
    }
    if (sessions.length === 0) {
      recommendationList.push({
        id: "trade-missing",
        title: "Start a trade simulator session",
        estimatedMinutes: 15,
        impact: "High",
        because: "Execution discipline is using fallback values because no trade sessions are available.",
        evidenceLink: "/trade/sim",
      })
    } else if (execution < 65) {
      recommendationList.push({
        id: "execution-weakness",
        title: "Run risk-discipline trading session",
        estimatedMinutes: 20,
        impact: "Medium",
        because: "Behavioral or session-level execution signals are below readiness target.",
        evidenceLink: "/trade?section=sessions",
      })
    }
    if (recommendationList.length === 0) {
      recommendationList.push({
        id: "maintain",
        title: "Maintain current cadence",
        estimatedMinutes: 10,
        impact: "Low",
        because: "Cross-source metrics are balanced. Continue regular interviews and trade sessions to sustain momentum.",
        evidenceLink: "/profile/interview",
      })
    }

    const explanationParts: string[] = []
    if (resumeScore != null) explanationParts.push(`resume signal ${resumeScore}/100`)
    if (interviewResults.length > 0) {
      explanationParts.push(`interview average ${(average(interviewResults.map((row) => row.averageScore)) ?? 0).toFixed(1)}/5 across ${interviewResults.length} session(s)`)
    }
    if (sessions.length > 0) explanationParts.push(`${sessions.length} trade session(s)`)

    const explanation = explanationParts.length > 0
      ? `Composite blends ${explanationParts.join(", ")}.`
      : "Readiness uses fallback values until resume, interview, and trade signals are available."

    return {
      resumeScore,
      theory,
      implementation,
      execution,
      communication,
      composite,
      breakdown,
      gapData,
      readinessTrend,
      recommendations: recommendationList.slice(0, 4),
      explanation,
    }
  }, [behavioral, interviewResults, resume, sessions])

  const trendValues = computed.readinessTrend.map((point) => point.score)
  const trendFloor = trendValues.length > 0 ? Math.min(...trendValues) : 40
  const trendCeiling = trendValues.length > 0 ? Math.max(...trendValues) : 60
  const trendMin = clamp(trendFloor - 8, 0, 100)
  const trendMax = clamp(trendCeiling + 8, 0, 100)

  const diagnosticChecklist = [
    { item: "Resume assessment signal loaded", done: computed.resumeScore != null },
    { item: "Interview score records available", done: interviewResults.length > 0 },
    { item: "At least 3 interview sessions recorded", done: interviewResults.length >= 3 },
    { item: "Trade session history loaded", done: sessions.length > 0 },
    { item: "Behavioral execution metrics loaded", done: Boolean(behavioral) },
    { item: "Cross-source readiness composite generated", done: true },
  ]

  const scoreComputationHelp = [
    "Composite = 0.30*Theory + 0.25*Implementation + 0.30*Execution + 0.15*Communication.",
    "Theory: Resume analyser overall score * 10 (fallback 45).",
    "Implementation: average interview score * 20 (fallback 45).",
    "Execution: average of risk discipline, execution quality, and stop-loss discipline; if behavioral data is missing, a session-based fallback is used.",
    "Communication: average of (interview score * 20) and strong-answer ratio (fallback 45).",
  ]

  const interviewAvgColumnHelp = "Avg = total score across answered questions / answered questions (shown as x.x/5)."
  const interviewStrongColumnHelp = "Strong = (strong answers / answered questions) * 100, where strong answers are scores 4.0/5 or higher."

  const runDiagnostic = () => {
    setDiagLoading(true)
    setDiagDone(false)
    setTimeout(() => {
      setDiagLoading(false)
      setDiagDone(true)
    }, 1800)
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <CardTitle className="text-sm font-semibold">Readiness Index</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Show readiness score formula"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-[340px] space-y-1.5 text-[11px] leading-relaxed">
                      {scoreComputationHelp.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {computed.explanation}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold tabular-nums ${scoreColor(computed.composite)}`}>
                {loading ? "—" : computed.composite}
              </p>
              <p className="text-[11px] text-muted-foreground">/ 100</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          {computed.breakdown.map((item) => (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{item.label}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[220px]">{item.tip}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className={`text-xs font-medium tabular-nums ${scoreColor(item.score)}`}>
                  {loading ? "—" : item.score}
                </span>
              </div>
              <Progress value={loading ? 0 : item.score} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Readiness trend — from recorded sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={computed.readinessTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[trendMin, trendMax]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <RechartTooltip contentStyle={{ fontSize: 11, borderRadius: 6, padding: "4px 8px" }} />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} name="Composite" />
                <Line type="monotone" dataKey="theory" stroke="#a3a3a3" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Theory" />
                <Line type="monotone" dataKey="execution" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Execution" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
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
              <BarChart data={computed.gapData} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, 70]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                <RechartTooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6, padding: "4px 8px" }}
                  formatter={(value) => [`Gap: ${Number(value)} pts`, ""]}
                />
                <Bar dataKey="gap" fill="#f87171" radius={[0, 3, 3, 0]} name="Gap" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="py-4 gap-3">
        <CardHeader className="px-3 sm:px-4 pb-0">
          <CardTitle className="text-sm font-semibold">Interview Score Records</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-4">
          <Table className="[&_th]:h-9 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Interviewer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">
                  <div className="inline-flex w-full items-center justify-end gap-1">
                    <span>Avg</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Show score computation for Avg column"
                            className="h-4 w-4 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" className="max-w-[280px] text-[11px] leading-relaxed">
                          <p>{interviewAvgColumnHelp}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="inline-flex w-full items-center justify-end gap-1">
                    <span>Strong</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Show score computation for Strong column"
                            className="h-4 w-4 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" className="max-w-[280px] text-[11px] leading-relaxed">
                          <p>{interviewStrongColumnHelp}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                    Loading interview score records…
                  </TableCell>
                </TableRow>
              ) : interviewResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                    No interview records yet. Complete a mock interview to start recording scores.
                  </TableCell>
                </TableRow>
              ) : (
                interviewResults.slice(0, 8).map((result) => (
                  <TableRow key={result.id} className="border-border/70">
                    <TableCell className="text-xs">{dateLabel(result.completedAt)}</TableCell>
                    <TableCell className="text-xs">{result.interviewer}</TableCell>
                    <TableCell className="text-xs">{result.category}</TableCell>
                    <TableCell className="text-right text-xs font-medium tabular-nums">
                      {result.averageScore.toFixed(1)}/5
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {result.answeredCount > 0 ? `${Math.round((result.strongAnswers / result.answeredCount) * 100)}%` : "0%"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Recommended Next Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border">
          {computed.recommendations.map((rec) => (
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
              <a href={rec.evidenceLink} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="h-2.5 w-2.5" />
                Open evidence
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="p-4 gap-2">
        <p className="text-xs text-muted-foreground">
          Signal coverage: resume {computed.resumeScore != null ? "ready" : "missing"} · interview {interviewResults.length} record(s) · trade {sessions.length} session(s)
        </p>
        <p className="text-xs text-muted-foreground">
          Last updates: resume {dateLabel(resume?.analyzedAt)} · interview {dateLabel(interviewResults[0]?.completedAt)} · trade {dateLabel(sessions[0]?.date)}
        </p>
      </Card>

      {loadError && (
        <p className="text-xs text-destructive">{loadError}</p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 text-xs"
        onClick={() => {
          setDiagOpen(true)
          setDiagDone(false)
        }}
      >
        Run full diagnostic
      </Button>

      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Full Readiness Diagnostic</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {diagnosticChecklist.map(({ item, done }, index) => (
              <div key={index} className="flex items-center gap-2.5">
                <div className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                  diagLoading && !done
                    ? "border-muted animate-pulse bg-muted"
                    : (diagDone || done)
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-muted bg-muted/40"
                }`}>
                  {(diagDone || done) && <Check className="h-2.5 w-2.5 text-emerald-600" />}
                </div>
                <span className={`text-xs ${diagLoading && !done ? "text-muted-foreground" : ""}`}>
                  {item}
                </span>
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

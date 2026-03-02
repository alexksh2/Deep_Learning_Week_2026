"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { Info, Play, RotateCcw, Send, Loader2 } from "lucide-react"

type Phase = "setup" | "waiting" | "answering" | "summary"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  type?: "question" | "feedback"
  score?: number
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

interface ScoredPair {
  questionIndex: number
  question: string
  answer: string
  feedback: string
  score: number
}

const CATEGORIES = [
  { id: "probability", label: "Probability Brainteasers", icon: "🎲", description: "Expected value, conditional probability, combinatorics" },
  { id: "mental-math", label: "Mental Math", icon: "🔢", description: "Fast estimation, mental arithmetic, approximation" },
  { id: "coding", label: "Timed Coding (Python)", icon: "💻", description: "Algorithms, data structures, quant tooling" },
  { id: "microstructure", label: "Market Microstructure", icon: "📊", description: "Order books, market impact, execution, HFT" },
  { id: "statistics", label: "Statistics & ML", icon: "📈", description: "Regression, hypothesis testing, time series" },
  { id: "derivatives", label: "Derivatives & Options", icon: "📉", description: "Options pricing, greeks, risk, hedging" },
]

const INTERVIEWERS = [
  { id: "jane-street", label: "Jane Street", description: "Fast pacing, precision-first follow-ups." },
  { id: "citadel", label: "Citadel", description: "Direct, performance-driven questioning." },
  { id: "two-sigma", label: "Two Sigma", description: "Data-centric and method-focused probing." },
]

const QUESTION_COUNTS = [3, 5, 10]
const avgColumnHelp = "Avg = total score across answered questions / answered questions (shown as x.x/5)."
const strongColumnHelp = "Strong = number of answers scored 4.0/5 or higher."
const needsWorkColumnHelp = "Needs Work = number of answers scored 2.0/5 or lower."

async function callInterview(
  category: string,
  interviewer: string,
  total: number,
  email: string | undefined,
  contextBlock: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<{ content: string; type: "question" | "feedback"; score: number | null }> {
  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, interviewer, total, email, context_block: contextBlock, messages }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

async function fetchInterviewResults(email: string): Promise<InterviewResultRecord[]> {
  const res = await fetch(`/api/interview/results?email=${encodeURIComponent(email)}&limit=25`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Failed to load interview history (${res.status})`)
  const payload = await res.json()
  return Array.isArray(payload) ? payload as InterviewResultRecord[] : []
}

async function storeInterviewResult(payload: {
  sessionId: string
  email: string
  interviewer: string
  category: string
  questionCount: number
  answeredCount: number
  averageScore: number
  strongAnswers: number
  needsWorkAnswers: number
  durationMinutes: number
  startedAt: string
  completedAt: string
  scoreRows: ScoredPair[]
}) {
  const res = await fetch("/api/interview/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Failed to store interview result (${res.status})`)
  }
}

function buildContextBlock(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return ""
  const lines = [
    "=== CANDIDATE CONTEXT ===",
    user.name ? `Name: ${user.name}` : null,
    user.targetRole ? `Target role: ${user.targetRole}` : null,
    user.targetFirms?.length ? `Target firms: ${user.targetFirms.join(", ")}` : null,
    user.tracks?.length ? `Tracks: ${user.tracks.join(", ")}` : null,
    "=== END CONTEXT ===",
  ]
  return lines.filter(Boolean).join("\n")
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function extractLastQuestion(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line.endsWith("?")) return line
  }

  const chunks = text.match(/[^?]*\?/g)
  return chunks?.length ? chunks[chunks.length - 1].trim() : null
}

function splitFeedbackAndNextQuestion(content: string): { feedback: string; nextQuestion: string | null } {
  const lines = content.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim()
    if (!trimmed) continue
    if (!trimmed.endsWith("?") || trimmed.startsWith("**")) break

    const feedback = lines.slice(0, index).join("\n").trim()
    if (!feedback || feedback.toLowerCase().includes("that concludes our session")) break
    return { feedback, nextQuestion: trimmed }
  }

  return { feedback: content.trim(), nextQuestion: null }
}

function buildScoredPairs(messages: ChatMessage[]): ScoredPair[] {
  const pairs: ScoredPair[] = []
  let currentQuestion = ""
  let pendingAnswer = ""

  for (const message of messages) {
    if (message.role === "assistant") {
      if (message.score == null) {
        currentQuestion = extractLastQuestion(message.content) ?? message.content.trim()
        continue
      }

      if (!currentQuestion || !pendingAnswer) {
        pendingAnswer = ""
        continue
      }

      const { feedback, nextQuestion } = splitFeedbackAndNextQuestion(message.content)
      pairs.push({
        questionIndex: pairs.length + 1,
        question: currentQuestion,
        answer: pendingAnswer,
        feedback,
        score: clamp(Math.round(message.score), 1, 5),
      })
      pendingAnswer = ""
      if (nextQuestion) currentQuestion = nextQuestion
      continue
    }

    if (message.content === "start") continue
    pendingAnswer = message.content
  }

  return pairs
}

function summarizeSession(messages: ChatMessage[], startTime: number) {
  const scoreRows = buildScoredPairs(messages)
  const scores = scoreRows.map((row) => row.score)
  const averageScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0

  return {
    scoreRows,
    averageScore,
    strongAnswers: scores.filter((score) => score >= 4).length,
    needsWorkAnswers: scores.filter((score) => score <= 2).length,
    durationMinutes: Math.max(Math.round((Date.now() - startTime) / 60000), 0),
  }
}

function shortText(value: string, max = 90): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trim()}…`
}

function ScoreBadge({ score }: { score: number }) {
  const style =
    score >= 4 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : score >= 3 ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[10px] tabular-nums", style)}>
      {score}/5
    </Badge>
  )
}

export function InterviewTab() {
  const { user } = useAuth()

  const [phase, setPhase] = useState<Phase>("setup")
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id)
  const [interviewerId, setInterviewerId] = useState(INTERVIEWERS[0].id)
  const [questionCount, setQuestionCount] = useState(5)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answer, setAnswer] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [startTime, setStartTime] = useState(0)
  const [sessionId, setSessionId] = useState("")
  const [savedSessionId, setSavedSessionId] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [historyRows, setHistoryRows] = useState<InterviewResultRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")

  const category = CATEGORIES.find((entry) => entry.id === categoryId) ?? CATEGORIES[0]
  const interviewer = INTERVIEWERS.find((entry) => entry.id === interviewerId) ?? INTERVIEWERS[0]
  const contextBlock = buildContextBlock(user)
  const answeredCount = messages.filter((message) => message.role === "user" && message.content !== "start").length
  const isDone = messages.some((message) => message.role === "assistant" && message.content.includes("That concludes our session"))
  const summary = useMemo(() => summarizeSession(messages, startTime), [messages, startTime])

  const loadHistory = useCallback(async () => {
    if (!user?.email) {
      setHistoryRows([])
      setHistoryLoading(false)
      setHistoryError("")
      return
    }

    setHistoryLoading(true)
    try {
      const results = await fetchInterviewResults(user.email)
      setHistoryRows(results)
      setHistoryError("")
    } catch (loadError) {
      setHistoryRows([])
      setHistoryError(loadError instanceof Error ? loadError.message : "Failed to load interview history.")
    } finally {
      setHistoryLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const persistResult = useCallback(async (history: ChatMessage[]) => {
    if (!user?.email || !sessionId || savedSessionId === sessionId) return

    const sessionSummary = summarizeSession(history, startTime)
    if (sessionSummary.scoreRows.length === 0) return

    setSaveState("saving")
    try {
      await storeInterviewResult({
        sessionId,
        email: user.email,
        interviewer: interviewer.label,
        category: category.label,
        questionCount,
        answeredCount: sessionSummary.scoreRows.length,
        averageScore: Number(sessionSummary.averageScore.toFixed(2)),
        strongAnswers: sessionSummary.strongAnswers,
        needsWorkAnswers: sessionSummary.needsWorkAnswers,
        durationMinutes: sessionSummary.durationMinutes,
        startedAt: new Date(startTime || Date.now()).toISOString(),
        completedAt: new Date().toISOString(),
        scoreRows: sessionSummary.scoreRows,
      })
      setSavedSessionId(sessionId)
      setSaveState("saved")
      void loadHistory()
    } catch {
      setSaveState("error")
    }
  }, [
    category.label,
    interviewer.label,
    loadHistory,
    questionCount,
    savedSessionId,
    sessionId,
    startTime,
    user?.email,
  ])

  async function callLLM(history: ChatMessage[]) {
    setLoading(true)
    setError("")
    try {
      const apiMessages = history.map((message) => ({ role: message.role, content: message.content }))
      const result = await callInterview(
        category.label,
        interviewer.label,
        questionCount,
        user?.email,
        contextBlock,
        apiMessages,
      )

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.content,
        type: result.type,
        score: result.score ?? undefined,
      }
      const next = [...history, assistantMessage]
      const sessionFinished = result.content.includes("That concludes our session")

      setMessages(next)
      setPhase(sessionFinished ? "summary" : "answering")
      if (sessionFinished) {
        void persistResult(next)
      }
    } catch (llmError) {
      setError(String(llmError))
      setPhase(history.length <= 1 ? "setup" : "answering")
    } finally {
      setLoading(false)
    }
  }

  async function startInterview() {
    const initial: ChatMessage[] = [{ role: "user", content: "start" }]
    const nextSessionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `session_${Date.now()}_${Math.round(Math.random() * 1_000_000)}`

    setSessionId(nextSessionId)
    setSavedSessionId("")
    setSaveState("idle")
    setMessages(initial)
    setAnswer("")
    setError("")
    setStartTime(Date.now())
    setPhase("waiting")
    await callLLM(initial)
  }

  async function submitAnswer() {
    if (!answer.trim() || loading) return
    const userMessage: ChatMessage = { role: "user", content: answer.trim() }
    const next = [...messages, userMessage]
    setAnswer("")
    setPhase("waiting")
    setMessages(next)
    await callLLM(next)
  }

  function reset() {
    setPhase("setup")
    setMessages([])
    setAnswer("")
    setError("")
    setSessionId("")
    setSavedSessionId("")
    setSaveState("idle")
  }

  const scoreColor =
    summary.averageScore >= 4
      ? "text-emerald-500"
      : summary.averageScore >= 3
        ? "text-amber-500"
        : "text-red-500"

  const saveStatus =
    saveState === "saving"
      ? "Saving score record…"
      : saveState === "saved"
        ? "Score record saved to interview history."
        : saveState === "error"
          ? "Score record could not be saved."
          : ""

  const historyTable = (
    <Card className="py-4 gap-3">
      <CardContent className="px-3 sm:px-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Interview Score Records
          </h4>
          {historyLoading && (
            <span className="text-[11px] text-muted-foreground">Loading…</span>
          )}
        </div>
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
                        <p>{avgColumnHelp}</p>
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
                        <p>{strongColumnHelp}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="inline-flex w-full items-center justify-end gap-1">
                  <span>Needs Work</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Show score computation for Needs Work column"
                          className="h-4 w-4 text-muted-foreground hover:text-foreground"
                        >
                          <Info className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="end" className="max-w-[280px] text-[11px] leading-relaxed">
                        <p>{needsWorkColumnHelp}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                  Loading interview score records…
                </TableCell>
              </TableRow>
            ) : historyRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                  No recorded sessions yet. Complete one interview to create your score table.
                </TableCell>
              </TableRow>
            ) : (
              historyRows.map((row) => (
                <TableRow key={row.id} className="border-border/70">
                  <TableCell className="text-xs">
                    {new Date(row.completedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-xs">{row.interviewer}</TableCell>
                  <TableCell className="text-xs">{row.category}</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{row.averageScore.toFixed(1)}/5</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{row.strongAnswers}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{row.needsWorkAnswers}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {historyError && (
          <p className="mt-2 text-[11px] text-destructive">{historyError}</p>
        )}
      </CardContent>
    </Card>
  )

  if (phase === "setup") {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Interviewer:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {INTERVIEWERS.map((firm) => (
              <button
                key={firm.id}
                onClick={() => setInterviewerId(firm.id)}
                className={cn(
                  "rounded-lg border p-3 text-left text-xs transition-colors",
                  interviewerId === firm.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <p className="font-medium">{firm.label}</p>
                <p className="text-muted-foreground mt-1">{firm.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setCategoryId(entry.id)}
              className={cn(
                "rounded-lg border p-3 text-left text-xs transition-colors",
                categoryId === entry.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-base">{entry.icon}</span>
                <span className="font-medium leading-tight">{entry.label}</span>
              </div>
              <p className="text-muted-foreground">{entry.description}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Questions:</span>
          <div className="flex gap-1.5">
            {QUESTION_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => setQuestionCount(count)}
                className={cn(
                  "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                  questionCount === count
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {count}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">≈ {questionCount * 3} min</span>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button onClick={startInterview} size="sm" className="gap-2">
          <Play className="h-3.5 w-3.5" />
          Start — {interviewer.label} · {category.label}
        </Button>

        {historyTable}
      </div>
    )
  }

  if (phase === "summary") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Session Complete</h3>
            <p className="text-xs text-muted-foreground">
              {interviewer.label} interviewer · {category.icon} {category.label} · {summary.scoreRows.length} questions · {summary.durationMinutes} min
            </p>
            {saveStatus && (
              <p className={cn(
                "mt-1 text-[11px]",
                saveState === "error" ? "text-destructive" : "text-muted-foreground",
              )}>
                {saveStatus}
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={reset} className="gap-1.5 text-xs h-7">
            <RotateCcw className="h-3 w-3" />
            Leave Session
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border px-3 py-2.5 text-center">
            <p className={cn("text-2xl font-bold tabular-nums", scoreColor)}>{summary.averageScore.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">avg score / 5</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5 text-center">
            <p className="text-2xl font-bold tabular-nums">{summary.strongAnswers}</p>
            <p className="text-[11px] text-muted-foreground">strong answers</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5 text-center">
            <p className="text-2xl font-bold tabular-nums text-red-500">{summary.needsWorkAnswers}</p>
            <p className="text-[11px] text-muted-foreground">needs work</p>
          </div>
        </div>

        <Card className="py-4 gap-3">
          <CardContent className="px-3 sm:px-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Question Score Table
            </h4>
            <Table className="[&_th]:h-9 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.scoreRows.map((row) => (
                  <TableRow key={row.questionIndex}>
                    <TableCell className="text-xs tabular-nums">{row.questionIndex}</TableCell>
                    <TableCell className="text-xs">{shortText(row.question)}</TableCell>
                    <TableCell className="text-right text-xs font-medium tabular-nums">{row.score}/5</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {summary.scoreRows.map((row) => (
            <Card key={`${row.questionIndex}-${row.score}`} className="overflow-hidden p-0">
              <div
                className={cn(
                  "h-0.5 w-full",
                  row.score >= 4 ? "bg-emerald-500" : row.score >= 3 ? "bg-amber-500" : "bg-red-500",
                )}
              />
              <CardContent className="space-y-2 pt-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-xs font-medium leading-snug">
                    <span className="mr-1.5 text-muted-foreground">Q{row.questionIndex}.</span>
                    {row.question}
                  </p>
                  <ScoreBadge score={row.score} />
                </div>
                <div className="rounded-md bg-muted/40 px-2.5 py-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mr-1 font-medium text-foreground/60">Your answer:</span>
                    {row.answer}
                  </p>
                </div>
                <p className="whitespace-pre-line text-[11px] leading-relaxed">{row.feedback}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {historyTable}
      </div>
    )
  }

  const visibleMessages = messages.filter((message) => message.content !== "start")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {interviewer.label} · {category.icon} {category.label}
          </span>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {answeredCount}/{questionCount} answered
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} className="h-6 px-2 text-[11px] text-muted-foreground">
          Leave Session
        </Button>
      </div>

      <Progress value={(answeredCount / questionCount) * 100} className="h-1" />

      <div className="space-y-3">
        {visibleMessages.map((message, index) => {
          const isUser = message.role === "user"
          return (
            <div key={index} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
              <div className={cn(
                "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted text-muted-foreground",
              )}>
                {isUser ? "A" : "Q"}
              </div>
              <div className={cn(
                "flex-1 whitespace-pre-line rounded-2xl px-3.5 py-2.5 leading-relaxed",
                isUser
                  ? "max-w-[85%] rounded-tr-sm border border-primary/20 bg-primary/10 text-sm"
                  : message.score != null
                    ? "rounded-tl-sm border border-border bg-background text-xs"
                    : "rounded-tl-sm bg-muted text-sm",
              )}>
                {message.content}
                {message.score != null && (
                  <div className="mt-2">
                    <ScoreBadge score={message.score} />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {answeredCount === 0 ? "Preparing first question…" : "Evaluating and preparing next question…"}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {phase === "answering" && !isDone && (
        <div className="space-y-2">
          <Textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submitAnswer()
            }}
            placeholder="Type your answer… (⌘+Enter to submit)"
            rows={4}
            className="resize-none text-sm"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">⌘+Enter to submit</p>
            <Button onClick={submitAnswer} disabled={!answer.trim() || loading} size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Submit Answer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

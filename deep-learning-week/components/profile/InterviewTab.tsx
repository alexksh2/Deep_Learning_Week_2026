"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { Play, RotateCcw, Send, Loader2 } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "setup" | "waiting" | "answering" | "summary"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  type?: "question" | "feedback"  // assistant messages only
  score?: number                  // feedback messages only
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "probability",    label: "Probability Brainteasers", icon: "🎲", description: "Expected value, conditional probability, combinatorics" },
  { id: "mental-math",    label: "Mental Math",              icon: "🔢", description: "Fast estimation, mental arithmetic, approximation" },
  { id: "coding",         label: "Timed Coding (Python)",    icon: "💻", description: "Algorithms, data structures, quant tooling" },
  { id: "microstructure", label: "Market Microstructure",    icon: "📊", description: "Order books, market impact, execution, HFT" },
  { id: "statistics",     label: "Statistics & ML",          icon: "📈", description: "Regression, hypothesis testing, time series" },
  { id: "derivatives",    label: "Derivatives & Options",    icon: "📉", description: "Options pricing, greeks, risk, hedging" },
]

const QUESTION_COUNTS = [3, 5, 10]

// ── API call ──────────────────────────────────────────────────────────────────

async function callInterview(
  category: string,
  total: number,
  email: string | undefined,
  contextBlock: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<{ content: string; type: "question" | "feedback"; score: number | null }> {
  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, total, email, context_block: contextBlock, messages }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContextBlock(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return ""
  const lines = [
    "=== CANDIDATE CONTEXT ===",
    user.name                ? `Name: ${user.name}`                             : null,
    user.targetRole          ? `Target role: ${user.targetRole}`                : null,
    user.targetFirms?.length ? `Target firms: ${user.targetFirms.join(", ")}`  : null,
    user.tracks?.length      ? `Tracks: ${user.tracks.join(", ")}`             : null,
    "=== END CONTEXT ===",
  ]
  return lines.filter(Boolean).join("\n")
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

// ── Main component ────────────────────────────────────────────────────────────

export function InterviewTab() {
  const { user } = useAuth()

  const [phase,         setPhase]         = useState<Phase>("setup")
  const [categoryId,    setCategoryId]    = useState(CATEGORIES[0].id)
  const [questionCount, setQuestionCount] = useState(5)
  const [messages,      setMessages]      = useState<ChatMessage[]>([])
  const [answer,        setAnswer]        = useState("")
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState("")
  const [startTime,     setStartTime]     = useState(0)

  const category      = CATEGORIES.find(c => c.id === categoryId) ?? CATEGORIES[0]
  const contextBlock  = buildContextBlock(user)
  const answeredCount = messages.filter(m => m.role === "user" && m.content !== "start").length
  const isDone        = messages.some(m => m.role === "assistant" && m.content.includes("That concludes our session"))

  // ── Call LLM with full message history ────────────────────────────────────

  async function callLLM(history: ChatMessage[]) {
    setLoading(true)
    setError("")
    try {
      const apiMessages = history.map(m => ({ role: m.role, content: m.content }))
      const result = await callInterview(category.label, questionCount, user?.email, contextBlock, apiMessages)

      const assistantMsg: ChatMessage = {
        role:    "assistant",
        content: result.content,
        type:    result.type,
        score:   result.score ?? undefined,
      }
      const next = [...history, assistantMsg]
      setMessages(next)
      setPhase(result.content.includes("That concludes our session") ? "summary" : "answering")
    } catch (e) {
      setError(String(e))
      setPhase(history.length <= 1 ? "setup" : "answering")
    } finally {
      setLoading(false)
    }
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  async function startInterview() {
    const initial: ChatMessage[] = [{ role: "user", content: "start" }]
    setMessages(initial)
    setAnswer("")
    setError("")
    setStartTime(Date.now())
    setPhase("waiting")
    await callLLM(initial)
  }

  // ── Submit answer ─────────────────────────────────────────────────────────

  async function submitAnswer() {
    if (!answer.trim() || loading) return
    const userMsg: ChatMessage = { role: "user", content: answer.trim() }
    const next = [...messages, userMsg]
    setAnswer("")
    setPhase("waiting")
    setMessages(next)
    await callLLM(next)
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function reset() {
    setPhase("setup")
    setMessages([])
    setAnswer("")
    setError("")
  }

  // ── Render: Setup ─────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryId(cat.id)}
              className={cn(
                "rounded-lg border p-3 text-left text-xs transition-colors",
                categoryId === cat.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{cat.icon}</span>
                <span className="font-medium leading-tight">{cat.label}</span>
              </div>
              <p className="text-muted-foreground">{cat.description}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Questions:</span>
          <div className="flex gap-1.5">
            {QUESTION_COUNTS.map(n => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={cn(
                  "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                  questionCount === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">≈ {questionCount * 3} min</span>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button onClick={startInterview} size="sm" className="gap-2">
          <Play className="h-3.5 w-3.5" />
          Start — {category.label}
        </Button>
      </div>
    )
  }

  // ── Render: Summary ───────────────────────────────────────────────────────

  if (phase === "summary") {
    const elapsed    = Math.round((Date.now() - startTime) / 60000)
    const feedbacks  = messages.filter(m => m.role === "assistant" && m.score != null)
    const avg        = feedbacks.length
      ? feedbacks.reduce((a, m) => a + (m.score ?? 0), 0) / feedbacks.length
      : 0
    const scoreColor = avg >= 4 ? "text-emerald-500" : avg >= 3 ? "text-amber-500" : "text-red-500"

    // Build Q/A pairs: for each feedback message, find the preceding user answer and question
    const pairs: { question: string; answer: string; feedback: string; score: number }[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role === "assistant" && m.score != null && i >= 2) {
        const userAnswer  = messages[i - 1]
        const prevAsst    = messages.slice(0, i - 1).reverse().find(x => x.role === "assistant")
        if (userAnswer && prevAsst) {
          pairs.push({
            question: prevAsst.content,
            answer:   userAnswer.content,
            feedback: m.content,
            score:    m.score!,
          })
        }
      }
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Session Complete</h3>
            <p className="text-xs text-muted-foreground">
              {category.icon} {category.label} · {feedbacks.length} questions · {elapsed} min
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={reset} className="gap-1.5 text-xs h-7">
            <RotateCcw className="h-3 w-3" />
            New Session
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border px-3 py-2.5 text-center">
            <p className={cn("text-2xl font-bold tabular-nums", scoreColor)}>{avg.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">avg score / 5</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5 text-center">
            <p className="text-2xl font-bold tabular-nums">
              {feedbacks.filter(m => (m.score ?? 0) >= 4).length}
            </p>
            <p className="text-[11px] text-muted-foreground">strong answers</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2.5 text-center">
            <p className="text-2xl font-bold tabular-nums text-red-500">
              {feedbacks.filter(m => (m.score ?? 0) <= 2).length}
            </p>
            <p className="text-[11px] text-muted-foreground">needs work</p>
          </div>
        </div>

        <div className="space-y-3">
          {pairs.map((rec, i) => (
            <Card key={i} className="overflow-hidden p-0">
              <div className={cn(
                "h-0.5 w-full",
                rec.score >= 4 ? "bg-emerald-500" : rec.score >= 3 ? "bg-amber-500" : "bg-red-500",
              )} />
              <CardContent className="pt-3 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium leading-snug flex-1">
                    <span className="text-muted-foreground mr-1.5">Q{i + 1}.</span>
                    {rec.question}
                  </p>
                  <ScoreBadge score={rec.score} />
                </div>
                <div className="rounded-md bg-muted/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground/60 mr-1">Your answer:</span>
                    {rec.answer}
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed whitespace-pre-line">{rec.feedback}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ── Render: Interview ─────────────────────────────────────────────────────

  const visibleMessages = messages.filter(m => m.content !== "start")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{category.icon} {category.label}</span>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {answeredCount}/{questionCount} answered
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} className="h-6 text-[11px] text-muted-foreground px-2">
          End session
        </Button>
      </div>

      <Progress value={(answeredCount / questionCount) * 100} className="h-1" />

      {/* Full conversation — every message in order */}
      <div className="space-y-3">
        {visibleMessages.map((msg, i) => {
          const isUser = msg.role === "user"
          return (
            <div key={i} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
              <div className={cn(
                "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted border border-border text-muted-foreground",
              )}>
                {isUser ? "A" : "Q"}
              </div>
              <div className={cn(
                "rounded-2xl px-3.5 py-2.5 leading-relaxed flex-1 whitespace-pre-line",
                isUser
                  ? "rounded-tr-sm bg-primary/10 border border-primary/20 max-w-[85%] text-sm"
                  : msg.score != null
                    ? "rounded-tl-sm border border-border bg-background text-xs"
                    : "rounded-tl-sm bg-muted text-sm",
              )}>
                {msg.content}
                {msg.score != null && (
                  <div className="mt-2">
                    <ScoreBadge score={msg.score} />
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

      {/* Answer input */}
      {phase === "answering" && !isDone && (
        <div className="space-y-2">
          <Textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer() }}
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

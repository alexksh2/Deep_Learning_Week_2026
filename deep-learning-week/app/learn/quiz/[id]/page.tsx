"use client"

import { use, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { quizzes, masteryData, getTopicLabel, recommendations } from "@/lib/mock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Flag,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import type { Confidence, QuizQuestion } from "@/lib/types"

type QuestionState = {
  answer: string
  confidence: Confidence
  flagged: boolean
}

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const quiz = quizzes.find((q) => q.id === id)

  const [current, setCurrent] = useState(0)
  const [states, setStates] = useState<QuestionState[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (quiz) {
      setStates(
        quiz.questions.map(() => ({ answer: "", confidence: "Med", flagged: false }))
      )
      setTimeLeft(quiz.timeLimitMinutes * 60)
    }
  }, [quiz])

  useEffect(() => {
    if (submitted || timeLeft <= 0) return
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(timer)
  }, [submitted, timeLeft])

  const handleSubmit = useCallback(() => {
    setSubmitted(true)
    setShowConfirm(false)
  }, [])

  if (!quiz) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Quiz not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link href="/learn">Back to Learn</Link>
        </Button>
      </div>
    )
  }

  if (states.length === 0) return null

  const question = quiz.questions[current]
  const state = states[current]

  function updateState(idx: number, updates: Partial<QuestionState>) {
    setStates((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...updates } : s))
    )
  }

  function getResult(q: QuizQuestion, s: QuestionState) {
    return s.answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  // Results
  if (submitted) {
    const correct = quiz.questions.filter((q, i) => getResult(q, states[i])).length
    const score = Math.round((correct / quiz.questions.length) * 100)
    const topicBreakdown: Record<string, { correct: number; total: number }> = {}
    quiz.questions.forEach((q, i) => {
      q.topicTags.forEach((t) => {
        if (!topicBreakdown[t]) topicBreakdown[t] = { correct: 0, total: 0 }
        topicBreakdown[t].total++
        if (getResult(q, states[i])) topicBreakdown[t].correct++
      })
    })

    return (
      <TooltipProvider>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/learn">Learn</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/learn?tab=quizzes">Quizzes</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{quiz.title} - Results</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold">{quiz.title}</h1>
            <div className="text-4xl font-bold tabular-nums">{score}%</div>
            <p className="text-sm text-muted-foreground">
              {correct} of {quiz.questions.length} correct
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Topic breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">By Topic</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(topicBreakdown).map(([topic, data]) => (
                  <div key={topic} className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-muted-foreground">
                      {getTopicLabel(topic as never)}
                    </span>
                    <span className="text-sm font-mono tabular-nums">
                      {data.correct}/{data.total}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Mistake categorization */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Mistakes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {["Conceptual", "Careless", "Implementation"].map((type) => {
                  const count = type === "Conceptual" ? 2 : type === "Careless" ? 1 : 0
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-xs">{type}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {count}
                      </Badge>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Recommended follow-ups */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Follow-ups</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recommendations.slice(0, 3).map((rec) => (
                  <div key={rec.id} className="rounded-md border border-border p-2">
                    <p className="text-xs font-medium">{rec.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px]">{rec.impactTag}</Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">{rec.estimatedMinutes}min</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Question review */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Question Review</h2>
            {quiz.questions.map((q, i) => {
              const isCorrect = getResult(q, states[i])
              return (
                <Card key={q.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      {isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-chart-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm">{q.text}</p>
                        <div className="mt-2 text-xs text-muted-foreground">
                          <p>Your answer: <span className="font-mono">{states[i].answer || "(blank)"}</span></p>
                          <p>Correct: <span className="font-mono">{q.correctAnswer}</span></p>
                          <p className="mt-1">{q.explanation}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="flex justify-center">
            <Button asChild>
              <Link href="/learn?tab=quizzes">
                Back to Quizzes
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Quiz-taking UI
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/learn">Learn</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/learn?tab=quizzes">Quizzes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{quiz.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid gap-4 lg:grid-cols-[180px_1fr_220px]">
          {/* Left: Question navigator */}
          <Card className="p-3">
            <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Questions</p>
            <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-3">
              {quiz.questions.map((_, i) => {
                const s = states[i]
                let bg = "bg-muted text-muted-foreground"
                if (s.flagged) bg = "bg-chart-1/20 text-chart-1 border-chart-1/30"
                else if (s.answer) bg = "bg-chart-2/20 text-chart-2 border-chart-2/30"
                if (i === current) bg += " ring-2 ring-ring"
                return (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`h-8 w-8 rounded border text-xs font-mono font-medium transition-colors ${bg}`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-chart-2/40" /> Answered
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-chart-1/40" /> Flagged
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted" /> Unanswered
              </div>
            </div>
          </Card>

          {/* Center: Question panel */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-xs font-mono text-muted-foreground">
                Question {current + 1} of {quiz.questions.length}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono tabular-nums ${timeLeft < 60 ? "text-destructive" : "text-muted-foreground"}`}>
                  <Clock className="inline h-3 w-3 mr-1" />
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              </div>
            </div>

            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap gap-1.5 mb-1">
                {question.topicTags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] font-mono uppercase">
                    {getTopicLabel(t)}
                  </Badge>
                ))}
                <Badge variant="outline" className="text-[10px] font-mono uppercase">
                  {question.difficulty}
                </Badge>
              </div>

              <p className="text-sm leading-relaxed">{question.text}</p>

              {question.type === "multiple-choice" && question.options ? (
                <RadioGroup
                  value={state.answer}
                  onValueChange={(v) => updateState(current, { answer: v })}
                  className="space-y-2"
                >
                  {question.options.map((opt) => (
                    <Label
                      key={opt}
                      className="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary"
                    >
                      <RadioGroupItem value={opt} />
                      <span className="text-sm font-mono">{opt}</span>
                    </Label>
                  ))}
                </RadioGroup>
              ) : (
                <Input
                  placeholder="Type your answer..."
                  value={state.answer}
                  onChange={(e) => updateState(current, { answer: e.target.value })}
                />
              )}

              {/* Confidence */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Confidence:</span>
                {(["Low", "Med", "High"] as Confidence[]).map((c) => (
                  <Button
                    key={c}
                    variant={state.confidence === c ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[10px] px-2.5"
                    onClick={() => updateState(current, { confidence: c })}
                  >
                    {c}
                  </Button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => updateState(current, { flagged: !state.flagged })}
                  >
                    <Flag className={`h-3.5 w-3.5 ${state.flagged ? "text-chart-1 fill-chart-1" : ""}`} />
                    {state.flagged ? "Unflag" : "Flag"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCurrent(Math.max(0, current - 1))}
                    disabled={current === 0}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Previous
                  </Button>
                  {current < quiz.questions.length - 1 ? (
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setCurrent(current + 1)}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  ) : (
                    <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="h-8 text-xs">
                          Submit Quiz
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Submit Quiz?</DialogTitle>
                          <DialogDescription>
                            You have answered {states.filter((s) => s.answer).length} of{" "}
                            {quiz.questions.length} questions.
                            {states.some((s) => s.flagged) && (
                              <span className="block mt-1 text-chart-1">
                                {states.filter((s) => s.flagged).length} question(s) are flagged for review.
                              </span>
                            )}
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowConfirm(false)}>
                            Continue Reviewing
                          </Button>
                          <Button onClick={handleSubmit}>Submit</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right: Topic context */}
          <Card className="p-3">
            <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Topic Context</p>
            {question.topicTags.map((t) => {
              const mastery = masteryData.find((m) => m.topicId === t)
              return (
                <div key={t} className="mb-3">
                  <p className="text-xs font-mono uppercase">{getTopicLabel(t)}</p>
                  {mastery && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Your mastery</span>
                        <span className="font-mono tabular-nums">{mastery.score}%</span>
                      </div>
                      <Progress value={mastery.score} className="h-1" />
                    </div>
                  )}
                </div>
              )
            })}
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Difficulty</p>
              <Badge variant="outline" className="text-[10px] font-mono">
                {question.difficulty}
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}

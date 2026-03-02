"use client"

import { use, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { quizzes, getTopicLabel, recommendations } from "@/lib/mock"
import { getQuestionPoolForQuiz, getRandomQuestionsForQuiz, QUESTIONS_PER_ATTEMPT } from "@/lib/quiz-question-bank"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  ArrowRight,
} from "lucide-react"
import type { Confidence, MistakeType, QuizAttempt, QuizQuestion, QuizStatus } from "@/lib/types"
import { useNotifications } from "@/contexts/NotificationContext"
import { useAuth } from "@/contexts/AuthContext"
import type { InProgressQuizState, StoredQuizProgress } from "@/lib/quiz-progress"

type QuestionState = {
  answer: string
  confidence: Confidence
  flagged: boolean
}

function createDefaultQuestionState(): QuestionState {
  return { answer: "", confidence: "Med", flagged: false }
}

function isConfidence(value: unknown): value is Confidence {
  return value === "Low" || value === "Med" || value === "High"
}

function normalizeQuestionState(value: unknown): QuestionState {
  if (!value || typeof value !== "object") return createDefaultQuestionState()
  const candidate = value as Partial<QuestionState>
  return {
    answer: typeof candidate.answer === "string" ? candidate.answer : "",
    confidence: isConfidence(candidate.confidence) ? candidate.confidence : "Med",
    flagged: candidate.flagged === true,
  }
}

function classifyMistake(question: QuizQuestion, state: QuestionState): MistakeType {
  if (question.difficulty === "Advanced") return "Implementation"
  if (state.confidence === "High") return "Careless"
  return "Conceptual"
}

function buildMistakeBreakdown(questions: QuizQuestion[], states: QuestionState[]): Record<MistakeType, number> {
  const breakdown: Record<MistakeType, number> = {
    Conceptual: 0,
    Careless: 0,
    Implementation: 0,
  }

  questions.forEach((question, index) => {
    const state = states[index]
    if (!state) return
    const isCorrect =
      state.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()
    if (isCorrect) return
    breakdown[classifyMistake(question, state)]++
  })

  return breakdown
}

function restoreAttemptFromProgress(
  quizId: string,
  inProgress: InProgressQuizState,
  maxTimeLeft: number
): { questions: QuizQuestion[]; states: QuestionState[]; current: number; timeLeft: number; startedAt: string } | null {
  const pool = getQuestionPoolForQuiz(quizId)
  if (!Array.isArray(inProgress.questionIds) || inProgress.questionIds.length === 0) return null
  const byId = new Map(pool.map((question) => [question.id, question]))

  const questions: QuizQuestion[] = []
  for (const questionId of inProgress.questionIds) {
    const question = byId.get(questionId)
    if (!question) return null
    questions.push(question)
  }

  if (!Array.isArray(inProgress.states) || inProgress.states.length !== questions.length) return null
  const states = inProgress.states.map((state) => normalizeQuestionState(state))

  const currentRaw = Number.isFinite(inProgress.current) ? Math.floor(inProgress.current) : 0
  const current = Math.min(Math.max(0, currentRaw), Math.max(questions.length - 1, 0))

  const timeLeftRaw = Number.isFinite(inProgress.timeLeft) ? Math.floor(inProgress.timeLeft) : maxTimeLeft
  const timeLeft = Math.min(maxTimeLeft, Math.max(0, timeLeftRaw))

  const startedAt =
    typeof inProgress.startedAt === "string" && inProgress.startedAt.trim()
      ? inProgress.startedAt
      : new Date().toISOString()

  return { questions, states, current, timeLeft, startedAt }
}

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const quiz = quizzes.find((q) => q.id === id)
  const router = useRouter()
  const { addNotification } = useNotifications()
  const { user } = useAuth()

  const [current, setCurrent] = useState(0)
  const [attemptQuestions, setAttemptQuestions] = useState<QuizQuestion[]>([])
  const [states, setStates] = useState<QuestionState[]>([])
  const [attemptsHistory, setAttemptsHistory] = useState<QuizAttempt[]>([])
  const [attemptStartedAt, setAttemptStartedAt] = useState("")
  const [attemptInitialized, setAttemptInitialized] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  useEffect(() => {
    let active = true

    function startFreshAttempt(quizId: string, timeLimitSeconds: number) {
      const sampledQuestions = getRandomQuestionsForQuiz(quizId, QUESTIONS_PER_ATTEMPT)
      setAttemptQuestions(sampledQuestions)
      setStates(sampledQuestions.map(() => createDefaultQuestionState()))
      setCurrent(0)
      setTimeLeft(timeLimitSeconds)
      setAttemptStartedAt(new Date().toISOString())
      setSubmitted(false)
      setShowConfirm(false)
      setShowLeaveConfirm(false)
    }

    async function initializeAttempt() {
      if (!quiz) {
        if (!active) return
        setAttemptQuestions([])
        setStates([])
        setAttemptsHistory([])
        setAttemptStartedAt("")
        setAttemptInitialized(false)
        return
      }

      const timeLimitSeconds = quiz.timeLimitMinutes * 60
      setAttemptInitialized(false)
      setSubmitted(false)
      setShowConfirm(false)
      setShowLeaveConfirm(false)

      if (!user?.email) {
        if (!active) return
        setAttemptsHistory(quiz.attempts)
        startFreshAttempt(quiz.id, timeLimitSeconds)
        setAttemptInitialized(true)
        return
      }

      try {
        const res = await fetch(
          `/api/learn/quiz-progress?email=${encodeURIComponent(user.email)}&quizId=${encodeURIComponent(quiz.id)}`,
          { cache: "no-store" }
        )
        const data = (res.ok ? await res.json() : null) as { progress?: StoredQuizProgress | null } | null
        if (!active) return

        const saved = data?.progress ?? null
        setAttemptsHistory(saved?.attempts ?? [])

        if (saved?.inProgress) {
          const restored = restoreAttemptFromProgress(quiz.id, saved.inProgress, timeLimitSeconds)
          if (restored) {
            setAttemptQuestions(restored.questions)
            setStates(restored.states)
            setCurrent(restored.current)
            setTimeLeft(restored.timeLeft)
            setAttemptStartedAt(restored.startedAt)
            setAttemptInitialized(true)
            return
          }
        }

        startFreshAttempt(quiz.id, timeLimitSeconds)
      } catch {
        if (!active) return
        setAttemptsHistory([])
        startFreshAttempt(quiz.id, timeLimitSeconds)
      } finally {
        if (active) setAttemptInitialized(true)
      }
    }

    initializeAttempt()
    return () => {
      active = false
    }
  }, [quiz, user?.email])

  const saveQuizProgress = useCallback(
    async (status: QuizStatus, attempts: QuizAttempt[], inProgress: InProgressQuizState | null) => {
      if (!quiz || !user?.email) return

      try {
        await fetch("/api/learn/quiz-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            progress: {
              quizId: quiz.id,
              status,
              attempts,
              inProgress,
            },
          }),
        })
      } catch {
        // Ignore transient network/database failures; user can continue quiz flow.
      }
    },
    [quiz, user?.email]
  )

  useEffect(() => {
    if (!quiz || !user?.email || !attemptInitialized || submitted) return
    if (attemptQuestions.length === 0 || states.length !== attemptQuestions.length) return

    const inProgress: InProgressQuizState = {
      questionIds: attemptQuestions.map((question) => question.id),
      states,
      current,
      timeLeft,
      startedAt: attemptStartedAt || new Date().toISOString(),
    }

    const timer = setTimeout(() => {
      void saveQuizProgress("in-progress", attemptsHistory, inProgress)
    }, 300)

    return () => clearTimeout(timer)
  }, [quiz, user?.email, attemptInitialized, submitted, attemptQuestions, states, current, attemptsHistory, attemptStartedAt, saveQuizProgress])

  useEffect(() => {
    if (!quiz || !user?.email || !attemptInitialized || submitted) return
    if (attemptQuestions.length === 0 || states.length !== attemptQuestions.length) return
    if (timeLeft <= 0 || timeLeft % 15 !== 0) return

    const inProgress: InProgressQuizState = {
      questionIds: attemptQuestions.map((question) => question.id),
      states,
      current,
      timeLeft,
      startedAt: attemptStartedAt || new Date().toISOString(),
    }

    void saveQuizProgress("in-progress", attemptsHistory, inProgress)
  }, [quiz, user?.email, attemptInitialized, submitted, attemptQuestions, states, current, attemptsHistory, attemptStartedAt, timeLeft, saveQuizProgress])

  useEffect(() => {
    if (!quiz || !user?.email || !attemptInitialized || submitted) return
    if (typeof navigator.sendBeacon !== "function") return
    const handleBeforeUnload = () => {
      if (attemptQuestions.length === 0 || states.length !== attemptQuestions.length) return
      const payload = new Blob([JSON.stringify({
        email: user.email,
        progress: {
          quizId: quiz.id,
          status: "in-progress",
          attempts: attemptsHistory,
          inProgress: {
            questionIds: attemptQuestions.map((question) => question.id),
            states,
            current,
            timeLeft,
            startedAt: attemptStartedAt || new Date().toISOString(),
          },
        },
      })], { type: "application/json" })
      navigator.sendBeacon("/api/learn/quiz-progress", payload)
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [quiz, user?.email, attemptInitialized, submitted, attemptQuestions, states, current, attemptsHistory, attemptStartedAt, timeLeft])

  useEffect(() => {
    if (submitted || timeLeft <= 0) return
    const timer = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(timer)
  }, [submitted, timeLeft])

  const handleSubmit = useCallback(async () => {
    if (!quiz || attemptQuestions.length === 0) return

    const correct = attemptQuestions.filter(
      (q, i) =>
        states[i]?.answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase(),
    ).length
    const score = Math.round((correct / attemptQuestions.length) * 100)
    const elapsedSeconds = Math.max(0, quiz.timeLimitMinutes * 60 - timeLeft)
    const mistakeBreakdown = buildMistakeBreakdown(attemptQuestions, states)

    const newAttempt: QuizAttempt = {
      date: new Date().toISOString().slice(0, 10),
      score,
      timeSeconds: elapsedSeconds,
      mistakeBreakdown,
    }
    const updatedAttempts = [newAttempt, ...attemptsHistory]

    setAttemptsHistory(updatedAttempts)
    setSubmitted(true)
    setShowConfirm(false)

    addNotification({
      title: `Quiz completed: ${quiz.title}`,
      body: `Score ${score}% (${correct}/${attemptQuestions.length}).`,
      href: `/learn/quiz/${quiz.id}`,
      category: "learning",
      source: "quiz",
    })

    if (user?.email) {
      await saveQuizProgress("completed", updatedAttempts, null)
      return
    }
  }, [quiz, attemptQuestions, states, attemptsHistory, addNotification, timeLeft, user?.email, saveQuizProgress])

  const handleLeaveQuiz = useCallback(async () => {
    if (!quiz) return
    if (user?.email && attemptQuestions.length > 0 && states.length === attemptQuestions.length) {
      const inProgress: InProgressQuizState = {
        questionIds: attemptQuestions.map((question) => question.id),
        states,
        current,
        timeLeft,
        startedAt: attemptStartedAt || new Date().toISOString(),
      }
      await saveQuizProgress("in-progress", attemptsHistory, inProgress)
    }

    setShowLeaveConfirm(false)
    router.push("/learn?tab=quizzes")
  }, [quiz, user?.email, attemptQuestions, states, current, timeLeft, attemptStartedAt, saveQuizProgress, attemptsHistory, router])

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

  if (!attemptInitialized || states.length === 0 || attemptQuestions.length === 0) return null

  const question = attemptQuestions[current]
  const state = states[current]
  const answeredCount = states.filter((s) => s.answer.trim().length > 0).length
  const canLeaveQuiz = answeredCount >= 5

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
    const correct = attemptQuestions.filter((q, i) => getResult(q, states[i])).length
    const score = Math.round((correct / attemptQuestions.length) * 100)
    const topicBreakdown: Record<string, { correct: number; total: number }> = {}
    attemptQuestions.forEach((q, i) => {
      const primaryTopic = q.topicTags[0] ?? quiz.topicTags[0] ?? "probability"
      if (!topicBreakdown[primaryTopic]) topicBreakdown[primaryTopic] = { correct: 0, total: 0 }
      topicBreakdown[primaryTopic].total++
      if (getResult(q, states[i])) topicBreakdown[primaryTopic].correct++
    })

    const mistakeBreakdown = buildMistakeBreakdown(attemptQuestions, states)

    const wrongQuestions = attemptQuestions
      .map((q, i) => ({ q, s: states[i] }))
      .filter(({ q, s }) => !getResult(q, s))

    const weakTopics = new Set(
      wrongQuestions.flatMap(({ q }) => q.topicTags)
    )

    const followUps = [...recommendations]
      .map(rec => ({
        rec,
        score:
          (rec.linkedId === quiz.id ? 4 : 0) +
          ([...weakTopics].some(t => rec.linkedId?.includes(t)) ? 2 : 0) +
          (rec.impactTag === "High impact" ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ rec }) => rec)

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
              {correct} of {attemptQuestions.length} correct
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
                {(["Conceptual", "Careless", "Implementation"] as const).map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs">{type}</span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {mistakeBreakdown[type]}
                    </Badge>
                  </div>
                ))}
                <p className="pt-1 text-[10px] text-muted-foreground">
                  Implementation = wrong on Advanced questions (application/execution gap).
                </p>
              </CardContent>
            </Card>

            {/* Recommended follow-ups */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Follow-ups</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {followUps.map((rec) => (
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
            {attemptQuestions.map((q, i) => {
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

        <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
          {/* Left: Question navigator */}
          <Card className="p-3">
            <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Questions</p>
            <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-3">
              {attemptQuestions.map((_, i) => {
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
                Question {current + 1} of {attemptQuestions.length}
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
                  {canLeaveQuiz && (
                    <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                          Leave Quiz
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Leave Quiz?</DialogTitle>
                          <DialogDescription>
                            Your progress will be saved and you can resume later.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowLeaveConfirm(false)}>
                            Stay in Quiz
                          </Button>
                          <Button onClick={() => void handleLeaveQuiz()}>Leave</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
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
                  {current < attemptQuestions.length - 1 ? (
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
                            You have answered {answeredCount} of{" "}
                            {attemptQuestions.length} questions.
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

        </div>
      </div>
    </TooltipProvider>
  )
}

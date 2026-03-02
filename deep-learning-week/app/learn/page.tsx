"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts"
import { Search, Clock, ArrowRight, Play, AlertTriangle, Plus, Trash2, RefreshCw } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import {
  courses,
  quizzes,
  srCards,
  masteryData,
  getTopicLabel,
  recommendations,
} from "@/lib/mock"
import type { Difficulty, SRCard } from "@/lib/types"
import type { StoredQuizProgress } from "@/lib/quiz-progress"

type StickyNote = {
  id: string
  title: string
  content: string
  color: string
  createdAt: string
  updatedAt: string
}

const NOTES_STORAGE_KEY = "learn-sticky-notes-v1"
const LEGACY_NOTES_STORAGE_KEY = "learn-notes"
const SR_CARDS_STORAGE_KEY_PREFIX = "learn-sr-cards-v1"
const RANDOM_SPACED_REPETITION_CARD_COUNT = 10
const NOTE_COLORS = [
  { value: "bg-amber-100/90 border-amber-300", label: "Amber" },
  { value: "bg-rose-100/90 border-rose-300", label: "Rose" },
  { value: "bg-sky-100/90 border-sky-300", label: "Sky" },
  { value: "bg-emerald-100/90 border-emerald-300", label: "Mint" },
]
type ReviewRating = "again" | "hard" | "good" | "easy"
type SessionStats = Record<ReviewRating, number>

const INITIAL_SESSION_STATS: SessionStats = {
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
}

const LEARN_TAB_HEADERS: Record<string, { title: string; description: string }> = {
  courses: {
    title: "Courses",
    description: "Structured learning paths with modules, progress tracking, and practice-focused coverage.",
  },
  quizzes: {
    title: "Quizzes",
    description: "Assess understanding with topic-tagged quizzes, attempt history, and mistake diagnostics.",
  },
  "spaced-repetition": {
    title: "Spaced Repetition",
    description: "Reinforce key concepts with scheduled review cards tuned to retention and forgetting risk.",
  },
  notes: {
    title: "Notes",
    description: "Capture and organize study notes with sticky cards that autosave locally.",
  },
  mastery: {
    title: "Mastery",
    description: "Track mastery and confidence trends to identify gaps, risk areas, and next-best actions.",
  },
}

function createStickyNote(colorIndex = 0, content = ""): StickyNote {
  const now = new Date().toISOString()
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "New note",
    content,
    color: NOTE_COLORS[colorIndex % NOTE_COLORS.length].value,
    createdAt: now,
    updatedAt: now,
  }
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const next = new Date(year, month - 1, day)
  next.setDate(next.getDate() + days)
  return toLocalIsoDate(next)
}

function applyReview(card: SRCard, rating: ReviewRating, reviewDate: string): SRCard {
  let easeFactor = card.easeFactor
  let interval = card.interval

  if (rating === "again") {
    easeFactor = Math.max(1.3, easeFactor - 0.2)
    interval = 1
  } else if (rating === "hard") {
    easeFactor = Math.max(1.3, easeFactor - 0.1)
    interval = Math.max(1, Math.round(interval * 1.2))
  } else if (rating === "good") {
    interval = Math.max(2, Math.round(interval * easeFactor))
  } else {
    easeFactor = Math.min(3, easeFactor + 0.1)
    interval = Math.max(3, Math.round(interval * (easeFactor + 0.3)))
  }

  return {
    ...card,
    easeFactor: Number(easeFactor.toFixed(1)),
    interval,
    dueDate: addDays(reviewDate, interval),
    lastReview: reviewDate,
  }
}

function isValidStoredSRCard(value: unknown): value is SRCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const card = value as Partial<SRCard>
  return (
    typeof card.id === "string" &&
    typeof card.front === "string" &&
    typeof card.back === "string" &&
    typeof card.topicId === "string" &&
    typeof card.easeFactor === "number" &&
    Number.isFinite(card.easeFactor) &&
    card.easeFactor > 0 &&
    typeof card.interval === "number" &&
    Number.isInteger(card.interval) &&
    card.interval > 0 &&
    typeof card.dueDate === "string" &&
    (card.lastReview === undefined || typeof card.lastReview === "string")
  )
}

function parseStoredSRCards(value: string): SRCard[] | null {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    return parsed.every(isValidStoredSRCard) ? parsed : null
  } catch {
    return null
  }
}

function sampleRandomCardIds(allCards: SRCard[], size: number): string[] {
  const shuffled = [...allCards]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.min(size, shuffled.length)).map((card) => card.id)
}

function LearnContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get("tab") || "courses"
  const activeHeader = LEARN_TAB_HEADERS[activeTab] ?? LEARN_TAB_HEADERS.courses
  const srCardsStorageKey = user?.email
    ? `${SR_CARDS_STORAGE_KEY_PREFIX}:${user.email.toLowerCase()}`
    : null
  const [courseSearch, setCourseSearch] = useState("")
  const [courseDifficulty, setCourseDifficulty] = useState<string>("all")
  const [quizTopic, setQuizTopic] = useState<string>("all")
  const [quizDifficulty, setQuizDifficulty] = useState<string>("all")
  const [quizProgressById, setQuizProgressById] = useState<Record<string, StoredQuizProgress>>({})
  const [cards, setCards] = useState<SRCard[]>(srCards)
  const [cardsHydrated, setCardsHydrated] = useState(false)
  const [randomCardPool, setRandomCardPool] = useState<string[]>([])
  const [sessionQueue, setSessionQueue] = useState<string[]>([])
  const [sessionIndex, setSessionIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [sessionStats, setSessionStats] = useState<SessionStats>({ ...INITIAL_SESSION_STATS })
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const stored = window.localStorage.getItem(NOTES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
      }
      const legacy = window.localStorage.getItem(LEGACY_NOTES_STORAGE_KEY)
      if (legacy?.trim()) return [createStickyNote(0, legacy)]
      return []
    } catch {
      return []
    }
  })

  useEffect(() => {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(stickyNotes))
  }, [stickyNotes])

  useEffect(() => {
    setCardsHydrated(false)
    if (!srCardsStorageKey) {
      setCards(srCards)
      setCardsHydrated(true)
      return
    }

    try {
      const stored = window.localStorage.getItem(srCardsStorageKey)
      const parsed = stored ? parseStoredSRCards(stored) : null
      setCards(parsed ?? srCards)
    } catch {
      setCards(srCards)
    } finally {
      setCardsHydrated(true)
    }
  }, [srCardsStorageKey])

  useEffect(() => {
    if (!srCardsStorageKey || !cardsHydrated) return
    window.localStorage.setItem(srCardsStorageKey, JSON.stringify(cards))
  }, [cards, cardsHydrated, srCardsStorageKey])

  useEffect(() => {
    const targetSize = Math.min(RANDOM_SPACED_REPETITION_CARD_COUNT, cards.length)
    if (targetSize === 0) {
      setRandomCardPool([])
      return
    }

    setRandomCardPool((prev) => {
      const hasValidPool =
        prev.length === targetSize &&
        prev.every((id) => cards.some((card) => card.id === id))
      if (hasValidPool) return prev
      return sampleRandomCardIds(cards, RANDOM_SPACED_REPETITION_CARD_COUNT)
    })
  }, [cards])

  useEffect(() => {
    let active = true

    async function loadQuizProgress() {
      if (!user?.email) {
        if (active) setQuizProgressById({})
        return
      }

      try {
        const res = await fetch(
          `/api/learn/quiz-progress?email=${encodeURIComponent(user.email)}`,
          { cache: "no-store" }
        )
        if (!res.ok) {
          if (active) setQuizProgressById({})
          return
        }

        const data = (await res.json()) as { progress?: StoredQuizProgress[] }
        if (!active) return

        const byId: Record<string, StoredQuizProgress> = {}
        if (Array.isArray(data.progress)) {
          for (const progress of data.progress) {
            if (progress?.quizId) byId[progress.quizId] = progress
          }
        }
        setQuizProgressById(byId)
      } catch {
        if (active) setQuizProgressById({})
      }
    }

    loadQuizProgress()
    return () => {
      active = false
    }
  }, [user?.email])

  const addStickyNote = () => {
    setStickyNotes((prev) => [createStickyNote(prev.length), ...prev])
  }

  const updateStickyNote = (id: string, patch: Partial<StickyNote>) => {
    const now = new Date().toISOString()
    setStickyNotes((prev) =>
      prev.map((note) =>
        note.id === id
          ? { ...note, ...patch, updatedAt: now }
          : note
      )
    )
  }

  const deleteStickyNote = (id: string) => {
    setStickyNotes((prev) => prev.filter((note) => note.id !== id))
  }

  const noteHistory = [...stickyNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const filteredCourses = courses.filter((c) => {
    const matchSearch = c.title.toLowerCase().includes(courseSearch.toLowerCase())
    const matchDiff = courseDifficulty === "all" || c.difficulty === courseDifficulty
    return matchSearch && matchDiff
  })

  const quizzesWithProgress = quizzes.map((quiz) => {
    if (!user?.email) return quiz
    const progress = quizProgressById[quiz.id]
    if (!progress) {
      return {
        ...quiz,
        status: "not-started" as const,
        attempts: [],
      }
    }
    return {
      ...quiz,
      status: progress.status,
      attempts: progress.attempts,
    }
  })

  const filteredQuizzes = quizzesWithProgress.filter((q) => {
    const matchTopic = quizTopic === "all" || q.topicTags.includes(quizTopic as never)
    const matchDiff = quizDifficulty === "all" || q.difficulty === quizDifficulty
    return matchTopic && matchDiff
  })

  const todayIso = toLocalIsoDate(new Date())
  const dueNow = cards
    .filter((c) => c.dueDate <= todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const dueUpcoming = cards
    .filter((c) => c.dueDate > todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const randomCards = randomCardPool
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is SRCard => Boolean(card))
  const retentionEstimate = (() => {
    const reviewed = cards.filter(c => c.lastReview)
    if (reviewed.length === 0) return 0
    const todayMs = Date.now()
    const scores = reviewed.map(c => {
      const daysSince = Math.max(0, (todayMs - new Date(c.lastReview!).getTime()) / 86_400_000)
      // Map ease factor (1.3–3.0) to stability in days (3–30)
      const stability = ((c.easeFactor - 1.3) / (3.0 - 1.3)) * 27 + 3
      return Math.exp(-daysSince / stability) * 100
    })
    return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
  })()
  const sessionActive = sessionQueue.length > 0
  const sessionComplete = sessionActive && sessionIndex >= sessionQueue.length
  const currentSessionCard =
    sessionActive && !sessionComplete
      ? cards.find((card) => card.id === sessionQueue[sessionIndex])
      : undefined

  const radarData = masteryData.map((m) => ({
    topic: getTopicLabel(m.topicId),
    mastery: m.score,
    confidence: m.confidenceCalibration * 100,
  }))

  const atRiskTopics = masteryData.filter((m) => m.badge === "At Risk" || m.badge === "Needs Review")

  const refreshRandomCards = () => {
    if (cards.length === 0) return
    setRandomCardPool(sampleRandomCardIds(cards, RANDOM_SPACED_REPETITION_CARD_COUNT))
  }

  const startSession = () => {
    if (randomCards.length === 0) return
    setSessionQueue(randomCards.map((card) => card.id))
    setSessionIndex(0)
    setShowAnswer(false)
    setSessionStats({ ...INITIAL_SESSION_STATS })
  }

  const endSession = () => {
    setSessionQueue([])
    setSessionIndex(0)
    setShowAnswer(false)
    setSessionStats({ ...INITIAL_SESSION_STATS })
  }

  const rateCard = (rating: ReviewRating) => {
    const cardId = sessionQueue[sessionIndex]
    if (!cardId) return

    setCards((prev) =>
      prev.map((card) => (card.id === cardId ? applyReview(card, rating, todayIso) : card))
    )
    setSessionStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }))
    setSessionIndex((prev) => prev + 1)
    setShowAnswer(false)
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{activeHeader.title}</h1>
          <p className="text-sm text-muted-foreground">
            {activeHeader.description}
          </p>
        </div>

        <Tabs value={activeTab}>
          {/* Courses Tab */}
          <TabsContent value="courses" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search courses..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={courseDifficulty} onValueChange={setCourseDifficulty}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {filteredCourses.map((course) => (
                <Card key={course.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link
                        href={`/learn/course/${course.id}`}
                        className="text-sm font-medium hover:underline leading-snug"
                      >
                        {course.title}
                      </Link>
                      <DifficultyBadge difficulty={course.difficulty} />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {course.description}
                    </p>
                    <div className="flex items-center gap-2 mb-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      {course.tags.map((t) => (
                        <span key={t}>{getTopicLabel(t)}</span>
                      ))}
                      <span className="ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {course.estimatedHours}h
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={course.progress} className="flex-1 h-1.5" />
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">
                        {course.progress}%
                      </span>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Link href={`/learn/course/${course.id}`}>
                          {course.progress > 0 ? "Continue" : "Start"}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredCourses.length === 0 && (
                <div className="col-span-2 rounded-md border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">No courses match your filters.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Quizzes Tab */}
          <TabsContent value="quizzes" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={quizTopic} onValueChange={setQuizTopic}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="Topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All topics</SelectItem>
                  <SelectItem value="probability">Probability</SelectItem>
                  <SelectItem value="statistics">Statistics</SelectItem>
                  <SelectItem value="time-series">Time Series</SelectItem>
                  <SelectItem value="execution">Execution</SelectItem>
                  <SelectItem value="microstructure">Microstructure</SelectItem>
                  <SelectItem value="risk">Risk</SelectItem>
                </SelectContent>
              </Select>
              <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quiz</TableHead>
                    <TableHead className="w-28">Topics</TableHead>
                    <TableHead className="w-24">Difficulty</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="w-24">Last Score</TableHead>
                    <TableHead className="w-28">Mistakes</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuizzes.map((quiz) => {
                    const lastAttempt = quiz.attempts[0]
                    return (
                      <TableRow key={quiz.id}>
                        <TableCell className="text-sm font-medium">
                          <Link href={`/learn/quiz/${quiz.id}`} className="hover:underline">
                            {quiz.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {quiz.topicTags.map((t) => (
                              <span key={t} className="text-[10px] font-mono uppercase text-muted-foreground">
                                {getTopicLabel(t)}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DifficultyBadge difficulty={quiz.difficulty} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={quiz.status} />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {lastAttempt ? `${lastAttempt.score}%` : "---"}
                        </TableCell>
                        <TableCell>
                          {lastAttempt ? (
                            <div className="flex gap-1">
                              {Object.entries(lastAttempt.mistakeBreakdown).map(
                                ([type, count]) =>
                                  count > 0 && (
                                    <Tooltip key={type}>
                                      <TooltipTrigger>
                                        <Badge variant="secondary" className="text-[9px] font-mono">
                                          {type.charAt(0)}:{count}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="text-xs">
                                        {type}: {count} mistake{count > 1 ? "s" : ""}
                                      </TooltipContent>
                                    </Tooltip>
                                  )
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">---</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                            <Link href={`/learn/quiz/${quiz.id}`}>
                              <Play className="h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Spaced Repetition Tab */}
          <TabsContent value="spaced-repetition" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-semibold tabular-nums">{dueNow.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Due now</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-semibold tabular-nums">{dueUpcoming.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-semibold tabular-nums">{retentionEstimate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Retention estimate</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {sessionActive ? "Session in Progress" : `Random Set (${randomCards.length} cards)`}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={refreshRandomCards}
                  disabled={sessionActive || cards.length === 0}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh {Math.min(RANDOM_SPACED_REPETITION_CARD_COUNT, cards.length)}
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={sessionActive ? endSession : startSession}
                  variant={sessionActive ? "outline" : "default"}
                  disabled={!sessionActive && randomCards.length === 0}
                >
                  <Play className="h-3.5 w-3.5" />
                  {sessionActive ? "End Session" : "Start Session"}
                </Button>
              </div>
            </div>

            {sessionActive ? (
              sessionComplete ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Session Complete</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <StatPill label="Again" value={sessionStats.again} />
                      <StatPill label="Hard" value={sessionStats.hard} />
                      <StatPill label="Good" value={sessionStats.good} />
                      <StatPill label="Easy" value={sessionStats.easy} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reviewed {sessionQueue.length} card{sessionQueue.length === 1 ? "" : "s"}.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={startSession} disabled={randomCards.length === 0}>
                        Review Random Cards
                      </Button>
                      <Button size="sm" variant="outline" onClick={endSession}>
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : currentSessionCard ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Card {sessionIndex + 1} of {sessionQueue.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Progress value={(sessionIndex / sessionQueue.length) * 100} className="h-1.5" />
                    <div className="rounded-md border border-border p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                          Prompt
                        </p>
                        <p className="text-sm mt-1">{currentSessionCard.front}</p>
                      </div>
                      {showAnswer && (
                        <div className="border-t border-border pt-3">
                          <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                            Answer
                          </p>
                          <p className="text-sm mt-1 text-muted-foreground">{currentSessionCard.back}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        <span>{getTopicLabel(currentSessionCard.topicId)}</span>
                        <span>|</span>
                        <span>Ease: {currentSessionCard.easeFactor.toFixed(1)}</span>
                        <span>|</span>
                        <span>Interval: {currentSessionCard.interval}d</span>
                      </div>
                    </div>

                    {!showAnswer ? (
                      <Button size="sm" className="h-8" onClick={() => setShowAnswer(true)}>
                        Reveal Answer
                      </Button>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-4">
                        <Button size="sm" variant="outline" onClick={() => rateCard("again")}>
                          Again
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => rateCard("hard")}>
                          Hard
                        </Button>
                        <Button size="sm" onClick={() => rateCard("good")}>
                          Good
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => rateCard("easy")}>
                          Easy
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null
            ) : (
              <div className="space-y-2">
                {randomCards.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">No cards available right now.</p>
                    </CardContent>
                  </Card>
                ) : (
                  randomCards.map((card) => (
                    <Card key={card.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm">{card.front}</p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                            <span>{getTopicLabel(card.topicId)}</span>
                            <span>|</span>
                            <span>Ease: {card.easeFactor.toFixed(1)}</span>
                            <span>|</span>
                            <span>Interval: {card.interval}d</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </TabsContent>

          {/* Mastery Map Tab */}
          <TabsContent value="mastery" className="space-y-4 mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Mastery Radar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <PolarAngleAxis
                          dataKey="topic"
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                        />
                        <Radar
                          name="Mastery"
                          dataKey="mastery"
                          stroke="var(--color-chart-2)"
                          fill="var(--color-chart-2)"
                          fillOpacity={0.15}
                          strokeWidth={1.5}
                        />
                        <Radar
                          name="Confidence"
                          dataKey="confidence"
                          stroke="var(--color-chart-4)"
                          fill="var(--color-chart-4)"
                          fillOpacity={0.08}
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-chart-2" />
                      Mastery
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-chart-4" />
                      Confidence
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-chart-1" />
                    At Risk Topics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {atRiskTopics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No topics currently at risk. Keep it up!</p>
                  ) : (
                    atRiskTopics.map((m) => {
                      const rec = recommendations.find(
                        (r) => r.type === "course" || r.type === "drill"
                      )
                      return (
                        <div
                          key={m.topicId}
                          className="rounded-md border border-border p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">
                              {getTopicLabel(m.topicId)}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {m.score}% mastery
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Forgetting risk: {(m.forgettingRisk * 100).toFixed(0)}% | Confidence calibration: {(m.confidenceCalibration * 100).toFixed(0)}%
                          </p>
                          {rec && (
                            <div className="mt-2 flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">
                                {rec.impactTag}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {rec.title}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Sticky Study Notes</h2>
                <p className="text-xs text-muted-foreground">Autosaved locally. Each sticky note keeps its own edit timeline.</p>
              </div>
              <Button size="sm" className="h-8 gap-1.5" onClick={addStickyNote}>
                <Plus className="h-3.5 w-3.5" />
                New Sticker
              </Button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                {stickyNotes.map((note) => (
                  <Card key={note.id} className={`${note.color} border-2 shadow-sm`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={note.title}
                          onChange={(e) => updateStickyNote(note.id, { title: e.target.value })}
                          className="h-8 bg-white/65 border-white/70"
                          placeholder="Note title"
                        />
                        <div className="flex items-center gap-1 rounded-md bg-white/55 px-1.5 py-1">
                          {NOTE_COLORS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => updateStickyNote(note.id, { color: c.value })}
                              className={`h-4 w-4 rounded-full border ${c.value} ${note.color === c.value ? "ring-2 ring-foreground/40" : ""}`}
                              aria-label={`Set note color ${c.label}`}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>

                      <Textarea
                        value={note.content}
                        onChange={(e) => updateStickyNote(note.id, { content: e.target.value })}
                        placeholder="Write your sticky note..."
                        className="min-h-36 bg-white/65 border-white/70"
                      />

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Updated {new Date(note.updatedAt).toLocaleString()}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => deleteStickyNote(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {stickyNotes.length === 0 && (
                  <Card className="sm:col-span-2 border-dashed">
                    <CardContent className="p-8 text-center">
                      <p className="text-sm text-muted-foreground">No sticky notes yet.</p>
                      <Button size="sm" className="mt-3 h-8 gap-1.5" onClick={addStickyNote}>
                        <Plus className="h-3.5 w-3.5" />
                        Create your first sticker
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Sticker History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {noteHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Your note activity will appear here.</p>
                  ) : (
                    noteHistory.map((note) => (
                      <div key={note.id} className="rounded-md border border-border p-2">
                        <p className="text-xs font-medium truncate">{note.title || "Untitled note"}</p>
                        <p className="text-[11px] text-muted-foreground">Created {new Date(note.createdAt).toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground">Last edit {new Date(note.updatedAt).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono">{value}</p>
    </div>
  )
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const colors: Record<Difficulty, string> = {
    Beginner: "bg-chart-2/15 text-chart-2 border-chart-2/20",
    Intermediate: "bg-chart-4/15 text-chart-4 border-chart-4/20",
    Advanced: "bg-chart-1/15 text-chart-1 border-chart-1/20",
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${colors[difficulty]}`}>
      {difficulty}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "not-started": "bg-muted text-muted-foreground border-border",
    "in-progress": "bg-chart-4/15 text-chart-4 border-chart-4/20",
    "completed": "bg-chart-2/15 text-chart-2 border-chart-2/20",
  }
  const labels: Record<string, string> = {
    "not-started": "New",
    "in-progress": "In Progress",
    "completed": "Done",
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${colors[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading...</div>}>
      <LearnContent />
    </Suspense>
  )
}

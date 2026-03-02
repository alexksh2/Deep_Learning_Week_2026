"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { RefreshCw, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react"
import {
  masteryData,
  recommendations,
  buildSkillMatrix,
  getTopicLabel,
} from "@/lib/mock"
import { skillMatrixQuizDefinitions } from "@/lib/skill-matrix-quiz-definitions"
import type { MasteryTrend } from "@/lib/types"
import type { StoredQuizProgress } from "@/lib/quiz-progress"
import { useNotifications, type AppNotification, type NotificationCategory } from "@/contexts/NotificationContext"
import { useAuth } from "@/contexts/AuthContext"

function TrendIcon({ trend }: { trend: MasteryTrend }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-chart-2" />
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
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
  const { notifications, markAsRead } = useNotifications()
  const { user } = useAuth()
  const [quizProgressById, setQuizProgressById] = useState<Record<string, StoredQuizProgress>>({})
  const aiRecommendedPlan = useMemo(
    () =>
      recommendations.slice(0, 3).map((item) => {
        let link = "/learn"
        if (item.type === "drill") link = "/trade/sim"
        if (item.type === "quiz" && item.linkedId) link = `/learn/quiz/${item.linkedId}`
        if (item.type === "course" && item.linkedId) link = `/learn/course/${item.linkedId}`

        return {
          id: item.id,
          title: item.title,
          because: item.because,
          estimatedMinutes: item.estimatedMinutes,
          impactTag: item.impactTag,
          link,
        }
      }),
    [],
  )

  const recentNotifications = useMemo(() => notifications.slice(0, 12), [notifications])
  const skillDefsById = useMemo(
    () => new Map(skillMatrixQuizDefinitions.map((definition) => [definition.skillId, definition])),
    [],
  )

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
          { cache: "no-store" },
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

  const masteryOverview = useMemo(() => {
    const skills = buildSkillMatrix({
      quizProgressById,
      useQuizProgressOnly: Boolean(user?.email),
    })

    const topicTotals = new Map<string, { sum: number; count: number; skills: Set<string> }>()
    for (const skill of skills) {
      const definition = skillDefsById.get(skill.id)
      if (!definition) continue

      for (const topicId of definition.topicTags) {
        const current = topicTotals.get(topicId) ?? { sum: 0, count: 0, skills: new Set<string>() }
        current.sum += skill.measuredScore
        current.count += 1
        current.skills.add(definition.skillName)
        topicTotals.set(topicId, current)
      }
    }

    return masteryData.map((topic) => {
      const total = topicTotals.get(topic.topicId)
      if (!total || total.count === 0) {
        return {
          ...topic,
          derivedSkills: [] as string[],
        }
      }
      return {
        ...topic,
        score: Math.round(total.sum / total.count),
        derivedSkills: Array.from(total.skills).sort((a, b) => a.localeCompare(b)),
      }
    })
  }, [quizProgressById, skillDefsById, user?.email])

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
          {/* Combined Plan */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">AI Recommended Plan</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI Recommended</p>
                {aiRecommendedPlan.map((item) => (
                  <Link
                    key={item.id}
                    href={item.link}
                    className="block rounded-md border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-tight">{item.title}</p>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] whitespace-nowrap">
                        {item.impactTag}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{item.because}</p>
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground font-mono">
                      <Clock className="h-3 w-3" />
                      {item.estimatedMinutes} min
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mastery Overview */}
        <div>
          <h2 className="text-sm font-medium mb-3">Mastery Overview</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {masteryOverview.map((m) => (
              <Card key={m.topicId} className="p-0">
                <CardContent className="p-4">
                  <div className="mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {getTopicLabel(m.topicId)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums">{m.score}</span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                    <TrendIcon trend={m.trend} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="mt-2 text-left text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Derived from {m.derivedSkills.length} skill{m.derivedSkills.length === 1 ? "" : "s"}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-72">
                      <p>{m.derivedSkills.length === 0 ? "No linked skills found for this topic." : m.derivedSkills.join(", ")}</p>
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

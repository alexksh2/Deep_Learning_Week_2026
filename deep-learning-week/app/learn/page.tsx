"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Search, Clock, ArrowRight, Play, AlertTriangle } from "lucide-react"
import {
  courses,
  quizzes,
  srCards,
  masteryData,
  getTopicLabel,
  recommendations,
} from "@/lib/mock"
import type { Difficulty } from "@/lib/types"

function LearnContent() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") || "courses"
  const [courseSearch, setCourseSearch] = useState("")
  const [courseDifficulty, setCourseDifficulty] = useState<string>("all")
  const [quizTopic, setQuizTopic] = useState<string>("all")
  const [quizDifficulty, setQuizDifficulty] = useState<string>("all")

  const filteredCourses = courses.filter((c) => {
    const matchSearch = c.title.toLowerCase().includes(courseSearch.toLowerCase())
    const matchDiff = courseDifficulty === "all" || c.difficulty === courseDifficulty
    return matchSearch && matchDiff
  })

  const filteredQuizzes = quizzes.filter((q) => {
    const matchTopic = quizTopic === "all" || q.topicTags.includes(quizTopic as never)
    const matchDiff = quizDifficulty === "all" || q.difficulty === quizDifficulty
    return matchTopic && matchDiff
  })

  const dueToday = srCards.filter((c) => c.dueDate === "2026-03-01")
  const dueUpcoming = srCards.filter((c) => c.dueDate > "2026-03-01")
  const retentionEstimate = Math.round(
    (srCards.reduce((sum, c) => sum + Math.min(c.easeFactor / 3, 1), 0) / srCards.length) * 100
  )

  const radarData = masteryData.map((m) => ({
    topic: getTopicLabel(m.topicId),
    mastery: m.score,
    confidence: m.confidenceCalibration * 100,
  }))

  const atRiskTopics = masteryData.filter((m) => m.badge === "At Risk" || m.badge === "Needs Review")

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Learn</h1>
          <p className="text-sm text-muted-foreground">
            Courses, quizzes, spaced repetition, and mastery tracking.
          </p>
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
            <TabsTrigger value="spaced-repetition">Spaced Repetition</TabsTrigger>
            <TabsTrigger value="mastery">Mastery Map</TabsTrigger>
          </TabsList>

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
                  <p className="text-3xl font-semibold tabular-nums">{dueToday.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Due today</p>
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
              <h2 className="text-sm font-medium">Due Today ({dueToday.length} cards)</h2>
              <Button size="sm" className="h-8 gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Start Session
              </Button>
            </div>

            <div className="space-y-2">
              {dueToday.map((card) => (
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
              ))}
            </div>
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
        </Tabs>
      </div>
    </TooltipProvider>
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

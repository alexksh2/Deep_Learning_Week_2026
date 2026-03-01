"use client"

import { use } from "react"
import Link from "next/link"
import { courses, masteryData, getTopicLabel, recommendations } from "@/lib/mock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Clock,
  CheckCircle2,
  Circle,
  ArrowRight,
  AlertTriangle,
  Lightbulb,
  FileText,
} from "lucide-react"
import type { Difficulty } from "@/lib/types"

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

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const course = courses.find((c) => c.id === id)

  if (!course) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Course not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link href="/learn">Back to Learn</Link>
        </Button>
      </div>
    )
  }

  const completedLessons = course.lessons.filter((l) => l.completed).length
  const nextLesson = course.lessons.find((l) => !l.completed)
  const relatedMastery = masteryData.filter((m) =>
    course.tags.includes(m.topicId)
  )
  const relatedRecs = recommendations.filter(
    (r) => r.linkedId === course.id || course.tags.some((t) => r.because.toLowerCase().includes(t))
  ).slice(0, 2)

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
              <BreadcrumbLink href="/learn?tab=courses">Courses</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{course.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-start gap-3 mb-2">
                <h1 className="text-xl font-semibold tracking-tight flex-1">
                  {course.title}
                </h1>
                <DifficultyBadge difficulty={course.difficulty} />
              </div>
              <p className="text-sm text-muted-foreground">{course.description}</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {course.estimatedHours} hours
                </div>
                <div className="flex gap-1.5">
                  {course.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] font-mono uppercase">
                      {getTopicLabel(t)}
                    </Badge>
                  ))}
                </div>
                {course.prerequisites.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger className="text-xs text-muted-foreground">
                      {course.prerequisites.length} prereq{course.prerequisites.length > 1 ? "s" : ""}
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {course.prerequisites.join(", ")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-4">
              <Progress value={course.progress} className="flex-1 h-2" />
              <span className="text-sm font-mono tabular-nums text-muted-foreground">
                {completedLessons}/{course.lessons.length} lessons
              </span>
            </div>

            {/* Lesson list */}
            <Accordion type="multiple" defaultValue={nextLesson ? [nextLesson.id] : []}>
              {course.lessons.map((lesson, i) => (
                <AccordionItem key={lesson.id} value={lesson.id}>
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      {lesson.completed ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <span className="text-sm font-medium">
                          {i + 1}. {lesson.title}
                        </span>
                        <span className="ml-2 text-xs font-mono text-muted-foreground">
                          {lesson.estimatedMinutes}min
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-7 space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {lesson.keyConcepts.map((concept) => (
                          <Badge
                            key={concept}
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            {concept}
                          </Badge>
                        ))}
                      </div>
                      {!lesson.completed && (
                        <Button size="sm" className="h-7 text-xs gap-1">
                          Start lesson
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                      {lesson.completed && (
                        <p className="text-xs text-chart-2">Completed</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Right Rail */}
          <div className="space-y-4">
            {/* Next Best Action */}
            {relatedRecs.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4" />
                    Next Best Action
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {relatedRecs.map((rec) => (
                    <div key={rec.id} className="rounded-md border border-border p-2.5">
                      <p className="text-sm font-medium">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Because: {rec.because}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {rec.impactTag}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {rec.estimatedMinutes}min
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Common Pitfalls */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-chart-1" />
                  Common Pitfalls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Confusing convergence in probability with almost sure convergence. The former allows for rare exceptions, the latter does not.
                </p>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Misapplying the optional stopping theorem without checking the bounded stopping time condition.
                </p>
              </CardContent>
            </Card>

            {/* Evidence Card */}
            {relatedMastery.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Your Evidence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {relatedMastery.map((m) => (
                    <div key={m.topicId} className="flex items-center justify-between text-xs">
                      <span className="font-mono uppercase text-muted-foreground">
                        {getTopicLabel(m.topicId)}
                      </span>
                      <span className="font-mono tabular-nums">
                        {m.score}% mastery
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Last mistakes in this area were primarily conceptual (Bayes updates, conditional distributions).
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

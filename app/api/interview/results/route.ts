import { NextResponse } from "next/server"
import { getInterviewResults, upsertInterviewResult } from "@/lib/auth-db"
import type { InterviewScoreRow } from "@/lib/auth-db"

type CreateInterviewResultBody = {
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
  scoreRows: unknown
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeScoreRows(value: unknown): InterviewScoreRow[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row, index) => {
      if (!row || typeof row !== "object") return null
      const record = row as Record<string, unknown>
      const score = clamp(Math.round(asNumber(record.score)), 1, 5)
      return {
        questionIndex: clamp(Math.round(asNumber(record.questionIndex) || index + 1), 1, 1000),
        score,
        question: asString(record.question),
        answer: asString(record.answer),
        feedback: asString(record.feedback),
      } satisfies InterviewScoreRow
    })
    .filter((row): row is InterviewScoreRow => Boolean(row && row.question && row.answer))
}

function summarizeScoreRows(scoreRows: InterviewScoreRow[]) {
  const scores = scoreRows.map((row) => clamp(Math.round(asNumber(row.score)), 1, 5))
  const answeredCount = clamp(scoreRows.length, 0, 100)
  const averageScore = scores.length
    ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
    : 0

  return {
    answeredCount,
    averageScore,
    strongAnswers: scores.filter((score) => score >= 4).length,
    needsWorkAnswers: scores.filter((score) => score <= 2).length,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = asString(searchParams.get("email")).toLowerCase()
  const limit = clamp(Math.round(Number(searchParams.get("limit") ?? "20")), 1, 100)

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 })
  }

  const rows = getInterviewResults(email, limit)
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateInterviewResultBody
    const email = asString(body.email).toLowerCase()
    const sessionId = asString(body.sessionId)

    if (!email || !sessionId) {
      return NextResponse.json(
        { error: "Email and sessionId are required." },
        { status: 400 },
      )
    }

    const scoreRows = normalizeScoreRows(body.scoreRows)
    if (scoreRows.length === 0) {
      return NextResponse.json({ error: "At least one scored answer is required." }, { status: 400 })
    }
    const scoreSummary = summarizeScoreRows(scoreRows)
    const requestedQuestionCount = clamp(Math.round(asNumber(body.questionCount)), 1, 100)

    const persisted = upsertInterviewResult(email, {
      id: sessionId,
      interviewer: asString(body.interviewer) || "Unknown interviewer",
      category: asString(body.category) || "General",
      questionCount: clamp(Math.max(requestedQuestionCount, scoreSummary.answeredCount), 1, 100),
      answeredCount: scoreSummary.answeredCount,
      averageScore: scoreSummary.averageScore,
      strongAnswers: scoreSummary.strongAnswers,
      needsWorkAnswers: scoreSummary.needsWorkAnswers,
      durationMinutes: clamp(Math.round(asNumber(body.durationMinutes)), 0, 240),
      startedAt: asString(body.startedAt) || new Date().toISOString(),
      completedAt: asString(body.completedAt) || new Date().toISOString(),
      scoreRows,
    })

    return NextResponse.json(persisted)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to store interview result." },
      { status: 500 },
    )
  }
}

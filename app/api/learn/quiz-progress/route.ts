import { NextRequest, NextResponse } from "next/server"
import { getQuizProgress, getQuizProgressByQuiz, upsertQuizProgress } from "@/lib/auth-db"
import type { StoredQuizProgress } from "@/lib/quiz-progress"

type UpsertBody = {
  email?: string
  progress?: Omit<StoredQuizProgress, "updatedAt"> & { updatedAt?: string }
}

function hasValidStatus(status: string): boolean {
  return status === "not-started" || status === "in-progress" || status === "completed"
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  const quizId = req.nextUrl.searchParams.get("quizId")?.trim()

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 })
  }

  if (quizId) {
    const progress = getQuizProgressByQuiz(email, quizId)
    return NextResponse.json({ progress })
  }

  const progress = getQuizProgress(email)
  return NextResponse.json({ progress })
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as UpsertBody
  const email = body.email?.trim().toLowerCase()
  const progress = body.progress

  if (!email || !progress) {
    return NextResponse.json({ error: "email and progress required" }, { status: 400 })
  }

  if (!progress.quizId || !hasValidStatus(progress.status) || !Array.isArray(progress.attempts)) {
    return NextResponse.json({ error: "invalid progress payload" }, { status: 400 })
  }

  const saved = upsertQuizProgress(email, {
    quizId: progress.quizId,
    status: progress.status,
    attempts: progress.attempts,
    inProgress: progress.inProgress ?? null,
    updatedAt: progress.updatedAt,
  })

  return NextResponse.json({ ok: true, progress: saved })
}

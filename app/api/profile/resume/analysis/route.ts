import { NextResponse } from "next/server"
import { getResumeAnalysis } from "@/lib/auth-db"
import { buildResumeAnalysisContext } from "@/lib/resume-analysis-context"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email")?.trim().toLowerCase()

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 })
  }

  const record = getResumeAnalysis(email)
  if (!record) {
    return NextResponse.json({ exists: false })
  }

  return NextResponse.json({
    exists: true,
    source: record.source,
    analyzedAt: record.analyzedAt,
    updatedAt: record.updatedAt,
    analysis: record.analysis,
    contextBlock: buildResumeAnalysisContext(record.analysis),
  })
}

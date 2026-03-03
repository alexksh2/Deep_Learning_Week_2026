import { spawn } from "child_process"
import { randomUUID } from "crypto"
import { appendFile, mkdir } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"
import { getReadinessStudyPlan, upsertReadinessStudyPlan } from "@/lib/auth-db"
import { resolvePythonScriptPath } from "@/lib/python-paths"

const SCRIPT_PATH = resolvePythonScriptPath(
  "ml-development/readiness-agent/study_plan_agent.py",
  "readiness-agent/study_plan_agent.py",
)
const AUDIT_DIR = path.join(process.cwd(), "data", "responsible-ai")
const AUDIT_LOG_FILE = path.join(AUDIT_DIR, "study-plan-tool-audit.ndjson")
const DOCUMENTATION_PATH = "docs/responsible-ai-study-plan-tool-logging.md"

type ToolTraceEntry = {
  step?: number
  toolName?: string
  arguments?: Record<string, unknown>
  outputSummary?: string
  status?: string
  invokedAt?: string
}

type StudyPlanAgentResponse = {
  error?: string
  source?: string
  weeklyMinutes?: number
  plan?: unknown[]
  rationale?: string
  generatedAt?: string
  fallbackReason?: string
  toolTrace?: ToolTraceEntry[]
  weeklyOutlook?: unknown[]
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function summarizeRequest(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return { valid: false }
  }

  const asRecord = body as Record<string, unknown>
  const rawBreakdown = Array.isArray(asRecord.breakdown) ? asRecord.breakdown : []
  const breakdown = rawBreakdown
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .slice(0, 8)
    .map((entry) => ({
      key: typeof entry.key === "string" ? entry.key : "unknown",
      score: toNumber(entry.score, 0),
    }))

  const rawRecommendations = Array.isArray(asRecord.recommendations) ? asRecord.recommendations : []
  const recommendationCount = rawRecommendations.length

  return {
    valid: true,
    composite: toNumber(asRecord.composite, 0),
    hoursPerWeek: toNumber(asRecord.hoursPerWeek, 0),
    targetRole: typeof asRecord.targetRole === "string" ? asRecord.targetRole : "unspecified",
    breakdown,
    recommendationCount,
  }
}

async function appendAuditLog(record: Record<string, unknown>): Promise<void> {
  await mkdir(AUDIT_DIR, { recursive: true })
  await appendFile(AUDIT_LOG_FILE, `${JSON.stringify(record)}\n`, "utf8")
}

function runStudyPlanScript(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [SCRIPT_PATH], {
      env: { ...process.env },
    })

    let stdout = ""
    let stderr = ""
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      py.kill()
      finish(() => reject(new Error("study_plan_agent.py timed out")))
    }, 45_000)

    py.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    py.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    py.on("error", (error) => {
      finish(() => reject(error))
    })

    py.on("close", (code) => {
      finish(() => {
        if (stderr.trim()) {
          console.error("[readiness_study_plan_agent]", stderr.trim())
        }
        if (code === 0) resolve(stdout.trim())
        else reject(new Error(`study_plan_agent.py exited ${code}: ${stderr.slice(0, 200)}`))
      })
    })

    py.stdin.write(payload)
    py.stdin.end()
  })
}

export async function POST(request: Request) {
  const auditId = randomUUID()
  const startedAt = new Date().toISOString()
  let body: unknown = null

  try {
    body = await request.json()
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {}
    const userEmail = normalizeEmail(bodyRecord.email)
    const scriptRequest: Record<string, unknown> = { ...bodyRecord }
    delete scriptRequest.email

    const raw = await runStudyPlanScript(JSON.stringify(scriptRequest))
    const parsed = JSON.parse(raw) as StudyPlanAgentResponse & Record<string, unknown>
    const toolTrace = Array.isArray(parsed.toolTrace) ? parsed.toolTrace : []

    if (parsed.error) {
      const payload = {
        auditId,
        startedAt,
        loggedAt: new Date().toISOString(),
        status: "error",
        requestSummary: summarizeRequest(body),
        responseSummary: {
          source: parsed.source ?? "unknown",
          sessionCount: Array.isArray(parsed.plan) ? parsed.plan.length : 0,
          toolCount: toolTrace.length,
          fallbackReason: parsed.fallbackReason ?? null,
        },
        toolTrace,
        error: parsed.error,
      }
      try {
        await appendAuditLog(payload)
      } catch (logError) {
        console.error("[readiness_study_plan_audit]", logError)
      }
      return NextResponse.json({ error: parsed.error, auditId }, { status: 500 })
    }

    const payload = {
      auditId,
      startedAt,
      loggedAt: new Date().toISOString(),
      status: "ok",
      model: process.env.OPENAI_MODEL_READINESS_AGENT ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      requestSummary: summarizeRequest(body),
      responseSummary: {
        source: parsed.source ?? "unknown",
        sessionCount: Array.isArray(parsed.plan) ? parsed.plan.length : 0,
        weeklyMinutes: toNumber(parsed.weeklyMinutes, 0),
        toolCount: toolTrace.length,
        fallbackReason: parsed.fallbackReason ?? null,
      },
      toolTrace,
    }
    try {
      await appendAuditLog(payload)
    } catch (logError) {
      console.error("[readiness_study_plan_audit]", logError)
    }

    const responsePayload = { ...parsed, auditId, documentationPath: DOCUMENTATION_PATH }
    if (userEmail) {
      upsertReadinessStudyPlan(userEmail, responsePayload)
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    const payload = {
      auditId,
      startedAt,
      loggedAt: new Date().toISOString(),
      status: "error",
      requestSummary: summarizeRequest(body),
      error: error instanceof Error ? error.message : String(error),
    }
    try {
      await appendAuditLog(payload)
    } catch (logError) {
      console.error("[readiness_study_plan_audit]", logError)
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error), auditId },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = normalizeEmail(searchParams.get("email"))

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 })
  }

  try {
    const record = getReadinessStudyPlan(email)
    if (!record) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      payload: record.payload,
      updatedAt: record.updatedAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

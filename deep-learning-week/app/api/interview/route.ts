import { spawn } from "child_process"
import { NextResponse } from "next/server"
import path from "path"
import { getResumeAnalysis } from "@/lib/auth-db"
import { buildResumeAnalysisContext } from "@/lib/resume-analysis-context"

const SCRIPT = path.join(
  process.cwd(),
  "ml-development/interview-pipeline/interview_llm.py",
)

function runScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [SCRIPT, ...args])
    let stdout = ""
    let stderr = ""

    py.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString() })

    py.on("close", (code) => {
      if (stderr) console.error("[interview_llm]", stderr.trim())
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`interview_llm.py exited ${code}: ${stderr.slice(0, 200)}`))
    })
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      category: string
      interviewer?: string
      total: number
      email?: string
      context_block?: string
      messages: { role: "user" | "assistant"; content: string }[]
    }

    const email = body.email?.trim().toLowerCase()
    const storedResumeAnalysis = email ? getResumeAnalysis(email) : null
    const mergedContextBlock = [
      body.context_block ?? "",
      storedResumeAnalysis ? buildResumeAnalysisContext(storedResumeAnalysis.analysis) : "",
    ]
      .filter((entry) => entry.trim().length > 0)
      .join("\n\n")

    const args = [
      "--category",      body.category,
      "--interviewer",   body.interviewer ?? "Jane Street",
      "--total",         String(body.total),
      "--context_block", mergedContextBlock,
      "--messages",      JSON.stringify(body.messages),
    ]

    const raw    = await runScript(args)
    const result = JSON.parse(raw)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

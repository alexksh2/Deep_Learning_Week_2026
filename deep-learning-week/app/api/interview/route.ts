import { spawn } from "child_process"
import { NextResponse } from "next/server"
import path from "path"

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
      total: number
      context_block?: string
      messages: { role: "user" | "assistant"; content: string }[]
    }

    const args = [
      "--category",      body.category,
      "--total",         String(body.total),
      "--context_block", body.context_block ?? "",
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

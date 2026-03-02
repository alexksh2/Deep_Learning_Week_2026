import { spawn } from "child_process"
import { NextResponse } from "next/server"
import { resolvePythonScriptPath } from "@/lib/python-paths"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickers = searchParams.get("tickers") || "USMV"
  const tickerList = tickers
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)

  const script = resolvePythonScriptPath(
    "ml-development/etf-analysis/run_analysis.py",
    "etf-analysis/run_analysis.py",
  )

  return new Promise<Response>((resolve) => {
    const py = spawn("python3", [script, ...tickerList])
    let stdout = ""
    let stderr = ""

    py.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString() })

    // 3 min timeout — first call downloads factor data
    const timer = setTimeout(() => {
      py.kill()
      resolve(NextResponse.json({ error: "Analysis timed out" }, { status: 504 }))
    }, 180_000)

    py.on("close", (code: number) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: stderr || "Analysis script failed" },
            { status: 500 },
          ),
        )
        return
      }
      try {
        const data = JSON.parse(stdout)
        resolve(NextResponse.json(data))
      } catch {
        resolve(
          NextResponse.json(
            { error: "Script returned invalid JSON" },
            { status: 500 },
          ),
        )
      }
    })
  })
}

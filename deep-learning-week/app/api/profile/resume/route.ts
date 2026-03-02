import { spawn } from "child_process"
import { writeFile, unlink } from "fs/promises"
import os from "os"
import path from "path"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const name = file.name.toLowerCase()
    const isPDF  = file.type === "application/pdf" || name.endsWith(".pdf")
    const isTXT  = file.type === "text/plain"      || name.endsWith(".txt")
    const isDOCX = name.endsWith(".docx") || name.endsWith(".doc")

    if (!isPDF && !isTXT && !isDOCX) {
      return NextResponse.json(
        { error: "Only PDF, TXT and DOCX files are supported." },
        { status: 415 },
      )
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 503 })
    }

    // Write upload to a temp file so the Python subprocess can read it
    const ext     = name.split(".").pop() ?? "pdf"
    const tmpPath = path.join(os.tmpdir(), `resume_${Date.now()}.${ext}`)
    const bytes   = await file.arrayBuffer()
    await writeFile(tmpPath, Buffer.from(bytes))

    const script = path.join(process.cwd(), "resume-analysis", "api.py")

    return new Promise<Response>((resolve) => {
      const py = spawn("python3", [script, "--file", tmpPath], {
        env: { ...process.env },
      })

      let stdout = ""
      let stderr = ""

      py.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
      py.stderr.on("data", (d: Buffer) => { stderr += d.toString() })

      // 2-min timeout (model loading + two Groq calls)
      const timer = setTimeout(() => {
        py.kill()
        unlink(tmpPath).catch(() => {})
        resolve(NextResponse.json({ error: "Analysis timed out" }, { status: 504 }))
      }, 120_000)

      py.on("close", (code: number) => {
        clearTimeout(timer)
        unlink(tmpPath).catch(() => {})

        if (code !== 0) {
          resolve(
            NextResponse.json(
              { error: stderr || "Resume analysis script failed" },
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
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

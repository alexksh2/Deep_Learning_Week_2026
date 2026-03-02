import { spawn }             from "child_process"
import { writeFile, unlink } from "fs/promises"
import { randomUUID }        from "crypto"
import os                    from "os"
import path                  from "path"
import { NextResponse }      from "next/server"
import { resolvePythonScriptPath } from "@/lib/python-paths"

const SCRIPT = resolvePythonScriptPath(
  "ml-development/rag-pipeline/rag_cli.py",
  "rag-pipeline/rag_cli.py",
)

function runSubprocess(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [SCRIPT, ...args], { env: { ...process.env } })
    let stdout = ""
    let stderr = ""

    py.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      py.kill()
      reject(new Error("RAG subprocess timed out"))
    }, 180_000) // 3-min ceiling (first call downloads embedding model)

    py.on("close", (code: number) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(stderr || "RAG script failed"))
      else resolve(stdout.trim())
    })
  })
}

// ── POST /api/coaching/rag ────────────────────────────────────────────────────
//
//  action = "index" → multipart/form-data  { file }
//    → builds FAISS index, returns { indexDir, pages, chunks }
//
//  action = "query" → application/json  { question, indexDir, evaluate? }
//    → answers question with citations, returns { answer, citations, evaluation }

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? ""

  // ── INDEX ──────────────────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    let tmpPath = ""
    try {
      const form = await request.formData()
      const file = form.get("file") as File | null
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

      const ext     = file.name.split(".").pop() ?? "pdf"
      tmpPath       = path.join(os.tmpdir(), `rag_upload_${randomUUID()}.${ext}`)
      const bytes   = await file.arrayBuffer()
      await writeFile(tmpPath, Buffer.from(bytes))

      const indexDir = path.join(os.tmpdir(), `rag_index_${randomUUID()}`)
      const stdout   = await runSubprocess(["index", "--file", tmpPath, "--index-dir", indexDir])
      const data     = JSON.parse(stdout)

      if (data.error) return NextResponse.json({ error: data.error }, { status: 500 })
      return NextResponse.json({ indexDir: data.index_dir, pages: data.pages, chunks: data.chunks })
    } catch (e: any) {
      return NextResponse.json({ error: String(e.message ?? e) }, { status: 500 })
    } finally {
      if (tmpPath) unlink(tmpPath).catch(() => {})
    }
  }

  // ── QUERY ──────────────────────────────────────────────────────────────────
  try {
    const body = await request.json() as { question: string; indexDir: string; evaluate?: boolean }
    const { question, indexDir, evaluate = true } = body

    if (!question || !indexDir) {
      return NextResponse.json({ error: "question and indexDir are required" }, { status: 400 })
    }

    const args = ["query", "--question", question, "--index-dir", indexDir]
    if (!evaluate) args.push("--no-evaluate")

    const stdout = await runSubprocess(args)
    const data   = JSON.parse(stdout)

    if (data.error) return NextResponse.json({ error: data.error }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message ?? e) }, { status: 500 })
  }
}

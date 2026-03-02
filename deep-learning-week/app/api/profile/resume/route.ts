import { spawn } from "child_process"
import { readFile, stat, unlink, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { NextResponse } from "next/server"
import { upsertResumeAnalysis } from "@/lib/auth-db"
import { resolvePythonScriptPath } from "@/lib/python-paths"

const RESUME_DIR = path.join(process.cwd(), "data", "resumes")
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".doc", ".docx"])

type ResumeMeta = {
  originalName: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
}

function normalizeUserKey(rawEmail: string | null): string {
  const normalized = (rawEmail ?? "guest").trim().toLowerCase()
  const safe = normalized.replace(/[^a-z0-9._-]/g, "_")
  return safe || "guest"
}

function extFromName(fileName: string): string {
  return path.extname(fileName).toLowerCase()
}

function metaPathFor(userKey: string): string {
  return path.join(RESUME_DIR, `${userKey}__meta.json`)
}

async function resolveStoredResumePath(email: string | null): Promise<string | null> {
  const userKey = normalizeUserKey(email)
  try {
    const rawMeta = await readFile(metaPathFor(userKey), "utf8")
    const meta = JSON.parse(rawMeta) as ResumeMeta
    if (!meta?.storedName) return null

    const extension = extFromName(meta.storedName)
    if (!ALLOWED_EXTENSIONS.has(extension)) return null

    const storedPath = path.join(RESUME_DIR, meta.storedName)
    const info = await stat(storedPath).catch(() => null)
    return info?.isFile() ? storedPath : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const fileInput = form.get("file")
    const useStored = form.get("useStored") === "true"
    const emailInput = form.get("email")
    const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : null
    const analysisSource = fileInput instanceof File ? "upload" : "profile"

    let analysisPath: string | null = null
    let tempPathToDelete: string | null = null

    if (fileInput instanceof File) {
      const name = fileInput.name.toLowerCase()
      const isPDF  = fileInput.type === "application/pdf" || name.endsWith(".pdf")
      const isTXT  = fileInput.type === "text/plain"      || name.endsWith(".txt")
      const isDOCX = name.endsWith(".docx") || name.endsWith(".doc")

      if (!isPDF && !isTXT && !isDOCX) {
        return NextResponse.json(
          { error: "Only PDF, TXT, DOC, and DOCX files are supported." },
          { status: 415 },
        )
      }

      // Write upload to a temp file so the Python subprocess can read it.
      const ext = name.split(".").pop() ?? "pdf"
      const tmpPath = path.join(os.tmpdir(), `resume_${Date.now()}.${ext}`)
      const bytes = await fileInput.arrayBuffer()
      await writeFile(tmpPath, Buffer.from(bytes))
      analysisPath = tmpPath
      tempPathToDelete = tmpPath
    } else if (useStored || email) {
      analysisPath = await resolveStoredResumePath(email)
      if (!analysisPath) {
        return NextResponse.json(
          { error: "No stored resume found in profile. Upload one or choose a different source." },
          { status: 400 },
        )
      }
    } else {
      return NextResponse.json(
        { error: "No file provided. Upload a resume or use your stored profile resume." },
        { status: 400 },
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 })
    }

    if (!analysisPath) {
      return NextResponse.json(
        { error: "Unable to resolve a resume source for analysis." },
        { status: 400 },
      )
    }

    const script = resolvePythonScriptPath(
      "ml-development/resume-analysis/api.py",
      "resume-analysis/api.py",
    )

    return new Promise<Response>((resolve) => {
      const py = spawn("python3", [script, "--file", analysisPath], {
        env: { ...process.env },
      })

      let stdout = ""
      let stderr = ""

      py.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
      py.stderr.on("data", (d: Buffer) => { stderr += d.toString() })

      // 2-min timeout (model loading + two OpenAI calls)
      const timer = setTimeout(() => {
        py.kill()
        if (tempPathToDelete) {
          unlink(tempPathToDelete).catch(() => {})
        }
        resolve(NextResponse.json({ error: "Analysis timed out" }, { status: 504 }))
      }, 120_000)

      py.on("close", (code: number) => {
        clearTimeout(timer)
        if (tempPathToDelete) {
          unlink(tempPathToDelete).catch(() => {})
        }

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
          const data = JSON.parse(stdout) as Record<string, unknown>
          if (email) {
            upsertResumeAnalysis(email, data, analysisSource)
          }
          resolve(NextResponse.json(data))
        } catch (error) {
          resolve(
            NextResponse.json(
              { error: error instanceof Error ? error.message : "Script returned invalid JSON" },
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

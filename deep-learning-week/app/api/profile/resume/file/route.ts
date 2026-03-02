import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises"
import path from "path"
import { NextRequest, NextResponse } from "next/server"

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

async function ensureResumeDir() {
  await mkdir(RESUME_DIR, { recursive: true })
}

async function removeExistingStoredFiles(userKey: string) {
  const entries = await readdir(RESUME_DIR)
  const prefix = `${userKey}__resume.`
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix))
      .map((name) => rm(path.join(RESUME_DIR, name), { force: true })),
  )
}

async function readStoredMeta(userKey: string): Promise<ResumeMeta | null> {
  try {
    const raw = await readFile(metaPathFor(userKey), "utf8")
    const parsed = JSON.parse(raw) as ResumeMeta
    if (!parsed?.storedName) return null
    return parsed
  } catch {
    return null
  }
}

function buildFileUrl(userKey: string): string {
  return `/api/profile/resume/file?mode=file&email=${encodeURIComponent(userKey)}`
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode")
  const email = request.nextUrl.searchParams.get("email")
  const userKey = normalizeUserKey(email)

  await ensureResumeDir()
  const meta = await readStoredMeta(userKey)
  if (!meta) {
    return NextResponse.json({ exists: false })
  }

  const storedPath = path.join(RESUME_DIR, meta.storedName)
  const info = await stat(storedPath).catch(() => null)
  if (!info?.isFile()) {
    return NextResponse.json({ exists: false })
  }

  if (mode === "file") {
    const bytes = await readFile(storedPath)
    const extension = extFromName(meta.storedName)
    const isInline = extension === ".pdf" || extension === ".txt"
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": meta.mimeType || "application/octet-stream",
        "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${meta.originalName}"`,
        "Cache-Control": "no-store",
      },
    })
  }

  return NextResponse.json({
    exists: true,
    originalName: meta.originalName,
    size: meta.size,
    uploadedAt: meta.uploadedAt,
    mimeType: meta.mimeType,
    viewUrl: buildFileUrl(userKey),
  })
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const file = form.get("file")
  const emailInput = form.get("email")
  const email = typeof emailInput === "string" ? emailInput : null
  const userKey = normalizeUserKey(email)

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const extension = extFromName(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "Only PDF, TXT, DOC, and DOCX files are supported." },
      { status: 415 },
    )
  }

  await ensureResumeDir()
  await removeExistingStoredFiles(userKey)

  const storedName = `${userKey}__resume${extension}`
  const storedPath = path.join(RESUME_DIR, storedName)
  const fileBytes = Buffer.from(await file.arrayBuffer())
  await writeFile(storedPath, fileBytes)

  const meta: ResumeMeta = {
    originalName: file.name,
    storedName,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }
  await writeFile(metaPathFor(userKey), JSON.stringify(meta, null, 2), "utf8")

  return NextResponse.json({
    ok: true,
    exists: true,
    originalName: meta.originalName,
    size: meta.size,
    uploadedAt: meta.uploadedAt,
    mimeType: meta.mimeType,
    viewUrl: buildFileUrl(userKey),
  })
}


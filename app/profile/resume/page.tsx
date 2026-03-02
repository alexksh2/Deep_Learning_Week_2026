"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  User,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Globe,
  Briefcase,
  GraduationCap,
  Code2,
  FolderGit2,
  Award,
  Star,
  X,
  TrendingUp,
  Target,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ResumeHighlight } from "@/lib/types"
import { useAuth } from "@/contexts/AuthContext"
import {
  fetchStoredResume,
  RESUME_UPDATED_EVENT,
  type ResumeFileState,
  uploadStoredResume,
} from "@/lib/resume-file-client"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResumeData {
  personal: {
    name: string | null; email: string | null; phone: string | null
    location: string | null; linkedin: string | null; github: string | null; website: string | null
  }
  summary: string | null
  experience: { company: string; role: string; location: string | null; start: string | null; end: string | null; bullets: string[] }[]
  education: { institution: string; degree: string | null; field: string | null; start: string | null; end: string | null; gpa: string | null; notes: string[] }[]
  skills: { technical: string[]; soft: string[]; languages: string[] }
  projects: { name: string; description: string | null; technologies: string[]; url: string | null }[]
  certifications: { name: string; issuer: string | null; date: string | null }[]
  assessment: { strengths: string[]; gaps: string[]; quant_relevance: string; overall_score: number }
  highlights?: string[]
  career_matches?: {
    title: string
    match_percentage: number
    matched_skills: string[]
    missing_skills: string[]
    category: string
    matched_required?: string[]
    matched_preferred?: string[]
    missing_required?: string[]
    missing_preferred?: string[]
    required_score?: number
    preferred_score?: number
    required_coverage?: string
    preferred_coverage?: string
    score_explanation?: string
    resume_evidence?: { skill: string; snippet: string }[]
  }[]
  improvement_recommendations?: {
    career: string
    target_skill: string
    priority: "High" | "Medium" | "Low"
    gap_type?: "required" | "preferred" | "positioning"
    why: string
    action: string
    resume_basis?: string
    resume_evidence?: string[]
  }[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const pct   = (score / 10) * 100
  const r     = 30
  const circ  = 2 * Math.PI * r
  const dash  = (pct / 100) * circ
  const color = score >= 8 ? "#10b981" : score >= 5 ? "#f59e0b" : "#ef4444"
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={40} cy={40} r={r} fill="none" stroke="var(--color-border)" strokeWidth={8} />
        <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 40 40)" />
        <text x={40} y={45} textAnchor="middle" fontSize={18} fontWeight={700} fill={color}>{score}</text>
      </svg>
      <span className="text-[10px] text-muted-foreground">/ 10</span>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null
  const isLink = value.startsWith("http") || value.includes("linkedin") || value.includes("github")
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground text-xs w-16 shrink-0">{label}</span>
      {isLink ? (
        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className="text-chart-2 hover:underline truncate text-xs">{value}</a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResumeAnalyserPage() {
  const { user } = useAuth()
  const [source, setSource]   = useState<"upload" | "profile">("upload")
  const [file, setFile]       = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [storedResume, setStoredResume] = useState<ResumeFileState>({ exists: false })
  const [storedResumeLoading, setStoredResumeLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [data, setData]       = useState<ResumeData | null>(null)
  const [highlights, setHighlights] = useState<ResumeHighlight[]>([])
  const inputRef              = useRef<HTMLInputElement>(null)

  const toggleConfirmed = (id: string) => {
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, confirmed: !h.confirmed } : h))
  }

  const accept = (f: File) => {
    const ok = f.type === "application/pdf" || f.name.endsWith(".pdf")
            || f.type === "text/plain"      || f.name.endsWith(".txt")
            || f.name.endsWith(".doc")      || f.name.endsWith(".docx")
    if (!ok) { setError("Only PDF, TXT, DOC, and DOCX files are supported."); return }
    setFile(f)
    setSource("upload")
    setError(null)
    setData(null)
  }

  const loadStoredResume = useCallback(async () => {
    setStoredResumeLoading(true)
    try {
      const existingResume = await fetchStoredResume(user?.email)
      setStoredResume(existingResume)
    } catch {
      setStoredResume({ exists: false })
    } finally {
      setStoredResumeLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    void loadStoredResume()
  }, [loadStoredResume])

  const loadSavedAnalysis = useCallback(async () => {
    if (!user?.email) return
    try {
      const response = await fetch(
        `/api/profile/resume/analysis?email=${encodeURIComponent(user.email)}`,
        { cache: "no-store" },
      )
      if (!response.ok) return
      const payload = (await response.json()) as { exists?: boolean; analysis?: ResumeData }
      if (payload.exists && payload.analysis) {
        setData(payload.analysis)
      }
    } catch {
      // Silent failure: analysis can still be generated on demand.
    }
  }, [user?.email])

  useEffect(() => {
    void loadSavedAnalysis()
  }, [loadSavedAnalysis])

  useEffect(() => {
    if (!data) {
      setHighlights([])
      return
    }
    setHighlights(buildExtractedHighlights(data))
  }, [data])

  useEffect(() => {
    const onResumeUpdated = () => {
      void loadStoredResume()
    }

    window.addEventListener(RESUME_UPDATED_EVENT, onResumeUpdated)
    return () => window.removeEventListener(RESUME_UPDATED_EVENT, onResumeUpdated)
  }, [loadStoredResume])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) accept(f)
  }, [])

  async function analyse() {
    if (source === "upload" && !file) return
    if (source === "profile" && !storedResume.exists) {
      setError("No stored resume found in your profile. Upload one first or switch to upload mode.")
      return
    }

    setLoading(true); setError(null)
    try {
      const form = new FormData()
      if (source === "upload" && file) {
        await uploadStoredResume(file, user?.email)
        form.append("file", file)
        if (user?.email) {
          form.append("email", user.email)
        }
      } else {
        form.append("useStored", "true")
        if (user?.email) {
          form.append("email", user.email)
        }
      }

      const res  = await fetch("/api/profile/resume", { method: "POST", body: form })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Analysis failed"); return }
      setData(json)
      void loadStoredResume()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const fileSizeMB = file ? (file.size / 1_048_576).toFixed(2) : ""
  const storedResumeSummary = storedResume.exists
    ? `Updated ${formatUploadedAt(storedResume.uploadedAt)} · ${formatFileSize(storedResume.size)}`
    : "No resume stored in profile."
  const canAnalyse = source === "upload" ? Boolean(file) : storedResume.exists
  const analysingLabel = source === "upload" ? "Analyse Uploaded Resume" : "Analyse Profile Resume"

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Resume Analyser</h1>
        <p className="text-sm text-muted-foreground">
          Analyse either a new upload or your existing profile resume to extract structured information and get a quant-finance relevance assessment.
        </p>
      </div>

      {/* Resume source */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <Button
              size="sm"
              variant={source === "upload" ? "default" : "outline"}
              onClick={() => {
                setSource("upload")
                setError(null)
              }}
            >
              Upload New Resume
            </Button>
            <Button
              size="sm"
              variant={source === "profile" ? "default" : "outline"}
              disabled={storedResumeLoading || !storedResume.exists}
              onClick={() => {
                setSource("profile")
                setError(null)
              }}
            >
              Use Profile Resume
            </Button>
          </div>

          {source === "upload" ? (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer py-14 px-6 text-center",
                dragging ? "border-chart-2 bg-chart-2/5" : "border-border hover:border-muted-foreground/40",
                file && "border-chart-2/40 bg-chart-2/3",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f) }}
              />

              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-2/15">
                    <FileText className="h-6 w-6 text-chart-2" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{fileSizeMB} MB · {file.type || "text/plain"}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="text-muted-foreground h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setData(null) }}
                  >
                    <X className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/30">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Drop your resume here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">or click to browse · PDF/TXT/DOC/DOCX · max 10 MB</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {storedResumeLoading ? "Loading profile resume..." : storedResume.exists ? storedResume.originalName : "No resume uploaded"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {storedResumeLoading ? "Please wait while resume metadata loads." : storedResumeSummary}
                  </p>
                </div>
                {storedResume.exists && storedResume.viewUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => window.open(storedResume.viewUrl, "_blank", "noopener,noreferrer")}
                  >
                    View
                  </Button>
                )}
              </div>
              {!storedResumeLoading && !storedResume.exists && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Upload a resume from Profile to use this source, or switch to upload mode above.
                </p>
              )}
            </div>
          )}

          {source === "upload" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Uploaded resumes are automatically saved to your profile before analysis.
            </p>
          )}
          {source === "profile" && !storedResumeLoading && storedResume.exists && (
            <p className="mt-2 text-xs text-muted-foreground">
              Analysis will run on the currently stored profile resume.
            </p>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button onClick={analyse} disabled={!canAnalyse || loading || storedResumeLoading} size="sm">
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analysing…</>
                : analysingLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {data && (
        <div className="space-y-4">

          {/* Assessment banner */}
          <Card className="border-chart-2/30 bg-chart-2/3">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-6">
                <ScoreRing score={data.assessment.overall_score} />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Quant Relevance</p>
                    <p className="text-sm leading-relaxed">{data.assessment.quant_relevance}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {data.assessment.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">Strengths</p>
                        <ul className="space-y-1">
                          {data.assessment.strengths.map((s, i) => (
                            <li key={i} className="text-xs flex items-start gap-1.5">
                              <span className="text-emerald-500 mt-0.5">✓</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.assessment.gaps.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">Gaps</p>
                        <ul className="space-y-1">
                          {data.assessment.gaps.map((g, i) => (
                            <li key={i} className="text-xs flex items-start gap-1.5">
                              <span className="text-amber-500 mt-0.5">△</span>{g}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Extracted highlights */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium">Extracted Highlights</CardTitle>
                <span className="text-[11px] text-muted-foreground">
                  Top 3 quant-relevant signals · confirm to activate
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {highlights.length > 0 ? (
                highlights.map(highlight => (
                  <div
                    key={highlight.id}
                    className={`flex items-start justify-between rounded-md border p-3 transition-colors ${
                      highlight.confirmed ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/20"
                    }`}
                  >
                    <div className="flex items-start gap-2 flex-1">
                      <Checkbox
                        id={highlight.id}
                        checked={highlight.confirmed}
                        onCheckedChange={() => toggleConfirmed(highlight.id)}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <label htmlFor={highlight.id} className="text-xs cursor-pointer leading-relaxed">
                        {highlight.text}
                      </label>
                    </div>
                    {highlight.confirmed && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                        Active
                      </Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No highlights were extracted from this resume.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Personal info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" /> Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.personal.name && (
                <p className="text-base font-semibold">{data.personal.name}</p>
              )}
              <div className="grid gap-1.5">
                <InfoRow icon={Mail}     label="Email"    value={data.personal.email} />
                <InfoRow icon={Phone}    label="Phone"    value={data.personal.phone} />
                <InfoRow icon={MapPin}   label="Location" value={data.personal.location} />
                <InfoRow icon={Linkedin} label="LinkedIn" value={data.personal.linkedin} />
                <InfoRow icon={Github}   label="GitHub"   value={data.personal.github} />
                <InfoRow icon={Globe}    label="Website"  value={data.personal.website} />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          {data.summary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{data.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Experience */}
          {data.experience.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> Work Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {data.experience.map((exp, i) => (
                  <div key={i}>
                    {i > 0 && <Separator className="mb-5" />}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{exp.role}</p>
                        <p className="text-xs text-muted-foreground">{exp.company}{exp.location ? ` · ${exp.location}` : ""}</p>
                      </div>
                      {(exp.start || exp.end) && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums shrink-0">
                          {exp.start ?? ""}{exp.end ? ` – ${exp.end}` : ""}
                        </span>
                      )}
                    </div>
                    {exp.bullets.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {exp.bullets.map((b, j) => (
                          <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Education */}
          {data.education.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" /> Education
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.education.map((edu, i) => (
                  <div key={i}>
                    {i > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{edu.institution}</p>
                        <p className="text-xs text-muted-foreground">
                          {[edu.degree, edu.field].filter(Boolean).join(" · ")}
                          {edu.gpa ? ` · GPA ${edu.gpa}` : ""}
                        </p>
                      </div>
                      {(edu.start || edu.end) && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums shrink-0">
                          {edu.start ?? ""}{edu.end ? ` – ${edu.end}` : ""}
                        </span>
                      )}
                    </div>
                    {edu.notes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {edu.notes.map((n, j) => (
                          <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                            {n}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Skills */}
          {(data.skills.technical.length > 0 || data.skills.soft.length > 0 || data.skills.languages.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4" /> Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.skills.technical.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Technical</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.skills.technical.map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-[11px] font-mono">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.skills.soft.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Soft Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.skills.soft.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[11px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.skills.languages.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Languages</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.skills.languages.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[11px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Projects */}
          {data.projects.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4" /> Projects
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.projects.map((proj, i) => (
                  <div key={i}>
                    {i > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{proj.name}</p>
                      {proj.url && (
                        <a href={proj.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-chart-2 hover:underline shrink-0">Link ↗</a>
                      )}
                    </div>
                    {proj.description && (
                      <p className="text-xs text-muted-foreground mt-1">{proj.description}</p>
                    )}
                    {proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {proj.technologies.map((t, j) => (
                          <Badge key={j} variant="secondary" className="text-[10px] font-mono">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Certifications */}
          {data.certifications.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Award className="h-4 w-4" /> Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.certifications.map((cert, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm">{cert.name}</p>
                        {cert.issuer && <p className="text-xs text-muted-foreground">{cert.issuer}</p>}
                      </div>
                      {cert.date && <span className="text-xs text-muted-foreground tabular-nums">{cert.date}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Career Matches */}
          {data.career_matches && data.career_matches.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Quant Career Matches
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.career_matches.map((match, i) => {
                  const matchedRequired = dedupeStringList(match.matched_required)
                  const matchedPreferred = dedupeStringList(match.matched_preferred)
                  const missingRequired = dedupeStringList(match.missing_required ?? match.missing_skills)
                  const missingPreferred = dedupeStringList(match.missing_preferred)
                  const evidence = dedupeEvidenceItems(match.resume_evidence)
                  const reason = buildCareerReason(match)

                  return (
                    <div key={i} className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{match.title}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{match.category}</Badge>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${
                        match.match_percentage >= 60 ? "text-emerald-500"
                        : match.match_percentage >= 35 ? "text-amber-500"
                        : "text-muted-foreground"
                      }`}>
                        {match.match_percentage}%
                      </span>
                    </div>
                    {match.required_coverage && match.preferred_coverage && (
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          Required {match.required_coverage}
                          {typeof match.required_score === "number" ? ` (+${match.required_score}/60)` : ""}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          Preferred {match.preferred_coverage}
                          {typeof match.preferred_score === "number" ? ` (+${match.preferred_score}/40)` : ""}
                        </Badge>
                      </div>
                    )}
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          match.match_percentage >= 60 ? "bg-emerald-500"
                          : match.match_percentage >= 35 ? "bg-amber-500"
                          : "bg-muted-foreground/40"
                        }`}
                        style={{ width: `${match.match_percentage}%` }}
                      />
                    </div>
                    {reason && !(missingRequired.length > 0 && reason.startsWith("Primary constraint:")) && (
                      <p
                        className={`text-[11px] leading-relaxed ${
                          reason.startsWith("Primary constraint:")
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {reason}
                      </p>
                    )}
                    <div className="space-y-1">
                      {matchedRequired.length > 0 && (
                        <p className="text-[11px] font-bold text-foreground">
                          Matched required: {matchedRequired.join(", ")}
                        </p>
                      )}
                      {matchedPreferred.length > 0 && (
                        <p className="text-[11px] font-bold text-foreground">
                          Matched preferred: {matchedPreferred.join(", ")}
                        </p>
                      )}
                      {missingRequired.length > 0 && (
                        <p className="text-[11px] font-bold text-foreground">
                          Critical gap: <span className="text-amber-600 dark:text-amber-400">{missingRequired.join(", ")}</span>
                        </p>
                      )}
                      {missingRequired.length === 0 && missingPreferred.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Missing preferred: {missingPreferred.join(", ")}
                        </p>
                      )}
                    </div>
                    {evidence.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Resume evidence</p>
                        {evidence.slice(0, 2).map((item, evidenceIndex) => (
                          <p key={`${match.title}-${item.skill}-${evidenceIndex}`} className="text-[11px] text-muted-foreground leading-relaxed">
                            {item.skill}: "{item.snippet}"
                          </p>
                        ))}
                      </div>
                    )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Improvement recommendations */}
          {data.improvement_recommendations && data.improvement_recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" /> How To Improve Match Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.improvement_recommendations.map((recommendation, index) => {
                  const isPositioningGap = recommendation.gap_type === "positioning"
                  return (
                    <div key={`${recommendation.career}-${recommendation.target_skill}-${index}`} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {recommendation.target_skill} for {recommendation.career}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {recommendation.priority}
                          </Badge>
                          {recommendation.gap_type && (
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {recommendation.gap_type}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        <span className="font-medium">Why it matters:</span> {recommendation.why}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        <span className="font-medium">{isPositioningGap ? "How to reposition:" : "What to add:"}</span> {recommendation.action}
                      </p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <Star className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Upload a resume or use your profile resume to see the analysis</p>
          <p className="text-xs text-muted-foreground mt-1">
            The analyzer will extract all content and score it for quant-finance relevance
          </p>
        </div>
      )}
    </div>
  )
}

function formatUploadedAt(uploadedAt?: string): string {
  if (!uploadedAt) return "Unknown date"
  const date = new Date(uploadedAt)
  if (Number.isNaN(date.getTime())) return "Unknown date"
  return date.toLocaleDateString()
}

function formatFileSize(sizeBytes?: number): string {
  if (typeof sizeBytes !== "number") return "Unknown size"
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
}

function normalizeHighlight(value: unknown): string | null {
  if (typeof value !== "string") return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (!cleaned || cleaned.length < 12) return null
  return cleaned
}

const MAX_EXTRACTED_HIGHLIGHTS = 3
const QUANT_HIGHLIGHT_TERMS = [
  "quant",
  "python",
  "c++",
  "sql",
  "stochastic",
  "statistics",
  "derivatives",
  "options",
  "volatility",
  "risk",
  "factor",
  "portfolio",
  "algorithmic",
  "backtest",
  "microstructure",
  "signal",
  "time series",
  "machine learning",
  "reinforcement learning",
  "quantlib",
  "bloomberg",
  "var",
  "sharpe",
  "garch",
]

function isQuantRelatedHighlight(value: string): boolean {
  const lower = value.toLowerCase()
  if (lower.includes("quant")) return true
  return QUANT_HIGHLIGHT_TERMS.some(term => lower.includes(term))
}

function pushUniqueHighlights(target: string[], values: unknown[], maxItems: number, requireQuant: boolean) {
  for (const value of values) {
    const normalized = normalizeHighlight(value)
    if (!normalized) continue
    if (requireQuant && !isQuantRelatedHighlight(normalized)) continue
    const exists = target.some((item) => item.toLowerCase() === normalized.toLowerCase())
    if (!exists) target.push(normalized)
    if (target.length >= maxItems) return
  }
}

function dedupeStringList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const cleaned = typeof value === "string" ? value.trim() : ""
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

function dedupeEvidenceItems(
  values: { skill: string; snippet: string }[] | undefined,
): { skill: string; snippet: string }[] {
  if (!Array.isArray(values)) return []
  const out: { skill: string; snippet: string }[] = []
  const seen = new Set<string>()
  for (const item of values) {
    const skill = typeof item?.skill === "string" ? item.skill.trim() : ""
    const snippet = typeof item?.snippet === "string" ? item.snippet.trim() : ""
    if (!skill || !snippet) continue
    const key = `${skill.toLowerCase()}::${snippet.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ skill, snippet })
  }
  return out
}

function buildCareerReason(match: {
  missing_required?: string[]
  missing_preferred?: string[]
  missing_skills?: string[]
  score_explanation?: string
}): string | null {
  const missingRequired = dedupeStringList(match.missing_required ?? match.missing_skills)
  const missingPreferred = dedupeStringList(match.missing_preferred)

  if (missingRequired.length > 0) {
    return `Primary constraint: missing required skills (${missingRequired.join(", ")}). Required skills have the highest weight.`
  }
  if (missingPreferred.length > 0) {
    return `All required skills are covered; score is limited by missing preferred skills (${missingPreferred.join(", ")}).`
  }
  if (typeof match.score_explanation === "string" && match.score_explanation.trim().length > 0) {
    return match.score_explanation.trim()
  }
  return null
}

function buildExtractedHighlights(data: ResumeData): ResumeHighlight[] {
  const extracted: string[] = []

  if (Array.isArray(data.highlights)) {
    pushUniqueHighlights(extracted, data.highlights, MAX_EXTRACTED_HIGHLIGHTS, true)
  }

  if (extracted.length < MAX_EXTRACTED_HIGHLIGHTS) {
    const experienceBullets = data.experience.flatMap((item) => item.bullets ?? [])
    pushUniqueHighlights(extracted, experienceBullets, MAX_EXTRACTED_HIGHLIGHTS, true)
  }

  if (extracted.length < MAX_EXTRACTED_HIGHLIGHTS) {
    const projectDescriptions = data.projects
      .map((project) => project.description)
      .filter((description): description is string => typeof description === "string")
    pushUniqueHighlights(extracted, projectDescriptions, MAX_EXTRACTED_HIGHLIGHTS, true)
  }

  if (extracted.length < MAX_EXTRACTED_HIGHLIGHTS && data.summary) {
    pushUniqueHighlights(extracted, [data.summary], MAX_EXTRACTED_HIGHLIGHTS, true)
  }

  return extracted.slice(0, MAX_EXTRACTED_HIGHLIGHTS).map((text, index) => ({
    id: `rh-${index + 1}`,
    text,
    confirmed: false,
  }))
}

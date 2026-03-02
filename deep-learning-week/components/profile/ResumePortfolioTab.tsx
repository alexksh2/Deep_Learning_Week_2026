"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, ExternalLink, Eye, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { QuickActionsCard } from "@/components/profile/QuickActionsCard"
import { portfolioLinks as initialLinks } from "@/lib/mock"
import type { PortfolioLink, LinkCategory } from "@/lib/types"
import { loadStoredPortfolioLinks, saveStoredPortfolioLinks } from "@/lib/profile-client-state"
import { useAuth } from "@/contexts/AuthContext"
import {
  fetchStoredResume,
  RESUME_UPDATED_EVENT,
  type ResumeFileState,
  uploadStoredResume,
} from "@/lib/resume-file-client"

const categories: LinkCategory[] = ["GitHub", "Website", "LinkedIn", "Project"]

const categoryColor: Record<LinkCategory, string> = {
  GitHub:   "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  Website:  "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  LinkedIn: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Project:  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
}

export function ResumePortfolioTab() {
  const { user } = useAuth()
  const [links, setLinks] = useState<PortfolioLink[]>(initialLinks)
  const [resume, setResume] = useState<ResumeFileState>({ exists: false })
  const [resumeLoading, setResumeLoading] = useState(true)
  const [resumeUpdating, setResumeUpdating] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [newCat, setNewCat] = useState<LinkCategory>("GitHub")
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const loadResume = useCallback(async () => {
    setResumeLoading(true)
    try {
      const data = await fetchStoredResume(user?.email)
      setResume(data)
      setResumeError(null)
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Failed to load resume.")
      setResume({ exists: false })
    } finally {
      setResumeLoading(false)
    }
  }, [user?.email])

  const handleReplace = async (file: File) => {
    setResumeUpdating(true)
    setResumeError(null)
    try {
      const data = await uploadStoredResume(file, user?.email)
      setResume(data)
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Failed to upload resume.")
    } finally {
      setResumeUpdating(false)
    }
  }

  useEffect(() => {
    setLinks(loadStoredPortfolioLinks(initialLinks.map((link) => ({ ...link }))))
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    void loadResume()
  }, [loadResume])

  useEffect(() => {
    const onResumeUpdated = () => {
      void loadResume()
    }

    window.addEventListener(RESUME_UPDATED_EVENT, onResumeUpdated)
    return () => window.removeEventListener(RESUME_UPDATED_EVENT, onResumeUpdated)
  }, [loadResume])

  useEffect(() => {
    if (!isHydrated) return
    saveStoredPortfolioLinks(links)
  }, [links, isHydrated])

  const addLink = () => {
    if (!newLabel.trim() || !newUrl.trim()) return
    setLinks(prev => [...prev, { id: `pl-${Date.now()}`, label: newLabel.trim(), url: newUrl.trim(), category: newCat, visible: true }])
    setNewLabel(""); setNewUrl("")
  }

  const removeLink = (id: string) => setLinks(prev => prev.filter(l => l.id !== id))

  const resumeSubtitle = resume.exists
    ? `Updated ${formatUploadedAt(resume.uploadedAt)} · ${formatFileSize(resume.size)}`
    : "Upload your resume to enable viewing and replacement."

  return (
    <div className="space-y-5">
      {/* Resume Section */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Resume</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {resumeLoading ? "Loading resume..." : resume.exists ? resume.originalName : "No resume uploaded"}
              </p>
              <p className="text-xs text-muted-foreground">
                {resumeLoading ? "Please wait while resume metadata loads." : resumeSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!resume.exists || !resume.viewUrl || resumeUpdating || resumeLoading}
                onClick={() => {
                  if (!resume.viewUrl) return
                  window.open(resume.viewUrl, "_blank", "noopener,noreferrer")
                }}
              >
                <Eye className="h-3.5 w-3.5" />View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={resumeUpdating}
                onClick={() => replaceInputRef.current?.click()}
              >
                {resumeUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload
              </Button>
              <input
                ref={replaceInputRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void handleReplace(file)
                  event.currentTarget.value = ""
                }}
              />
            </div>
          </div>
          {resumeError && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{resumeError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Portfolio Links */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Portfolio Links</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">URL</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => (
                  <tr key={link.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">{link.label}</td>
                    <td className="px-3 py-2 max-w-[160px]">
                      <a
                        href="#"
                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground truncate transition-colors"
                        onClick={e => e.preventDefault()}
                      >
                        <span className="truncate">{link.url.replace(/^https?:\/\//, "")}</span>
                        <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColor[link.category]}`}>
                        {link.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeLink(link.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add link row */}
          <div className="flex gap-2">
            <Input
              placeholder="Label"
              className="h-7 text-xs w-24"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
            <Input
              placeholder="https://..."
              className="h-7 text-xs flex-1"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addLink()}
            />
            <Select value={newCat} onValueChange={v => setNewCat(v as LinkCategory)}>
              <SelectTrigger className="h-7 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={addLink}>
              <Plus className="h-3 w-3" />Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <QuickActionsCard />
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

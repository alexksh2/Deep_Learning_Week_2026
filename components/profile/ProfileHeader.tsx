"use client"

import { useRef, useState } from "react"
import { AlertCircle, Download, Loader2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/AuthContext"
import { downloadProfileExport } from "@/lib/profile-export"
import { uploadStoredResume } from "@/lib/resume-file-client"

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ACCEPTED_RESUME_EXTENSIONS = new Set([".pdf", ".txt", ".doc", ".docx"])

function hasAcceptedResumeExtension(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex < 0) return false
  const extension = fileName.slice(dotIndex).toLowerCase()
  return ACCEPTED_RESUME_EXTENSIONS.has(extension)
}

export function ProfileHeader() {
  const { user } = useAuth()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    await downloadProfileExport(user)
    setExportDone(true)
    window.setTimeout(() => setExportDone(false), 2000)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) {
      setDragging(false)
      setSelectedFile(null)
      setUploadError(null)
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handleFileSelected = (file: File) => {
    if (!hasAcceptedResumeExtension(file.name)) {
      setSelectedFile(null)
      setUploadError("Only PDF, TXT, DOC, and DOCX files are supported.")
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null)
      setUploadError("File is too large. Maximum size is 5 MB.")
      return
    }
    setSelectedFile(file)
    setUploadError(null)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setUploadError(null)
    try {
      await uploadStoredResume(selectedFile, user?.email)
      handleDialogOpenChange(false)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload resume.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your learning and trading coaching is tailored from what you share here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            {exportDone ? "Exported!" : "Export Profile"}
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Update Resume
          </Button>
        </div>
      </div>
      <Separator />

      <Dialog open={uploadOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Update Resume</DialogTitle>
          </DialogHeader>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelected(file)
            }}
          />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFileSelected(file)
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => inputRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium truncate max-w-[260px]">{selectedFile.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFile(null)
                    setUploadError(null)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Drop your resume here</p>
                <p className="text-xs text-muted-foreground">PDF/TXT/DOC/DOCX · max 5 MB</p>
              </div>
            )}
          </div>
          {uploadError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => handleDialogOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button size="sm" disabled={!selectedFile || uploading} onClick={handleUpload}>
              {uploading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading…</> : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

"use client"

import { useState } from "react"
import { Download, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

export function ProfileHeader() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mockFile, setMockFile] = useState<string | null>(null)

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
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Download className="h-3.5 w-3.5" />
            Export Profile
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Update Resume
          </Button>
        </div>
      </div>
      <Separator />

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Update Resume</DialogTitle>
          </DialogHeader>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) setMockFile(file.name)
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => setMockFile("alex-chen-resume-2026.pdf")}
          >
            {mockFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-medium">{mockFile}</span>
                <button onClick={(e) => { e.stopPropagation(); setMockFile(null) }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Drop your resume here</p>
                <p className="text-xs text-muted-foreground">PDF or DOCX · max 5 MB</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!mockFile} onClick={() => setUploadOpen(false)}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

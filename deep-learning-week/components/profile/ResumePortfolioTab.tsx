"use client"

import { useState } from "react"
import { FileText, Eye, RefreshCw, Plus, Trash2, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { QuickActionsCard } from "@/components/profile/QuickActionsCard"
import { resumeMetadata, portfolioLinks as initialLinks } from "@/lib/mock"
import type { PortfolioLink, LinkCategory } from "@/lib/types"

const categories: LinkCategory[] = ["GitHub", "Website", "LinkedIn", "Project"]

const categoryColor: Record<LinkCategory, string> = {
  GitHub:   "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  Website:  "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  LinkedIn: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Project:  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
}

export function ResumePortfolioTab() {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [links, setLinks] = useState<PortfolioLink[]>(initialLinks)
  const [newLabel, setNewLabel] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [newCat, setNewCat] = useState<LinkCategory>("GitHub")

  const addLink = () => {
    if (!newLabel.trim() || !newUrl.trim()) return
    setLinks(prev => [...prev, { id: `pl-${Date.now()}`, label: newLabel.trim(), url: newUrl.trim(), category: newCat, visible: true }])
    setNewLabel(""); setNewUrl("")
  }

  const removeLink = (id: string) => setLinks(prev => prev.filter(l => l.id !== id))

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
              <p className="text-sm font-medium truncate">{resumeMetadata.fileName}</p>
              <p className="text-xs text-muted-foreground">
                Updated {resumeMetadata.lastUpdated} · {resumeMetadata.fileSize}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-3.5 w-3.5" />View
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />Replace
              </Button>
            </div>
          </div>
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

      {/* Resume preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {resumeMetadata.fileName}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3 min-h-[300px]">
            <div className="text-center border-b border-border pb-3">
              <p className="text-base font-bold">Alex Khoo Shien How</p>
              <p className="text-xs text-muted-foreground">AL0001OW@e.ntu.edu.sg · github.com/alexksh2 · NTU</p>
            </div>
            {[
              { section: "Education", lines: ["MIT — B.S. Mathematics & Computer Science (GPA 3.9)", "Relevant: Probability Theory, Stochastic Processes, Numerical Methods, Algorithms"] },
              { section: "Experience", lines: ["Quant Research Intern – Two Sigma (Summer 2025)", "Built ML pipeline for volatility calibration across equity options surface", "Risk Analyst Intern – Citadel (Summer 2024)", "Backtesting framework for systematic execution strategies; Python, Pandas"] },
              { section: "Projects", lines: ["Vol Surface Pricer: SVI parametrization + calibration in Python/AWS", "Pairs Trading Engine: Cointegration-based stat-arb with risk overlays"] },
              { section: "Skills", lines: ["Python, C++ (intermediate), NumPy, Pandas, PyTorch", "Topics: Stochastic calculus, time series, optimization, microstructure"] },
            ].map(({ section, lines }) => (
              <div key={section}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{section}</p>
                {lines.map((l, i) => <p key={i} className="text-xs">{l}</p>)}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

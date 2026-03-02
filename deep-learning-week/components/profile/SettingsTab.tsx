"use client"

import { useState } from "react"
import { Info, Download, Trash2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { profileSettings as initialSettings } from "@/lib/mock"
import type { ProfileSettings } from "@/lib/types"
import { useAuth } from "@/contexts/AuthContext"
import { downloadProfileExport } from "@/lib/profile-export"

function SettingRow({
  label, description, checked, onCheckedChange, tip,
}: { label: string; description?: string; checked: boolean; onCheckedChange: (v: boolean) => void; tip?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{label}</span>
          {tip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[200px]">{tip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="flex-shrink-0" />
    </div>
  )
}

export function SettingsTab() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<ProfileSettings>(initialSettings)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exportDone, setExportDone] = useState(false)

  const setNotif = (key: keyof ProfileSettings["notifications"], v: boolean) =>
    setSettings(p => ({ ...p, notifications: { ...p.notifications, [key]: v } }))
  const setPersonal = (key: keyof ProfileSettings["personalization"], v: boolean) =>
    setSettings(p => ({ ...p, personalization: { ...p.personalization, [key]: v } }))
  const setPrivacy = (key: keyof ProfileSettings["privacy"], v: boolean) =>
    setSettings(p => ({ ...p, privacy: { ...p.privacy, [key]: v } }))

  const handleExport = async () => {
    await downloadProfileExport(user)
    setExportDone(true)
    setTimeout(() => setExportDone(false), 2000)
  }

  return (
    <div className="space-y-4 max-w-lg">
      {/* Notifications */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          <SettingRow
            label="Spaced repetition reminders"
            description="Daily nudge when SR cards are due. Sends at 08:00 local time."
            checked={settings.notifications.spacedRepReminders}
            onCheckedChange={v => setNotif("spacedRepReminders", v)}
          />
          <Separator />
          <SettingRow
            label="Trading drill reminders"
            description="Reminder to run your scheduled paper trading drills."
            checked={settings.notifications.tradingDrillReminders}
            onCheckedChange={v => setNotif("tradingDrillReminders", v)}
          />
          <Separator />
          <SettingRow
            label="Weekly summary email"
            description="Sunday digest: mastery changes, readiness trend, top recommendations."
            checked={settings.notifications.weeklySummaryEmail}
            onCheckedChange={v => setNotif("weeklySummaryEmail", v)}
          />
        </CardContent>
      </Card>

      {/* Personalization */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Personalization</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          <SettingRow
            label="Use paper trading signals in recommendations"
            description="Behavioral signals from trading sessions (e.g. overtrading, stop-loss violations) will influence your study plan."
            checked={settings.personalization.useTradingSignals}
            onCheckedChange={v => setPersonal("useTradingSignals", v)}
            tip="When enabled, execution errors from paper trading sessions are cross-referenced with your skill matrix to boost relevant drill priority."
          />
          <Separator />
          <SettingRow
            label="Use resume highlights to prioritize topics"
            description="Confirmed highlights from your resume (e.g. 'ML pipelines, backtesting') will deprioritize topics you've already demonstrated."
            checked={settings.personalization.useResumeHighlights}
            onCheckedChange={v => setPersonal("useResumeHighlights", v)}
            tip="When enabled, confirmed resume highlights reduce the weight of associated topics in your learning queue, focusing time on genuine gaps."
          />
        </CardContent>
      </Card>

      {/* Privacy & Data */}
      <Card className="p-4 gap-0">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">Privacy & Data</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          <SettingRow
            label="Resume visible to coaching engine"
            description="Allow the system to parse and use your resume for skill inference."
            checked={settings.privacy.resumeVisible}
            onCheckedChange={v => setPrivacy("resumeVisible", v)}
          />
          <Separator />
          <SettingRow
            label="Portfolio links publicly visible"
            description="When enabled, links marked 'visible' can be shown in shared profile views."
            checked={settings.privacy.linksVisible}
            onCheckedChange={v => setPrivacy("linksVisible", v)}
          />
          <Separator />
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              {exportDone ? "Exported!" : "Export my data"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete my data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Model transparency */}
      <Card className="p-4 gap-0 border-primary/20">
        <CardHeader className="p-0 mb-3">
          <CardTitle className="text-sm font-semibold">How recommendations are generated</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Recommendations are ranked by a weighted scoring function that combines:
            (1) skill gap magnitude from the mastery signals,
            (2) evidence of regression or rule violation in trading sessions,
            (3) proximity to your target role and timeline, and
            (4) recency — items you haven't practiced in &gt;7 days are boosted.
          </p>
          <Separator />
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence levels</p>
            {[
              { label: "High confidence", tip: "Score derived from ≥3 independent signals (quiz, SR cards, trading evidence)." },
              { label: "Medium confidence", tip: "Score derived from 1–2 signals or from signals older than 14 days." },
              { label: "Low confidence", tip: "Inferred from resume highlights or self-rating only. No external measurement yet." },
            ].map(({ label, tip }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs w-36">{label}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-[220px]">{tip}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete all data?
            </DialogTitle>
          </DialogHeader>
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <AlertDescription className="text-xs">
              This will permanently delete your profile, resume, aspirations, skill history, and all coaching data.
              Trading session records will be retained for system audit purposes. This action cannot be undone.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(false)}>
              Delete all data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

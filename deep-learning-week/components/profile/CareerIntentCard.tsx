"use client"

import { useState } from "react"
import { Info, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { careerIntentData } from "@/lib/mock"
import type { TargetRole, TargetTimeline, CareerIntentData } from "@/lib/types"

const roles: TargetRole[] = ["Quant Research", "Quant Trading", "Quant Dev", "Data Science", "Risk", "SWE"]
const timelines: TargetTimeline[] = ["1-3 months", "3-6 months", "6-12 months", "12+ months"]

export function CareerIntentCard() {
  const [intent, setIntent] = useState<CareerIntentData>(careerIntentData)
  const [firmInput, setFirmInput] = useState("")
  const [saved, setSaved] = useState(false)

  const addFirm = () => {
    const trimmed = firmInput.trim()
    if (trimmed && !intent.targetFirms.includes(trimmed)) {
      setIntent(prev => ({ ...prev, targetFirms: [...prev.targetFirms, trimmed] }))
    }
    setFirmInput("")
  }

  const removeFirm = (firm: string) =>
    setIntent(prev => ({ ...prev, targetFirms: prev.targetFirms.filter(f => f !== firm) }))

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card className="p-4 gap-0">
      <CardHeader className="p-0 mb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Career Intent</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[220px] text-xs">
                Your target role and constraints are used to weight skill recommendations,
                prioritize topics in your study plan, and tune paper trading drill difficulty.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-3">
        {/* Target role */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Target role</label>
          <Select value={intent.targetRole} onValueChange={v => setIntent(p => ({ ...p, targetRole: v as TargetRole }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Timeline */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Timeline</label>
          <Select value={intent.targetTimeline} onValueChange={v => setIntent(p => ({ ...p, targetTimeline: v as TargetTimeline }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timelines.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Target firms */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Target firms</label>
          <div className="flex flex-wrap gap-1">
            {intent.targetFirms.map(f => (
              <span key={f} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {f}
                <button onClick={() => removeFirm(f)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              className="h-7 text-xs flex-1"
              placeholder="Add firm..."
              value={firmInput}
              onChange={e => setFirmInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addFirm()}
            />
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addFirm}>Add</Button>
          </div>
        </div>

        <Separator />

        {/* Constraints */}
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Preferences</label>
          {([
            { key: "preferResearchHeavy", label: "Research-heavy environment" },
            { key: "preferLowLatency",   label: "Low-latency / HFT exposure" },
            { key: "preferDiscretionary", label: "Discretionary / market-making" },
          ] as const).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={key}
                checked={intent[key]}
                onCheckedChange={v => setIntent(p => ({ ...p, [key]: !!v }))}
                className="h-3.5 w-3.5"
              />
              <label htmlFor={key} className="text-xs cursor-pointer">{label}</label>
            </div>
          ))}
        </div>

        <Button
          size="sm"
          className="w-full h-7 text-xs gap-1.5 mt-1"
          onClick={handleSave}
          variant={saved ? "outline" : "default"}
        >
          {saved ? <><Check className="h-3 w-3" /> Saved</> : "Save intent"}
        </Button>
      </CardContent>
    </Card>
  )
}

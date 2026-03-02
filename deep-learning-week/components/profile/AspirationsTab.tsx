"use client"

import { useState, useRef } from "react"
import { Check, X, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { aspirationsData, careerIntentData } from "@/lib/mock"
import type { AspirationsData, LearningStylePref, RiskTolerancePref } from "@/lib/types"

const allStrengths = [
  "Probability & Statistics", "Python Engineering", "Systematic Thinking", "Mathematical Rigor",
  "Research Writing", "Data Visualization", "C++ Systems", "Risk Management", "Machine Learning",
]
const allWeaknesses = [
  "Execution Discipline", "C++ Systems", "Pressure Management", "Microstructure Depth",
  "Communication", "Optimization Theory", "Regime Detection", "Short-term Focus",
]
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function TagSelector({
  selected, options, onToggle, onAdd,
}: {
  selected: string[]
  options: string[]
  onToggle: (v: string) => void
  onAdd: (v: string) => void
}) {
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function commit() {
    const val = draft.trim()
    if (!val) return
    onAdd(val)
    setDraft("")
    inputRef.current?.focus()
  }

  // Custom entries = selected items not in the preset options list
  const customTags = selected.filter(s => !options.includes(s))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              selected.includes(o)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40"
            }`}
          >
            {selected.includes(o) && <Check className="h-2.5 w-2.5" />}
            {o}
          </button>
        ))}
        {customTags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium"
          >
            {tag}
            <button onClick={() => onToggle(tag)} className="hover:opacity-70">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit() } }}
          placeholder="Add custom…"
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={commit} disabled={!draft.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function AspirationsTab() {
  const [form, setForm] = useState<AspirationsData>(aspirationsData)
  const [saved, setSaved] = useState(false)

  const toggle = (field: "strengths" | "weaknesses", value: string) =>
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(x => x !== value)
        : [...prev[field], value],
    }))

  const addCustom = (field: "strengths" | "weaknesses", value: string) =>
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value) ? prev[field] : [...prev[field], value],
    }))

  const toggleDay = (day: string) =>
    setForm(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter(d => d !== day)
        : [...prev.availableDays, day],
    }))

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const suggestions = [
    careerIntentData.targetRole === "Quant Trading"
      ? `Target role: ${careerIntentData.targetRole} — microstructure and execution drills will be weighted higher.`
      : null,
    form.learningStyle === "drills"
      ? "Learning style: drills — daily plan will front-load short, high-repetition exercises."
      : null,
    form.weaknesses.includes("Execution Discipline")
      ? "Weakness flagged: Execution Discipline — stop-loss and overtrading scenarios added to drill rotation."
      : null,
    form.riskTolerancePref === "balanced"
      ? "Paper trading difficulty: balanced — drills simulate moderate volatility regimes."
      : null,
  ].filter(Boolean) as string[]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">
      {/* Form */}
      <div className="space-y-5">
        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-sm font-semibold">Goals & Motivation</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                North Star <span className="normal-case font-normal">— where you want to be in 1–2 years</span>
              </label>
              <Textarea
                className="text-xs min-h-[72px] resize-none"
                value={form.northStar}
                onChange={e => setForm(p => ({ ...p, northStar: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Why Quant?</label>
              <Textarea
                className="text-xs min-h-[72px] resize-none"
                value={form.whyQuant}
                onChange={e => setForm(p => ({ ...p, whyQuant: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-sm font-semibold">Strengths & Weaknesses</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Strengths to double down on</label>
              <TagSelector selected={form.strengths} options={allStrengths} onToggle={v => toggle("strengths", v)} onAdd={v => addCustom("strengths", v)} />
            </div>
            <Separator />
            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weaknesses to fix</label>
              <TagSelector selected={form.weaknesses} options={allWeaknesses} onToggle={v => toggle("weaknesses", v)} onAdd={v => addCustom("weaknesses", v)} />
            </div>
          </CardContent>
        </Card>

        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-sm font-semibold">Learning Cadence</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Learning style</label>
                <Select value={form.learningStyle} onValueChange={v => setForm(p => ({ ...p, learningStyle: v as LearningStylePref }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["drills", "projects", "theory-first", "mixed"] as LearningStylePref[]).map(s => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hours / week</label>
                <Select
                  value={String(form.hoursPerWeek)}
                  onValueChange={v => setForm(p => ({ ...p, hoursPerWeek: Number(v) }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 25, 30].map(h => (
                      <SelectItem key={h} value={String(h)} className="text-xs">{h}h / week</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Available days</label>
              <div className="flex gap-1.5">
                {weekDays.map(d => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`w-9 h-8 rounded text-[11px] font-medium border transition-colors ${
                      form.availableDays.includes(d)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Risk tolerance in paper trading
                </label>
                <span className="text-[10px] text-muted-foreground italic">(drills only)</span>
              </div>
              <Select value={form.riskTolerancePref} onValueChange={v => setForm(p => ({ ...p, riskTolerancePref: v as RiskTolerancePref }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["conservative", "balanced", "aggressive"] as RiskTolerancePref[]).map(r => (
                    <SelectItem key={r} value={r} className="text-xs capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Controls drill difficulty and volatility of simulated scenarios. Has no effect on real or live trading.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button size="sm" className="w-full gap-1.5 text-xs" onClick={handleSave} variant={saved ? "outline" : "default"}>
          {saved ? <><Check className="h-3 w-3" /> Saved</> : "Save aspirations"}
        </Button>
      </div>

      {/* Suggestions sidebar */}
      <div className="space-y-3">
        <Card className="p-4 gap-0">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="text-sm font-semibold">How this shapes your plan</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-2.5">
            {suggestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Fill in the form to see how your preferences affect recommendations.</p>
            ) : (
              suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                  {s}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="p-4 gap-0 border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-0">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1">Coaching tip</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Students who document a specific "Why Quant" statement complete 2× more drills in the first 30 days compared to those who skip it.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

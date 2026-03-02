"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { AuthUser } from "@/lib/auth-types"
import type { TrackBadge, TargetRole, TargetTimeline, LearningStylePref } from "@/lib/types"

interface Props {
  onComplete: (data: AuthUser) => void
  isLoading: boolean
}

const STEPS = ["Account", "Identity", "Career Intent", "Aspirations"]
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const TRACK_OPTIONS: TrackBadge[] = ["Interview Prep", "Research Track", "Trading Track"]

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Singapore", "Asia/Hong_Kong",
  "Australia/Sydney",
]

const GRAD_TIMELINES = ["< 6 months", "6–12 months", "1–2 years", "2+ years", "Already graduated"]
const TARGET_ROLES: TargetRole[] = ["Quant Research", "Quant Trading", "Quant Dev", "Data Science", "Risk", "SWE"]
const TARGET_TIMELINES: TargetTimeline[] = ["1-3 months", "3-6 months", "6-12 months", "12+ months"]
const LEARNING_STYLES: LearningStylePref[] = ["drills", "projects", "theory-first", "mixed"]
const HOURS_OPTIONS = [2, 5, 10, 15, 20, 30, 40]

type FormData = Omit<AuthUser, "avatar">

export function RegisterWizard({ onComplete, isLoading }: Props) {
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [firmInput, setFirmInput] = useState("")

  const [form, setForm] = useState<FormData>({
    email: "",
    password: "",
    name: "",
    school: "",
    graduationTimeline: "",
    location: "",
    timezone: "",
    tracks: [],
    targetRole: "Quant Research",
    targetTimeline: "6-12 months",
    targetFirms: [],
    preferResearchHeavy: false,
    preferLowLatency: false,
    preferDiscretionary: false,
    learningStyle: "mixed",
    hoursPerWeek: 10,
    availableDays: [],
    northStar: "",
  })

  const [confirmPassword, setConfirmPassword] = useState("")

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e })
  }

  function toggleTrack(t: TrackBadge) {
    set("tracks", form.tracks.includes(t) ? form.tracks.filter(x => x !== t) : [...form.tracks, t])
  }

  function toggleDay(d: string) {
    set("availableDays", form.availableDays.includes(d)
      ? form.availableDays.filter(x => x !== d)
      : [...form.availableDays, d])
  }

  function addFirm() {
    const trimmed = firmInput.trim()
    if (trimmed && !form.targetFirms.includes(trimmed)) {
      set("targetFirms", [...form.targetFirms, trimmed])
    }
    setFirmInput("")
  }

  function removeFirm(f: string) {
    set("targetFirms", form.targetFirms.filter(x => x !== f))
  }

  function validateStep(): boolean {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Valid email required"
      if (form.password.length < 8) e.password = "Password must be at least 8 characters"
      if (form.password !== confirmPassword) e.confirmPassword = "Passwords do not match"
    }
    if (step === 1) {
      if (!form.name.trim()) e.name = "Full name required"
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (!validateStep()) return
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      const initials = form.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "U"
      onComplete({ ...form, avatar: initials })
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{STEPS[step]}</span>
          <span>Step {step + 1} of {STEPS.length}</span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="space-y-4">
        {step === 0 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={errors.confirmPassword ? "border-destructive" : ""}
              />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                placeholder="Alex Khoo"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="school">School / Institution</Label>
              <Input
                id="school"
                placeholder="MIT, Columbia, etc."
                value={form.school}
                onChange={e => set("school", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Graduation timeline</Label>
              <Select value={form.graduationTimeline} onValueChange={v => set("graduationTimeline", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timeline" />
                </SelectTrigger>
                <SelectContent>
                  {GRAD_TIMELINES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="New York, NY"
                  value={form.location}
                  onChange={e => set("location", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={form.timezone} onValueChange={v => set("timezone", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select TZ" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Track preferences</Label>
              <div className="flex flex-wrap gap-2">
                {TRACK_OPTIONS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTrack(t)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      form.tracks.includes(t)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1.5">
              <Label>Target role</Label>
              <Select value={form.targetRole} onValueChange={v => set("targetRole", v as TargetRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target timeline</Label>
              <Select value={form.targetTimeline} onValueChange={v => set("targetTimeline", v as TargetTimeline)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_TIMELINES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target firms</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a firm..."
                  value={firmInput}
                  onChange={e => setFirmInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFirm() } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addFirm}>Add</Button>
              </div>
              {form.targetFirms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.targetFirms.map(f => (
                    <Badge key={f} variant="secondary" className="gap-1 pr-1">
                      {f}
                      <button
                        type="button"
                        onClick={() => removeFirm(f)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 px-0.5"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Preferences</Label>
              <div className="space-y-2">
                {[
                  { key: "preferResearchHeavy" as const, label: "Research-heavy roles" },
                  { key: "preferLowLatency" as const, label: "Low-latency / HFT" },
                  { key: "preferDiscretionary" as const, label: "Discretionary trading" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={key}
                      checked={form[key]}
                      onCheckedChange={v => set(key, !!v)}
                    />
                    <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-1.5">
              <Label>Learning style</Label>
              <Select value={form.learningStyle} onValueChange={v => set("learningStyle", v as LearningStylePref)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEARNING_STYLES.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hours per week</Label>
              <Select
                value={String(form.hoursPerWeek)}
                onValueChange={v => set("hoursPerWeek", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS_OPTIONS.map(h => (
                    <SelectItem key={h} value={String(h)}>{h}h / week</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Available days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      "w-10 h-10 rounded-lg border text-xs font-medium transition-colors",
                      form.availableDays.includes(d)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="northStar">
                North star <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="northStar"
                placeholder="What does success look like for you in 12 months?"
                value={form.northStar}
                onChange={e => set("northStar", e.target.value)}
                rows={3}
              />
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={isLoading}
          className="min-w-32"
        >
          {isLoading ? (
            <><Spinner className="mr-2 h-4 w-4" /> Creating…</>
          ) : step === STEPS.length - 1 ? "Create account" : "Next"}
        </Button>
      </div>
    </div>
  )
}

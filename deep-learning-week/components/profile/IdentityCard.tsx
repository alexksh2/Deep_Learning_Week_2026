"use client"

import { useState } from "react"
import { MapPin, Clock, Edit2, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { profileIdentity, masteryData, tradingSessions, userProfile } from "@/lib/mock"
import type { TrackBadge } from "@/lib/types"

const allTracks: TrackBadge[] = ["Interview Prep", "Research Track", "Trading Track"]

const trackVariant: Record<TrackBadge, string> = {
  "Interview Prep": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Research Track": "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  "Trading Track":  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
}

export function IdentityCard() {
  const [tracks, setTracks] = useState<TrackBadge[]>(profileIdentity.tracks)
  const [identity, setIdentity] = useState(profileIdentity)
  const [editDraft, setEditDraft] = useState(profileIdentity)
  const [sheetOpen, setSheetOpen] = useState(false)

  const masteryAvg = Math.round(masteryData.reduce((s, m) => s + m.score, 0) / masteryData.length)
  const sessions30d = tradingSessions.filter(s => {
    const d = new Date(s.timestamp)
    return (Date.now() - d.getTime()) < 30 * 24 * 60 * 60 * 1000
  }).length

  const toggleTrack = (t: TrackBadge) =>
    setTracks(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const saveEdit = () => {
    setIdentity(editDraft)
    setSheetOpen(false)
  }

  return (
    <Card className="p-4 gap-0">
      <CardHeader className="p-0 mb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                {identity.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm leading-tight">{identity.name}</p>
              <p className="text-xs text-muted-foreground">{identity.school} · {identity.graduationTimeline}</p>
            </div>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1">
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[360px]">
              <SheetHeader>
                <SheetTitle className="text-base">Edit Identity</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 py-4">
                {(["name", "school", "graduationTimeline", "location", "timezone"] as const).map(field => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs text-muted-foreground capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
                    <Input
                      className="h-8 text-sm"
                      value={editDraft[field]}
                      onChange={e => setEditDraft(prev => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                ))}
                <Separator />
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">GitHub URL</label>
                  <Input className="h-8 text-sm" placeholder="https://github.com/..." />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">LinkedIn URL</label>
                  <Input className="h-8 text-sm" placeholder="https://linkedin.com/in/..." />
                </div>
              </div>
              <SheetFooter>
                <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={saveEdit}>Save</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-3">
        {/* Location */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{identity.location}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{identity.timezone}</span>
        </div>

        {/* Track badges */}
        <div className="flex flex-wrap gap-1.5">
          {allTracks.map(t => (
            <button
              key={t}
              onClick={() => toggleTrack(t)}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity ${
                trackVariant[t]
              } ${tracks.includes(t) ? "opacity-100" : "opacity-30"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <Separator />

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Streak", value: `${userProfile.streak}d`, icon: "🔥" },
            { label: "Avg mastery", value: `${masteryAvg}`, icon: <TrendingUp className="h-3 w-3 text-emerald-500" /> },
            { label: "Sessions (30d)", value: `${sessions30d}`, icon: "📊" },
          ].map(s => (
            <div key={s.label} className="text-center space-y-0.5">
              <div className="flex items-center justify-center gap-1">
                {typeof s.icon === "string"
                  ? <span className="text-sm">{s.icon}</span>
                  : s.icon}
                <span className="text-sm font-semibold tabular-nums">{s.value}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

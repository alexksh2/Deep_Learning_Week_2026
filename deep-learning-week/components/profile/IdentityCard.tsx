"use client"

import { useState, useEffect } from "react"
import { MapPin, Clock, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { profileIdentity } from "@/lib/mock"
import { useAuth } from "@/contexts/AuthContext"
import type { TrackBadge } from "@/lib/types"

const allTracks: TrackBadge[] = ["Interview Prep", "Research Track", "Trading Track"]

const trackVariant: Record<TrackBadge, string> = {
  "Interview Prep": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Research Track": "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  "Trading Track":  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
}

export function IdentityCard() {
  const { user } = useAuth()

  const fromAuth = {
    name:               user?.name               ?? profileIdentity.name,
    email:              user?.email              ?? profileIdentity.email,
    avatar:             user?.avatar             ?? profileIdentity.avatar,
    school:             user?.school             ?? profileIdentity.school,
    graduationTimeline: user?.graduationTimeline ?? profileIdentity.graduationTimeline,
    location:           user?.location           ?? profileIdentity.location,
    timezone:           user?.timezone           ?? profileIdentity.timezone,
    tracks:             (user?.tracks as TrackBadge[]) ?? profileIdentity.tracks,
  }

  const [identity, setIdentity] = useState(fromAuth)
  const [tracks, setTracks] = useState<TrackBadge[]>(fromAuth.tracks)
  const [editDraft, setEditDraft] = useState(fromAuth)
  const [editTracks, setEditTracks] = useState<TrackBadge[]>(fromAuth.tracks)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Sync when auth user loads (it starts null, then resolves from DB)
  useEffect(() => {
    if (!user) return
    const updated = {
      name:               user.name,
      email:              user.email,
      avatar:             user.avatar,
      school:             user.school,
      graduationTimeline: user.graduationTimeline,
      location:           user.location,
      timezone:           user.timezone,
      tracks:             user.tracks as TrackBadge[],
    }
    setIdentity(updated)
    setTracks(updated.tracks)
  }, [user])

  const toggleTrack = (t: TrackBadge) =>
    setTracks(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const toggleEditTrack = (t: TrackBadge) =>
    setEditTracks(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open)
    if (open) {
      setEditDraft(identity)
      setEditTracks(tracks)
    }
  }

  const saveEdit = () => {
    setIdentity(editDraft)
    setTracks(editTracks)
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
          <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[380px] sm:max-w-[380px]">
              <SheetHeader>
                <SheetTitle className="text-base">Edit Identity</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4 space-y-4 overflow-y-auto">
                {(["name", "school", "graduationTimeline", "location", "timezone"] as const).map(field => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-xs text-muted-foreground capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
                    <Input
                      className="h-9 text-sm"
                      value={editDraft[field]}
                      onChange={e => setEditDraft(prev => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="border-t border-border pt-4 space-y-2">
                  <label className="text-xs text-muted-foreground">Tracks</label>
                  <div className="flex flex-wrap gap-2">
                    {allTracks.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleEditTrack(t)}
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${
                          trackVariant[t]
                        } ${editTracks.includes(t) ? "opacity-100" : "opacity-30"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <SheetFooter className="border-t border-border">
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
      </CardContent>
    </Card>
  )
}

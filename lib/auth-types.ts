import type { TrackBadge, TargetRole, TargetTimeline, LearningStylePref } from "@/lib/types"

export interface AuthUser {
  name: string
  email: string
  password: string
  avatar: string
  school: string
  graduationTimeline: string
  location: string
  timezone: string
  tracks: TrackBadge[]
  targetRole: TargetRole
  targetTimeline: TargetTimeline
  targetFirms: string[]
  preferResearchHeavy: boolean
  preferLowLatency: boolean
  preferDiscretionary: boolean
  learningStyle: LearningStylePref
  hoursPerWeek: number
  availableDays: string[]
  northStar: string
}

export interface AuthActionResult {
  success: boolean
  error?: string
}

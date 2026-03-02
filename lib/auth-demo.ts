import type { AuthUser } from "@/lib/auth-types"

export const DEMO_USER: AuthUser = {
  name: "Alex Khoo",
  email: "alexkhoo@gmail.com",
  password: "demo1234",
  avatar: "AK",
  school: "NTU",
  graduationTimeline: "May 2026",
  location: "Singapore",
  timezone: "SGT (UTC+8)",
  tracks: ["Interview Prep", "Research Track"],
  targetRole: "Quant Research",
  targetTimeline: "3-6 months",
  targetFirms: ["Citadel", "Two Sigma", "D.E. Shaw"],
  preferResearchHeavy: true,
  preferLowLatency: false,
  preferDiscretionary: false,
  learningStyle: "theory-first",
  hoursPerWeek: 15,
  availableDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  northStar: "Land a quant researcher role at a top systematic fund",
}

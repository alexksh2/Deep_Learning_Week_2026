"use client"

import { createContext, useContext, useEffect, useState } from "react"
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

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => { success: boolean; error?: string }
  register: (user: AuthUser) => { success: boolean; error?: string }
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// qlos_user   → stored account record (persists across logout so demo creds stay)
// qlos_session → active session email (cleared on logout)
const ACCOUNT_KEY = "qlos_user"
const SESSION_KEY = "qlos_session"

const DEMO_USER: AuthUser = {
  name: "Alex Chen",
  email: "alex.chen@quant.dev",
  password: "demo1234",
  avatar: "AC",
  school: "MIT",
  graduationTimeline: "Already graduated",
  location: "New York, NY",
  timezone: "America/New_York",
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      // Seed demo account if no account exists yet
      if (!localStorage.getItem(ACCOUNT_KEY)) {
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify(DEMO_USER))
      }
      // Restore active session if one exists
      const sessionEmail = localStorage.getItem(SESSION_KEY)
      if (sessionEmail) {
        const stored = localStorage.getItem(ACCOUNT_KEY)
        if (stored) {
          const account: AuthUser = JSON.parse(stored)
          if (account.email === sessionEmail) {
            setUser(account)
          }
        }
      }
    } catch {
      // ignore parse errors
    }
    setIsLoading(false)
  }, [])

  function login(email: string, password: string): { success: boolean; error?: string } {
    try {
      const stored = localStorage.getItem(ACCOUNT_KEY)
      if (!stored) return { success: false, error: "No account found. Please register." }
      const account: AuthUser = JSON.parse(stored)
      if (account.email !== email) return { success: false, error: "Invalid email or password." }
      if (account.password !== password) return { success: false, error: "Invalid email or password." }
      localStorage.setItem(SESSION_KEY, email)
      setUser(account)
      return { success: true }
    } catch {
      return { success: false, error: "Something went wrong." }
    }
  }

  function register(newUser: AuthUser): { success: boolean; error?: string } {
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(newUser))
      localStorage.setItem(SESSION_KEY, newUser.email)
      setUser(newUser)
      return { success: true }
    } catch {
      return { success: false, error: "Failed to save account." }
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

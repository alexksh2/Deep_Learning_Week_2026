"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { AuthActionResult, AuthUser } from "@/lib/auth-types"

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthActionResult>
  register: (user: AuthUser) => Promise<AuthActionResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_KEY = "qlos_session"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      const sessionEmail = localStorage.getItem(SESSION_KEY)
      if (!sessionEmail) {
        if (active) setIsLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/auth/user?email=${encodeURIComponent(sessionEmail)}`)
        if (!res.ok) {
          localStorage.removeItem(SESSION_KEY)
          if (active) setUser(null)
        } else {
          const data = (await res.json()) as { user: AuthUser }
          if (active) setUser(data.user)
        }
      } catch {
        localStorage.removeItem(SESSION_KEY)
        if (active) setUser(null)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    restoreSession()
    return () => {
      active = false
    }
  }, [])

  async function login(email: string, password: string): Promise<AuthActionResult> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as { user?: AuthUser; error?: string }
      if (!res.ok || !data.user) {
        return { success: false, error: data.error ?? "Login failed." }
      }
      localStorage.setItem(SESSION_KEY, data.user.email)
      setUser(data.user)
      return { success: true }
    } catch {
      return { success: false, error: "Unable to sign in right now." }
    }
  }

  async function register(newUser: AuthUser): Promise<AuthActionResult> {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })
      const data = (await res.json()) as { user?: AuthUser; error?: string }
      if (!res.ok || !data.user) {
        return { success: false, error: data.error ?? "Registration failed." }
      }
      localStorage.setItem(SESSION_KEY, data.user.email)
      setUser(data.user)
      return { success: true }
    } catch {
      return { success: false, error: "Unable to register right now." }
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

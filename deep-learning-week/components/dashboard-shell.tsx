"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { useAuth } from "@/contexts/AuthContext"

const AUTH_ROUTES = ["/login", "/register"]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isAuthPage = AUTH_ROUTES.includes(pathname)

  useEffect(() => {
    if (isLoading) return
    if (!user && !isAuthPage) {
      router.replace("/login")
    } else if (user && isAuthPage) {
      router.replace("/")
    }
  }, [user, isLoading, isAuthPage, router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isAuthPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        {children}
      </div>
    )
  }

  if (!user) {
    // Redirecting — render nothing to avoid flash
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

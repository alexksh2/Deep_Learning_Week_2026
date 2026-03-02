"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RegisterWizard } from "@/components/auth/RegisterWizard"
import { useAuth } from "@/contexts/AuthContext"
import type { AuthUser } from "@/lib/auth-types"

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleComplete(data: AuthUser) {
    setIsLoading(true)
    setError("")
    await new Promise(r => setTimeout(r, 400))
    const result = await register(data)
    if (result.success) {
      router.replace("/")
    } else {
      setError(result.error ?? "Registration failed.")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
          Q
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Tell us about yourself so we can personalise your path</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <RegisterWizard onComplete={handleComplete} isLoading={isLoading} />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

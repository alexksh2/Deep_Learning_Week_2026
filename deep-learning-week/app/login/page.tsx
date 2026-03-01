"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/contexts/AuthContext"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    // Small delay to feel snappy without being instant
    await new Promise(r => setTimeout(r, 300))
    const result = login(email, password)
    if (result.success) {
      router.replace("/")
    } else {
      setError(result.error ?? "Login failed.")
      setIsLoading(false)
    }
  }

  function fillDemo() {
    setEmail("alex.chen@quant.dev")
    setPassword("demo1234")
    setError("")
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      {/* Logo + branding */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
          Q
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Quant Learning OS</h1>
        <p className="text-sm text-muted-foreground">Your personalized path to quant finance mastery</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError("") }}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={e => { setPassword(e.target.value); setError("") }}
            required
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? <><Spinner className="mr-2 h-4 w-4" /> Signing in…</> : "Sign in"}
        </Button>
      </form>

      {/* Demo hint */}
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Demo credentials</p>
        <p>alex.chen@quant.dev / demo1234</p>
        <button
          type="button"
          onClick={fillDemo}
          className="mt-1.5 text-primary underline-offset-2 hover:underline"
        >
          Fill automatically
        </button>
      </div>

      {/* Register link */}
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary underline-offset-2 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}

import { NextResponse } from "next/server"
import { createUser } from "@/lib/auth-db"
import type { AuthUser } from "@/lib/auth-types"

function validateUserInput(input: Partial<AuthUser>): string | null {
  if (!input.email?.trim()) return "Email is required."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return "Invalid email format."
  if (!input.password || input.password.length < 8) return "Password must be at least 8 characters."
  if (!input.name?.trim()) return "Name is required."
  return null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AuthUser>
    const validationError = validateUserInput(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const result = createUser(body as AuthUser)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    return NextResponse.json({ user: result.user }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to register account." }, { status: 500 })
  }
}

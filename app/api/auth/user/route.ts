import { NextResponse } from "next/server"
import { findUserByEmail } from "@/lib/auth-db"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email")?.trim()

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 })
  }

  const user = findUserByEmail(email)
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 })
  }

  return NextResponse.json({ user }, { status: 200 })
}

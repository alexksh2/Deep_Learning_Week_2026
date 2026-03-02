import { NextResponse } from "next/server"
import { verifyUser } from "@/lib/auth-db"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string }
    const email = body.email?.trim() ?? ""
    const password = body.password ?? ""

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 })
    }

    const user = verifyUser(email, password)
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
    }

    return NextResponse.json({ user }, { status: 200 })
  } catch {
    return NextResponse.json({ error: "Login request failed." }, { status: 500 })
  }
}

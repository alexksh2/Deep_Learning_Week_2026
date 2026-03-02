import { NextRequest, NextResponse } from "next/server"
import { deleteConversationsByEmail, getConversations, upsertConversation } from "@/lib/auth-db"

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })
  const conversations = getConversations(email)
  return NextResponse.json({ conversations })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, conversation } = body
  if (!email || !conversation) return NextResponse.json({ error: "email and conversation required" }, { status: 400 })
  upsertConversation(email, conversation)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })
  deleteConversationsByEmail(email)
  return NextResponse.json({ ok: true })
}

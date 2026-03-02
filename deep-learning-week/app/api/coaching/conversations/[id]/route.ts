import { NextRequest, NextResponse } from "next/server"
import { deleteConversationById } from "@/lib/auth-db"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const email = req.nextUrl.searchParams.get("email")
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })
  deleteConversationById(id, email)
  return NextResponse.json({ ok: true })
}

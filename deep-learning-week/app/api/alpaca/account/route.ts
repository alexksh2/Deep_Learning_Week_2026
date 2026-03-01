import { NextResponse } from "next/server"
import { isConfigured, getAccount } from "@/lib/alpaca"

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    const account = await getAccount()
    return NextResponse.json(account)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

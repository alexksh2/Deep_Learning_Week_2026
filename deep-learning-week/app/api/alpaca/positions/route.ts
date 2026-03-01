import { NextResponse } from "next/server"
import { isConfigured, getPositions } from "@/lib/alpaca"

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    const positions = await getPositions()
    return NextResponse.json(positions)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

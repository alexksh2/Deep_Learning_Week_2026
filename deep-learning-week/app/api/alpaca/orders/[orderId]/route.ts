import { NextResponse } from "next/server"
import { isConfigured, cancelOrder } from "@/lib/alpaca"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 503 })
  }
  try {
    const { orderId } = await params
    await cancelOrder(orderId)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}

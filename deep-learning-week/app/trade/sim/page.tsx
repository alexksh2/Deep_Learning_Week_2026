"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react"
import type { OrderType, OrderSide } from "@/lib/types"
import type { AlpacaOrder, AlpacaPosition, AlpacaAccount, AlpacaBar } from "@/lib/alpaca"
import { CandlestickChart } from "@/components/CandlestickChart"
import type { OHLCBar } from "@/components/CandlestickChart"
import { useNotifications } from "@/contexts/NotificationContext"

type FatFingerEvent = {
  orderId: string
  createdAt: string
  symbol: string
  side: "buy" | "sell"
  qty: number
  maxPositionAtOrder: number
}

const FAT_FINGER_STORAGE_KEY = "trade-sim-fat-finger-events-v1"
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/

// ── Helpers ──────────────────────────────────────────────────────────

function mapStatus(alpacaStatus: string): "filled" | "canceled" | "pending" {
  if (alpacaStatus === "filled") return "filled"
  if (["canceled", "expired", "rejected", "done_for_day"].includes(alpacaStatus)) return "canceled"
  return "pending"
}

function fmtPrice(v: string | null | undefined) {
  if (!v) return "—"
  return `$${parseFloat(v).toFixed(2)}`
}

function fmtPnl(v: string) {
  const n = parseFloat(v)
  return (n >= 0 ? "+" : "") + `$${n.toFixed(2)}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}


// ── Component ─────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const { addNotification } = useNotifications()
  const [symbol, setSymbol] = useState("SPY")
  const [symbolInput, setSymbolInput] = useState("SPY")
  const [timeframe, setTimeframe] = useState("5m")
  const [sessionActive, setSessionActive] = useState(false)

  // Date range for chart — default: last 30 days to today
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  const [startDate, setStartDate] = useState(thirtyDaysAgo)
  const [endDate, setEndDate] = useState("")  // empty = no end cap

  // Order ticket
  const [orderType, setOrderType] = useState<OrderType>("Market")
  const [orderSide, setOrderSide] = useState<OrderSide>("Buy")
  const [qty, setQty] = useState("10")
  const [limitPrice, setLimitPrice] = useState("")
  const [maxPosition, setMaxPosition] = useState([500])
  const [stopLoss, setStopLoss] = useState(false)
  const [stopLossPct, setStopLossPct] = useState("2")

  // Alpaca data
  const [bars, setBars] = useState<OHLCBar[]>([])
  const [orders, setOrders] = useState<AlpacaOrder[]>([])
  const [positions, setPositions] = useState<AlpacaPosition[]>([])
  const [account, setAccount] = useState<AlpacaAccount | null>(null)

  // UI state
  const [isLoadingBars, setIsLoadingBars] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderError, setOrderError] = useState("")
  const [orderSuccess, setOrderSuccess] = useState("")
  const [nudges, setNudges] = useState<string[]>([])
  const [configError, setConfigError] = useState(false)
  const [learnerMode, setLearnerMode] = useState(false)
  const [fatFingerEvents, setFatFingerEvents] = useState<FatFingerEvent[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem(FAT_FINGER_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data fetchers ───────────────────────────────────────────────────

  const DISPLAY_BARS: Record<string, number> = {
    "1m":  390,
    "5m":  390,
    "15m": 520,
    "1h":  504,
    "1d":  365,
  }
  const fetchBars = useCallback(async (targetSymbol: string = symbol) => {
    setIsLoadingBars(true)
    setBars([])
    try {
      const res = await fetch(`/api/alpaca/bars/${encodeURIComponent(targetSymbol)}?timeframe=${timeframe}`)
      if (res.status === 503) { setConfigError(true); return }
      if (!res.ok) return
      const data = await res.json()
      let allBars: AlpacaBar[] = data.bars ?? []
      // Filter client-side — avoids sending recent dates to Alpaca (free SIP restriction)
      if (startDate) allBars = allBars.filter(b => b.t >= startDate)
      if (endDate)   allBars = allBars.filter(b => b.t.slice(0, 10) <= endDate)
      setBars(allBars.map((b: AlpacaBar) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })))
    } finally {
      setIsLoadingBars(false)
    }
  }, [symbol, timeframe, startDate, endDate])

  const applySymbol = useCallback(() => {
    const normalized = symbolInput.trim().toUpperCase()
    if (!normalized) {
      setOrderError("Enter a ticker symbol.")
      return null
    }
    if (!SYMBOL_PATTERN.test(normalized)) {
      setOrderError("Invalid ticker format. Use letters/numbers plus optional . or - (e.g. AAPL, BRK.B).")
      return null
    }
    setOrderError("")
    setSymbolInput(normalized)
    if (normalized !== symbol) {
      setSymbol(normalized)
      setOrderSuccess("")
    }
    return normalized
  }, [symbolInput, symbol])

  const fetchOrders = useCallback(async () => {
    const res = await fetch("/api/alpaca/orders?status=all&limit=50")
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data)) setOrders(data)
  }, [])

  const fetchPositions = useCallback(async () => {
    const res = await fetch("/api/alpaca/positions")
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data)) setPositions(data)
  }, [])

  const fetchAccount = useCallback(async () => {
    const res = await fetch("/api/alpaca/account")
    if (res.status === 503) { setConfigError(true); return }
    if (!res.ok) return
    const data = await res.json()
    if (data.id) setAccount(data)
  }, [])

  // ── Effects ─────────────────────────────────────────────────────────

  // Initial load
  useEffect(() => {
    fetchAccount()
    fetchOrders()
    fetchPositions()
  }, [fetchAccount, fetchOrders, fetchPositions])

  // Fetch bars on symbol / timeframe change
  useEffect(() => {
    fetchBars()
  }, [fetchBars])

  // Poll orders + positions while session is active
  useEffect(() => {
    if (sessionActive) {
      pollRef.current = setInterval(() => {
        fetchOrders()
        fetchPositions()
      }, 4000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionActive, fetchOrders, fetchPositions])

  // Coach nudge — trigger when filled order count crosses threshold
  const filledCount = orders.filter(o => o.status === "filled").length
  useEffect(() => {
    if (filledCount > 3) {
      setNudges([
        "You have 4+ filled orders this session. Consider slowing down to avoid overtrading.",
      ])
    }
  }, [filledCount])

  useEffect(() => {
    window.localStorage.setItem(FAT_FINGER_STORAGE_KEY, JSON.stringify(fatFingerEvents))
  }, [fatFingerEvents])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleSessionToggle = async () => {
    if (sessionActive) {
      // End session: cancel all open orders
      const open = orders.filter(o => mapStatus(o.status) === "pending")
      const filled = orders.filter(o => mapStatus(o.status) === "filled")
      await Promise.allSettled(
        open.map(o => fetch(`/api/alpaca/orders/${o.id}`, { method: "DELETE" }))
      )
      await fetchOrders()
      setSessionActive(false)
      setNudges([])
      addNotification({
        title: "Trading session ended",
        body: `${filled.length} filled order${filled.length === 1 ? "" : "s"} this session.`,
        href: "/trade?section=sessions",
        category: "trade",
        source: "trade",
      })
    } else {
      const activeSymbol = applySymbol()
      if (!activeSymbol) return
      setSessionActive(true)
      setOrderError("")
      setOrderSuccess("")
      await fetchBars(activeSymbol)
      await fetchOrders()
      await fetchPositions()
      addNotification({
        title: "Trading session started",
        body: `${activeSymbol} • ${timeframe} simulator session is active.`,
        href: "/trade/sim",
        category: "trade",
        source: "trade",
      })
    }
  }

  const handlePlaceOrder = useCallback(async () => {
    setOrderError("")
    setOrderSuccess("")
    setIsSubmitting(true)
    try {
      const activeSymbol = applySymbol()
      if (!activeSymbol) return
      const qtyNumber = parseInt(qty, 10)
      const exceedsMaxPosition = Number.isFinite(qtyNumber) && qtyNumber > maxPosition[0]
      const body: Record<string, string | boolean> = {
        symbol: activeSymbol,
        qty,
        side: orderSide.toLowerCase(),
        type: orderType.toLowerCase(),
        time_in_force: "day",
      }
      if (orderType === "Limit" && limitPrice) {
        body.limit_price = limitPrice
      }

      const res = await fetch("/api/alpaca/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        // Alpaca error messages come in `message` field
        setOrderError(data.message ?? data.error ?? `Error ${res.status}`)
        return
      }

      setOrderSuccess(`${orderSide} ${qty} ${activeSymbol} order submitted (${data.status})`)
      addNotification({
        title: `${orderSide} order submitted`,
        body: `${qty} ${activeSymbol} (${orderType.toLowerCase()}) • ${data.status}`,
        href: "/trade/sim",
        category: "trade",
        source: "trade",
      })
      if (exceedsMaxPosition && data.id) {
        setFatFingerEvents((prev) => [
          {
            orderId: data.id,
            createdAt: data.created_at ?? new Date().toISOString(),
            symbol: activeSymbol,
            side: orderSide.toLowerCase() as "buy" | "sell",
            qty: qtyNumber,
            maxPositionAtOrder: maxPosition[0],
          },
          ...prev,
        ])
        addNotification({
          title: "Risk alert: max position exceeded",
          body: `Order size ${qty} is above learner limit ${maxPosition[0]}.`,
          href: "/trade/sim",
          category: "system",
          source: "system",
        })
      }
      // Refresh immediately
      await Promise.all([fetchOrders(), fetchPositions()])
    } catch (e) {
      setOrderError(String(e))
    } finally {
      setIsSubmitting(false)
    }
  }, [qty, orderSide, orderType, limitPrice, fetchOrders, fetchPositions, maxPosition, addNotification, applySymbol])

  // Latest price from bars
  const latestPrice = bars[bars.length - 1]?.c

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/trade">Trade</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Simulator</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Config error banner */}
        {configError && (
          <Alert className="border-destructive/30 bg-destructive/5">
            <WifiOff className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-sm">
              Alpaca is not configured. Copy{" "}
              <code className="font-mono text-xs">.env.local.example</code> to{" "}
              <code className="font-mono text-xs">.env.local</code> and add your paper trading API keys,
              then restart the dev server.
            </AlertDescription>
          </Alert>
        )}

        {/* Top controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  applySymbol()
                }
              }}
              placeholder="Ticker"
              list="trade-sim-symbol-suggestions"
              className="h-9 w-32 font-mono"
            />
            <datalist id="trade-sim-symbol-suggestions">
              {["SPY", "QQQ", "IWM", "TLT", "GLD"].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={applySymbol}
              disabled={!symbolInput.trim() || symbolInput.trim().toUpperCase() === symbol}
            >
              Load
            </Button>
          </div>

          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["1m", "5m", "15m", "1h", "1d"].map((tf) => (
                <SelectItem key={tf} value={tf}>{tf}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              placeholder="latest"
              onChange={e => setEndDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button
            size="sm"
            className="h-9"
            variant={sessionActive ? "destructive" : "default"}
            onClick={handleSessionToggle}
          >
            {sessionActive ? "End Session" : "Start Session"}
          </Button>

          {/* Account status */}
          {account && (
            <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono">
              <Wifi className="h-3 w-3 text-chart-2" />
              <span className="text-muted-foreground">Buying power:</span>
              <span className="font-medium">${parseFloat(account.buying_power).toLocaleString()}</span>
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => { fetchBars(); fetchOrders(); fetchPositions(); fetchAccount() }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh data</TooltipContent>
          </Tooltip>
        </div>

        {/* Coach nudges */}
        {nudges.map((nudge, i) => (
          <Alert key={i} className="border-chart-1/30 bg-chart-1/5">
            <AlertTriangle className="h-4 w-4 text-chart-1" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">{nudge}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]">Why?</Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-56">
                  Rapid-fire order placement correlates with negative PnL outcomes.
                  Sessions with 12+ trades average −$350 vs +$165 for fewer than 8.
                </TooltipContent>
              </Tooltip>
            </AlertDescription>
          </Alert>
        ))}

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Price chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium font-mono">
                <span>
                  {symbol} · {timeframe}
                  {latestPrice && (
                    <span className="ml-3 text-muted-foreground">${latestPrice.toFixed(2)}</span>
                  )}
                </span>
                {isLoadingBars && <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 relative">
                {bars.length > 0
                  ? <CandlestickChart bars={bars} className="h-full w-full" />
                  : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {isLoadingBars ? "Loading chart…" : "No data available"}
                    </div>
                  )
                }
              </div>
            </CardContent>
          </Card>

          {/* Order ticket */}
          <Card>
            <CardHeader className="/b-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Order Ticket</CardTitle>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Learner Mode</span>
                  <Switch checked={learnerMode} onCheckedChange={setLearnerMode} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order type */}
              <div className="space-y-1.5">
                <Label className="text-xs">Order Type</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["Market", "Limit"] as OrderType[]).map((t) => (
                    <Button
                      key={t}
                      variant={orderType === t ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setOrderType(t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Side */}
              <div className="space-y-1.5">
                <Label className="text-xs">Side</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    variant={orderSide === "Buy" ? "default" : "outline"}
                    size="sm"
                    className={`h-8 text-xs ${orderSide === "Buy" ? "bg-chart-2 text-background hover:bg-chart-2/90" : ""}`}
                    onClick={() => setOrderSide("Buy")}
                  >
                    Buy
                  </Button>
                  <Button
                    variant={orderSide === "Sell" ? "default" : "outline"}
                    size="sm"
                    className={`h-8 text-xs ${orderSide === "Sell" ? "bg-destructive text-background hover:bg-destructive/90" : ""}`}
                    onClick={() => setOrderSide("Sell")}
                  >
                    Sell
                  </Button>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity (shares)</Label>
                <Input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
                {!learnerMode && Number.isFinite(parseInt(qty, 10)) && parseInt(qty, 10) > maxPosition[0] && (
                  <p className="text-[10px] text-chart-1">
                    Qty exceeds max position. Order will still be submitted and tagged as a fat-finger event.
                  </p>
                )}
              </div>

              {/* Limit price */}
              {orderType === "Limit" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Limit Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className="h-8 text-sm font-mono"
                    placeholder={latestPrice ? latestPrice.toFixed(2) : "0.00"}
                  />
                </div>
              )}

              {/* Risk controls */}
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Risk Controls
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Max Position</Label>
                    <span className="text-xs font-mono text-muted-foreground">{maxPosition[0]}</span>
                  </div>
                  <Slider
                    value={maxPosition}
                    onValueChange={setMaxPosition}
                    max={1000}
                    min={50}
                    step={50}
                    className="py-1"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Stop-Loss</Label>
                  <Switch checked={stopLoss} onCheckedChange={setStopLoss} />
                </div>
                {stopLoss && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.5"
                      value={stopLossPct}
                      onChange={(e) => setStopLossPct(e.target.value)}
                      className="h-7 text-xs font-mono w-20"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </div>

              {/* Error / success feedback */}
              {orderError && (
                <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {orderError}
                </p>
              )}
              {orderSuccess && (
                <p className="rounded border border-chart-2/30 bg-chart-2/10 px-2 py-1.5 text-xs text-chart-2">
                  {orderSuccess}
                </p>
              )}

              <Button
                className="w-full h-9"
                onClick={handlePlaceOrder}
                disabled={!sessionActive || isSubmitting || configError}
              >
                {isSubmitting ? (
                  <><Spinner className="mr-2 h-4 w-4" /> Submitting…</>
                ) : "Place Order"}
              </Button>
              {!sessionActive && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Start a session to place orders
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Positions & Orders */}
        <Tabs defaultValue="positions">
          <TabsList>
            <TabsTrigger value="positions">
              Positions {positions.length > 0 && `(${positions.length})`}
            </TabsTrigger>
            <TabsTrigger value="orders">
              Orders {orders.length > 0 && `(${orders.length})`}
            </TabsTrigger>
          </TabsList>

          {/* Positions */}
          <TabsContent value="positions" className="mt-3">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Side</TableHead>
                    <TableHead className="text-right">Avg Entry</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Unrealized PnL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((pos) => {
                    const pnl = parseFloat(pos.unrealized_pl)
                    return (
                      <TableRow key={pos.symbol}>
                        <TableCell className="font-mono text-sm font-medium">{pos.symbol}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{pos.qty}</TableCell>
                        <TableCell className="text-right">
                          <span className={`text-xs font-mono font-medium ${pos.side === "long" ? "text-chart-2" : "text-destructive"}`}>
                            {pos.side}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {fmtPrice(pos.avg_entry_price)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {fmtPrice(pos.current_price)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm tabular-nums ${pnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                          {fmtPnl(pos.unrealized_pl)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {positions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No open positions. Start a session and place orders.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Orders */}
          <TabsContent value="orders" className="mt-3">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Fill / Limit</TableHead>
                    <TableHead>Risk Flag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const displayStatus = mapStatus(order.status)
                    const fillPrice = order.filled_avg_price ?? order.limit_price
                    const fatFingerEvent = fatFingerEvents.find((e) => e.orderId === order.id)
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {fmtTime(order.created_at)}
                        </TableCell>
                        <TableCell className="text-xs font-mono capitalize">{order.type}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-mono font-medium ${order.side === "buy" ? "text-chart-2" : "text-destructive"}`}>
                            {order.side.charAt(0).toUpperCase() + order.side.slice(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono font-medium">{order.symbol}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {order.filled_qty}/{order.qty}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {fmtPrice(fillPrice)}
                        </TableCell>
                        <TableCell>
                          {fatFingerEvent ? (
                            <Badge variant="outline" className="text-[9px] font-mono uppercase border-chart-1/40 text-chart-1">
                              Fat Finger
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              displayStatus === "filled" ? "secondary"
                                : displayStatus === "canceled" ? "outline"
                                : "default"
                            }
                            className="text-[9px] font-mono uppercase"
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {displayStatus === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-destructive hover:text-destructive"
                              onClick={async () => {
                                await fetch(`/api/alpaca/orders/${order.id}`, { method: "DELETE" })
                                await fetchOrders()
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        No orders yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
            <Card className="mt-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Fat-Finger Log</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Max Position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fatFingerEvents.map((event) => (
                    <TableRow key={event.orderId}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{fmtTime(event.createdAt)}</TableCell>
                      <TableCell className="text-xs font-mono font-medium">{event.symbol}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-mono font-medium ${event.side === "buy" ? "text-chart-2" : "text-destructive"}`}>
                          {event.side.charAt(0).toUpperCase() + event.side.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{event.qty}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{event.maxPositionAtOrder}</TableCell>
                    </TableRow>
                  ))}
                  {fatFingerEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        No fat-finger events recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

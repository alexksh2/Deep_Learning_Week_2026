"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"
import { AlertTriangle, Info } from "lucide-react"
import { priceData, mockOrders, mockPositions } from "@/lib/mock"
import type { OrderType, OrderSide, TradeOrder, Position } from "@/lib/types"

export default function SimulatorPage() {
  const [symbol, setSymbol] = useState("SPY")
  const [timeframe, setTimeframe] = useState("5m")
  const [sessionActive, setSessionActive] = useState(false)

  // Order ticket state
  const [orderType, setOrderType] = useState<OrderType>("Market")
  const [orderSide, setOrderSide] = useState<OrderSide>("Buy")
  const [qty, setQty] = useState("100")
  const [limitPrice, setLimitPrice] = useState("")
  const [maxPosition, setMaxPosition] = useState([500])
  const [stopLoss, setStopLoss] = useState(false)
  const [stopLossPct, setStopLossPct] = useState("2")

  // Mock live state
  const [orders, setOrders] = useState<TradeOrder[]>(mockOrders)
  const [positions] = useState<Position[]>(mockPositions)
  const [nudges, setNudges] = useState<string[]>([])

  const chartData = priceData[symbol]?.map((p, i) => ({
    idx: i,
    price: p.close,
    time: new Date(p.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  })) ?? []

  const handlePlaceOrder = useCallback(() => {
    const newOrder: TradeOrder = {
      id: `o-${Date.now()}`,
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      type: orderType,
      side: orderSide,
      symbol,
      qty: parseInt(qty) || 100,
      price: chartData[chartData.length - 1]?.price ?? 0,
      limitPrice: orderType === "Limit" ? parseFloat(limitPrice) || undefined : undefined,
      status: "filled",
      slippageBps: orderType === "Market" ? Math.round(Math.random() * 10) : 0,
      tags: [],
    }
    setOrders((prev) => [newOrder, ...prev])

    // Coach nudge logic
    const recentCount = orders.filter(
      (o) => o.status === "filled"
    ).length
    if (recentCount > 3) {
      setNudges(["You have placed 4+ orders rapidly. Consider slowing down to avoid overtrading."])
    }
  }, [orderType, orderSide, symbol, qty, limitPrice, chartData, orders])

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

        {/* Top controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["SPY", "QQQ", "IWM", "TLT", "GLD"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["1m", "5m", "15m", "1h"].map((tf) => (
                <SelectItem key={tf} value={tf}>{tf}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9"
            variant={sessionActive ? "destructive" : "default"}
            onClick={() => setSessionActive(!sessionActive)}
          >
            {sessionActive ? "End Session" : "Start Session"}
          </Button>
        </div>

        {/* Coach nudges */}
        {nudges.map((nudge, i) => (
          <Alert key={i} className="border-chart-1/30 bg-chart-1/5">
            <AlertTriangle className="h-4 w-4 text-chart-1" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">{nudge}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                    Why?
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-56">
                  Rapid-fire order placement correlates with negative PnL outcomes.
                  Sessions with 12+ trades average -$350 vs +$165 for fewer than 8.
                </TooltipContent>
              </Tooltip>
            </AlertDescription>
          </Alert>
        ))}

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Price chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium font-mono">
                {symbol} - {timeframe}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                      interval={Math.floor(chartData.length / 6)}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="var(--color-foreground)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Order ticket */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Order Ticket</CardTitle>
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
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
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
                    placeholder={`${chartData[chartData.length - 1]?.price ?? ""}`}
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

              <Button
                className="w-full h-9"
                onClick={handlePlaceOrder}
                disabled={!sessionActive}
              >
                Place Order
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
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="mt-3">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Unrealized PnL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((pos) => (
                    <TableRow key={pos.symbol}>
                      <TableCell className="font-mono text-sm font-medium">{pos.symbol}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{pos.qty}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">${pos.avgPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">${pos.currentPrice.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm tabular-nums ${pos.unrealizedPnl >= 0 ? "text-chart-2" : "text-destructive"}`}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {positions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        No open positions. Start a session and place orders.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

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
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Slippage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{order.time}</TableCell>
                      <TableCell className="text-xs font-mono">{order.type}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-mono font-medium ${order.side === "Buy" ? "text-chart-2" : "text-destructive"}`}>
                          {order.side}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono font-medium">{order.symbol}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{order.qty}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">${order.price.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={order.status === "filled" ? "secondary" : "outline"}
                          className="text-[9px] font-mono uppercase"
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.slippageBps !== undefined && order.slippageBps > 0 ? (
                          <Badge
                            variant={order.slippageBps > 5 ? "destructive" : "secondary"}
                            className="text-[9px] font-mono"
                          >
                            {order.slippageBps}bps
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">---</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

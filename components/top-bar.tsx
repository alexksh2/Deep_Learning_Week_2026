"use client"

import { useMemo, useState } from "react"
import { Search, Bell, BellRing, BookOpen, Moon, Settings2, Sun, TrendingUp, X } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { userProfile } from "@/lib/mock"
import { CommandPalette } from "@/components/command-palette"
import { useAuth } from "@/contexts/AuthContext"
import { useNotifications, type NotificationCategory } from "@/contexts/NotificationContext"

type NotificationFilter = "all" | "unread" | NotificationCategory

const NOTIFICATION_FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "trade", label: "Trade" },
  { value: "learning", label: "Learning" },
  { value: "system", label: "System" },
]

function formatNotificationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const deltaMs = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute

  if (deltaMs < hour) {
    const mins = Math.max(1, Math.floor(deltaMs / minute))
    return `${mins}m ago`
  }

  if (deltaMs < 24 * hour) {
    return `${Math.floor(deltaMs / hour)}h ago`
  }

  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function categoryLabel(category: NotificationCategory) {
  if (category === "trade") return "Trade"
  if (category === "learning") return "Learning"
  return "System"
}

function categoryIcon(category: NotificationCategory) {
  if (category === "trade") return <TrendingUp className="h-3.5 w-3.5" />
  if (category === "learning") return <BookOpen className="h-3.5 w-3.5" />
  return <Settings2 className="h-3.5 w-3.5" />
}

function categoryTone(category: NotificationCategory) {
  if (category === "trade") return "border-chart-2/30 bg-chart-2/10 text-chart-2"
  if (category === "learning") return "border-chart-1/30 bg-chart-1/10 text-chart-1"
  return "border-border bg-muted/70 text-muted-foreground"
}

export function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all")
  const { resolvedTheme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const { notifications, unreadCount, markAsRead, removeNotification, markAllAsRead, clearAll } = useNotifications()
  const router = useRouter()

  const displayName = user?.name ?? userProfile.name
  const displayEmail = user?.email ?? userProfile.email
  const displayAvatar = user?.avatar ?? userProfile.avatar

  function handleLogout() {
    logout()
    router.replace("/login")
  }

  const unreadBadge = unreadCount > 99 ? "99+" : String(unreadCount)
  const filteredNotifications = useMemo(() => {
    const source =
      notificationFilter === "all"
        ? notifications
        : notificationFilter === "unread"
          ? notifications.filter((item) => !item.read)
          : notifications.filter((item) => item.category === notificationFilter)

    return source.slice(0, 20)
  }, [notifications, notificationFilter])

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 gap-4">
        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-full max-w-sm"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search courses, topics, quizzes...</span>
          <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
            Ctrl+K
          </kbd>
        </button>

        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full border border-background px-1 text-[9px] leading-none flex items-center justify-center">
                    {unreadBadge}
                  </Badge>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-[360px] sm:w-[420px] p-0 overflow-hidden rounded-xl">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold leading-tight">Notifications</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Trade, learning, and system updates in one feed.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                    <BellRing className="h-3 w-3" />
                    <span>{unreadCount} unread</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {NOTIFICATION_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setNotificationFilter(filter.value)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        notificationFilter === filter.value
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <ScrollArea className="h-[360px]">
                {filteredNotifications.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-xs text-muted-foreground">
                    <BellRing className="h-5 w-5 opacity-60" />
                    <p>No notifications in this view.</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredNotifications.map((item) => (
                      <div
                        key={item.id}
                        className={`mb-1 flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/60 ${
                          item.read ? "border-transparent bg-transparent" : "border-border bg-muted/40"
                        }`}
                      >
                        <a
                          href={item.href}
                          onClick={() => markAsRead(item.id)}
                          className="flex min-w-0 flex-1 items-start gap-3"
                        >
                          <div className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${categoryTone(item.category)}`}>
                            {categoryIcon(item.category)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {categoryLabel(item.category)}
                                </span>
                                {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/80" />}
                              </div>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {formatNotificationTime(item.createdAt)}
                              </span>
                            </div>
                            <p className="line-clamp-1 text-sm font-medium leading-tight">{item.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                          </div>
                        </a>
                        {item.read && (
                          <button
                            type="button"
                            onClick={() => removeNotification(item.id)}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Clear read notification"
                            title="Clear"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="flex items-center justify-between border-t border-border bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">{notifications.length} total</div>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                    {displayAvatar}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{displayEmail}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/profile">Profile</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/profile/settings">Settings</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}

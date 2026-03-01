"use client"

import { useState } from "react"
import { Search, Bell, Flame } from "lucide-react"
import { Input } from "@/components/ui/input"
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
import { userProfile } from "@/lib/mock"
import { CommandPalette } from "@/components/command-palette"

export function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false)

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
          {/* Today status pill */}
          <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs md:flex">
            <Flame className="h-3.5 w-3.5 text-chart-1" />
            <span className="font-mono font-medium">{userProfile.streak}d streak</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{userProfile.dailyStudyTarget}min planned</span>
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative h-8 w-8">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full p-0 text-[9px] flex items-center justify-center">
              3
            </Badge>
            <span className="sr-only">Notifications</span>
          </Button>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                    {userProfile.avatar}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{userProfile.name}</p>
                  <p className="text-xs text-muted-foreground">{userProfile.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/profile">Profile & Settings</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { BookOpen, Brain, Tag, History } from "lucide-react"
import { courses, quizzes, topics, tradingSessions } from "@/lib/mock"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  function navigate(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search courses, quizzes, topics, sessions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Courses">
          {courses.map((c) => (
            <CommandItem key={c.id} onSelect={() => navigate(`/learn/course/${c.id}`)}>
              <BookOpen className="mr-2 h-4 w-4" />
              <span>{c.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quizzes">
          {quizzes.map((q) => (
            <CommandItem key={q.id} onSelect={() => navigate(`/learn/quiz/${q.id}`)}>
              <Brain className="mr-2 h-4 w-4" />
              <span>{q.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Topics">
          {topics.slice(0, 6).map((t) => (
            <CommandItem key={t.id} onSelect={() => navigate(`/learn?tab=mastery`)}>
              <Tag className="mr-2 h-4 w-4" />
              <span>{t.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Trading Sessions">
          {tradingSessions.slice(0, 3).map((s) => (
            <CommandItem key={s.id} onSelect={() => navigate(`/trade/review/${s.id}`)}>
              <History className="mr-2 h-4 w-4" />
              <span>
                {s.instruments.join(", ")} &mdash; {s.pnl >= 0 ? "+" : ""}${s.pnl}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

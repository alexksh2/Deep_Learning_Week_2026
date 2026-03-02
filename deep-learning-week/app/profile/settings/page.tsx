"use client"

import { ProfileHeader } from "@/components/profile/ProfileHeader"
import { IdentityCard } from "@/components/profile/IdentityCard"
import { CareerIntentCard } from "@/components/profile/CareerIntentCard"
import { QuickActionsCard } from "@/components/profile/QuickActionsCard"
import { SettingsTab } from "@/components/profile/SettingsTab"

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-5 max-w-screen-xl">
      <ProfileHeader />

      <div className="grid grid-cols-1 lg:grid-cols-[288px_1fr] gap-5 items-start">
        <div className="space-y-4 lg:sticky lg:top-4">
          <IdentityCard />
          <CareerIntentCard />
          <QuickActionsCard />
        </div>

        <div className="space-y-4">
          <div className="border-b border-border pb-2.5">
            <h2 className="text-xs font-medium text-foreground">Settings</h2>
          </div>
          <SettingsTab />
        </div>
      </div>
    </div>
  )
}

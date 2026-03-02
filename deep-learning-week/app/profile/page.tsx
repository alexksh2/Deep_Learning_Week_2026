"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProfileHeader } from "@/components/profile/ProfileHeader"
import { IdentityCard } from "@/components/profile/IdentityCard"
import { CareerIntentCard } from "@/components/profile/CareerIntentCard"
import { ResumePortfolioTab } from "@/components/profile/ResumePortfolioTab"
import { AspirationsTab } from "@/components/profile/AspirationsTab"
import { SkillsMatrixTab } from "@/components/profile/SkillsMatrixTab"

export default function ProfilePage() {
  return (
    <div className="space-y-5 max-w-screen-xl">
      <ProfileHeader />

      <div className="grid grid-cols-1 lg:grid-cols-[288px_1fr] gap-5 items-start">
        {/* Left column — sticky */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <IdentityCard />
          <CareerIntentCard />
        </div>

        {/* Right column — tabs */}
        <Tabs defaultValue="resume" className="w-full">
          <TabsList className="flex justify-start gap-0 border-b border-border rounded-none h-auto p-0 bg-transparent mb-5 w-full overflow-x-auto">
            {[
              { value: "resume",      label: "Resume & Portfolio" },
              { value: "aspirations", label: "Aspirations" },
              { value: "skills",      label: "Skills Matrix" },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-0 border-b-2 border-b-transparent data-[state=active]:border-b-foreground data-[state=active]:bg-transparent px-4 pb-2.5 pt-0 text-xs font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors whitespace-nowrap outline-none focus-visible:ring-0"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="resume">
            <ResumePortfolioTab />
          </TabsContent>
          <TabsContent value="aspirations">
            <AspirationsTab />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsMatrixTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

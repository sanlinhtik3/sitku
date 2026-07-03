import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Settings, Users, BarChart3, PenLine } from "lucide-react";
import { AIContentGlobalSettings } from "./AIContentGlobalSettings";
import { AIContentUserManager } from "./AIContentUserManager";
import { AIContentWriter } from "../AIContentWriter";

export function AdminAIContent() {
  const [activeTab, setActiveTab] = useState("writer");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/20">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Content Writer</h1>
          <p className="text-sm text-muted-foreground">
            Generate AI content, manage settings, and user permissions
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-muted/50">
          <TabsTrigger value="writer" className="flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            <span className="hidden sm:inline">Writer</span>
          </TabsTrigger>
          <TabsTrigger value="global" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="writer" className="space-y-4">
          <AIContentWriter />
        </TabsContent>

        <TabsContent value="global" className="space-y-4">
          <AIContentGlobalSettings />
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <AIContentUserManager />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-card p-8 text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium text-foreground">Coming Soon</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Content generation statistics and analytics will be available here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// AI Content Management Page - Agentic AI Chat Style
import { Sparkles, FileText } from "lucide-react";
import { AIContentWriter } from "@/components/admin/AIContentWriter";
import { AIContentLibrary } from "@/components/admin/AIContentLibrary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function AIContentManagement() {
  return (
    <div className="min-h-[calc(100vh-4rem)] p-2 sm:p-4 lg:p-6 pb-24 lg:pb-8">
      <div className="w-full bg-card/20 backdrop-blur-xl rounded-2xl border border-white/[0.06] shadow-xl shadow-primary/5 overflow-hidden">
        {/* Compact Header - Chat Style */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 via-indigo-500 to-purple-600 shadow-md shadow-purple-500/20 ring-1 ring-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                  AI Content Studio
                  <Badge className="text-[9px] px-1.5 py-0 h-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 font-medium">
                    AI Writer
                  </Badge>
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block">
                  Generate, manage & review AI-powered content
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pill-style Tabs */}
        <Tabs defaultValue="writer" className="w-full">
          <div className="px-3 pt-3 sm:px-4 sm:pt-4">
            <TabsList className="inline-flex gap-1 p-1 bg-card/30 backdrop-blur-xl border border-white/[0.06] rounded-2xl h-auto">
              <TabsTrigger
                value="writer"
                className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsl(var(--primary)/0.25)] transition-all duration-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI Writer</span>
              </TabsTrigger>
              <TabsTrigger
                value="library"
                className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_hsl(var(--primary)/0.25)] transition-all duration-300"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>My Content</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="writer" className="p-3 sm:p-4 lg:p-6 pt-3 sm:pt-4">
            <AIContentWriter showLibrary={false} />
          </TabsContent>

          <TabsContent value="library" className="p-3 sm:p-4 lg:p-6 pt-3 sm:pt-4">
            <AIContentLibrary />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

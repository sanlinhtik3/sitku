import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconBrain, IconCode, IconEye, IconVariable } from "@tabler/icons-react";
import { PromptFileList } from "./PromptFileList";
import { PromptEditor } from "./PromptEditor";
import { PromptPreview } from "./PromptPreview";
import { PromptVariables } from "./PromptVariables";
import { PromptUploadDialog } from "./PromptUploadDialog";
import { PromptHistoryPanel } from "./PromptHistoryPanel";
import { usePromptFiles, usePromptHistory } from "./usePromptFiles";
import type { PromptFile } from "./types";

export function AdminBeeBotPrompts() {
  const { promptFiles, isLoading, createPromptFile, updatePromptFile, deletePromptFile, reorderPromptFiles } = usePromptFiles();
  const [selectedFile, setSelectedFile] = useState<PromptFile | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [activeTab, setActiveTab] = useState("editor");
  
  const { history, isLoading: historyLoading } = usePromptHistory(selectedFile?.id || null);

  const handleSelectFile = (file: PromptFile) => {
    setSelectedFile(file);
    setActiveTab("editor");
  };

  const handleSaveFile = async (updates: Partial<PromptFile>) => {
    if (!selectedFile) return;
    await updatePromptFile.mutateAsync({ id: selectedFile.id, updates });
    // Update local selected file
    setSelectedFile(prev => prev ? { ...prev, ...updates } : null);
  };

  const handleDeleteFile = async (id: string) => {
    await deletePromptFile.mutateAsync(id);
    setSelectedFile(null);
  };

  const handleCreateFile = async (data: Partial<PromptFile>) => {
    await createPromptFile.mutateAsync(data);
    setShowUploadDialog(false);
  };

  const handleRestoreVersion = (content: string) => {
    if (!selectedFile) return;
    // Update the content in the editor
    handleSaveFile({ content });
    setShowHistoryPanel(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <IconBrain className="size-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">BeeBot Prompt Studio</CardTitle>
                <CardDescription>
                  Manage BeeBot's system prompts with modular .md files
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowUploadDialog(true)}>
              Create / Upload
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-4 min-h-[calc(100vh-300px)]">
        {/* File List - Left Sidebar */}
        <div className="col-span-3">
          <Card className="h-full">
            <PromptFileList
              files={promptFiles || []}
              selectedId={selectedFile?.id || null}
              onSelect={handleSelectFile}
              onCreateNew={() => setShowUploadDialog(true)}
              onReorder={(items) => reorderPromptFiles.mutateAsync(items)}
              isLoading={isLoading}
            />
          </Card>
        </div>

        {/* Editor / Preview Area */}
        <div className="col-span-6">
          <Card className="h-full overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="border-b border-border/50 px-3 pt-2">
                <TabsList>
                  <TabsTrigger value="editor" className="gap-1">
                    <IconCode className="size-4" />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-1">
                    <IconEye className="size-4" />
                    Preview
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="editor" className="flex-1 m-0 data-[state=active]:flex flex-col">
                <PromptEditor
                  file={selectedFile}
                  onSave={handleSaveFile}
                  onDelete={handleDeleteFile}
                  onShowHistory={() => setShowHistoryPanel(true)}
                  onShowPreview={() => setActiveTab("preview")}
                  isSaving={updatePromptFile.isPending}
                />
              </TabsContent>
              
              <TabsContent value="preview" className="flex-1 m-0 data-[state=active]:flex flex-col">
                <PromptPreview files={promptFiles || []} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Variables Panel - Right Sidebar */}
        <div className="col-span-3">
          <Card className="h-full">
            <div className="p-3 border-b border-border/50 flex items-center gap-2">
              <IconVariable className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Variables</h3>
            </div>
            <PromptVariables />
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <PromptUploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        onSubmit={handleCreateFile}
        isSubmitting={createPromptFile.isPending}
      />

      <PromptHistoryPanel
        open={showHistoryPanel}
        onOpenChange={setShowHistoryPanel}
        file={selectedFile}
        history={history || []}
        isLoading={historyLoading}
        onRestore={handleRestoreVersion}
      />
    </div>
  );
}

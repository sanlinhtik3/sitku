import { lazy, Suspense } from "react";
import { TavilyApiKeyDialog } from "./TavilyApiKeyDialog";
import { CreditsExhaustedDialog } from "@/components/CreditsExhaustedDialog";
import { AIContentApiKeyDialog } from "@/components/ai-content/AIContentApiKeyDialog";
import { NotionConfigDialog } from "./NotionConfigDialog";

import type { QueryClient } from "@tanstack/react-query";
import type { useAgentDialogState } from "@/hooks/agent-chat/useAgentDialogState";

const NeuralLinkDialog = lazy(() => import("./NeuralLinkDialog").then(m => ({ default: m.NeuralLinkDialog })));
const SoulEditor = lazy(() => import("./SoulEditor").then(m => ({ default: m.SoulEditor })));
const FacebookPagesDialog = lazy(() => import("./FacebookPagesDialog").then(m => ({ default: m.FacebookPagesDialog })));

interface DialogRouterProps {
  ds: ReturnType<typeof useAgentDialogState>;
  userId: string;
  agentSettings: { custom_instructions?: string | null } | null;
  creditsExhaustedError: any;
  clearCreditsExhaustedError: () => void;
  queryClient: QueryClient;
  updateSettings: (settings: { custom_instructions: string }) => Promise<void>;
  isSavingSoul: boolean;
}

export function DialogRouter({
  ds, userId, agentSettings, creditsExhaustedError,
  clearCreditsExhaustedError, queryClient, updateSettings, isSavingSoul,
}: DialogRouterProps) {
  return (
    <>
      <TavilyApiKeyDialog open={ds.tavilyKeyOpen} onOpenChange={ds.setTavilyKeyOpen} userId={userId} />
      <CreditsExhaustedDialog
        open={!!creditsExhaustedError}
        onOpenChange={(open) => !open && clearCreditsExhaustedError()}
        error={creditsExhaustedError}
        featureName="BeeBot"
      />
      <AIContentApiKeyDialog
        open={ds.apiKeyDialogOpen}
        onOpenChange={ds.setApiKeyDialogOpen}
        userId={userId}
        initialTab={ds.apiKeyInitialTab}
        onKeyUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["user-ai-settings", userId] });
          queryClient.invalidateQueries({ queryKey: ["intelligence-status", userId] });
        }}
      />
      <Suspense fallback={null}>
        <NeuralLinkDialog open={ds.telegramDialogOpen} onOpenChange={ds.setTelegramDialogOpen} userId={userId} />
      </Suspense>
      <Suspense fallback={null}>
        <FacebookPagesDialog open={ds.facebookDialogOpen} onOpenChange={ds.setFacebookDialogOpen} userId={userId} />
      </Suspense>
      
      <NotionConfigDialog
        open={ds.notionDialogOpen}
        onOpenChange={ds.setNotionDialogOpen}
        userId={userId}
      />

      <Suspense fallback={null}>
        <SoulEditor
          open={ds.soulEditorOpen}
          onOpenChange={ds.setSoulEditorOpen}
          currentInstructions={agentSettings?.custom_instructions || null}
          onSave={async (text) => { await updateSettings({ custom_instructions: text }); }}
          isSaving={isSavingSoul}
        />
      </Suspense>
    </>
  );
}

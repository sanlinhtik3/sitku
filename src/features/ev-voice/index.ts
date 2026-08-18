// E.V is the active voice boundary. The old jarvis path remains only as a storage/API
// compatibility layer so existing keys, action history, and SQLite turns are not lost.
export { EvVoiceAssistant } from "@/features/jarvis/ui/Jarvis";
export {
  geminiKey,
  evEnabled,
  evModels,
  evWakeWord,
  isWakePhrase,
  makeEvBrain,
} from "@/features/jarvis/services/brain";
export type { Intent, JarvisAction as EvAction } from "@/features/jarvis/services/brain";
export * from "./capabilities/capabilityRegistry";
export * from "./capabilities/capabilityPolicy";
export * from "./capabilities/runtimeCatalog";
export * from "./protocols";
export * from "./operator";
export * from "./storytelling/storytellingProtocol";
export * from "./storytelling/storytellingRegistry";

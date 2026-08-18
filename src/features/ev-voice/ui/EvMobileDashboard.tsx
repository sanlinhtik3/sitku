import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Files,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { FuiPanel, FuiStatus } from "@/design-system/fui";
import { cn } from "@/lib/utils";
import { EvSpeechOrb } from "./EvSpeechOrb";

interface EvMobileActiveNote {
  title: string;
}

interface EvMobileDashboardProps {
  vaultName: string;
  noteCount: number;
  activeNote?: EvMobileActiveNote | null;
  voiceEnabled: boolean;
  providerReady: boolean;
  onOpenVoice: () => void;
  onOpenNotes: () => void;
  onOpenCfo: () => void;
  onOpenConsultant: () => void;
  onOpenSettings: () => void;
}

interface EvHomeActionProps {
  label: string;
  detail: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  accent?: boolean;
}

const noAnalyser = () => null;
const noPointerAction = () => undefined;

/** Compact action widget shared by the phone dashboard and future tablet shells. */
export function EvHomeAction({ label, detail, icon: Icon, onClick, accent }: EvHomeActionProps) {
  return (
    <button type="button" className={cn("ev-home-action fui-panel", accent && "is-accent")} data-fui-panel="quiet" onClick={onClick}>
      <span className="ev-home-action-icon"><Icon className="h-[18px] w-[18px]" strokeWidth={1.65} /></span>
      <span className="min-w-0 flex-1 text-left">
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.6} />
    </button>
  );
}

function useDeviceClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return {
    time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(now),
    date: new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(now),
  };
}

export function EvMobileDashboard({
  vaultName,
  noteCount,
  activeNote,
  voiceEnabled,
  providerReady,
  onOpenVoice,
  onOpenNotes,
  onOpenCfo,
  onOpenConsultant,
  onOpenSettings,
}: EvMobileDashboardProps) {
  const clock = useDeviceClock();
  const voiceState = !voiceEnabled ? "Voice disabled" : providerReady ? "Live systems ready" : "Provider setup required";
  const status = voiceEnabled && providerReady ? "success" : "warning";
  const activateVoice = voiceEnabled ? onOpenVoice : onOpenSettings;

  return (
    <main className="ev-mobile-home" aria-label="E.V home dashboard">
      <header className="ev-mobile-home-header">
        <div>
          <h1>E.V</h1>
        </div>
        <div className="ev-mobile-clock" aria-label={`${clock.date}, ${clock.time}`}>
          <strong>{clock.time}</strong>
          <span>{clock.date}</span>
        </div>
      </header>

      <FuiPanel tone="primary" className="ev-mobile-hero">
        <div className="ev-mobile-hero-topline">
          <FuiStatus status={status} label={voiceState} />
        </div>
        <div className="ev-mobile-orb-shell">
          <EvSpeechOrb
            phase="idle"
            heardVoice={false}
            getAnalyser={noAnalyser}
            onPointerDown={noPointerAction}
            onPointerUp={activateVoice}
            onPointerLeave={noPointerAction}
          />
        </div>
        <div className="ev-mobile-hero-copy">
          <strong>{voiceEnabled ? "Talk to E.V" : "Enable E.V voice"}</strong>
          <span>{providerReady ? "Ask, search, inspect, or run an approved action." : "Finish provider setup to start a live voice session."}</span>
        </div>
        <div className="ev-mobile-readout" aria-label="Workspace status">
          <span><small>Vault</small><strong>{vaultName}</strong></span>
          <span><small>Voice</small><strong>{providerReady ? "Ready" : "Setup"}</strong></span>
          <span><small>Runtime</small><strong>Local</strong></span>
        </div>
      </FuiPanel>

      <section className="ev-mobile-action-grid" aria-label="Sitku spaces">
        <EvHomeAction label="Notes" detail={activeNote ? `${noteCount} · ${activeNote.title}` : `${noteCount} local files`} icon={Files} onClick={onOpenNotes} accent />
        <EvHomeAction label="Personal CFO" detail="Money operations" icon={WalletCards} onClick={onOpenCfo} />
        <EvHomeAction label="Consultant" detail="Team intelligence" icon={BriefcaseBusiness} onClick={onOpenConsultant} />
      </section>

      <footer className="ev-mobile-home-footer">
        <span><ShieldCheck className="h-4 w-4" /> Local data protected</span>
        <button type="button" onClick={onOpenSettings}><Settings className="h-4 w-4" /> Settings</button>
      </footer>
    </main>
  );
}

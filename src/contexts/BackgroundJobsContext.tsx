import { createContext, useContext } from "react";

export interface BackgroundJob {
  id: string;
  videoName: string;
  status: string;
  progress: number;
  stepMessage: string;
  currentStep: string;
  startedAt: Date;
  errorMessage?: string;
}

export interface BackgroundJobsContextType {
  activeJobs: BackgroundJob[];
  completedJobs: BackgroundJob[];
  hasActiveJobs: boolean;
  activeCount: number;
  openJobDialog: (jobId: string) => void;
  setDialogHandler: (handler: (jobId: string) => void) => void;
}

export const BackgroundJobsContext = createContext<BackgroundJobsContextType | null>(null);

export const useBackgroundJobs = () => {
  const context = useContext(BackgroundJobsContext);
  if (!context) {
    // Safe defaults when provider hasn't initialized yet (e.g., on public routes)
    return {
      activeJobs: [],
      completedJobs: [],
      hasActiveJobs: false,
      activeCount: 0,
      openJobDialog: () => {},
      setDialogHandler: () => {},
    };
  }
  return context;
};

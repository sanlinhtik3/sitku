import { memo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Wrench, Clock, AlertTriangle, Sparkles } from "lucide-react";
import type { FeatureStatus } from "@/hooks/useFeatureFlags";

interface FeatureUnavailableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  featureNameMy?: string | null;
  status: FeatureStatus;
  message?: string | null;
  messageMy?: string | null;
}

const statusContent: Record<FeatureStatus, {
  icon: React.ElementType;
  title: string;
  titleMy: string;
  defaultMessage: string;
  defaultMessageMy: string;
  iconColor: string;
}> = {
  active: {
    icon: Sparkles,
    title: "Feature Active",
    titleMy: "Feature အသုံးပြုနိုင်ပါသည်",
    defaultMessage: "This feature is currently active.",
    defaultMessageMy: "ဤ Feature ကို လက်ရှိအသုံးပြုနိုင်ပါသည်။",
    iconColor: "text-emerald-500",
  },
  beta: {
    icon: Sparkles,
    title: "Beta Feature",
    titleMy: "စမ်းသပ်ဆဲ Feature",
    defaultMessage: "This feature is in beta testing phase.",
    defaultMessageMy: "ဤ Feature သည် စမ်းသပ်မှုအဆင့်တွင် ရှိနေပါသည်။",
    iconColor: "text-blue-500",
  },
  maintenance: {
    icon: Wrench,
    title: "Under Maintenance",
    titleMy: "ပြုပြင်နေပါသည်",
    defaultMessage: "This feature is temporarily unavailable while we make improvements.",
    defaultMessageMy: "ဤ Feature ကို ပိုမိုကောင်းမွန်အောင် ပြုပြင်နေပါသည်။ ခဏစောင့်ပေးပါ။",
    iconColor: "text-orange-500",
  },
  coming_soon: {
    icon: Clock,
    title: "Coming Soon",
    titleMy: "မကြာမီ လာမည်",
    defaultMessage: "This feature is coming soon. Stay tuned!",
    defaultMessageMy: "ဤ Feature ကို မကြာမီ မိတ်ဆက်ပေးပါမည်။ စောင့်မျှော်ပေးပါ။",
    iconColor: "text-purple-500",
  },
  deprecated: {
    icon: AlertTriangle,
    title: "Feature Deprecated",
    titleMy: "ဖယ်ရှားတော့မည်",
    defaultMessage: "This feature will be removed soon. Please use alternatives.",
    defaultMessageMy: "ဤ Feature ကို မကြာမီ ဖယ်ရှားပါမည်။ အခြားနည်းလမ်းများ အသုံးပြုပါ။",
    iconColor: "text-red-500",
  },
};

export const FeatureUnavailableDialog = memo(({
  open,
  onOpenChange,
  featureName,
  featureNameMy,
  status,
  message,
  messageMy,
}: FeatureUnavailableDialogProps) => {
  const content = statusContent[status];
  const Icon = content.icon;

  const displayName = featureNameMy || featureName;
  const displayMessage = messageMy || message || content.defaultMessageMy || content.defaultMessage;
  const displayTitle = content.titleMy || content.title;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="text-center sm:text-center">
          <div className={`mx-auto mb-4 h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center ${content.iconColor}`}>
            <Icon className="h-8 w-8" />
          </div>
          <AlertDialogTitle className="text-xl">
            {displayTitle}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p className="font-medium text-foreground">{displayName}</p>
            <p className="text-muted-foreground">{displayMessage}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction className="min-w-[120px]">
            နားလည်ပါပြီ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

FeatureUnavailableDialog.displayName = "FeatureUnavailableDialog";

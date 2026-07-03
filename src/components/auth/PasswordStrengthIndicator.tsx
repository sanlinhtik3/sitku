import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

export const PasswordStrengthIndicator = ({ password, className }: PasswordStrengthIndicatorProps) => {
  const requirements: Requirement[] = useMemo(() => [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase letter (A-Z)", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter (a-z)", met: /[a-z]/.test(password) },
    { label: "Number (0-9)", met: /[0-9]/.test(password) },
  ], [password]);

  const strength = useMemo(() => {
    const metCount = requirements.filter(r => r.met).length;
    if (metCount === 0) return { level: 0, label: "", color: "bg-muted" };
    if (metCount === 1) return { level: 1, label: "Weak", color: "bg-destructive" };
    if (metCount === 2) return { level: 2, label: "Fair", color: "bg-orange-500" };
    if (metCount === 3) return { level: 3, label: "Good", color: "bg-yellow-500" };
    return { level: 4, label: "Strong", color: "bg-green-500" };
  }, [requirements]);

  if (!password) return null;

  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Password strength</span>
          <span className={cn(
            "font-medium",
            strength.level === 1 && "text-destructive",
            strength.level === 2 && "text-orange-500",
            strength.level === 3 && "text-yellow-500",
            strength.level === 4 && "text-green-500"
          )}>
            {strength.label}
          </span>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                level <= strength.level ? strength.color : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Requirements List */}
      <ul className="space-y-1 text-xs" aria-label="Password requirements">
        {requirements.map((req, index) => (
          <li
            key={index}
            className={cn(
              "flex items-center gap-2 transition-colors",
              req.met ? "text-green-500" : "text-muted-foreground"
            )}
          >
            {req.met ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <X className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

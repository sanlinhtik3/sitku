import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface ClockTimePickerProps {
  hour: number;       // 0-23
  minute: number;     // 0-59
  onTimeChange: (hour: number, minute: number) => void;
  className?: string;
}

type PickerMode = "hour" | "minute";

const HOUR_NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_NUMBERS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function ClockTimePicker({ hour, minute, onTimeChange, className }: ClockTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>("hour");
  const [isPM, setIsPM] = useState(hour >= 12);
  const [localHour, setLocalHour] = useState(hour);
  const [localMinute, setLocalMinute] = useState(minute);
  const clockRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  // Sync from props when popover opens
  useEffect(() => {
    if (open) {
      setLocalHour(hour);
      setLocalMinute(minute);
      setIsPM(hour >= 12);
      setMode("hour");
    }
  }, [open, hour, minute]);

  const display12Hour = (() => {
    const h = localHour % 12;
    return h === 0 ? 12 : h;
  })();

  const getAngleFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const svg = clockRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, []);

  const handleClockInteraction = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const angle = getAngleFromEvent(e);
    if (angle === null) return;

    if (mode === "hour") {
      let h = Math.round(angle / 30) % 12;
      if (h === 0) h = 12;
      const hour24 = isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
      setLocalHour(hour24);
    } else {
      let m = Math.round(angle / 6) % 60;
      setLocalMinute(m);
    }
  }, [mode, isPM, getAngleFromEvent]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    handleClockInteraction(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) handleClockInteraction(e);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      handleClockInteraction(e);
      if (mode === "hour") {
        setTimeout(() => setMode("minute"), 200);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    handleClockInteraction(e);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging.current) handleClockInteraction(e);
  };
  const handleTouchEnd = () => {
    isDragging.current = false;
    if (mode === "hour") {
      setTimeout(() => setMode("minute"), 200);
    }
  };

  const toggleAMPM = (pm: boolean) => {
    setIsPM(pm);
    const h12 = localHour % 12;
    setLocalHour(pm ? (h12 === 0 ? 12 : h12 + 12) : h12);
  };

  const handleOk = () => {
    onTimeChange(localHour, localMinute);
    setOpen(false);
  };

  const handleReset = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    setLocalHour(h);
    setLocalMinute(m);
    setIsPM(h >= 12);
    setMode("hour");
  };

  // Calculate hand angle
  const handAngle = mode === "hour"
    ? ((display12Hour % 12) * 30) - 90
    : (localMinute * 6) - 90;

  const numbers = mode === "hour" ? HOUR_NUMBERS : MINUTE_NUMBERS;
  const activeValue = mode === "hour" ? display12Hour : localMinute;
  const radius = 90;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 h-9 px-3 rounded-lg border border-border/30 bg-background/50",
            "hover:bg-muted/40 transition-colors text-sm font-medium cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">
            {String(display12Hour).padStart(2, "0")}:{String(localMinute).padStart(2, "0")}
          </span>
          <span className="text-[10px] font-semibold text-primary/80 uppercase">
            {isPM ? "PM" : "AM"}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[280px] p-0 border-border/30 bg-card/95 backdrop-blur-2xl shadow-2xl"
        align="start"
        sideOffset={6}
      >
        {/* Display header */}
        <div className="flex items-center justify-center gap-1 px-4 pt-4 pb-2">
          <div className="flex items-center bg-muted/30 rounded-lg overflow-hidden border border-border/20">
            <button
              type="button"
              onClick={() => setMode("hour")}
              className={cn(
                "px-3 py-2 text-2xl font-bold tabular-nums transition-colors",
                mode === "hour" ? "text-foreground bg-muted/50" : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {String(display12Hour).padStart(2, "0")}
            </button>
            <span className="text-2xl font-bold text-muted-foreground">:</span>
            <button
              type="button"
              onClick={() => setMode("minute")}
              className={cn(
                "px-3 py-2 text-2xl font-bold tabular-nums transition-colors",
                mode === "minute" ? "text-foreground bg-muted/50" : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {String(localMinute).padStart(2, "0")}
            </button>
          </div>

          {/* AM/PM toggle */}
          <div className="flex flex-col gap-0.5 ml-2">
            <button
              type="button"
              onClick={() => toggleAMPM(false)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-bold transition-all border",
                !isPM
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/30"
              )}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => toggleAMPM(true)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-bold transition-all border",
                isPM
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/30"
              )}
            >
              PM
            </button>
          </div>
        </div>

        {/* Clock face */}
        <div className="flex items-center justify-center px-4 py-2">
          <svg
            ref={clockRef}
            width="220"
            height="220"
            viewBox="0 0 240 240"
            className="cursor-pointer select-none touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { isDragging.current = false; }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Background circle */}
            <circle cx="120" cy="120" r="110" className="fill-muted/20 stroke-border/20" strokeWidth="1" />

            {/* Dot markers */}
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i * 6 - 90) * (Math.PI / 180);
              const r = 102;
              const x = 120 + r * Math.cos(a);
              const y = 120 + r * Math.sin(a);
              const isMajor = i % 5 === 0;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={isMajor ? 2 : 1}
                  className={isMajor ? "fill-muted-foreground/40" : "fill-muted-foreground/15"}
                />
              );
            })}

            {/* Clock hand */}
            {(() => {
              const a = handAngle * (Math.PI / 180);
              const handLen = mode === "hour" ? 65 : 80;
              const ex = 120 + handLen * Math.cos(a);
              const ey = 120 + handLen * Math.sin(a);
              return (
                <>
                  <line x1="120" y1="120" x2={ex} y2={ey} className="stroke-foreground" strokeWidth="2" strokeLinecap="round" />
                  <circle cx={ex} cy={ey} r="6" className="fill-foreground" />
                  <circle cx="120" cy="120" r="4" className="fill-foreground" />
                </>
              );
            })()}

            {/* Numbers */}
            {numbers.map((num, i) => {
              const a = (i * 30 - 90) * (Math.PI / 180);
              const x = 120 + radius * Math.cos(a);
              const y = 120 + radius * Math.sin(a);
              const isActive = num === activeValue;
              return (
                <text
                  key={num}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "text-xs font-semibold pointer-events-none select-none",
                    isActive ? "fill-primary" : "fill-muted-foreground/70"
                  )}
                >
                  {mode === "minute" ? String(num).padStart(2, "0") : num}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleOk}
            className="text-xs px-6 font-semibold"
          >
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

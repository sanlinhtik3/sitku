import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle } from "lucide-react";
import { format, addMonths, subMonths, isSameMonth } from "date-fns";

interface MonthSelectorProps {
  selectedDate: Date;
  onMonthChange: (date: Date) => void;
  overdueCount?: number;
}

export function MonthSelector({ selectedDate, onMonthChange, overdueCount = 0 }: MonthSelectorProps) {
  const now = new Date();
  const isCurrentMonth = isSameMonth(selectedDate, now);
  const isFutureMonth = selectedDate > now && !isCurrentMonth;

  const handlePrevMonth = () => {
    onMonthChange(subMonths(selectedDate, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(selectedDate, 1));
  };

  const handleToday = () => {
    onMonthChange(new Date());
  };

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg">
      {/* Navigation Arrows */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevMonth}
        className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-primary/20 hover:text-primary"
      >
        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>

      {/* Month Display */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-primary/10 border border-primary/30 rounded-md min-w-[120px] sm:min-w-[140px] justify-center">
        <Calendar className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-xs sm:text-sm">
          {format(selectedDate, "MMMM yyyy")}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNextMonth}
        disabled={isFutureMonth}
        className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-primary/20 hover:text-primary disabled:opacity-50"
      >
        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>

      {/* Today Button */}
      {!isCurrentMonth && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleToday}
          className="h-7 sm:h-8 text-xs border-primary/30 hover:border-primary/50 hover:bg-primary/10"
        >
          <Calendar className="h-3 w-3 mr-1" />
          Today
        </Button>
      )}

      {/* Overdue Indicator */}
      {isCurrentMonth && overdueCount > 0 && (
        <Badge 
          variant="outline" 
          className="bg-destructive/10 text-destructive border-destructive/30 animate-pulse"
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          {overdueCount} Overdue
        </Badge>
      )}

      {/* Current Month Indicator */}
      {isCurrentMonth && (
        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
          Current
        </Badge>
      )}
    </div>
  );
}

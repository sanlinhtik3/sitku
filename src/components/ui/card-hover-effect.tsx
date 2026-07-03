import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { LucideIcon } from "lucide-react";
import { useState } from "react";

export const HoverEffect = ({
  items,
  className,
}: {
  items: {
    icon: LucideIcon;
    title: string;
    description: string;
  }[];
  className?: string;
}) => {
  let [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 py-4 sm:py-6 lg:py-10",
        className
      )}
    >
      {items.map((item, idx) => (
        <div
          key={idx}
          className="relative group block p-1.5 sm:p-2 h-full w-full"
          onMouseEnter={() => setHoveredIndex(idx)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === idx && (
              <motion.span
                className="absolute inset-0 h-full w-full bg-primary/10 dark:bg-primary/5 block rounded-2xl sm:rounded-3xl"
                layoutId="hoverBackground"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: 0.15 },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.15, delay: 0.2 },
                }}
              />
            )}
          </AnimatePresence>
          <Card>
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors mb-2 sm:mb-4">
              <item.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <CardTitle>{item.title}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </Card>
        </div>
      ))}
    </div>
  );
};

export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "rounded-xl sm:rounded-2xl h-full w-full p-3 sm:p-4 overflow-hidden bg-card border border-border group-hover:border-primary/30 relative z-20 transition-all",
        className
      )}
    >
      <div className="relative z-50">
        <div className="p-2 sm:p-4">{children}</div>
      </div>
    </div>
  );
};

export const CardTitle = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <h4 className={cn("text-foreground font-bold tracking-wide mt-2 sm:mt-4 text-sm sm:text-base", className)}>
      {children}
    </h4>
  );
};

export const CardDescription = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <p
      className={cn(
        "mt-2 sm:mt-4 lg:mt-6 text-muted-foreground tracking-wide leading-relaxed text-xs sm:text-sm",
        className
      )}
    >
      {children}
    </p>
  );
};

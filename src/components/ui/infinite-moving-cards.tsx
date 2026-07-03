"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";

export const InfiniteMovingCards = ({
  items,
  direction = "left",
  speed = "fast",
  pauseOnHover = true,
  className,
}: {
  items: {
    quote: string;
    name: string;
    title: string;
  }[];
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLUListElement>(null);

  useEffect(() => {
    addAnimation();
  }, []);
  
  const [start, setStart] = useState(false);
  
  function addAnimation() {
    if (containerRef.current && scrollerRef.current) {
      const scrollerContent = Array.from(scrollerRef.current.children);
      scrollerContent.forEach((item) => {
        const duplicatedItem = item.cloneNode(true);
        if (scrollerRef.current) {
          scrollerRef.current.appendChild(duplicatedItem);
        }
      });
      getDirection();
      getSpeed();
      setStart(true);
    }
  }
  
  const getDirection = () => {
    if (containerRef.current) {
      containerRef.current.style.setProperty(
        "--animation-direction",
        direction === "left" ? "forwards" : "reverse",
      );
    }
  };
  
  const getSpeed = () => {
    if (containerRef.current) {
      const dur = speed === "fast" ? "20s" : speed === "normal" ? "40s" : "80s";
      containerRef.current.style.setProperty("--animation-duration", dur);
    }
  };

  // Get avatar initial and a deterministic color
  const getInitial = (name: string) => name.charAt(0).toUpperCase();
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "scroller relative z-20 max-w-7xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]",
        className,
      )}
    >
      <ul
        ref={scrollerRef}
        className={cn(
          "flex w-max min-w-full shrink-0 flex-nowrap gap-3 sm:gap-4 py-2 will-change-transform",
          start && "animate-scroll",
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
      >
        {items.map((item, idx) => (
          <li
            className="relative w-[240px] sm:w-[280px] md:w-[340px] max-w-full shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-4 py-3 sm:px-5 sm:py-4 shadow-[0_0_15px_hsl(var(--primary)/0.05)] hover:shadow-[0_0_25px_hsl(var(--primary)/0.1)] transition-shadow"
            key={`${item.name}-${idx}`}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs sm:text-sm font-bold text-primary">
                  {getInitial(item.name)}
                </span>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-[13px] leading-relaxed text-muted-foreground mb-2">
                  "{item.quote}"
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{item.name}</span>
                  <span className="text-[11px] sm:text-xs font-medium text-primary">{item.title}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

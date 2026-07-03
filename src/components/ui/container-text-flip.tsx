"use client";

import React, { useState, useEffect, useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ContainerTextFlipProps {
  /** Array of words to cycle through in the animation */
  words?: string[];
  /** Time in milliseconds between word transitions */
  interval?: number;
  /** Additional CSS classes to apply to the container */
  className?: string;
  /** Additional CSS classes to apply to the text */
  textClassName?: string;
  /** Duration of the transition animation in milliseconds */
  animationDuration?: number;
}

export function ContainerTextFlip({
  words = ["AI Content", "Crypto", "Finance", "Knowledge"],
  interval = 2500,
  className,
  textClassName,
  animationDuration = 700,
}: ContainerTextFlipProps) {
  const id = useId();
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [width, setWidth] = useState(100);
  const textRef = React.useRef<HTMLDivElement>(null);

  const updateWidthForWord = () => {
    if (textRef.current) {
      const textWidth = textRef.current.scrollWidth + 40;
      setWidth(textWidth);
    }
  };

  useEffect(() => {
    updateWidthForWord();
  }, [currentWordIndex]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, interval);

    return () => clearInterval(intervalId);
  }, [words, interval]);

  return (
    <motion.span
      layout
      layoutId={`words-here-${id}`}
      animate={{ width }}
      transition={{ duration: animationDuration / 2000 }}
      className={cn(
        // Base styling
        "relative inline-flex items-center justify-center",
        "rounded-xl px-4 py-2 sm:px-6 sm:py-3",
        "text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold",
        
        // Glassmorphism background
        "bg-gradient-to-b from-primary/20 to-secondary/10",
        "backdrop-blur-sm",
        
        // Border with glow
        "border border-primary/30",
        
        // Neon glow effect
        "shadow-[0_0_30px_hsl(var(--primary)/0.3)]",
        
        className
      )}
      key={words[currentWordIndex]}
    >
      <motion.span
        transition={{
          duration: animationDuration / 1000,
          ease: "easeInOut",
        }}
        className={cn("inline-block whitespace-nowrap", textClassName)}
        ref={textRef}
        layoutId={`word-div-${words[currentWordIndex]}-${id}`}
      >
        <motion.span className="inline-block">
          {words[currentWordIndex].split("").map((letter, index) => (
            <motion.span
              key={index}
              initial={{
                opacity: 0,
                filter: "blur(10px)",
              }}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
              }}
              transition={{
                delay: index * 0.03,
              }}
              className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent"
            >
              {letter === " " ? "\u00A0" : letter}
            </motion.span>
          ))}
        </motion.span>
      </motion.span>
    </motion.span>
  );
}

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline",
        hero: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-[0_0_20px_rgba(66,153,225,0.5)] hover:shadow-[0_0_30px_rgba(66,153,225,0.7)] transition-all",
        "ghost-light": "border border-primary/30 text-foreground hover:bg-primary/10 hover:border-primary/50 active:bg-primary/20 backdrop-blur-sm",
      },
      size: {
        default: "h-11 sm:h-10 px-4 py-2 min-h-[44px] sm:min-h-[40px]",
        sm: "h-10 sm:h-9 rounded-md px-3 min-h-[40px] sm:min-h-[36px]",
        lg: "h-12 sm:h-11 rounded-md px-8 min-h-[48px] sm:min-h-[44px]",
        icon: "h-11 w-11 sm:h-10 sm:w-10 min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

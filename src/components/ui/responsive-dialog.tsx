import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * ResponsiveDialog — bottom sheet on mobile, centered modal on desktop.
 *
 * Public API matches Radix Dialog so callers can swap `Dialog` → `ResponsiveDialog`
 * without further changes. On mobile (<768px) we render a vaul Drawer with a
 * drag-handle and safe-area-aware bottom padding. On desktop we render the
 * existing Radix Dialog unchanged.
 *
 * Why: every modal in the app currently uses centered Dialog, which feels web-y
 * on phones. A drag-to-dismiss sheet is the native iOS/Android pattern.
 */

type ResponsiveDialogContextValue = { isMobile: boolean };

const ResponsiveDialogContext = React.createContext<ResponsiveDialogContextValue | null>(null);

function useResponsive() {
  const ctx = React.useContext(ResponsiveDialogContext);
  if (!ctx) throw new Error("ResponsiveDialog.* must be rendered inside <ResponsiveDialog>");
  return ctx;
}

interface ResponsiveDialogRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveDialog({ open, defaultOpen, onOpenChange, children }: ResponsiveDialogRootProps) {
  const isMobile = useIsMobile();

  return (
    <ResponsiveDialogContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <Drawer open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      ) : (
        <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </ResponsiveDialogContext.Provider>
  );
}

export function ResponsiveDialogTrigger(props: React.ComponentProps<typeof DialogTrigger>) {
  const { isMobile } = useResponsive();
  return isMobile ? <DrawerTrigger {...props} /> : <DialogTrigger {...props} />;
}

interface ResponsiveDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum height for the mobile drawer expressed as a viewport percentage. Default: 92%. */
  mobileMaxHeight?: string;
  /** Hide the close button on the desktop dialog (drawer never has one). */
  hideCloseButton?: boolean;
}

export const ResponsiveDialogContent = React.forwardRef<HTMLDivElement, ResponsiveDialogContentProps>(
  ({ className, children, mobileMaxHeight = "92dvh", hideCloseButton, ...props }, ref) => {
    const { isMobile } = useResponsive();

    if (isMobile) {
      return (
        <DrawerContent
          ref={ref}
          className={cn(
            "max-h-[var(--rd-mh)] flex flex-col",
            // Native sheet: rounded top, contained scroll, momentum on iOS, safe-area-aware bottom.
            "overscroll-contain",
            className,
          )}
          style={{ ["--rd-mh" as keyof React.CSSProperties]: mobileMaxHeight } as React.CSSProperties}
          {...props}
        >
          <div
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
          >
            {children}
          </div>
        </DrawerContent>
      );
    }

    return (
      <DialogContent ref={ref} className={className} hideCloseButton={hideCloseButton} {...props}>
        {children}
      </DialogContent>
    );
  },
);
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

export function ResponsiveDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = useResponsive();
  return isMobile ? (
    <DrawerHeader className={className} {...props} />
  ) : (
    <DialogHeader className={className} {...props} />
  );
}

export function ResponsiveDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { isMobile } = useResponsive();
  return isMobile ? (
    <DrawerFooter className={className} {...props} />
  ) : (
    <DialogFooter className={className} {...props} />
  );
}

export const ResponsiveDialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    const { isMobile } = useResponsive();
    return isMobile ? (
      <DrawerTitle ref={ref} className={className} {...props} />
    ) : (
      <DialogTitle ref={ref} className={className} {...props} />
    );
  },
);
ResponsiveDialogTitle.displayName = "ResponsiveDialogTitle";

export const ResponsiveDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsive();
  return isMobile ? (
    <DrawerDescription ref={ref} className={className} {...props} />
  ) : (
    <DialogDescription ref={ref} className={className} {...props} />
  );
});
ResponsiveDialogDescription.displayName = "ResponsiveDialogDescription";

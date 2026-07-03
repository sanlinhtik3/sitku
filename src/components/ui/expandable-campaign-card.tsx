import React, { useEffect, useRef, useState, useCallback } from "react";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { format, differenceInDays } from "date-fns";
import { ExternalLink, X, Gift, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  campaign_url: string;
  is_active: boolean;
  expires_at: string | null;
  display_order: number;
}

interface ExpandableCampaignCardProps {
  campaigns: Campaign[];
}

export function ExpandableCampaignCard({ campaigns }: ExpandableCampaignCardProps) {
  const [active, setActive] = useState<Campaign | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }

    if (active) {
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      document.body.style.overflow = "auto";
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [active]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setActive(null), 200);
  }, []);

  useOutsideClick(ref, handleClose);

  const getExcerpt = (text: string | null, maxLength: number = 80) => {
    if (!text) return "Claim your exclusive reward now!";
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  const getExpiryStatus = (expiresAt: string | null) => {
    if (!expiresAt) return { text: "Active", color: "bg-emerald-500/20 text-emerald-400" };
    const daysLeft = differenceInDays(new Date(expiresAt), new Date());
    if (daysLeft <= 0) return { text: "Expired", color: "bg-destructive/20 text-destructive" };
    if (daysLeft <= 3) return { text: `${daysLeft}d left`, color: "bg-amber-500/20 text-amber-400" };
    if (daysLeft <= 7) return { text: `${daysLeft}d left`, color: "bg-primary/20 text-primary" };
    return { text: "Active", color: "bg-emerald-500/20 text-emerald-400" };
  };

  const handleClaimReward = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    handleClose();
  };

  return (
    <>
      {/* Overlay */}
      {active && (
        <div
          className={cn(
            "fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-200",
            isVisible ? "opacity-100" : "opacity-0"
          )}
          onClick={handleClose}
        />
      )}

      {/* Expanded Modal */}
      {active && (
        <div className="fixed inset-0 grid place-items-center z-[100] p-4">
          <button
            className={cn(
              "flex absolute top-4 right-4 lg:hidden items-center justify-center bg-primary rounded-full h-8 w-8 z-10 transition-opacity duration-200",
              isVisible ? "opacity-100" : "opacity-0"
            )}
            onClick={handleClose}
          >
            <X className="h-4 w-4 text-primary-foreground" />
          </button>

          <div
            ref={ref}
            className={cn(
              "w-full max-w-[95vw] sm:max-w-[600px] h-fit max-h-[85vh] flex flex-col bg-card/95 backdrop-blur-md border border-primary/20 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,255,200,0.1)] transition-all duration-200",
              isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
            )}
          >
            <img
              src={active.thumbnail_url || "/placeholder.svg"}
              alt={active.title}
              className="w-full h-40 sm:h-52 lg:h-80 rounded-t-2xl sm:rounded-t-3xl object-cover"
            />

            <div className="flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between items-start p-3 sm:p-4 lg:p-6 gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full ${getExpiryStatus(active.expires_at).color}`}>
                      <Clock className="h-3 w-3" />
                      {getExpiryStatus(active.expires_at).text}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm sm:text-base lg:text-lg text-foreground line-clamp-2">
                    {active.title}
                  </h3>
                  {active.expires_at && (
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                      Expires: {format(new Date(active.expires_at), "MMM dd, yyyy")}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleClaimReward(active.campaign_url)}
                  className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-full font-semibold bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-0 shadow-lg shadow-primary/25"
                >
                  <Gift className="h-3 w-3 sm:h-4 sm:w-4" />
                  Claim Reward
                  <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                </button>
              </div>

              <div className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4">
                <div className="text-muted-foreground text-xs sm:text-sm leading-relaxed max-h-24 sm:max-h-32 md:max-h-40 overflow-auto [mask:linear-gradient(to_bottom,white,white,transparent)] [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]">
                  <p>{active.description || "Register now and claim your exclusive reward! Limited time offer."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact List View */}
      <ul className="max-w-2xl mx-auto w-full space-y-1">
        {campaigns.map((campaign) => {
          const status = getExpiryStatus(campaign.expires_at);
          return (
            <li
              key={campaign.id}
              onClick={() => setActive(campaign)}
              className="p-4 flex flex-row justify-between items-center hover:bg-muted/50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="flex gap-4 items-center">
                <img
                  src={campaign.thumbnail_url || "/placeholder.svg"}
                  alt={campaign.title}
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <div>
                  <h3 className="font-medium text-foreground text-left">
                    {campaign.title}
                  </h3>
                  <p className="text-muted-foreground text-sm text-left line-clamp-1">
                    {getExcerpt(campaign.description)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>
                  {status.text}
                </span>
                <button className="px-4 py-2 text-sm rounded-full font-medium bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5">
                  <Gift className="h-4 w-4" />
                  Claim
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default ExpandableCampaignCard;

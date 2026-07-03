import React, { useEffect, useId, useRef, useState, useCallback } from "react";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { format } from "date-fns";
import { ArrowRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Post {
  id: string;
  title: string;
  slug: string;
  thumbnail_url: string | null;
  content_html: string | null;
  published_at: string | null;
  created_at: string | null;
  category?: {
    name: string;
    slug: string;
  } | null;
}

interface ExpandablePostCardProps {
  posts: Post[];
}

export function ExpandablePostCard({ posts }: ExpandablePostCardProps) {
  const [active, setActive] = useState<Post | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

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

  const getExcerpt = (html: string | null, maxLength: number = 150) => {
    if (!html) return "No description available";
    const text = html.replace(/<[^>]*>/g, "");
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "MMM dd, yyyy");
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
                  {active.category && (
                    <span className="inline-block px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-medium bg-primary/20 text-primary rounded-full mb-1.5 sm:mb-2">
                      {active.category.name}
                    </span>
                  )}
                  <h3 className="font-bold text-sm sm:text-base lg:text-lg text-foreground line-clamp-2">
                    {active.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                    {formatDate(active.published_at || active.created_at)}
                  </p>
                </div>

                <Link
                  to={`/learn/${active.slug}`}
                  onClick={handleClose}
                  className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-full font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-0"
                >
                  Read More
                  <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Link>
              </div>

              <div className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4">
                <div className="text-muted-foreground text-xs sm:text-sm leading-relaxed max-h-24 sm:max-h-32 md:max-h-40 overflow-auto [mask:linear-gradient(to_bottom,white,white,transparent)] [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]">
                  <p>{getExcerpt(active.content_html, 500)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact List View */}
      <ul className="max-w-2xl mx-auto w-full space-y-1">
        {posts.map((post) => (
          <li
            key={post.id}
            onClick={() => setActive(post)}
            className="p-4 flex flex-row justify-between items-center hover:bg-muted/50 rounded-xl cursor-pointer transition-colors"
          >
            <div className="flex gap-4 items-center">
              <img
                src={post.thumbnail_url || "/placeholder.svg"}
                alt={post.title}
                className="h-14 w-14 rounded-lg object-cover"
              />
              <div>
                <h3 className="font-medium text-foreground text-left">
                  {post.title}
                </h3>
                <p className="text-muted-foreground text-sm text-left">
                  {post.category?.name || formatDate(post.published_at || post.created_at)}
                </p>
              </div>
            </div>
            <button className="px-5 py-2 text-sm rounded-full font-medium bg-muted hover:bg-primary hover:text-primary-foreground text-foreground transition-colors">
              Read
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default ExpandablePostCard;

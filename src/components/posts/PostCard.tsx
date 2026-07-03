import { memo, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Share2, Check } from "lucide-react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PostAuthor {
  full_name: string | null;
  avatar_url: string | null;
}

interface PostCategory {
  name: string;
  slug: string;
}

interface Post {
  id: string;
  title: string;
  slug: string;
  type: string;
  content_html: string;
  thumbnail_url: string | null;
  view_count: number;
  created_at: string;
  author?: PostAuthor | null;
  category?: PostCategory | null;
  author_role?: string;
}

interface PostCardProps {
  post: Post;
}

const getRoleLabel = (role?: string) => {
  switch (role) {
    case "admin":
      return "Admin";
    case "moderator":
      return "Moderator";
    case "creator":
      return "Creator";
    default:
      return "User";
  }
};

const getExcerpt = (html: string) => {
  const text = html.replace(/<[^>]*>/g, "");
  return text.length > 100 ? text.substring(0, 100) + "..." : text;
};

export const PostCard = memo(({ post }: PostCardProps) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Memoize derived values
  const excerpt = useMemo(() => getExcerpt(post.content_html), [post.content_html]);
  const authorName = useMemo(() => post.author?.full_name || "Anonymous", [post.author?.full_name]);
  const authorInitial = useMemo(() => authorName.charAt(0).toUpperCase(), [authorName]);
  const categoryName = useMemo(() => post.category?.name || post.type, [post.category?.name, post.type]);
  const postUrl = useMemo(() => `${window.location.origin}/learn/${post.slug}`, [post.slug]);

  // Memoize click handler
  const handleCardClick = useCallback(() => {
    navigate(`/learn/${post.slug}`);
  }, [navigate, post.slug]);

  // Memoize share handler
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.title,
          url: postUrl
        });
        toast.success("Shared successfully!");
      } else {
        await navigator.clipboard.writeText(postUrl);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      try {
        await navigator.clipboard.writeText(postUrl);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Failed to copy link");
      }
    }
  }, [post.title, postUrl]);

  return (
    <article 
      className="cursor-pointer hover:shadow-xl hover:shadow-primary/20 transition-all duration-300 hover:-translate-y-2 overflow-hidden group rounded-xl sm:rounded-2xl backdrop-blur-sm" 
      onClick={handleCardClick}
      style={{ willChange: 'transform, box-shadow' }}
    >
      {/* Thumbnail */}
      <div className="pb-2 sm:pb-3 pb-0">
        <div className="aspect-video overflow-hidden rounded-lg sm:rounded-xl">
          {post.thumbnail_url ? (
            <OptimizedImage 
              src={post.thumbnail_url} 
              alt={post.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" 
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <span className="text-2xl sm:text-4xl font-bold text-primary/30">{post.title.charAt(0)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pb-3 sm:pb-4 space-y-2 sm:space-y-3">
        {/* Category Badge */}
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px] sm:text-xs font-medium uppercase tracking-wide">
          {categoryName}
        </Badge>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-semibold line-clamp-2 group-hover:text-primary transition-colors leading-tight">
          {post.title}
        </h3>

        {/* Excerpt */}
        <p className="text-muted-foreground text-xs sm:text-sm line-clamp-2 leading-relaxed">{excerpt}</p>

        {/* Footer: Author & Actions */}
        <div className="flex items-center justify-between pt-2 sm:pt-3 border-t border-border/30">
          {/* Author Info */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-border/50">
              <AvatarImage src={post.author?.avatar_url || undefined} alt={authorName} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm font-medium">
                {authorInitial}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-medium text-foreground line-clamp-1">{authorName}</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">{getRoleLabel(post.author_role)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {post.view_count}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 hover:bg-primary/10" onClick={handleShare}>
              {copied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" /> : <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
});

PostCard.displayName = 'PostCard';

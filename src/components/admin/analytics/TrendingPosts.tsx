import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, MousePointerClick, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEngagement } from "@/lib/analytics";

interface TrendingPost {
  id: string;
  title: string;
  thumbnail_url: string | null;
  slug: string;
  viewsInPeriod: number;
  engagements: number;
}

export const TrendingPosts = ({ timeRange }: { timeRange: 7 | 14 | 28 | 90 }) => {
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTrendingPosts();
  }, [timeRange]);

  const fetchTrendingPosts = async () => {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - timeRange);

      // Get published posts
      const { data: posts } = await supabase
        .from("posts")
        .select("id, title, thumbnail_url, slug, view_count")
        .eq("is_published", true)
        .order("view_count", { ascending: false })
        .limit(10);

      if (!posts) return;

      // Get views and engagements for each post
      const postsWithMetrics = await Promise.all(
        posts.map(async (post) => {
          const [views, engagements] = await Promise.all([
            supabase
              .from("post_views")
              .select("id", { count: "exact" })
              .eq("post_id", post.id)
              .gte("viewed_at", daysAgo.toISOString()),
            supabase
              .from("post_engagements")
              .select("id", { count: "exact" })
              .eq("post_id", post.id)
              .gte("engaged_at", daysAgo.toISOString()),
          ]);

          return {
            ...post,
            viewsInPeriod: views.count || 0,
            engagements: engagements.count || 0,
          };
        })
      );

      // Sort by combined score
      postsWithMetrics.sort((a, b) => {
        const scoreA = a.viewsInPeriod + (a.engagements * 2);
        const scoreB = b.viewsInPeriod + (b.engagements * 2);
        return scoreB - scoreA;
      });

      setPosts(postsWithMetrics.slice(0, 5));
    } catch (error) {
      console.error("Error fetching trending posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = (post: TrendingPost) => {
    trackEngagement('post', post.id, 'click');
    navigate(`/posts/${post.slug}`);
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg">Trending Posts ({timeRange} Days)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="space-y-3 sm:space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 sm:h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="px-4 sm:px-6 pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <CardTitle className="text-base sm:text-lg">Trending Posts ({timeRange} Days)</CardTitle>
          <Button
            variant="ghost" 
            size="sm"
            className="w-full sm:w-auto h-11 sm:h-auto active:scale-95 transition-transform"
            onClick={() => navigate('/admin#posts')}
          >
            See All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="space-y-2 sm:space-y-3">
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No posts yet. Create your first post to see trends!
            </p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-3 border rounded-lg hover:bg-accent/50 active:bg-accent cursor-pointer transition-colors min-h-[72px] sm:min-h-0"
                onClick={() => handlePostClick(post)}
              >
                {post.thumbnail_url && (
                  <img
                    src={post.thumbnail_url}
                    alt={post.title}
                    className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm sm:text-base line-clamp-2">{post.title}</h4>
                  <div className="flex items-center gap-3 sm:gap-4 mt-1.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3 sm:h-3 sm:w-3" />
                      <span>{post.viewsInPeriod}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3 sm:h-3 sm:w-3" />
                      <span>{post.engagements}</span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

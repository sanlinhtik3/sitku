import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ExpandablePostCard } from "@/components/ui/expandable-post-card";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useInViewport } from "@/hooks/useInViewport";

const LatestPostsSection = () => {
  const { ref, isVisible } = useInViewport();

  const { data: posts, isLoading } = useQuery({
    queryKey: ["latest-posts-landing"],
    queryFn: async () => {
      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select("id, title, slug, thumbnail_url, content_html, published_at, created_at, category_id")
        .eq("is_published", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(3);

      if (postsError) throw postsError;
      if (!postsData || postsData.length === 0) return [];

      const categoryIds = postsData.map((p) => p.category_id).filter((id): id is string => id !== null);
      let categoriesMap: Record<string, { name: string; slug: string }> = {};
      
      if (categoryIds.length > 0) {
        const { data: categoriesData } = await supabase
          .from("post_categories")
          .select("id, name, slug")
          .in("id", categoryIds);

        if (categoriesData) {
          categoriesMap = categoriesData.reduce((acc, cat) => {
            acc[cat.id] = { name: cat.name, slug: cat.slug };
            return acc;
          }, {} as Record<string, { name: string; slug: string }>);
        }
      }

      return postsData.map((post) => ({
        ...post,
        category: post.category_id ? categoriesMap[post.category_id] || null : null,
      }));
    },
    enabled: isVisible,
    staleTime: 5 * 60 * 1000,
  });

  if (!isVisible) {
    return <div ref={ref} className="min-h-[300px]" />;
  }

  if (isLoading) {
    return (
      <section ref={ref} className="py-16 lg:py-24 relative overflow-hidden section-elevated section-fade-top">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-8 sm:mb-10" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 bg-white/[0.03] backdrop-blur-lg rounded-2xl border border-white/[0.08]">
                <Skeleton className="h-40 w-full rounded-xl mb-3" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!posts || posts.length === 0) return null;

  return (
    <section ref={ref} className="py-16 lg:py-24 relative overflow-hidden section-elevated section-fade-top">
      <div className="absolute -bottom-20 right-1/4 w-[250px] h-[250px] bg-primary/[0.08] rounded-full blur-[100px] pointer-events-none" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-8 sm:mb-10">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
              <span className="text-primary mr-2">&gt;</span>
              Latest Posts
            </h2>
            <Link
              to="/learn"
              className="group inline-flex items-center gap-1.5 text-xs sm:text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              View All
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </ScrollReveal>
        
        <ScrollReveal delay={0.2}>
          <ExpandablePostCard posts={posts} />
        </ScrollReveal>
      </div>
    </section>
  );
};

export default LatestPostsSection;

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PublicLayout } from '@/layouts/PublicLayout';
import { PostCard } from '@/components/posts/PostCard';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, BookOpen } from 'lucide-react';
import { GlassmorphicCard, PageHeader } from '@/components/ui/FuturisticElements';
import { LoadingState, EmptyState } from '@/components/ui/LoadingState';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { usePageMeta } from '@/hooks/usePageMeta';

const POSTS_PER_PAGE = 9;

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
  published_at: string | null;
  author_id: string | null;
  category_id: string | null;
  author?: PostAuthor | null;
  category?: PostCategory | null;
  author_role?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function Learn() {
  usePageMeta({
    title: "Learn Crypto – ZOE CRYPTO Blog",
    description: "Read the latest articles, guides, and tutorials about cryptocurrency, blockchain, and digital finance.",
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Debounce search input (400ms delay)
  const debouncedSearch = useDebounce(searchInput, 400);

  // Memoize allCategories to prevent re-creation on every render
  const allCategories = useMemo(() => 
    [{ id: 'all', name: 'All', slug: 'all' }, ...categories],
    [categories]
  );

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('post_categories')
        .select('id, name, slug')
        .order('name');
      
      if (!error && data) {
        setCategories(data);
      }
    };
    loadCategories();
  }, []);

  // Memoize loadPosts function
  const loadPosts = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 0 : page;
      const from = currentPage * POSTS_PER_PAGE;
      const to = from + POSTS_PER_PAGE - 1;

      // Build base query
      let query = supabase
        .from('posts')
        .select('*', { count: 'exact' })
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .range(from, to);

      // Filter by category
      if (selectedCategory !== 'all') {
        const selectedCat = categories.find(c => c.slug === selectedCategory);
        if (selectedCat) {
          query = query.eq('category_id', selectedCat.id);
        }
      }

      if (debouncedSearch) {
        query = query.ilike('title', `%${debouncedSearch}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Get unique author and category IDs
      const authorIds = [...new Set((data || []).map(p => p.author_id).filter(Boolean))] as string[];
      const categoryIds = [...new Set((data || []).map(p => p.category_id).filter(Boolean))] as string[];

      // Fetch profiles, categories, and roles in PARALLEL using Promise.all
      const [profilesResult, categoriesResult, rolesResult] = await Promise.all([
        authorIds.length > 0 
          ? supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', authorIds)
          : Promise.resolve({ data: [] }),
        categoryIds.length > 0 
          ? supabase.from('post_categories').select('id, name, slug').in('id', categoryIds)
          : Promise.resolve({ data: [] }),
        authorIds.length > 0 
          ? supabase.from('user_roles').select('user_id, role').in('user_id', authorIds)
          : Promise.resolve({ data: [] })
      ]);

      // Build lookup maps
      const profilesMap: Record<string, PostAuthor> = (profilesResult.data || []).reduce((acc, p) => {
        acc[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        return acc;
      }, {} as Record<string, PostAuthor>);

      const categoriesMap: Record<string, PostCategory> = (categoriesResult.data || []).reduce((acc, c) => {
        acc[c.id] = { name: c.name, slug: c.slug };
        return acc;
      }, {} as Record<string, PostCategory>);

      const rolesMap: Record<string, string> = (rolesResult.data || []).reduce((acc, r) => {
        acc[r.user_id] = r.role;
        return acc;
      }, {} as Record<string, string>);

      // Transform data
      const postsWithDetails: Post[] = (data || []).map(post => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        type: post.type,
        content_html: post.content_html || '',
        thumbnail_url: post.thumbnail_url,
        view_count: post.view_count || 0,
        created_at: post.created_at || '',
        published_at: post.published_at,
        author_id: post.author_id,
        category_id: post.category_id,
        author: post.author_id ? profilesMap[post.author_id] || null : null,
        category: post.category_id ? categoriesMap[post.category_id] || null : null,
        author_role: post.author_id ? rolesMap[post.author_id] || 'user' : 'user'
      }));

      if (reset) {
        setPosts(postsWithDetails);
        setPage(0);
      } else {
        setPosts(prev => [...prev, ...postsWithDetails]);
      }

      setHasMore((data?.length || 0) === POSTS_PER_PAGE && (from + (data?.length || 0)) < (count || 0));
    } catch (error) {
      console.error('Error loading posts:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [page, selectedCategory, debouncedSearch, categories]);

  // Reset and reload when filters change
  useEffect(() => {
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setLoading(true);
    loadPosts(true);
  }, [selectedCategory, debouncedSearch]);

  const loadMorePosts = useCallback(() => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    setPage(prev => prev + 1);
  }, [loadingMore, hasMore]);

  useEffect(() => {
    if (page > 0) {
      loadPosts(false);
    }
  }, [page, loadPosts]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMorePosts();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading, loadMorePosts]);

  // Memoize category click handler
  const handleCategoryClick = useCallback((slug: string) => {
    setSelectedCategory(slug);
  }, []);

  // Memoize search input handler
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  }, []);

  return (
    <PublicLayout>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20 md:pb-8">
        {/* Header */}
        <PageHeader
          icon={BookOpen}
          title="Learn & Grow"
          subtitle="Explore educational content, tutorials, and guides"
        />

        {/* Category Tabs */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
          <div className="flex gap-1.5 sm:gap-2 min-w-max pb-2">
            {allCategories.map((category) => (
              <button
                key={category.slug}
                onClick={() => handleCategoryClick(category.slug)}
                className={cn(
                  "px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap",
                  selectedCategory === category.slug
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-border/50"
                )}
                style={{ willChange: 'background-color, color' }}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <GlassmorphicCard className="p-3 sm:p-4" glow>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <Input
              placeholder="Search posts..."
              value={searchInput}
              onChange={handleSearchChange}
              className="pl-9 sm:pl-10 h-9 sm:h-10 text-sm bg-background/50 border-primary/20 focus:border-primary/50"
            />
          </div>
        </GlassmorphicCard>

        {/* Posts Grid */}
        {loading ? (
          <LoadingState variant="post" count={9} columns={3} />
        ) : posts.length === 0 ? (
          <EmptyState 
            icon={<BookOpen className="h-12 w-12" />}
            title="No posts found"
            description={searchInput ? "Try adjusting your search terms" : "No posts available in this category yet."}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="mt-6">
                <LoadingState variant="post" count={3} columns={3} />
              </div>
            )}

            {/* Intersection observer target */}
            <div ref={observerTarget} className="h-10 mt-6" />

            {/* No more posts message */}
            {!hasMore && posts.length > 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No more posts to load</p>
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}

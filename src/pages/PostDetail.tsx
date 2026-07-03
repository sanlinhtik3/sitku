import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Linkedin, Twitter, Link2, Check, Clock, ImageOff, Sparkles } from 'lucide-react';
import { usePostViewTracking } from '@/hooks/useViewTracking';
import { GeminiContentViewer } from '@/components/ui/GeminiContentViewer';
import { usePageMeta, buildOgImageUrl } from '@/hooks/usePageMeta';
import { JsonLd, buildArticleSchema } from '@/components/SEO/JsonLd';

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
  summary: string | null;
  view_count: number;
  created_at: string;
  published_at: string | null;
  author_id: string | null;
  category_id: string | null;
  author?: PostAuthor | null;
  category?: PostCategory | null;
  author_role?: string;
}

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  thumbnail_url: string | null;
  content_html: string | null;
  published_at: string | null;
  created_at: string;
}

const getRoleLabel = (role?: string) => {
  switch (role) {
    case 'admin': return 'Admin';
    case 'creator': return 'Creator';
    case 'learner': return 'User';
    default: return 'User';
  }
};

const calculateReadingTime = (content: string | null): number => {
  if (!content) return 1;
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / 200));
};

const getExcerpt = (html: string | null, maxLength: number = 100): string => {
  if (!html) return '';
  const text = html.replace(/<[^>]*>/g, '');
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

export default function PostDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  usePostViewTracking(post?.id);

  // Dynamic SEO metadata
  const pageMeta = useMemo(() => {
    if (!post) return {};
    const excerpt = post.summary || post.content_html?.replace(/<[^>]*>/g, '').substring(0, 155) || '';
    return {
      title: `${post.title} | ZOE CRYPTO`,
      description: excerpt,
      ogImage: post.thumbnail_url || buildOgImageUrl(post.title, post.author?.full_name || undefined, 'post'),
      ogType: 'article',
    };
  }, [post]);
  usePageMeta(pageMeta);

  const articleSchema = useMemo(() => {
    if (!post) return null;
    return buildArticleSchema({
      title: post.title,
      slug: post.slug,
      summary: post.summary,
      thumbnail_url: post.thumbnail_url,
      published_at: post.published_at,
      created_at: post.created_at,
      author_name: post.author?.full_name,
    });
  }, [post]);

  useEffect(() => {
    if (slug) {
      loadPost();
    }
  }, [slug]);

  const loadPost = async () => {
    try {
      setLoading(true);
      
      // Step 1: Fetch post only (no joins - avoids PGRST200 error)
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (postError) throw postError;

      if (!postData) {
        toast.error('Post not found');
        navigate('/learn');
        return;
      }

      // Step 2: Fetch author profile separately
      let author: PostAuthor | null = null;
      if (postData.author_id) {
        const { data: authorData } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('user_id', postData.author_id)
          .maybeSingle();
        author = authorData;
      }

      // Step 3: Fetch category separately
      let category: PostCategory | null = null;
      if (postData.category_id) {
        const { data: categoryData } = await supabase
          .from('post_categories')
          .select('name, slug')
          .eq('id', postData.category_id)
          .maybeSingle();
        category = categoryData;
      }

      // Step 4: Fetch author role
      let authorRole = 'learner';
      if (postData.author_id) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', postData.author_id)
          .maybeSingle();
        if (roleData) {
          authorRole = roleData.role;
        }
      }

      // Step 5: Combine data in-memory
      setPost({
        ...postData,
        author,
        category,
        author_role: authorRole
      });

      // Fetch related posts (excluding current post)
      const { data: related } = await supabase
        .from('posts')
        .select('id, title, slug, thumbnail_url, content_html, published_at, created_at')
        .eq('is_published', true)
        .neq('id', postData.id)
        .order('published_at', { ascending: false })
        .limit(4);

      if (related) {
        setRelatedPosts(related);
      }
    } catch (error) {
      console.error('Error loading post:', error);
      toast.error('Post not found');
      navigate('/learn');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const title = post?.title || '';

    switch (platform) {
      case 'linkedin':
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
        break;
      case 'copy':
        navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success('Link copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
        break;
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <main className="flex-1 flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col gap-3 w-48">
            <div className="h-3 rounded-md bg-muted/30 animate-pulse" />
            <div className="h-3 rounded-md bg-muted/30 animate-pulse w-4/5" />
            <div className="h-3 rounded-md bg-muted/30 animate-pulse w-3/5" />
          </div>
        </main>
      </PublicLayout>
    );
  }

  if (!post) {
    return null;
  }

  const readingTime = calculateReadingTime(post.content_html);
  const formattedDate = new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).toUpperCase();

  return (
    <PublicLayout>
      {articleSchema && <JsonLd data={articleSchema} />}
      <main className="flex-1 pb-20 md:pb-8">
        <div className="container mx-auto px-4 py-6 sm:py-8 max-w-6xl">
          {/* Back Link */}
          <Link 
            to="/learn" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6 sm:mb-8 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>All articles</span>
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 lg:gap-12">
            {/* Main Content Column */}
            <div className="space-y-5 sm:space-y-6">
              {/* Category & Reading Time Header */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {post.category && (
                  <Badge className="bg-primary text-primary-foreground border-0 font-semibold px-3 py-1 text-xs uppercase tracking-wider">
                    {post.category.name}
                  </Badge>
                )}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="uppercase tracking-wider text-xs font-medium">
                    {readingTime} MINUTE{readingTime > 1 ? 'S' : ''} READ
                  </span>
                </div>
              </div>

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold leading-tight">
                {post.title}
              </h1>

              {/* Date */}
              <p className="text-muted-foreground text-xs sm:text-sm uppercase tracking-wider font-medium">
                {formattedDate}
              </p>

              {/* Mobile Author & Share Section */}
              <div className="lg:hidden bg-card/50 backdrop-blur-sm rounded-xl p-4 border border-border/30">
                <div className="flex items-center justify-between gap-4">
                  {/* Author */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 ring-2 ring-primary/20">
                      <AvatarImage src={post.author?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                        {post.author?.full_name?.charAt(0) || 'A'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm">{post.author?.full_name || 'Anonymous'}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(post.author_role)}</p>
                    </div>
                  </div>

                  {/* Share Buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary"
                      onClick={() => handleShare('linkedin')}
                    >
                      <Linkedin className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary"
                      onClick={() => handleShare('twitter')}
                    >
                      <Twitter className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary"
                      onClick={() => handleShare('copy')}
                    >
                      {copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Thumbnail */}
              {post.thumbnail_url && (
                <div className="rounded-xl sm:rounded-2xl overflow-hidden shadow-lg">
                  <img
                    src={post.thumbnail_url}
                    alt={post.title}
                    className="w-full h-auto object-cover"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                  />
                </div>
              )}

              {/* Summary Section - Only shows if summary exists */}
              {post.summary && (
                <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/40 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary uppercase tracking-wider">
                      SUMMARY
                    </span>
                  </div>
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {post.summary}
                  </p>
                </div>
              )}

              {/* Content */}
              <div className="pt-6 sm:pt-8">
                <GeminiContentViewer 
                  content={post.content_html} 
                  type="html" 
                />
              </div>

              {/* More Blog Posts Section */}
              {relatedPosts.length > 0 && (
                <div className="border-t border-border/30 pt-10 sm:pt-12 mt-10 sm:mt-12">
                  <h2 className="text-xl sm:text-2xl font-bold mb-6 sm:mb-8">More blog posts to read</h2>
                  
                  {/* Desktop: Horizontal Cards (2 columns) */}
                  <div className="hidden md:grid md:grid-cols-2 gap-5">
                    {relatedPosts.map((relatedPost) => (
                      <Link
                        key={relatedPost.id}
                        to={`/learn/${relatedPost.slug}`}
                        className="group flex gap-4 p-3 rounded-xl hover:bg-card/50 transition-all duration-300"
                      >
                        {/* Thumbnail */}
                        <div className="shrink-0 w-32 h-24 rounded-lg overflow-hidden bg-muted/30">
                          {relatedPost.thumbnail_url ? (
                            <img
                              src={relatedPost.thumbnail_url}
                              alt={relatedPost.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/50 to-muted/30">
                              <ImageOff className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        {/* Text Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {relatedPost.title}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {getExcerpt(relatedPost.content_html, 80)}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {new Date(relatedPost.published_at || relatedPost.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {/* Mobile: Vertical Cards (1 column) */}
                  <div className="md:hidden grid grid-cols-1 gap-5">
                    {relatedPosts.map((relatedPost) => (
                      <Link
                        key={relatedPost.id}
                        to={`/learn/${relatedPost.slug}`}
                        className="group block space-y-3"
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video rounded-xl overflow-hidden bg-muted/30">
                          {relatedPost.thumbnail_url ? (
                            <img
                              src={relatedPost.thumbnail_url}
                              alt={relatedPost.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/50 to-muted/30">
                              <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        {/* Title */}
                        <h3 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                          {relatedPost.title}
                        </h3>
                        {/* Excerpt */}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {getExcerpt(relatedPost.content_html, 100)}
                        </p>
                        {/* Date */}
                        <p className="text-xs text-muted-foreground/70">
                          {new Date(relatedPost.published_at || relatedPost.created_at).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden lg:block">
              <div className="sticky top-8 space-y-6">
                {/* Author Card */}
                <div className="space-y-4">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                    <AvatarImage src={post.author?.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">
                      {post.author?.full_name?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-lg">{post.author?.full_name || 'Anonymous'}</p>
                    <p className="text-sm text-muted-foreground">{getRoleLabel(post.author_role)}</p>
                  </div>
                </div>

                {/* Share Section */}
                <div className="space-y-4 pt-6 border-t border-border/20">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                    SHARE THIS ARTICLE
                  </p>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-10 w-10 rounded-lg border-border/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all"
                      onClick={() => handleShare('linkedin')}
                    >
                      <Linkedin className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-10 w-10 rounded-lg border-border/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all"
                      onClick={() => handleShare('twitter')}
                    >
                      <Twitter className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-10 w-10 rounded-lg border-border/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all"
                      onClick={() => handleShare('copy')}
                    >
                      {copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}

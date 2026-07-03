import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Eye, Search, EyeOff, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { PostEditorDialog } from './PostEditorDialog';
import { PostAnalyticsDialog } from './PostAnalyticsDialog';

interface Post {
  id: string;
  title: string;
  slug: string;
  type: string;
  is_published: boolean;
  view_count: number;
  created_at: string;
  published_at: string | null;
}

const POSTS_PER_PAGE = 10;

export const AdminPosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'scheduled' | 'draft'>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsPostId, setAnalyticsPostId] = useState<string | null>(null);
  const [analyticsPostTitle, setAnalyticsPostTitle] = useState('');

  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadPosts();
  }, [searchQuery, currentPage, statusFilter]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const from = currentPage * POSTS_PER_PAGE;
      const to = from + POSTS_PER_PAGE - 1;

      let query = supabase
        .from('posts')
        .select('id, title, slug, type, is_published, view_count, created_at, published_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      // Apply status filter
      if (statusFilter === 'published') {
        query = query.eq('is_published', true);
      } else if (statusFilter === 'scheduled') {
        query = query.eq('is_published', false).not('published_at', 'is', null).gt('published_at', new Date().toISOString());
      } else if (statusFilter === 'draft') {
        query = query.eq('is_published', false).or('published_at.is.null,published_at.lte.' + new Date().toISOString());
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setPosts(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading posts:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Post deleted successfully');
      loadPosts();
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ 
          is_published: !currentStatus,
          published_at: !currentStatus ? new Date().toISOString() : null
        })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentStatus ? 'Post unpublished' : 'Post published');
      loadPosts();
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Failed to update post');
    }
  };

  const getPostStatus = (post: Post) => {
    if (post.is_published) {
      return { label: 'Published', variant: 'default' as const };
    }
    if (post.published_at && new Date(post.published_at) > new Date()) {
      return { label: 'Scheduled', variant: 'secondary' as const };
    }
    return { label: 'Draft', variant: 'outline' as const };
  };

  const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Posts Management</h2>
        <Button onClick={() => { setEditingPostId(null); setEditorOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Post
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts by title..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{totalCount} Total Posts</Badge>
      </div>

      {loading && (
        <div className="text-center py-8">Loading posts...</div>
      )}

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Publish Date</TableHead>
              <TableHead>Views</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No posts found. Create your first post!
                </TableCell>
              </TableRow>
            ) : (
              posts.map((post) => {
                const status = getPostStatus(post);
                return (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium">{post.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{post.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} className="gap-1">
                        {status.label === 'Scheduled' && <Clock className="h-3 w-3" />}
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {post.published_at ? (
                        <div className="text-sm">
                          <div>{format(new Date(post.published_at), 'PPP')}</div>
                          <div className="text-muted-foreground">{format(new Date(post.published_at), 'p')}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{post.view_count}</TableCell>
                    <TableCell>
                      {new Date(post.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAnalyticsPostId(post.id);
                            setAnalyticsPostTitle(post.title);
                            setAnalyticsOpen(true);
                          }}
                          title="View Analytics"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePublish(post.id, post.is_published)}
                          title={post.is_published ? 'Unpublish' : 'Publish Now'}
                        >
                          {post.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingPostId(post.id); setEditorOpen(true); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Post</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this post? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(post.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                className={currentPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  onClick={() => setCurrentPage(i)}
                  isActive={currentPage === i}
                  className="cursor-pointer"
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                className={currentPage === totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <PostEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        postId={editingPostId}
        onSuccess={loadPosts}
      />

      <PostAnalyticsDialog
        open={analyticsOpen}
        onOpenChange={setAnalyticsOpen}
        postId={analyticsPostId}
        postTitle={analyticsPostTitle}
      />
    </div>
  );
};
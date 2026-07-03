import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, Eye, CalendarIcon, Clock, FileText, Link2, Image, Tag, X, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ThumbnailUploader } from './ThumbnailUploader';

interface PostEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId?: string | null;
  onSuccess: () => void;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export const PostEditorDialog = ({ open, onOpenChange, postId, onSuccess }: PostEditorDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [content, setContent] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [summary, setSummary] = useState('');
  const oldThumbnailRef = useRef<string>('');

  useEffect(() => {
    if (open) {
      loadCategories();
      if (postId) {
        loadPost();
      } else {
        resetForm();
      }
    }
  }, [open, postId]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('post_categories')
        .select('id, name, slug')
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  useEffect(() => {
    if (title && !postId) {
      const generatedSlug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      setSlug(generatedSlug);
    }
  }, [title, postId]);

  const resetForm = () => {
    setTitle('');
    setSlug('');
    setCategoryId('');
    setContent('');
    setThumbnailUrl('');
    setExternalLink('');
    setSummary('');
    setIsPublished(false);
    setScheduledDate(undefined);
    setScheduledTime('12:00');
  };

  const loadPost = async () => {
    try {
      const { data, error } = await supabase.from('posts').select('*').eq('id', postId).single();
      if (error) throw error;
      if (data) {
        setTitle(data.title);
        setSlug(data.slug);
        setCategoryId(data.category_id || '');
        setContent(data.content_html || '');
        setThumbnailUrl(data.thumbnail_url || '');
        oldThumbnailRef.current = data.thumbnail_url || '';
        setExternalLink(data.external_link || '');
        setSummary(data.summary || '');
        setIsPublished(data.is_published);
        
        if (data.published_at && !data.is_published) {
          const scheduledDateTime = new Date(data.published_at);
          setScheduledDate(scheduledDateTime);
          setScheduledTime(format(scheduledDateTime, 'HH:mm'));
        }
      }
    } catch (error) {
      toast.error('Failed to load post');
    }
  };

  const handleSave = async (publish = false, schedule = false) => {
    if (!title.trim() || !slug.trim() || !content.trim()) {
      toast.error('Title, slug, and content are required');
      return;
    }
    
    if (schedule && !scheduledDate) {
      toast.error('Please select a date and time to schedule the post');
      return;
    }
    
    if (schedule && scheduledDate) {
      const [hours, minutes] = scheduledTime.split(':');
      const scheduleDateTime = new Date(scheduledDate);
      scheduleDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      if (scheduleDateTime <= new Date()) {
        toast.error('Scheduled time must be in the future');
        return;
      }
    }
    
    setLoading(true);
    try {
      const sanitizedContent = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'span', 'div'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
      });

      // Determine published_at based on context
      let publishedAt: string | null | undefined = undefined; // undefined = don't update
      
      if (postId) {
        // EXISTING POST: only set new timestamp if publishing for the first time
        if (publish && !isPublished) {
          // Was draft, now publishing for the first time
          publishedAt = new Date().toISOString();
        } else if (schedule && scheduledDate) {
          const [hours, minutes] = scheduledTime.split(':');
          const scheduleDateTime = new Date(scheduledDate);
          scheduleDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          publishedAt = scheduleDateTime.toISOString();
        }
        // Otherwise: keep existing published_at (don't include in update)
      } else {
        // NEW POST
        if (publish) {
          publishedAt = new Date().toISOString();
        } else if (schedule && scheduledDate) {
          const [hours, minutes] = scheduledTime.split(':');
          const scheduleDateTime = new Date(scheduledDate);
          scheduleDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          publishedAt = scheduleDateTime.toISOString();
        } else {
          publishedAt = null;
        }
      }

      // Clean up old thumbnail from storage if replaced
      if (oldThumbnailRef.current && oldThumbnailRef.current !== thumbnailUrl && oldThumbnailRef.current.includes('post-thumbnails')) {
        try {
          const url = new URL(oldThumbnailRef.current);
          const pathParts = url.pathname.split('/');
          const bucketIndex = pathParts.indexOf('post-thumbnails');
          if (bucketIndex !== -1) {
            const filePath = pathParts.slice(bucketIndex + 1).join('/');
            await supabase.storage.from('post-thumbnails').remove([filePath]);
          }
        } catch (e) {
          // Ignore storage cleanup errors
        }
      }

      const postData: Record<string, any> = {
        title,
        slug,
        category_id: categoryId || null,
        content: { html: sanitizedContent },
        content_html: sanitizedContent,
        thumbnail_url: thumbnailUrl || null,
        external_link: externalLink || null,
        summary: summary.trim() || null,
        is_published: publish,
        author_id: (await supabase.auth.getUser()).data.user?.id
      };

      // Only include published_at if it's being changed
      if (publishedAt !== undefined) {
        postData.published_at = publishedAt;
      }

      if (postId) {
        const { error } = await supabase.from('posts').update(postData).eq('id', postId);
        if (error) throw error;
        toast.success(schedule ? 'Post scheduled successfully' : 'Post updated successfully');
      } else {
        const { error } = await supabase.from('posts').insert([postData as any]);
        if (error) throw error;
        toast.success(schedule ? 'Post scheduled successfully' : 'Post created successfully');
      }
      
      // Reset the old thumbnail ref after successful save
      oldThumbnailRef.current = thumbnailUrl;
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save post');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === categoryId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:w-[90vw] sm:max-w-[700px] md:max-w-[850px] lg:max-w-[1100px] xl:max-w-[1300px] max-h-[95vh] sm:max-h-[92vh] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-primary/20 shadow-2xl shadow-primary/5">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border/40 bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  {postId ? 'Edit Post' : 'Create New Post'}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                  {postId ? 'Update your post content and settings' : 'Write and publish your new content'}
                </DialogDescription>
              </div>
            </div>
            {isPublished && (
              <Badge variant="default" className="bg-green-500/20 text-green-400 border border-green-500/30">
                Published
              </Badge>
            )}
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 h-[calc(95vh-160px)] sm:h-[calc(92vh-180px)]">
          <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Basic Information</span>
              </div>
              
              <div className="grid gap-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    id="title" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    placeholder="Enter an engaging post title..."
                    className="h-11 bg-muted/50 border-border/60 focus:border-primary/50 focus:ring-primary/20 transition-colors"
                  />
                </div>

                {/* Slug & Type Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="slug" className="text-sm font-medium">
                      URL Slug <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/posts/</span>
                      <Input 
                        id="slug" 
                        value={slug} 
                        onChange={e => setSlug(e.target.value)} 
                        placeholder="your-post-slug"
                        className="h-11 pl-16 bg-muted/50 border-border/60 focus:border-primary/50 focus:ring-primary/20 transition-colors font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-sm font-medium flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5" />
                      Category
                    </Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger 
                        id="category" 
                        className="h-11 bg-muted/50 border-border/60 focus:border-primary/50 focus:ring-primary/20"
                      >
                        <SelectValue placeholder="Select a category">
                          {selectedCategory && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                              {selectedCategory.name}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border/60">
                        {categories.length === 0 ? (
                          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                            No categories available
                          </div>
                        ) : (
                          categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                                {cat.name}
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Media & Links Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Image className="h-4 w-4" />
                <span>Media & Links</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Image className="h-3.5 w-3.5" />
                    Thumbnail
                  </Label>
                  <ThumbnailUploader
                    value={thumbnailUrl}
                    onChange={(url) => {
                      // If replacing, track old URL for cleanup
                      if (thumbnailUrl && thumbnailUrl !== url && thumbnailUrl.includes('post-thumbnails')) {
                        oldThumbnailRef.current = thumbnailUrl;
                      }
                      setThumbnailUrl(url);
                    }}
                    onDelete={(deletedUrl) => {
                      // Clear the ref since we just deleted it
                      if (oldThumbnailRef.current === deletedUrl) {
                        oldThumbnailRef.current = '';
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="external-link" className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" />
                    External Link
                    <span className="text-muted-foreground font-normal">(Optional)</span>
                  </Label>
                  <Input 
                    id="external-link" 
                    value={externalLink} 
                    onChange={e => setExternalLink(e.target.value)} 
                    placeholder="https://example.com"
                    className="h-11 bg-muted/50 border-border/60 focus:border-primary/50 focus:ring-primary/20 transition-colors"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Summary Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span>Post Summary</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary" className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Summary
                  <span className="text-muted-foreground font-normal">(Optional - displays below thumbnail)</span>
                </Label>
                <div className="relative">
                  <textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value.slice(0, 500))}
                    placeholder="Write a brief summary that appears below the thumbnail on the post detail page..."
                    rows={3}
                    className="w-full min-h-[100px] px-4 py-3 text-sm rounded-xl bg-muted/50 border border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors resize-none placeholder:text-muted-foreground/50"
                  />
                  <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                    {summary.length}/500
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Publishing Options Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Publishing Options</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Published Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/40">
                  <div className="space-y-0.5">
                    <Label htmlFor="published" className="text-sm font-medium cursor-pointer">
                      Publish Immediately
                    </Label>
                    <p className="text-xs text-muted-foreground">Make this post visible to everyone</p>
                  </div>
                  <Switch 
                    id="published" 
                    checked={isPublished} 
                    onCheckedChange={setIsPublished}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>

                {/* Schedule */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-3">
                  <Label className="text-sm font-medium">Schedule for Later</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 h-10 justify-start text-left font-normal bg-background/50 border-border/60 hover:bg-muted/50",
                            !scheduledDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduledDate ? format(scheduledDate, "MMM dd, yyyy") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-background border-border/60" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          initialFocus
                          disabled={(date) => date < new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                    
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-28 h-10 bg-background/50 border-border/60"
                    />
                  </div>
                  {scheduledDate && !isPublished && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                        <Clock className="h-3 w-3 mr-1" />
                        Scheduled: {format(scheduledDate, "MMM dd")} at {scheduledTime}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => setScheduledDate(undefined)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Content Editor Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>Content</span>
                  <span className="text-destructive">*</span>
                </div>
                <span className="text-xs text-muted-foreground">Rich text editor with formatting options</span>
              </div>
              <div className="rounded-xl border border-border/40 overflow-hidden bg-muted/20">
                <RichTextEditor content={content} onChange={setContent} />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-border/40">
              <Button 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto order-last sm:order-first text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              
              <div className="flex w-full sm:w-auto items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleSave(false, false)} 
                  disabled={loading} 
                  className="flex-1 sm:flex-none gap-2 border-border/60 hover:bg-muted/50"
                >
                  <Save className="h-4 w-4" />
                  <span className="hidden xs:inline">Save</span> Draft
                </Button>
                
                {scheduledDate && !isPublished && (
                  <Button 
                    variant="secondary" 
                    onClick={() => handleSave(false, true)} 
                    disabled={loading} 
                    className="flex-1 sm:flex-none gap-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
                  >
                    <Clock className="h-4 w-4" />
                    Schedule
                  </Button>
                )}
                
                <Button 
                  onClick={() => handleSave(true, false)} 
                  disabled={loading} 
                  className="flex-1 sm:flex-none gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                >
                  <Eye className="h-4 w-4" />
                  {isPublished ? 'Update' : 'Publish'}
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Save, Eye, CalendarIcon, Clock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';
export default function PostEditor() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState('learn');
  const [content, setContent] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [scheduledTime, setScheduledTime] = useState('12:00');
  useEffect(() => {
    if (id) {
      loadPost();
    }
  }, [id]);
  useEffect(() => {
    if (title && !id) {
      const generatedSlug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      setSlug(generatedSlug);
    }
  }, [title, id]);
  const loadPost = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('posts').select('*').eq('id', id).single();
      if (error) throw error;
      if (data) {
        setTitle(data.title);
        setSlug(data.slug);
        setType(data.type);
        setContent(data.content_html || '');
        setThumbnailUrl(data.thumbnail_url || '');
        setExternalLink(data.external_link || '');
        setIsPublished(data.is_published);
        
        // Load scheduled date if exists
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
      // Sanitize HTML content to prevent XSS attacks
      const sanitizedContent = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'span', 'div'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
      });

      let publishedAt = null;
      
      if (publish) {
        publishedAt = new Date().toISOString();
      } else if (schedule && scheduledDate) {
        const [hours, minutes] = scheduledTime.split(':');
        const scheduleDateTime = new Date(scheduledDate);
        scheduleDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        publishedAt = scheduleDateTime.toISOString();
      }

      const postData = {
        title,
        slug,
        type,
        content: {
          html: sanitizedContent
        },
        content_html: sanitizedContent,
        thumbnail_url: thumbnailUrl || null,
        external_link: externalLink || null,
        is_published: publish,
        published_at: publishedAt,
        author_id: (await supabase.auth.getUser()).data.user?.id
      };
      if (id) {
        const {
          error
        } = await supabase.from('posts').update(postData).eq('id', id);
        if (error) throw error;
        toast.success(schedule ? 'Post scheduled successfully' : 'Post updated successfully');
      } else {
        const {
          error
        } = await supabase.from('posts').insert([postData]);
        if (error) throw error;
        toast.success(schedule ? 'Post scheduled successfully' : 'Post created successfully');
      }
      navigate('/admin/posts');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save post');
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto my-[50px]">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => navigate('/admin/posts')} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Posts
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleSave(false, false)} disabled={loading} className="gap-2">
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
              <Button variant="secondary" onClick={() => handleSave(false, true)} disabled={loading} className="gap-2">
                <Clock className="h-4 w-4" />
                Schedule
              </Button>
              <Button onClick={() => handleSave(true, false)} disabled={loading} className="gap-2">
                <Eye className="h-4 w-4" />
                {isPublished ? 'Update & Publish' : 'Publish Now'}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{id ? 'Edit Post' : 'Create New Post'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter post title" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="post-slug" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="learn">Learn</SelectItem>
                      <SelectItem value="web3">Web3</SelectItem>
                      <SelectItem value="tutorial">Tutorial</SelectItem>
                      <SelectItem value="guide">Guide</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="thumbnail">Thumbnail URL</Label>
                  <Input id="thumbnail" value={thumbnailUrl} onChange={e => setThumbnailUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="external-link">External Link (Optional)</Label>
                <Input id="external-link" value={externalLink} onChange={e => setExternalLink(e.target.value)} placeholder="https://example.com" />
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="published" checked={isPublished} onCheckedChange={setIsPublished} />
                <Label htmlFor="published">Published</Label>
              </div>

              <div className="space-y-2">
                <Label>Schedule Publication (Optional)</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !scheduledDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduledDate ? format(scheduledDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
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
                    className="w-32"
                  />
                </div>
                {scheduledDate && !isPublished && (
                  <p className="text-sm text-muted-foreground">
                    Post will be published on {format(scheduledDate, "PPP")} at {scheduledTime}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Content</Label>
                <RichTextEditor content={content} onChange={setContent} />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>;
}
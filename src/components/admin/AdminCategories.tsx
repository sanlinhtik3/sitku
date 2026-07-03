import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, FolderOpen, AlertTriangle, FileText } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string | null;
  post_count?: number;
}

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
}

export const AdminCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState<CategoryFormData>({ name: '', slug: '', description: '' });
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  
  // Delete protection
  const [postsInCategory, setPostsInCategory] = useState(0);
  const [deleteAction, setDeleteAction] = useState<'delete' | 'reassign' | 'remove'>('delete');
  const [reassignCategoryId, setReassignCategoryId] = useState<string>('');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      
      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('post_categories')
        .select('*')
        .order('name');
      
      if (categoriesError) throw categoriesError;
      
      // Fetch post counts per category
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('category_id');
      
      if (postsError) throw postsError;
      
      // Count posts per category
      const postCounts = new Map<string, number>();
      postsData?.forEach(post => {
        if (post.category_id) {
          postCounts.set(post.category_id, (postCounts.get(post.category_id) || 0) + 1);
        }
      });
      
      // Merge counts with categories
      const categoriesWithCounts = (categoriesData || []).map(cat => ({
        ...cat,
        post_count: postCounts.get(cat.id) || 0
      }));
      
      setCategories(categoriesWithCounts);
    } catch (error: any) {
      toast.error('Failed to load categories');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: !editDialogOpen ? generateSlug(name) : prev.slug
    }));
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('post_categories')
        .insert([{
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null
        }]);
      
      if (error) throw error;
      
      toast.success('Category created successfully');
      setCreateDialogOpen(false);
      setFormData({ name: '', slug: '', description: '' });
      loadCategories();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('A category with this slug already exists');
      } else {
        toast.error('Failed to create category');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedCategory || !formData.name.trim() || !formData.slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('post_categories')
        .update({
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null
        })
        .eq('id', selectedCategory.id);
      
      if (error) throw error;
      
      toast.success('Category updated successfully');
      setEditDialogOpen(false);
      setSelectedCategory(null);
      setFormData({ name: '', slug: '', description: '' });
      loadCategories();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('A category with this slug already exists');
      } else {
        toast.error('Failed to update category');
      }
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (category: Category) => {
    setSelectedCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || ''
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = async (category: Category) => {
    setSelectedCategory(category);
    setPostsInCategory(category.post_count || 0);
    setDeleteAction(category.post_count ? 'remove' : 'delete');
    setReassignCategoryId('');
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;
    
    setSaving(true);
    try {
      // Handle posts based on delete action
      if (postsInCategory > 0) {
        if (deleteAction === 'reassign' && reassignCategoryId) {
          // Reassign posts to another category
          const { error: updateError } = await supabase
            .from('posts')
            .update({ category_id: reassignCategoryId })
            .eq('category_id', selectedCategory.id);
          
          if (updateError) throw updateError;
        } else if (deleteAction === 'remove') {
          // Set posts category to null
          const { error: updateError } = await supabase
            .from('posts')
            .update({ category_id: null })
            .eq('category_id', selectedCategory.id);
          
          if (updateError) throw updateError;
        }
      }
      
      // Delete the category
      const { error } = await supabase
        .from('post_categories')
        .delete()
        .eq('id', selectedCategory.id);
      
      if (error) throw error;
      
      toast.success('Category deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedCategory(null);
      loadCategories();
    } catch (error: any) {
      toast.error('Failed to delete category');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const otherCategories = categories.filter(c => c.id !== selectedCategory?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Post Categories</h1>
          <p className="text-muted-foreground">Manage categories for your blog posts</p>
        </div>
        <Button onClick={() => {
          setFormData({ name: '', slug: '', description: '' });
          setCreateDialogOpen(true);
        }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Categories Table */}
      <Card className="bg-background/50 backdrop-blur-sm border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            All Categories
          </CardTitle>
          <CardDescription>
            {categories.length} {categories.length === 1 ? 'category' : 'categories'} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No categories yet</p>
              <p className="text-sm">Create your first category to organize posts</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Posts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(category => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{category.slug}</code>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {category.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" />
                        {category.post_count || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(category)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(category)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Category</DialogTitle>
            <DialogDescription>Add a new category for organizing posts</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                value={formData.name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g., Tutorials"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-slug">Slug *</Label>
              <Input
                id="create-slug"
                value={formData.slug}
                onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="e.g., tutorials"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this category..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>Update category details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Tutorials"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug *</Label>
              <Input
                id="edit-slug"
                value={formData.slug}
                onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="e.g., tutorials"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this category..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {postsInCategory > 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Delete Category
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {postsInCategory > 0 ? (
                <>
                  <p>
                    This category has <strong>{postsInCategory} post{postsInCategory > 1 ? 's' : ''}</strong>. 
                    What would you like to do with them?
                  </p>
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="action-remove"
                        name="deleteAction"
                        checked={deleteAction === 'remove'}
                        onChange={() => setDeleteAction('remove')}
                        className="text-primary"
                      />
                      <Label htmlFor="action-remove" className="font-normal cursor-pointer">
                        Remove category from posts (posts will have no category)
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id="action-reassign"
                          name="deleteAction"
                          checked={deleteAction === 'reassign'}
                          onChange={() => setDeleteAction('reassign')}
                          className="text-primary"
                        />
                        <Label htmlFor="action-reassign" className="font-normal cursor-pointer">
                          Reassign posts to another category
                        </Label>
                      </div>
                      {deleteAction === 'reassign' && (
                        <Select value={reassignCategoryId} onValueChange={setReassignCategoryId}>
                          <SelectTrigger className="ml-6 w-[200px]">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {otherCategories.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p>Are you sure you want to delete "{selectedCategory?.name}"? This action cannot be undone.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving || (deleteAction === 'reassign' && !reassignCategoryId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? 'Deleting...' : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

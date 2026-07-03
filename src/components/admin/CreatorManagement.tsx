import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Loader2, Crown, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CreatorPermission {
  id: string;
  user_id: string;
  can_create_courses: boolean;
  max_courses: number;
  is_suspended: boolean;
  suspension_reason: string;
  suspended_by: string;
  suspended_at: string;
  created_at: string;
  user_full_name?: string;
  user_email?: string;
  course_count?: number;
}

export function CreatorManagement() {
  const [creators, setCreators] = useState<CreatorPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCreator, setSelectedCreator] = useState<CreatorPermission | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    can_create_courses: false,
    max_courses: 10,
    is_suspended: false,
    suspension_reason: "",
  });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchCreators();
  }, []);

  const fetchCreators = async () => {
    try {
      setLoading(true);
      
      // Get all creators from user_roles
      const { data: creatorRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "creator");

      if (rolesError) throw rolesError;

      if (!creatorRoles || creatorRoles.length === 0) {
        setCreators([]);
        setLoading(false);
        return;
      }

      const userIds = creatorRoles.map(r => r.user_id);

      // Get permissions for all creators
      const { data: permissions, error: permError } = await supabase
        .from("creator_permissions")
        .select("*")
        .in("user_id", userIds);

      if (permError) throw permError;

      // Get user details
      const { data: { users } } = await supabase.auth.admin.listUsers();
      
      const userMap = new Map<string, { email: string; name: string }>();
      if (users) {
        users.forEach((u: any) => {
          if (u.id && u.email) {
            userMap.set(u.id, {
              email: u.email,
              name: u.user_metadata?.full_name || "Unknown"
            });
          }
        });
      }

      // Get course counts for each creator
      const courseCounts = await Promise.all(
        userIds.map(async (userId) => {
          const { count } = await supabase
            .from("courses")
            .select("*", { count: "exact", head: true })
            .eq("created_by", userId);
          return { userId, count: count || 0 };
        })
      );

      const courseCountMap = new Map<string, number>();
      courseCounts.forEach(cc => {
        courseCountMap.set(cc.userId, cc.count);
      });

      // Combine all data
      const enrichedCreators = permissions?.map(perm => ({
        ...perm,
        user_email: userMap.get(perm.user_id)?.email || "Unknown",
        user_full_name: userMap.get(perm.user_id)?.name || "Unknown User",
        course_count: courseCountMap.get(perm.user_id) || 0,
      })) || [];

      setCreators(enrichedCreators);
    } catch (error) {
      console.error("Error fetching creators:", error);
      toast.error("Failed to load creators");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (creator: CreatorPermission) => {
    setSelectedCreator(creator);
    setFormData({
      can_create_courses: creator.can_create_courses,
      max_courses: creator.max_courses,
      is_suspended: creator.is_suspended,
      suspension_reason: creator.suspension_reason || "",
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!selectedCreator) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: any = {
        can_create_courses: formData.can_create_courses,
        max_courses: formData.max_courses,
        is_suspended: formData.is_suspended,
      };

      if (formData.is_suspended) {
        updateData.suspension_reason = formData.suspension_reason;
        updateData.suspended_by = user?.id;
        updateData.suspended_at = new Date().toISOString();
      } else {
        updateData.suspension_reason = null;
        updateData.suspended_by = null;
        updateData.suspended_at = null;
      }

      const { error } = await supabase
        .from("creator_permissions")
        .update(updateData)
        .eq("id", selectedCreator.id);

      if (error) throw error;

      toast.success("Creator permissions updated successfully");
      setEditMode(false);
      setSelectedCreator(null);
      fetchCreators();
    } catch (error) {
      console.error("Error updating permissions:", error);
      toast.error("Failed to update permissions");
    } finally {
      setProcessing(false);
    }
  };

  const quickTogglePermission = async (creator: CreatorPermission, field: 'can_create_courses' | 'is_suspended') => {
    try {
      const { error } = await supabase
        .from("creator_permissions")
        .update({ [field]: !creator[field] })
        .eq("id", creator.id);

      if (error) throw error;

      toast.success(`Permission ${field === 'can_create_courses' ? 'to create courses' : 'suspension'} updated`);
      fetchCreators();
    } catch (error) {
      console.error("Error updating permission:", error);
      toast.error("Failed to update permission");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Creator Management</h2>
        <p className="text-muted-foreground">Manage creator permissions and course limits</p>
      </div>

      {creators.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No creators found
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {creators.map((creator) => (
            <Card key={creator.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Crown className="h-5 w-5 text-amber-500" />
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {creator.user_full_name}
                        {creator.is_suspended && (
                          <Badge variant="destructive">Suspended</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{creator.user_email}</CardDescription>
                    </div>
                  </div>
                  <Button onClick={() => handleEdit(creator)} size="sm">
                    Manage
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Can Create Courses</p>
                    <div className="flex items-center gap-2">
                      {creator.can_create_courses ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Disabled
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => quickTogglePermission(creator, 'can_create_courses')}
                      >
                        Toggle
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium">Course Limit</p>
                    <p className="text-2xl font-bold text-primary">
                      {creator.course_count} / {creator.max_courses}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium">Status</p>
                    <div className="flex items-center gap-2">
                      {creator.is_suspended ? (
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="h-3 w-3" />
                          Suspended
                        </Badge>
                      ) : (
                        <Badge variant="default" className="gap-1">
                          <Unlock className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => quickTogglePermission(creator, 'is_suspended')}
                      >
                        Toggle
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium">Member Since</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(creator.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>

                {creator.is_suspended && creator.suspension_reason && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm font-medium text-destructive">Suspension Reason:</p>
                    <p className="text-sm text-muted-foreground mt-1">{creator.suspension_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editMode} onOpenChange={setEditMode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Creator Permissions</DialogTitle>
            <DialogDescription>
              Configure permissions for {selectedCreator?.user_full_name}
            </DialogDescription>
          </DialogHeader>

          {selectedCreator && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="can_create">Can Create Courses</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow this creator to create new courses
                  </p>
                </div>
                <Switch
                  id="can_create"
                  checked={formData.can_create_courses}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, can_create_courses: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_courses">Maximum Courses</Label>
                <Input
                  id="max_courses"
                  type="number"
                  min="1"
                  value={formData.max_courses}
                  onChange={(e) => 
                    setFormData({ ...formData, max_courses: parseInt(e.target.value) || 10 })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Current courses: {selectedCreator.course_count}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="suspended">Suspend Creator</Label>
                  <p className="text-sm text-muted-foreground">
                    Prevent this creator from creating courses
                  </p>
                </div>
                <Switch
                  id="suspended"
                  checked={formData.is_suspended}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, is_suspended: checked })
                  }
                />
              </div>

              {formData.is_suspended && (
                <div className="space-y-2">
                  <Label htmlFor="reason">Suspension Reason</Label>
                  <Textarea
                    id="reason"
                    value={formData.suspension_reason}
                    onChange={(e) => 
                      setFormData({ ...formData, suspension_reason: e.target.value })
                    }
                    placeholder="Explain why this creator is being suspended..."
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={processing}>
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

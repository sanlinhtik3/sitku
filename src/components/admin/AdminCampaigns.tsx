import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Plus, Pencil, Trash2, ExternalLink, Gift, RefreshCw } from "lucide-react";
import { CampaignEditorDialog } from "./CampaignEditorDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  campaign_url: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  display_order: number;
}

export function AdminCampaigns() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading, refetch } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as Campaign[];
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ is_active })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast.success("Campaign status updated");
    },
    onError: (error) => {
      toast.error("Failed to update campaign status");
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast.success("Campaign deleted");
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error) => {
      toast.error("Failed to delete campaign");
      console.error(error);
    },
  });

  const getExpiryStatus = (expiresAt: string | null, isActive: boolean) => {
    if (!isActive) return { text: "Inactive", variant: "secondary" as const };
    if (!expiresAt) return { text: "Active", variant: "default" as const };
    
    const daysLeft = differenceInDays(new Date(expiresAt), new Date());
    
    if (daysLeft <= 0) return { text: "Expired", variant: "destructive" as const };
    if (daysLeft <= 3) return { text: `${daysLeft}d left`, variant: "outline" as const };
    return { text: "Active", variant: "default" as const };
  };

  const handleEdit = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setEditorOpen(true);
  };

  const handleDelete = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Campaign Management
              </CardTitle>
              <CardDescription>
                Manage your promotional campaigns and referral links
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleCreate} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Campaign
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[80px]">Image</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => {
                    const status = getExpiryStatus(campaign.expires_at, campaign.is_active);
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <img
                            src={campaign.thumbnail_url || "/placeholder.svg"}
                            alt={campaign.title}
                            className="h-12 w-12 rounded-md object-cover"
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{campaign.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {campaign.description || "No description"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.text}</Badge>
                        </TableCell>
                        <TableCell>
                          {campaign.expires_at
                            ? format(new Date(campaign.expires_at), "MMM dd, yyyy")
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={campaign.is_active}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({
                                id: campaign.id,
                                is_active: checked,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(campaign.campaign_url, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(campaign)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(campaign)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No campaigns yet</p>
              <Button onClick={handleCreate} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create First Campaign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CampaignEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        campaign={selectedCampaign}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaignToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => campaignToDelete && deleteMutation.mutate(campaignToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

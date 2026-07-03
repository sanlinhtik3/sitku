import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CreatorApplication {
  id: string;
  user_id: string;
  status: string;
  bio: string;
  portfolio_url: string;
  youtube_url: string;
  tiktok_url: string;
  facebook_url: string;
  telegram_url: string;
  instagram_url: string;
  twitter_url: string;
  website_url: string;
  other_links: string;
  admin_notes: string;
  reviewed_by: string;
  reviewed_at: string;
  created_at: string;
  user_full_name?: string;
}

export function AdminCreatorApplications() {
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<CreatorApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    fetchApplications();
  }, [activeTab]);

  const fetchApplications = async () => {
    try {
      const { data: apps, error } = await supabase
        .from("creator_applications")
        .select("*")
        .eq("status", activeTab)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch user profiles separately
      if (apps && apps.length > 0) {
        const userIds = apps.map(app => app.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
        
        const enrichedApps = apps.map(app => ({
          ...app,
          user_full_name: profileMap.get(app.user_id) || "Unknown User"
        }));

        setApplications(enrichedApps);
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error("Error fetching applications:", error);
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (app: CreatorApplication) => {
    setSelectedApp(app);
    setAdminNotes(app.admin_notes || "");
  };

  const handleApprove = async () => {
    if (!selectedApp) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("creator_applications")
        .update({
          status: "approved",
          admin_notes: adminNotes,
          reviewed_by: user?.id,
        })
        .eq("id", selectedApp.id);

      if (error) throw error;

      toast.success("Application approved! User has been granted creator role.");
      setSelectedApp(null);
      fetchApplications();
    } catch (error) {
      console.error("Error approving application:", error);
      toast.error("Failed to approve application");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApp) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("creator_applications")
        .update({
          status: "rejected",
          admin_notes: adminNotes,
          reviewed_by: user?.id,
        })
        .eq("id", selectedApp.id);

      if (error) throw error;

      toast.success("Application rejected");
      setSelectedApp(null);
      fetchApplications();
    } catch (error) {
      console.error("Error rejecting application:", error);
      toast.error("Failed to reject application");
    } finally {
      setProcessing(false);
    }
  };

  const renderSocialLink = (url: string, label: string) => {
    if (!url) return null;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { variant: "outline" as const, icon: Clock, label: "Pending" },
      approved: { variant: "default" as const, icon: CheckCircle2, label: "Approved" },
      rejected: { variant: "destructive" as const, icon: XCircle, label: "Rejected" },
    };

    const statusConfig = config[status as keyof typeof config];
    if (!statusConfig) return null;

    const Icon = statusConfig.icon;
    return (
      <Badge variant={statusConfig.variant}>
        <Icon className="h-3 w-3 mr-1" />
        {statusConfig.label}
      </Badge>
    );
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
        <h2 className="text-3xl font-bold tracking-tight">Creator Applications</h2>
        <p className="text-muted-foreground">Review and manage creator applications</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {applications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No {activeTab} applications found
              </CardContent>
            </Card>
          ) : (
            applications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{app.user_full_name || "Unknown User"}</CardTitle>
                      <CardDescription>
                        Applied on {format(new Date(app.created_at), "PPP")}
                      </CardDescription>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Bio</h4>
                    <p className="text-sm text-muted-foreground">{app.bio}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Social Media & Links</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {renderSocialLink(app.portfolio_url, "Portfolio")}
                      {renderSocialLink(app.youtube_url, "YouTube")}
                      {renderSocialLink(app.tiktok_url, "TikTok")}
                      {renderSocialLink(app.facebook_url, "Facebook")}
                      {renderSocialLink(app.telegram_url, "Telegram")}
                      {renderSocialLink(app.instagram_url, "Instagram")}
                      {renderSocialLink(app.twitter_url, "Twitter")}
                      {renderSocialLink(app.website_url, "Website")}
                    </div>
                    {app.other_links && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">Other Links:</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {app.other_links}
                        </p>
                      </div>
                    )}
                  </div>

                  {app.admin_notes && (
                    <div>
                      <h4 className="font-semibold mb-2">Admin Notes</h4>
                      <p className="text-sm text-muted-foreground">{app.admin_notes}</p>
                    </div>
                  )}

                  {app.status === "pending" && (
                    <Button onClick={() => handleReview(app)}>Review Application</Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Application</DialogTitle>
            <DialogDescription>
              Review and approve or reject this creator application
            </DialogDescription>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Applicant</h4>
                <p className="text-sm">{selectedApp.user_full_name || "Unknown User"}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Bio</h4>
                <p className="text-sm text-muted-foreground">{selectedApp.bio}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Social Media Links</h4>
                <div className="grid grid-cols-2 gap-2">
                  {renderSocialLink(selectedApp.portfolio_url, "Portfolio")}
                  {renderSocialLink(selectedApp.youtube_url, "YouTube")}
                  {renderSocialLink(selectedApp.tiktok_url, "TikTok")}
                  {renderSocialLink(selectedApp.facebook_url, "Facebook")}
                  {renderSocialLink(selectedApp.telegram_url, "Telegram")}
                  {renderSocialLink(selectedApp.instagram_url, "Instagram")}
                  {renderSocialLink(selectedApp.twitter_url, "Twitter")}
                  {renderSocialLink(selectedApp.website_url, "Website")}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_notes">Admin Notes</Label>
                <Textarea
                  id="admin_notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this application..."
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedApp(null)} disabled={processing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
            <Button onClick={handleApprove} disabled={processing}>
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

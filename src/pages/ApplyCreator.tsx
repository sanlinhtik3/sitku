import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";

interface CreatorApplication {
  id: string;
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
  created_at: string;
}

export default function ApplyCreator() {
  const { user, isCreator } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [formData, setFormData] = useState({
    bio: "",
    portfolio_url: "",
    youtube_url: "",
    tiktok_url: "",
    facebook_url: "",
    telegram_url: "",
    instagram_url: "",
    twitter_url: "",
    website_url: "",
    other_links: "",
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (isCreator) {
      navigate("/creator");
      return;
    }

    fetchApplication();
  }, [user, isCreator, navigate]);

  const fetchApplication = async () => {
    try {
      const { data, error } = await supabase
        .from("creator_applications")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setApplication(data);
        setFormData({
          bio: data.bio || "",
          portfolio_url: data.portfolio_url || "",
          youtube_url: data.youtube_url || "",
          tiktok_url: data.tiktok_url || "",
          facebook_url: data.facebook_url || "",
          telegram_url: data.telegram_url || "",
          instagram_url: data.instagram_url || "",
          twitter_url: data.twitter_url || "",
          website_url: data.website_url || "",
          other_links: data.other_links || "",
        });
      }
    } catch (error) {
      console.error("Error fetching application:", error);
      toast.error("Failed to load application data");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate at least one social media link
    const hasAtLeastOneLink = 
      formData.youtube_url ||
      formData.tiktok_url ||
      formData.facebook_url ||
      formData.telegram_url ||
      formData.instagram_url ||
      formData.twitter_url ||
      formData.website_url;

    if (!hasAtLeastOneLink) {
      toast.error("Please provide at least one social media or website link");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("creator_applications")
        .insert([
          {
            user_id: user?.id,
            ...formData,
          },
        ]);

      if (error) throw error;

      toast.success("Application submitted successfully!");
      fetchApplication();
    } catch (error: any) {
      console.error("Error submitting application:", error);
      if (error.code === "23505") {
        toast.error("You have already submitted an application");
      } else {
        toast.error("Failed to submit application");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const getStatusBadge = () => {
    if (!application) return null;

    const statusConfig = {
      pending: {
        icon: Clock,
        label: "Pending Review",
        className: "text-yellow-600 bg-yellow-50",
      },
      approved: {
        icon: CheckCircle2,
        label: "Approved",
        className: "text-green-600 bg-green-50",
      },
      rejected: {
        icon: XCircle,
        label: "Rejected",
        className: "text-red-600 bg-red-50",
      },
    };

    const status = statusConfig[application.status as keyof typeof statusConfig];
    if (!status) return null;

    const Icon = status.icon;

    return (
      <Alert className={status.className}>
        <Icon className="h-4 w-4" />
        <AlertDescription>
          <div className="font-semibold">{status.label}</div>
          {application.admin_notes && (
            <div className="mt-2 text-sm">
              <strong>Admin Notes:</strong> {application.admin_notes}
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-4xl mx-auto py-8 px-4 pt-24">
        <Card>
        <CardHeader>
          <CardTitle>Apply to Become a Creator</CardTitle>
          <CardDescription>
            Share your creative work and build your own courses on our platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {getStatusBadge()}

          {(!application || application.status === "rejected") && (
            <form onSubmit={handleSubmit} className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label htmlFor="bio">Bio *</Label>
                <Textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  placeholder="Tell us about yourself and your creative journey..."
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="portfolio_url">Portfolio URL</Label>
                <Input
                  id="portfolio_url"
                  name="portfolio_url"
                  type="url"
                  value={formData.portfolio_url}
                  onChange={handleChange}
                  placeholder="https://yourportfolio.com"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="youtube_url">YouTube Channel</Label>
                  <Input
                    id="youtube_url"
                    name="youtube_url"
                    type="url"
                    value={formData.youtube_url}
                    onChange={handleChange}
                    placeholder="https://youtube.com/@yourchannel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tiktok_url">TikTok Profile</Label>
                  <Input
                    id="tiktok_url"
                    name="tiktok_url"
                    type="url"
                    value={formData.tiktok_url}
                    onChange={handleChange}
                    placeholder="https://tiktok.com/@yourprofile"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="facebook_url">Facebook Page</Label>
                  <Input
                    id="facebook_url"
                    name="facebook_url"
                    type="url"
                    value={formData.facebook_url}
                    onChange={handleChange}
                    placeholder="https://facebook.com/yourpage"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram_url">Telegram Channel</Label>
                  <Input
                    id="telegram_url"
                    name="telegram_url"
                    type="url"
                    value={formData.telegram_url}
                    onChange={handleChange}
                    placeholder="https://t.me/yourchannel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagram_url">Instagram Profile</Label>
                  <Input
                    id="instagram_url"
                    name="instagram_url"
                    type="url"
                    value={formData.instagram_url}
                    onChange={handleChange}
                    placeholder="https://instagram.com/yourprofile"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter_url">Twitter/X Profile</Label>
                  <Input
                    id="twitter_url"
                    name="twitter_url"
                    type="url"
                    value={formData.twitter_url}
                    onChange={handleChange}
                    placeholder="https://twitter.com/yourprofile"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website_url">Personal Website</Label>
                  <Input
                    id="website_url"
                    name="website_url"
                    type="url"
                    value={formData.website_url}
                    onChange={handleChange}
                    placeholder="https://yourwebsite.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="other_links">Other Links</Label>
                <Textarea
                  id="other_links"
                  name="other_links"
                  value={formData.other_links}
                  onChange={handleChange}
                  placeholder="Add any other relevant links (one per line)"
                  rows={3}
                />
              </div>

              <Alert>
                <AlertDescription>
                  * Please provide at least one social media or website link to verify your creative work
                </AlertDescription>
              </Alert>

              <div className="flex gap-4">
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Application
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {application && application.status === "pending" && (
            <div className="mt-6 text-center text-muted-foreground">
              <p>Your application is under review. We'll notify you once it's processed.</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

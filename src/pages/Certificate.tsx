import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, Download, Share2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface CertificateData {
  course_title: string;
  instructor_name: string | null;
  completion_date: string;
  total_lessons: number;
  user_name: string;
}

const Certificate = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificate();
  }, [id]);

  const fetchCertificate = async () => {
    try {
      const { data: certData, error: certError } = await supabase
        .from("certificates")
        .select("certificate_data, user_id")
        .eq("id", id)
        .single();

      if (certError) throw certError;

      if (certData) {
        // Fetch user profile separately
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", certData.user_id)
          .single();

        const certificateData = certData.certificate_data as any;
        setCertificate({
          ...certificateData,
          user_name: profileData?.full_name || 'Student'
        });
      }
    } catch (error) {
      console.error("Error fetching certificate:", error);
      toast.error("Failed to load certificate");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Certificate link copied to clipboard!");
  };

  const handleDownload = () => {
    toast.info("PDF download feature coming soon!");
    // In a real implementation, you would generate a PDF here
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center">
        <div className="animate-pulse text-primary">Loading certificate...</div>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-12 text-center">
            <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Certificate Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The certificate you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-6 flex gap-4">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button variant="hero" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-8 border-primary/20 shadow-2xl">
          <CardContent className="p-12 bg-gradient-to-br from-background to-primary/5">
            <div className="text-center space-y-8">
              <Award className="h-20 w-20 text-primary mx-auto" />
              
              <div>
                <h1 className="text-4xl font-bold mb-2 text-primary">
                  Certificate of Completion
                </h1>
                <div className="h-1 w-32 bg-primary mx-auto"></div>
              </div>

              <div className="space-y-6">
                <p className="text-lg text-muted-foreground">This is to certify that</p>
                
                <h2 className="text-5xl font-bold">{certificate.user_name}</h2>
                
                <p className="text-lg text-muted-foreground">
                  has successfully completed the course
                </p>
                
                <h3 className="text-3xl font-bold text-primary">
                  {certificate.course_title}
                </h3>

                {certificate.instructor_name && (
                  <p className="text-muted-foreground">
                    Instructed by <span className="font-semibold">{certificate.instructor_name}</span>
                  </p>
                )}

                <div className="flex justify-center gap-8 text-sm text-muted-foreground pt-4">
                  <div>
                    <p className="font-semibold">Date of Completion</p>
                    <p>{new Date(certificate.completion_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Lessons Completed</p>
                    <p>{certificate.total_lessons}</p>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-border">
                <div className="flex justify-center items-center gap-2 text-sm text-muted-foreground">
                  <Award className="h-4 w-4" />
                  <p>Verified Certificate ID: {id?.slice(0, 8)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Certificate;

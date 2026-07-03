import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, Download, Award } from "lucide-react";
import { useCertificates } from "@/hooks/useCertificates";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

export const CertificatesSection = () => {
  const { certificates, loading } = useCertificates();
  const navigate = useNavigate();

  const handleViewCertificate = (certificateId: string) => {
    navigate(`/certificate/${certificateId}`);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Certificates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (certificates.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          Certificates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {certificates.map((certificate) => (
            <div
              key={certificate.id}
              className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Award className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm line-clamp-1">
                  {certificate.certificate_data.course_title}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Completed {new Date(certificate.certificate_data.completion_date).toLocaleDateString()}
                </p>
                {certificate.certificate_data.instructor_name && (
                  <p className="text-xs text-muted-foreground">
                    by {certificate.certificate_data.instructor_name}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleViewCertificate(certificate.id)}
              >
                <Download className="h-4 w-4" />
                View
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

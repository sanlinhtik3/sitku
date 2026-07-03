import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Clock, AlertCircle, CheckCircle, FileText, ArrowRight, XCircle } from "lucide-react";
import { PendingEnrollmentDetailModal } from "./PendingEnrollmentDetailModal";
import { cn } from "@/lib/utils";

interface PendingEnrollment {
  id: string;
  course_id: string;
  status: string;
  created_at: string;
  payment_submitted_at: string | null;
  payment_receipt_url: string | null;
  payment_notes: string | null;
  final_price: number | null;
  discount_applied: number | null;
  courses: {
    id: string;
    slug: string;
    title: string;
    description: string;
    thumbnail_url: string;
    price: number;
  };
  payment_methods: {
    id: string;
    name: string;
    type: string;
  } | null;
}

interface PendingEnrollmentCardProps {
  enrollment: PendingEnrollment;
}

export const PendingEnrollmentCard = ({ enrollment }: PendingEnrollmentCardProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getEnrollmentSteps = () => {
    const isPending = enrollment.status === "pending";
    const isDenied = enrollment.status === "denied";
    const isApproved = enrollment.status === "approved";

    return [
      {
        label: "Payment Submitted",
        icon: <CheckCircle className="h-5 w-5" />,
        status: "completed",
        description: "Your payment has been received"
      },
      {
        label: "Admin Review",
        icon: isPending ? <Clock className="h-5 w-5" /> : isDenied ? <XCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />,
        status: isPending ? "current" : isApproved ? "completed" : "denied",
        description: isPending ? "Under review by our team" : isDenied ? "Request was denied" : "Review completed"
      },
      {
        label: isApproved ? "Access Granted" : isDenied ? "Access Denied" : "Access Pending",
        icon: isApproved ? <CheckCircle className="h-5 w-5" /> : isDenied ? <XCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />,
        status: isApproved ? "completed" : isDenied ? "denied" : "pending",
        description: isApproved ? "You can now access the course" : isDenied ? "Unable to grant access" : "Waiting for approval"
      }
    ];
  };

  const steps = getEnrollmentSteps();

  const getStatusBadge = () => {
    switch (enrollment.status) {
      case "pending":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case "denied":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Denied
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      default:
        return <Badge variant="outline">{enrollment.status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all overflow-hidden group">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row gap-4 p-4">
            {/* Thumbnail */}
            <div className="relative h-32 w-full sm:w-40 flex-shrink-0 rounded-lg overflow-hidden">
              <img
                src={enrollment.courses.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=500"}
                alt={enrollment.courses.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold line-clamp-1">
                    {enrollment.courses.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {enrollment.courses.description}
                </p>

                {/* Enrollment Progress Steps */}
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Enrollment Progress
                  </h4>
                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <div key={index} className="relative">
                        <div className="flex items-start gap-3">
                          {/* Step Icon */}
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                            step.status === "completed" && "bg-green-500/10 text-green-600 dark:text-green-400",
                            step.status === "current" && "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ring-2 ring-yellow-500/30",
                            step.status === "denied" && "bg-red-500/10 text-red-600 dark:text-red-400",
                            step.status === "pending" && "bg-muted text-muted-foreground"
                          )}>
                            {step.icon}
                          </div>

                          {/* Step Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "text-sm font-medium",
                                step.status === "completed" && "text-green-600 dark:text-green-400",
                                step.status === "current" && "text-yellow-600 dark:text-yellow-400 font-semibold",
                                step.status === "denied" && "text-red-600 dark:text-red-400",
                                step.status === "pending" && "text-muted-foreground"
                              )}>
                                {step.label}
                              </p>
                              {step.status === "current" && (
                                <Badge variant="outline" className="text-xs bg-yellow-500/10 border-yellow-500/30 text-yellow-600">
                                  Current
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.description}
                            </p>
                          </div>

                          {/* Connector Line */}
                          {index < steps.length - 1 && (
                            <div className={cn(
                              "absolute left-4 top-10 w-0.5 h-6 -ml-px",
                              steps[index + 1].status === "completed" || steps[index + 1].status === "current" 
                                ? "bg-gradient-to-b from-green-500/30 to-muted/30" 
                                : "bg-muted/30"
                            )} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Submitted {formatDate(enrollment.created_at)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Amount: </span>
                    <span className="font-semibold text-foreground">
                      ${enrollment.final_price?.toFixed(2) || enrollment.courses.price?.toFixed(2)}
                    </span>
                    {enrollment.discount_applied ? (
                      <span className="text-xs text-green-600 dark:text-green-400 ml-1">
                        ({enrollment.discount_applied}% off)
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-4 pt-3 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                  className="w-full gap-2"
                >
                  <Eye className="h-4 w-4" />
                  View Full Details
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PendingEnrollmentDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        enrollment={enrollment}
      />
    </>
  );
};

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  AlertCircle,
  CheckCircle,
  FileText,
  CreditCard,
  DollarSign,
  Calendar,
  Tag,
  XCircle,
} from "lucide-react";
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

interface PendingEnrollmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollment: PendingEnrollment;
}

export const PendingEnrollmentDetailModal = ({
  isOpen,
  onClose,
  enrollment,
}: PendingEnrollmentDetailModalProps) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusInfo = () => {
    switch (enrollment.status) {
      case "pending":
        return {
          icon: <Clock className="h-6 w-6" />,
          bgColor: "bg-yellow-500/10",
          borderColor: "border-yellow-500/30",
          textColor: "text-yellow-600 dark:text-yellow-400",
          badge: (
            <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/30 text-base py-1 px-3">
              <Clock className="h-4 w-4 mr-1.5" />
              Pending Review
            </Badge>
          ),
          message: "Your enrollment request is being reviewed by our team. You will be notified once it's processed.",
          steps: [
            { label: "Payment Submitted", status: "completed", icon: <CheckCircle className="h-5 w-5" /> },
            { label: "Admin Review", status: "current", icon: <Clock className="h-5 w-5" /> },
            { label: "Access Pending", status: "pending", icon: <Clock className="h-5 w-5" /> },
          ]
        };
      case "denied":
        return {
          icon: <XCircle className="h-6 w-6" />,
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/30",
          textColor: "text-red-600 dark:text-red-400",
          badge: (
            <Badge variant="destructive" className="text-base py-1 px-3">
              <AlertCircle className="h-4 w-4 mr-1.5" />
              Denied
            </Badge>
          ),
          message: "Unfortunately, your enrollment request was denied. Please contact support if you have questions or would like to resubmit.",
          steps: [
            { label: "Payment Submitted", status: "completed", icon: <CheckCircle className="h-5 w-5" /> },
            { label: "Admin Review", status: "completed", icon: <CheckCircle className="h-5 w-5" /> },
            { label: "Access Denied", status: "denied", icon: <XCircle className="h-5 w-5" /> },
          ]
        };
      case "approved":
        return {
          icon: <CheckCircle className="h-6 w-6" />,
          bgColor: "bg-green-500/10",
          borderColor: "border-green-500/30",
          textColor: "text-green-600 dark:text-green-400",
          badge: (
            <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/30 text-base py-1 px-3">
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Approved
            </Badge>
          ),
          message: "Congratulations! Your enrollment has been approved. You can now access the course and start learning.",
          steps: [
            { label: "Payment Submitted", status: "completed", icon: <CheckCircle className="h-5 w-5" /> },
            { label: "Admin Review", status: "completed", icon: <CheckCircle className="h-5 w-5" /> },
            { label: "Access Granted", status: "completed", icon: <CheckCircle className="h-5 w-5" /> },
          ]
        };
      default:
        return {
          icon: null,
          bgColor: "bg-muted",
          borderColor: "border-border",
          textColor: "text-foreground",
          badge: <Badge variant="outline" className="text-base py-1 px-3">{enrollment.status}</Badge>,
          message: "",
          steps: []
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] p-0">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-3xl font-bold">Enrollment Details</DialogTitle>
              <DialogDescription className="text-base">
                Complete information about your enrollment request
              </DialogDescription>
            </DialogHeader>

            {/* Status Alert Banner */}
            <div className={cn(
              "rounded-lg p-4 border-l-4 flex items-start gap-4",
              statusInfo.bgColor,
              statusInfo.borderColor
            )}>
              <div className={statusInfo.textColor}>
                {statusInfo.icon}
              </div>
              <div className="flex-1 space-y-2">
                {statusInfo.badge}
                <p className="text-sm leading-relaxed">{statusInfo.message}</p>
              </div>
            </div>

            {/* Progress Steps */}
            <div className="bg-muted/30 rounded-lg p-5">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Enrollment Progress
              </h4>
              <div className="flex items-center justify-between relative">
                {/* Progress Line */}
                <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted -z-0" />
                <div 
                  className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500 -z-0"
                  style={{ 
                    width: enrollment.status === "pending" ? "33%" : enrollment.status === "approved" ? "100%" : "66%" 
                  }}
                />
                
                {statusInfo.steps.map((step, index) => (
                  <div key={index} className="flex flex-col items-center flex-1 relative z-10">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors shadow-md",
                      step.status === "completed" && "bg-green-500 text-white",
                      step.status === "current" && "bg-yellow-500 text-white ring-4 ring-yellow-500/20",
                      step.status === "denied" && "bg-red-500 text-white",
                      step.status === "pending" && "bg-muted text-muted-foreground"
                    )}>
                      {step.icon}
                    </div>
                    <p className={cn(
                      "text-xs font-medium text-center",
                      step.status === "completed" && "text-green-600 dark:text-green-400",
                      step.status === "current" && "text-yellow-600 dark:text-yellow-400 font-semibold",
                      step.status === "denied" && "text-red-600 dark:text-red-400",
                      step.status === "pending" && "text-muted-foreground"
                    )}>
                      {step.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Two Column Layout */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left Column - Course & Enrollment Info */}
              <div className="space-y-6">
                {/* Course Info */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Course Information
                  </h3>
                  <div className="relative h-48 rounded-lg overflow-hidden mb-3">
                    <img
                      src={enrollment.courses.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=500"}
                      alt={enrollment.courses.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h4 className="text-xl font-bold mb-2">{enrollment.courses.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {enrollment.courses.description}
                  </p>
                </div>

                {/* Enrollment Information */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Enrollment Details
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Submitted On
                      </span>
                      <span className="text-sm font-medium">
                        {formatDate(enrollment.created_at)}
                      </span>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Course Price
                      </span>
                      <span className="text-sm font-medium">
                        ${enrollment.courses.price?.toFixed(2)}
                      </span>
                    </div>

                    {enrollment.discount_applied && (
                      <>
                        <Separator className="bg-border/50" />
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            Discount Applied
                          </span>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            {enrollment.discount_applied}% off
                          </span>
                        </div>
                      </>
                    )}

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Final Amount
                      </span>
                      <span className="text-lg font-bold text-primary">
                        ${enrollment.final_price?.toFixed(2) || enrollment.courses.price?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Payment Info */}
              <div className="space-y-6">
                {/* Payment Information */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Payment Information
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    {enrollment.payment_methods && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Payment Method
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {enrollment.payment_methods.name}
                          </Badge>
                        </div>
                        <Separator className="bg-border/50" />
                      </>
                    )}

                    {enrollment.payment_submitted_at && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Payment Date
                          </span>
                          <span className="text-sm font-medium">
                            {formatDate(enrollment.payment_submitted_at)}
                          </span>
                        </div>
                        <Separator className="bg-border/50" />
                      </>
                    )}

                    {enrollment.payment_notes && (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Payment Notes</span>
                        </div>
                        <p className="text-sm bg-background rounded-lg p-3 leading-relaxed border border-border/50">
                          {enrollment.payment_notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Receipt */}
                {enrollment.payment_receipt_url && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Payment Receipt
                    </h3>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="relative rounded-lg overflow-hidden border-2 border-border/50 bg-background">
                        <img
                          src={enrollment.payment_receipt_url}
                          alt="Payment receipt"
                          className="w-full h-auto object-contain max-h-[400px]"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Your submitted payment proof
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Close Button */}
            <div className="pt-4">
              <Button onClick={onClose} className="w-full" size="lg">
                Close
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

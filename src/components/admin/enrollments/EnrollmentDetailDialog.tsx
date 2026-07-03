import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, ExternalLink, Calendar, CreditCard, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { EnrollmentRow } from "./columns";

interface EnrollmentDetailDialogProps {
  enrollment: EnrollmentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

export function EnrollmentDetailDialog({
  enrollment,
  open,
  onOpenChange,
  onApprove,
  onDeny,
}: EnrollmentDetailDialogProps) {
  if (!enrollment) return null;

  const getStatusBadge = (status: string) => {
    const variantMap: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      approved: "default",
      denied: "destructive",
    };
    return (
      <Badge variant={variantMap[status] || "secondary"} className="capitalize">
        {status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Enrollment Details
            {getStatusBadge(enrollment.status)}
          </DialogTitle>
          <DialogDescription>
            Review the complete enrollment information and payment details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Student Information */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4" />
              Student Information
            </div>
            <div className="grid grid-cols-1 gap-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name:</span>
                <span className="text-sm font-medium">{enrollment.user_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">User ID:</span>
                <span className="text-xs font-mono">{enrollment.user_id}</span>
              </div>
            </div>
          </div>

          {/* Course Information */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4" />
              Course Information
            </div>
            <div className="grid grid-cols-1 gap-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Course:</span>
                <span className="text-sm font-medium text-right">{enrollment.course_title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Access Duration:</span>
                <span className="text-sm font-medium">{enrollment.access_duration_days} days</span>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4" />
              Payment Information
            </div>
            <div className="grid grid-cols-1 gap-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Final Price:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">${enrollment.final_price.toFixed(2)}</span>
                  {enrollment.discount_applied > 0 && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {enrollment.discount_applied}% OFF
                    </Badge>
                  )}
                </div>
              </div>
              {enrollment.payment_method_name && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Payment Method:</span>
                  <Badge variant="outline">{enrollment.payment_method_name}</Badge>
                </div>
              )}
              {enrollment.payment_submitted_at && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Submitted:</span>
                  <span className="text-sm font-medium">
                    {format(new Date(enrollment.payment_submitted_at), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Receipt */}
          {enrollment.payment_receipt_url && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Payment Receipt</div>
              <div className="border rounded-lg p-4 bg-muted/30">
                <a
                  href={enrollment.payment_receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <img
                    src={enrollment.payment_receipt_url}
                    alt="Payment receipt"
                    className="w-full rounded border hover:opacity-90 transition-opacity cursor-pointer"
                  />
                  <div className="flex items-center justify-center gap-1 text-xs text-primary mt-2 group-hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    <span>Open in new tab</span>
                  </div>
                </a>
              </div>
            </div>
          )}

          {/* Payment Notes */}
          {enrollment.payment_notes && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">User Notes</div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">{enrollment.payment_notes}</p>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4" />
              Timeline
            </div>
            <div className="grid grid-cols-1 gap-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Created:</span>
                <span className="text-sm font-medium">
                  {format(new Date(enrollment.created_at), "MMM d, yyyy HH:mm")}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {enrollment.status === "pending" && (
            <div className="flex gap-3 pt-4 border-t">
              <Button
                className="flex-1"
                onClick={() => {
                  onApprove(enrollment.id);
                  onOpenChange(false);
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                Approve Enrollment
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  onDeny(enrollment.id);
                  onOpenChange(false);
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Deny Enrollment
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

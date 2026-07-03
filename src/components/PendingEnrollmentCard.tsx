import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, CheckCircle, Circle, Receipt, CreditCard, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingEnrollmentCardProps {
  enrollment: {
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
  };
}

export const PendingEnrollmentCard = ({ enrollment }: PendingEnrollmentCardProps) => {
  const isPending = enrollment.status === "pending";
  const isDenied = enrollment.status === "denied";

  const submittedDate = enrollment.payment_submitted_at 
    ? new Date(enrollment.payment_submitted_at) 
    : new Date(enrollment.created_at);

  const timeAgo = formatDistanceToNow(submittedDate, { addSuffix: true });

  return (
    <Card className={`border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden ${
      isPending ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-red-500"
    }`}>
      <CardContent className="p-6">
        {/* Status Header */}
        <div className="flex items-center justify-between mb-4">
          <Badge 
            variant={isPending ? "default" : "destructive"}
            className={isPending ? "bg-amber-500 hover:bg-amber-600" : ""}
          >
            {isPending ? (
              <>
                <Clock className="h-3 w-3 mr-1" />
                Pending Review
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 mr-1" />
                Enrollment Denied
              </>
            )}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Submitted {timeAgo}
          </span>
        </div>

        <div className="grid md:grid-cols-[200px_1fr] gap-6">
          {/* Course Thumbnail */}
          <div className="relative h-40 md:h-full overflow-hidden rounded-lg">
            <img 
              src={enrollment.courses.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=500"} 
              alt={enrollment.courses.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Details */}
          <div className="space-y-4">
            {/* Course Info */}
            <div>
              <h3 className="text-xl font-semibold mb-1">{enrollment.courses.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {enrollment.courses.description}
              </p>
            </div>

            {/* Payment Details */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Details
              </h4>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {enrollment.payment_methods && (
                  <div>
                    <span className="text-muted-foreground">Method:</span>{" "}
                    <span className="font-medium">{enrollment.payment_methods.name}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Amount Paid:</span>{" "}
                  <span className="font-medium">
                    ${enrollment.final_price?.toFixed(2)}
                    {enrollment.discount_applied && enrollment.discount_applied > 0 && (
                      <span className="text-xs text-green-600 ml-1">
                        ({enrollment.discount_applied}% off)
                      </span>
                    )}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Submitted:</span>{" "}
                  <span className="font-medium">
                    {submittedDate.toLocaleDateString()} {submittedDate.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Receipt */}
            {enrollment.payment_receipt_url && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Payment Receipt
                </h4>
                <a 
                  href={enrollment.payment_receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-fit"
                >
                  <img
                    src={enrollment.payment_receipt_url}
                    alt="Payment receipt"
                    className="h-24 w-auto object-cover rounded border border-border hover:border-primary transition-colors cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    Click to view full size
                  </span>
                </a>
              </div>
            )}

            {/* User Notes */}
            {enrollment.payment_notes && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Your Notes
                </h4>
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">
                  "{enrollment.payment_notes}"
                </p>
              </div>
            )}

            {/* Status Timeline */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Status Timeline</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 fill-green-600" />
                  <span className="text-green-600">Payment submitted</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {isPending ? (
                    <>
                      <Clock className="h-4 w-4 text-amber-500" />
                      <span className="text-amber-600 font-medium">Under admin review (current)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-red-600 font-medium">Enrollment denied</span>
                    </>
                  )}
                </div>
                {isPending && (
                  <div className="flex items-center gap-2 text-sm">
                    <Circle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Access will be granted</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Message */}
            <div className={`p-3 rounded-lg ${
              isPending 
                ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800" 
                : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
            }`}>
              <p className={`text-sm ${isPending ? "text-amber-800 dark:text-amber-300" : "text-red-800 dark:text-red-300"}`}>
                {isPending ? (
                  <>
                    ⏰ Your request is being reviewed by our team. You'll receive a notification once approved.
                  </>
                ) : (
                  <>
                    Your enrollment request was not approved. Please contact support or try again with valid payment.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

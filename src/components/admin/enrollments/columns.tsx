import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, ExternalLink, ArrowUpDown, Eye } from "lucide-react";
import { format } from "date-fns";

export interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  created_at: string;
  payment_receipt_url: string | null;
  final_price: number;
  discount_applied: number;
  payment_notes: string | null;
  payment_submitted_at: string | null;
  access_duration_days: number;
  access_expires_at: string | null;
  is_expired: boolean;
  user_name: string;
  course_title: string;
  payment_method_name: string | null;
}

export const createColumns = (
  onApprove: (id: string) => void,
  onDeny: (id: string) => void,
  onViewDetails: (enrollment: EnrollmentRow) => void
): ColumnDef<EnrollmentRow>[] => [
  {
    accessorKey: "user_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 -ml-2"
        >
          Student
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return (
        <div className="flex flex-col min-w-[180px]">
          <span className="font-medium truncate">{row.getValue("user_name") || "Unknown"}</span>
          <span className="text-xs text-muted-foreground truncate">
            {row.original.user_id}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "course_title",
    header: "Course",
    cell: ({ row }) => {
      return (
        <div className="min-w-[200px] max-w-[300px]">
          <span className="font-medium line-clamp-2">{row.getValue("course_title")}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
        pending: "secondary",
        approved: "default",
        denied: "destructive",
      };
      return (
        <div className="min-w-[100px]">
          <Badge variant={variantMap[status] || "outline"} className="capitalize">
            {status}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "payment_method_name",
    header: "Payment Method",
    cell: ({ row }) => {
      const method = row.getValue("payment_method_name") as string | null;
      return (
        <div className="min-w-[140px]">
          {method ? (
            <Badge variant="outline">{method}</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "final_price",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          Price
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const price = row.getValue("final_price") as number;
      const discount = row.original.discount_applied;
      return (
        <div className="flex flex-col">
          <span className="font-medium">${price.toFixed(2)}</span>
          {discount > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {discount}% off
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "access_duration_days",
    header: "Duration",
    cell: ({ row }) => {
      const days = row.getValue("access_duration_days") as number;
      return <span className="text-sm">{days} days</span>;
    },
  },
  {
    id: "expiry_status",
    header: "Access Status",
    cell: ({ row }) => {
      const status = row.original.status;
      const expiresAt = row.original.access_expires_at;
      const isExpired = row.original.is_expired;

      // Only show for approved enrollments
      if (status !== "approved") {
        return <span className="text-muted-foreground text-sm">—</span>;
      }

      if (isExpired || !expiresAt) {
        return (
          <Badge variant="destructive" className="min-w-[100px] justify-center">
            Expired
          </Badge>
        );
      }

      const now = new Date();
      const expiry = new Date(expiresAt);
      const diffTime = expiry.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysRemaining <= 0) {
        return (
          <Badge variant="destructive" className="min-w-[100px] justify-center">
            Expired
          </Badge>
        );
      }

      // Color coding based on days remaining
      let badgeVariant: "default" | "secondary" | "outline" | "destructive" = "default";
      let colorClass = "";

      if (daysRemaining <= 3) {
        badgeVariant = "destructive";
      } else if (daysRemaining <= 7) {
        badgeVariant = "secondary";
        colorClass = "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
      } else {
        badgeVariant = "default";
        colorClass = "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      }

      return (
        <Badge variant={badgeVariant} className={`min-w-[100px] justify-center ${colorClass}`}>
          {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          Submitted
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return (
        <div className="flex flex-col">
          <span className="text-sm">{format(date, "MMM d, yyyy")}</span>
          <span className="text-xs text-muted-foreground">{format(date, "HH:mm")}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "payment_receipt_url",
    header: "Receipt",
    cell: ({ row }) => {
      const url = row.getValue("payment_receipt_url") as string | null;
      return (
        <div className="min-w-[80px]">
          {url ? (
            <Badge variant="default" className="gap-1">
              <Check className="h-3 w-3" />
              Uploaded
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const status = row.original.status;

      return (
        <div className="flex gap-2 min-w-[240px]">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewDetails(row.original)}
            className="h-8 whitespace-nowrap"
          >
            <Eye className="h-3 w-3 mr-1" />
            Details
          </Button>
          {status === "pending" && (
            <>
              <Button
                size="sm"
                onClick={() => onApprove(row.original.id)}
                className="h-8 whitespace-nowrap"
              >
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDeny(row.original.id)}
                className="h-8 whitespace-nowrap"
              >
                <X className="h-3 w-3 mr-1" />
                Deny
              </Button>
            </>
          )}
        </div>
      );
    },
  },
];

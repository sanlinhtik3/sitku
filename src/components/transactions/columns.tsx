import { ColumnDef } from "@tanstack/react-table";
import { TransactionHistoryRow } from "@/types/transaction";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { IconEye } from "@tabler/icons-react";

export const createColumns = (isAdmin: boolean, onViewDetails: (transaction: TransactionHistoryRow) => void): ColumnDef<TransactionHistoryRow>[] => {
  const baseColumns: ColumnDef<TransactionHistoryRow>[] = [
    {
      accessorKey: "course_title",
      header: "Course",
      cell: ({ row }) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          {row.original.course_thumbnail_url && (
            <img 
              src={row.original.course_thumbnail_url} 
              alt={row.original.course_title}
              className="w-12 h-12 rounded object-cover"
            />
          )}
          <div className="flex flex-col">
            <span className="font-medium">{row.original.course_title}</span>
            <span className="text-xs text-muted-foreground">{row.original.course_slug}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "final_price",
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => (
        <div className="text-right font-medium">
          ${row.original.final_price.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: "discount_applied",
      header: () => <div className="text-right">Discount</div>,
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.discount_applied > 0 ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              -{row.original.discount_applied}%
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "coupon_code",
      header: "Coupon",
      cell: ({ row }) => (
        <div>
          {row.original.coupon_code ? (
            <Badge variant="secondary" className="font-mono">
              {row.original.coupon_code}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "payment_method_name",
      header: "Payment Method",
      cell: ({ row }) => (
        <div>
          {row.original.payment_method_name ? (
            <Badge variant="outline">
              {row.original.payment_method_name}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "payment_submitted_at",
      header: "Date",
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.payment_submitted_at 
            ? format(new Date(row.original.payment_submitted_at), "MMM dd, yyyy")
            : format(new Date(row.original.created_at), "MMM dd, yyyy")
          }
        </div>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewDetails(row.original)}
          className="h-8 w-8"
        >
          <IconEye className="h-4 w-4" />
          <span className="sr-only">View details</span>
        </Button>
      ),
    },
  ];

  // Add user column for admin view
  if (isAdmin) {
    baseColumns.unshift({
      accessorKey: "user_name",
      header: "User",
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.user_name || 'Unknown User'}
        </div>
      ),
    });
  }

  return baseColumns;
};

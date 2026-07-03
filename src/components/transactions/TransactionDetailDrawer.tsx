import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { TransactionHistoryRow } from "@/types/transaction";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { 
  CreditCard, 
  Calendar, 
  Tag, 
  Clock, 
  User, 
  FileText,
  Receipt,
  BookOpen 
} from "lucide-react";

interface TransactionDetailDrawerProps {
  transaction: TransactionHistoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailDrawer({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();

  if (!transaction) return null;

  return (
    <Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[96vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle className="text-2xl">Transaction Details</DrawerTitle>
          <DrawerDescription className="text-base">
            Complete information about this purchase
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Course Information Card */}
            <Card className="overflow-hidden border-muted">
              <CardContent className="p-0">
                {transaction.course_thumbnail_url && (
                  <div className="relative h-48 w-full overflow-hidden">
                    <img 
                      src={transaction.course_thumbnail_url} 
                      alt={transaction.course_title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-white font-semibold text-xl mb-1">
                        {transaction.course_title}
                      </h3>
                      <p className="text-white/80 text-sm flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        {transaction.course_slug}
                      </p>
                    </div>
                  </div>
                )}
                {!transaction.course_thumbnail_url && (
                  <div className="p-6 bg-muted/30">
                    <h3 className="font-semibold text-xl mb-1">
                      {transaction.course_title}
                    </h3>
                    <p className="text-muted-foreground text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      {transaction.course_slug}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User Information (Admin Only) */}
            {isAdmin && transaction.user_name && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Customer</p>
                      <p className="font-semibold">{transaction.user_name}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Breakdown Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-lg">Payment Summary</h3>
                </div>
                
                <div className="space-y-3">
                  {transaction.discount_applied > 0 && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Original Price</span>
                        <span className="line-through text-muted-foreground">
                          ${(transaction.final_price / (1 - transaction.discount_applied / 100)).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Discount ({transaction.discount_applied}%)</span>
                        <span className="font-medium text-green-600">
                          -${((transaction.final_price / (1 - transaction.discount_applied / 100)) - transaction.final_price).toFixed(2)}
                        </span>
                      </div>
                      <div className="h-px bg-border" />
                    </>
                  )}
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-lg">Total Amount</span>
                    <span className="font-bold text-2xl text-primary">${transaction.final_price.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transaction Information Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-lg mb-4">Transaction Details</h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
                      {transaction.payment_method_name ? (
                        <Badge variant="secondary" className="font-medium">
                          {transaction.payment_method_name}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not specified</span>
                      )}
                    </div>
                  </div>
                  
                  {transaction.coupon_code && (
                    <div className="flex items-start gap-3">
                      <Tag className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-1">Coupon Code</p>
                        <Badge variant="outline" className="font-mono font-medium">
                          {transaction.coupon_code}
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">Transaction Date</p>
                      <p className="font-medium">
                        {transaction.payment_submitted_at 
                          ? format(new Date(transaction.payment_submitted_at), "MMMM dd, yyyy 'at' hh:mm a")
                          : format(new Date(transaction.created_at), "MMMM dd, yyyy 'at' hh:mm a")
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Access Information Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-lg">Access Information</h3>
                </div>
                
                <div className="grid gap-4">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm text-muted-foreground">Access Duration</span>
                    <span className="font-semibold">{transaction.access_duration_days} days</span>
                  </div>
                  
                  {transaction.access_expires_at && (
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Expires On</span>
                      <span className="font-semibold">
                        {format(new Date(transaction.access_expires_at), "MMMM dd, yyyy")}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Notes */}
            {transaction.payment_notes && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">Notes</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {transaction.payment_notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Payment Receipt */}
            {transaction.payment_receipt_url && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">Payment Receipt</h3>
                  </div>
                  <div className="rounded-lg overflow-hidden border bg-muted/20">
                    <img 
                      src={transaction.payment_receipt_url} 
                      alt="Payment Receipt"
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <DrawerFooter className="border-t bg-muted/20">
          <DrawerClose asChild>
            <Button variant="outline" size="lg" className="w-full">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { TransactionHistoryTable } from "@/components/transactions/TransactionHistoryTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AdminTransactions() {
  const { transactions, loading, error } = useTransactionHistory();

  // Calculate admin statistics
  const totalRevenue = transactions.reduce((sum, t) => sum + t.final_price, 0);
  const totalTransactions = transactions.length;
  const uniqueCustomers = new Set(transactions.map(t => t.user_id)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load transactions: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transaction History</h1>
        <p className="text-muted-foreground mt-2">
          View and manage all course enrollments and payments
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-3xl">${totalRevenue.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Transactions</CardDescription>
            <CardTitle className="text-3xl">{totalTransactions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Unique Customers</CardDescription>
            <CardTitle className="text-3xl">{uniqueCustomers}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Transactions</CardTitle>
          <CardDescription>
            Complete history of all course enrollments and payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionHistoryTable data={transactions} />
        </CardContent>
      </Card>
    </div>
  );
}

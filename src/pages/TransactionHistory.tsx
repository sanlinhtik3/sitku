import { Navbar } from "@/components/Navbar";
import { TransactionHistoryTable } from "@/components/transactions/TransactionHistoryTable";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { IconReceipt, IconLoader } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";

const TransactionHistory = () => {
  const { isAdmin } = useAuth();
  const { transactions, loading, error } = useTransactionHistory();

  // Calculate total revenue (admin only)
  const totalRevenue = transactions.reduce((sum, t) => sum + t.final_price, 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <IconReceipt className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">
                <span className="text-primary">Transaction</span> History
              </h1>
            </div>
            <p className="text-muted-foreground">
              {isAdmin 
                ? "View all course purchases and transactions" 
                : "View your complete purchase history"
              }
            </p>
          </div>

          {/* Admin Stats */}
          {isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-primary">
                    ${totalRevenue.toFixed(2)}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-primary">
                    {transactions.length}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Transactions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-primary">
                    {new Set(transactions.map(t => t.user_id)).size}
                  </div>
                  <p className="text-sm text-muted-foreground">Unique Customers</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <div className="text-muted-foreground">Loading transactions...</div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="py-12 text-center">
                <p className="text-destructive font-medium">Error loading transactions</p>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Transaction Table */}
          {!loading && !error && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline" className="text-sm">
                  {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <TransactionHistoryTable data={transactions} />
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default TransactionHistory;

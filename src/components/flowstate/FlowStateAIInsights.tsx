import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { 
  Brain, 
  Lightbulb, 
  TrendingUp, 
  Target, 
  MessageSquare, 
  Send, 
  Loader2,
  Sparkles,
  PiggyBank,
  AlertTriangle,
  CheckCircle2,
  Zap
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CurrencyDisplay } from "./ui/CurrencyDisplay";
import type { FlowStateStats, Transaction, CategoryBreakdown } from "@/hooks/useFlowState";
import { cn } from "@/lib/utils";

interface FlowStateAIInsightsProps {
  userId: string;
  stats: FlowStateStats;
  transactions: Transaction[];
  categoryBreakdown: CategoryBreakdown[];
  currency: string;
}

interface AIInsight {
  type: "warning" | "success" | "tip" | "prediction";
  title: string;
  description: string;
  icon: string;
}

interface AIResponse {
  insights: AIInsight[];
  budgetRecommendation: number | null;
  savingsPrediction: number | null;
  monthlyForecast: number | null;
}

export function FlowStateAIInsights({ 
  userId, 
  stats, 
  transactions, 
  categoryBreakdown,
  currency 
}: FlowStateAIInsightsProps) {
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  // Fetch AI insights
  const { data: aiData, isLoading: insightsLoading, refetch: refetchInsights } = useQuery({
    queryKey: ["flowstate-ai-insights", userId, stats.incomeThisMonth, stats.expensesThisMonth],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("flowstate-ai-insights", {
        body: {
          type: "analyze",
          stats,
          transactions: transactions.slice(0, 50).map(t => ({
            type: t.type,
            amount: t.amount,
            category: t.category?.name,
            date: t.transaction_date,
            description: t.description,
          })),
          categoryBreakdown,
          currency,
        },
      });
      if (error) throw error;
      return data as AIResponse;
    },
    enabled: !!userId && transactions.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke("flowstate-ai-insights", {
        body: {
          type: "chat",
          message,
          chatHistory,
          stats,
          categoryBreakdown,
          currency,
        },
      });
      if (error) throw error;
      return data.response as string;
    },
    onSuccess: (response) => {
      setChatHistory(prev => [
        ...prev,
        { role: "user", content: chatMessage },
        { role: "assistant", content: response },
      ]);
      setChatMessage("");
    },
    onError: () => {
      toast.error("Failed to get AI response. Please try again.");
    },
  });

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    chatMutation.mutate(chatMessage);
  };

  const getInsightIcon = (type: AIInsight["type"]) => {
    switch (type) {
      case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "tip": return <Lightbulb className="h-4 w-4 text-blue-500" />;
      case "prediction": return <TrendingUp className="h-4 w-4 text-purple-500" />;
    }
  };

  const getInsightBg = (type: AIInsight["type"]) => {
    switch (type) {
      case "warning": return "bg-amber-500/10 border-amber-500/20";
      case "success": return "bg-emerald-500/10 border-emerald-500/20";
      case "tip": return "bg-blue-500/10 border-blue-500/20";
      case "prediction": return "bg-purple-500/10 border-purple-500/20";
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center mb-4">
          <Brain className="h-8 w-8 text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold mb-2">AI Insights Unavailable</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Add some transactions first to get personalized AI insights and recommendations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold">AI Personal Finance Manager</h3>
            <p className="text-xs text-muted-foreground">Powered by Gemini AI</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetchInsights()}
          disabled={insightsLoading}
          className="gap-1.5"
        >
          <Sparkles className={cn("h-3.5 w-3.5", insightsLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Smart Insights */}
      <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h4 className="font-medium text-sm">Smart Insights</h4>
        </div>
        {insightsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : aiData?.insights && aiData.insights.length > 0 ? (
          <div className="space-y-2">
            {aiData.insights.map((insight, idx) => (
              <div 
                key={idx} 
                className={cn("flex items-start gap-3 p-3 rounded-lg border", getInsightBg(insight.type))}
              >
                {getInsightIcon(insight.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Analyzing your spending patterns...
          </p>
        )}
      </Card>

      {/* Budget & Predictions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Budget Recommendation */}
        <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-emerald-500" />
            <h4 className="font-medium text-sm">Budget Recommendation</h4>
          </div>
          {insightsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : aiData?.budgetRecommendation ? (
            <div>
              <CurrencyDisplay 
                amount={aiData.budgetRecommendation} 
                currency={currency} 
                size="lg" 
                className="text-emerald-500" 
              />
              <p className="text-xs text-muted-foreground mt-1">Suggested monthly budget</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Calculating...</p>
          )}
        </Card>

        {/* Savings Prediction */}
        <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <PiggyBank className="h-4 w-4 text-blue-500" />
            <h4 className="font-medium text-sm">Yearly Savings Forecast</h4>
          </div>
          {insightsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : aiData?.savingsPrediction ? (
            <div>
              <CurrencyDisplay 
                amount={aiData.savingsPrediction} 
                currency={currency} 
                size="lg" 
                showSign
                className={aiData.savingsPrediction >= 0 ? "text-blue-500" : "text-rose-500"} 
              />
              <p className="text-xs text-muted-foreground mt-1">Projected annual savings</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Calculating...</p>
          )}
        </Card>

        {/* Monthly Forecast */}
        <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm sm:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-purple-500" />
            <h4 className="font-medium text-sm">Next Month Expense Forecast</h4>
          </div>
          {insightsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : aiData?.monthlyForecast ? (
            <div className="flex items-center justify-between">
              <div>
                <CurrencyDisplay 
                  amount={aiData.monthlyForecast} 
                  currency={currency} 
                  size="lg" 
                  className="text-purple-500" 
                />
                <p className="text-xs text-muted-foreground mt-1">Based on your spending patterns</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">vs Current Month</p>
                <p className={cn(
                  "text-sm font-medium",
                  aiData.monthlyForecast > stats.expensesThisMonth ? "text-rose-500" : "text-emerald-500"
                )}>
                  {aiData.monthlyForecast > stats.expensesThisMonth ? "+" : "-"}
                  {Math.abs(((aiData.monthlyForecast - stats.expensesThisMonth) / (stats.expensesThisMonth || 1)) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Calculating...</p>
          )}
        </Card>
      </div>

      {/* AI Chat */}
      <Card className="p-4 border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-teal-500" />
          <h4 className="font-medium text-sm">Ask AI</h4>
        </div>
        
        {/* Chat History */}
        {chatHistory.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-3 mb-3 p-3 rounded-lg bg-muted/30">
            {chatHistory.map((msg, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "text-sm p-2 rounded-lg max-w-[85%]",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground ml-auto" 
                    : "bg-muted"
                )}
              >
                {msg.content}
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            placeholder="How can I reduce my expenses? What are some saving tips?"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            className="min-h-[60px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button 
            size="icon" 
            className="shrink-0 h-[60px] w-10 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleSendMessage}
            disabled={!chatMessage.trim() || chatMutation.isPending}
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Quick Prompts */}
        <div className="flex flex-wrap gap-2 mt-3">
          {["How can I save more?", "Reduce my expenses", "Budget tips"].map((prompt) => (
            <button
              key={prompt}
              onClick={() => setChatMessage(prompt)}
              className="text-xs px-2 py-1 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { IconFlask, IconPlayerPlay, IconPlus, IconTrash, IconCheck, IconX } from "@tabler/icons-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvalTest {
  id: string;
  category: string;
  input_message: string;
  expected_tools: string[];
  quality_keywords: string[];
  min_quality_score: number;
  complexity_tier: string;
  is_active: boolean;
}

interface EvalResult {
  test_id: string;
  test_category: string;
  test_input: string;
  model_used: string;
  reasoning_effort: string | null;
  passed: boolean;
  quality_score: number;
  tools_called: string[];
  response_snippet: string;
  latency_ms: number;
  tokens_used: number;
}

interface EvalSummary {
  run_id: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_latency_ms: number;
  avg_quality: number;
  results: EvalResult[];
}

export function BeeBotEvalDashboard() {
  const queryClient = useQueryClient();
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTest, setNewTest] = useState({
    category: "general",
    input_message: "",
    quality_keywords: "",
    complexity_tier: "moderate",
    min_quality_score: 0.7,
  });

  // Fetch existing tests
  const { data: tests, isLoading: testsLoading } = useQuery({
    queryKey: ["eval-tests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_eval_tests")
        .select("*")
        .eq("is_active", true)
        .order("category");
      return (data || []) as EvalTest[];
    },
  });

  // Run evals mutation
  const runEvals = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("beebot-eval", {
        body: { action: "run" },
      });
      if (error) throw error;
      return data as EvalSummary;
    },
    onSuccess: (data) => {
      setEvalSummary(data);
      toast({ title: `Eval Complete: ${data.pass_rate}% passed`, description: `${data.passed}/${data.total} tests passed` });
    },
    onError: (err) => {
      toast({ title: "Eval Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    },
  });

  // Add test mutation
  const addTest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agent_eval_tests").insert({
        category: newTest.category,
        input_message: newTest.input_message,
        quality_keywords: newTest.quality_keywords.split(",").map(k => k.trim()).filter(Boolean),
        complexity_tier: newTest.complexity_tier,
        min_quality_score: newTest.min_quality_score,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eval-tests"] });
      setShowAddForm(false);
      setNewTest({ category: "general", input_message: "", quality_keywords: "", complexity_tier: "moderate", min_quality_score: 0.7 });
      toast({ title: "Test case added" });
    },
  });

  // Delete test
  const deleteTest = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("agent_eval_tests").update({ is_active: false }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["eval-tests"] }),
  });

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconFlask className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">BeeBot Eval Tests</CardTitle>
            <Badge variant="outline" className="text-xs">{tests?.length || 0} tests</Badge>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <IconPlus className="h-4 w-4 mr-1" />
              Add Test
            </Button>
            <Button
              size="sm"
              onClick={() => runEvals.mutate()}
              disabled={runEvals.isPending || !tests?.length}
            >
              {runEvals.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <IconPlayerPlay className="h-4 w-4 mr-1" />
              )}
              Run Evals
            </Button>
          </div>
        </div>
        <CardDescription>Test reasoning effort, tool selection, and response quality across complexity tiers</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Add Test Form */}
        {showAddForm && (
          <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <Select value={newTest.category} onValueChange={v => setNewTest(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="tool_selection">Tool Selection</SelectItem>
                    <SelectItem value="reasoning">Reasoning</SelectItem>
                    <SelectItem value="grounding">Grounding</SelectItem>
                    <SelectItem value="myanmar">Myanmar Language</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Complexity Tier</label>
                <Select value={newTest.complexity_tier} onValueChange={v => setNewTest(p => ({ ...p, complexity_tier: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple</SelectItem>
                    <SelectItem value="turbo">Turbo</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="complex">Complex</SelectItem>
                    <SelectItem value="deep">Deep</SelectItem>
                    <SelectItem value="ultra-deep">Ultra-Deep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Input Message</label>
              <Input
                placeholder="User message to test..."
                value={newTest.input_message}
                onChange={e => setNewTest(p => ({ ...p, input_message: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quality Keywords (comma-separated)</label>
              <Input
                placeholder="keyword1, keyword2, ..."
                value={newTest.quality_keywords}
                onChange={e => setNewTest(p => ({ ...p, quality_keywords: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => addTest.mutate()} disabled={!newTest.input_message}>Save Test</Button>
            </div>
          </div>
        )}

        {/* Test Cases List */}
        {testsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tests?.length ? (
          <div className="space-y-2">
            {tests.map(test => (
              <div
                key={test.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-background/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px]">{test.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{test.complexity_tier}</Badge>
                  </div>
                  <p className="text-sm truncate">{test.input_message}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => deleteTest.mutate(test.id)}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground text-sm py-6">
            No test cases yet. Add some to start evaluating BeeBot.
          </p>
        )}

        {/* Eval Results */}
        {evalSummary && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">Results</h3>
              <Badge className={cn(
                "text-xs",
                evalSummary.pass_rate >= 80 ? "bg-green-500/20 text-green-400" :
                evalSummary.pass_rate >= 50 ? "bg-yellow-500/20 text-yellow-400" :
                "bg-red-500/20 text-red-400"
              )}>
                {evalSummary.pass_rate}% pass rate
              </Badge>
              <span className="text-xs text-muted-foreground">
                Avg: {evalSummary.avg_latency_ms}ms | Quality: {evalSummary.avg_quality}
              </span>
            </div>

            <div className="space-y-2">
              {evalSummary.results.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-3 rounded-lg border",
                    r.passed ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {r.passed ? (
                        <IconCheck className="h-4 w-4 text-green-400" />
                      ) : (
                        <IconX className="h-4 w-4 text-red-400" />
                      )}
                      <span className="text-sm font-medium">{r.test_category}</span>
                      <Badge variant="outline" className="text-[10px]">{r.model_used}</Badge>
                      {r.reasoning_effort && (
                        <Badge variant="secondary" className="text-[10px]">reasoning: {r.reasoning_effort}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Quality: {r.quality_score}</span>
                      <span>{r.latency_ms}ms</span>
                      <span>{r.tokens_used} tokens</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{r.test_input}</p>
                  {r.response_snippet && (
                    <p className="text-xs mt-1 text-foreground/70 line-clamp-2">{r.response_snippet}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

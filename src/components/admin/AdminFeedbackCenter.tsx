import { useState } from "react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconMessageReport,
  IconBug,
  IconBulb,
  IconAlertTriangle,
  IconMessage,
  IconCheck,
  IconClock,
  IconRobot,
  IconSearch,
  IconRefresh,
  IconFilter,
  IconExternalLink,
} from "@tabler/icons-react";
import { useFeedback, UserFeedback, FeedbackStatus } from "@/hooks/useFeedback";
import { FeedbackDiscussion } from "./FeedbackDiscussion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const feedbackTypeIcons: Record<string, React.ReactNode> = {
  bug: <IconBug className="h-4 w-4" />,
  feature_request: <IconBulb className="h-4 w-4" />,
  error: <IconAlertTriangle className="h-4 w-4" />,
  feedback: <IconMessage className="h-4 w-4" />,
  complaint: <IconAlertTriangle className="h-4 w-4" />,
  praise: <IconMessage className="h-4 w-4" />,
};

const statusColors: Record<FeedbackStatus, string> = {
  open: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  in_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ai_processing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  awaiting_admin: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
  wont_fix: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  duplicate: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const severityColors: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

export function AdminFeedbackCenter() {
  const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { allFeedback, isLoadingAllFeedback, refetchAllFeedback, feedbackStats, updateFeedbackStatus } = useFeedback();

  // Filter feedback
  const filteredFeedback = allFeedback?.filter(f => {
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (filterType !== 'all' && f.feedback_type !== filterType) return false;
    if (searchQuery && !f.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !f.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];

  const handleStatusChange = async (feedback: UserFeedback, newStatus: FeedbackStatus) => {
    await updateFeedbackStatus.mutateAsync({ id: feedback.id, status: newStatus });
    if (selectedFeedback?.id === feedback.id) {
      setSelectedFeedback({ ...feedback, status: newStatus });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <IconMessageReport className="h-6 w-6 text-primary" />
            Feedback Center
          </h2>
          <p className="text-muted-foreground">Manage user feedback with Super BeeBot AI</p>
        </div>
        <Button onClick={() => refetchAllFeedback()} variant="outline" size="sm">
          <IconRefresh className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-background/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold">{feedbackStats?.open || 0}</p>
              </div>
              <IconClock className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-background/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-500">{feedbackStats?.critical || 0}</p>
              </div>
              <IconAlertTriangle className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-background/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">AI Processing</p>
                <p className="text-2xl font-bold">{feedbackStats?.aiProcessed || 0}</p>
              </div>
              <IconRobot className="h-8 w-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-background/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-500">{feedbackStats?.resolved || 0}</p>
              </div>
              <IconCheck className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-background/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search feedback..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px] bg-background/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="ai_processing">AI Processing</SelectItem>
                <SelectItem value="awaiting_admin">Awaiting Admin</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px] bg-background/50">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature_request">Feature Request</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feedback List */}
        <Card className="bg-background/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Feedback List ({filteredFeedback.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {isLoadingAllFeedback ? (
                  <div className="py-8 space-y-3 px-4"><div className="h-4 w-3/4 rounded bg-muted/30 animate-pulse" /><div className="h-4 w-1/2 rounded bg-muted/30 animate-pulse" /></div>
                ) : filteredFeedback.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No feedback found</div>
                ) : (
                  filteredFeedback.map((feedback) => (
                    <motion.div
                      key={feedback.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "p-4 rounded-lg border cursor-pointer transition-all",
                        selectedFeedback?.id === feedback.id
                          ? "border-primary bg-primary/10"
                          : "border-border/50 bg-background/30 hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedFeedback(feedback)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "p-1.5 rounded",
                            feedback.feedback_type === 'bug' ? 'bg-red-500/20 text-red-400' :
                            feedback.feedback_type === 'feature_request' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          )}>
                            {feedbackTypeIcons[feedback.feedback_type]}
                          </span>
                          <div>
                            <h4 className="font-medium text-sm line-clamp-1">{feedback.title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(feedback.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={cn("text-xs", statusColors[feedback.status])}>
                            {feedback.status.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline" className={cn("text-xs", severityColors[feedback.severity])}>
                            {feedback.severity}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{feedback.description}</p>
                      {feedback.ai_analysis && (
                        <Badge variant="outline" className="mt-2 text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                          <IconRobot className="h-3 w-3 mr-1" />
                          AI Analyzed
                        </Badge>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card className="bg-background/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-0">
            {selectedFeedback ? (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent p-0">
                  <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="discussion" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                    Discussion
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                    AI Analysis
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="capitalize">{selectedFeedback.feedback_type.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className={severityColors[selectedFeedback.severity]}>{selectedFeedback.severity}</Badge>
                    </div>
                    <h3 className="text-xl font-bold">{selectedFeedback.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(selectedFeedback.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-sm whitespace-pre-wrap">{selectedFeedback.description}</p>
                  </div>

                  {selectedFeedback.page_url && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <IconExternalLink className="h-4 w-4" />
                      <span className="truncate">{selectedFeedback.page_url}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Update Status</p>
                    <div className="flex flex-wrap gap-2">
                      {(['open', 'in_review', 'ai_processing', 'resolved', 'wont_fix'] as FeedbackStatus[]).map((status) => (
                        <Button
                          key={status}
                          variant="outline"
                          size="sm"
                          className={cn(
                            selectedFeedback.status === status && statusColors[status]
                          )}
                          onClick={() => handleStatusChange(selectedFeedback, status)}
                          disabled={updateFeedbackStatus.isPending}
                        >
                          {status.replace('_', ' ')}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="discussion" className="p-0">
                  <FeedbackDiscussion feedbackId={selectedFeedback.id} />
                </TabsContent>

                <TabsContent value="ai" className="p-4">
                  {selectedFeedback.ai_analysis ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <IconRobot className="h-4 w-4" />
                          BeeBot Analysis
                        </h4>
                        <pre className="text-sm whitespace-pre-wrap">
                          {JSON.stringify(selectedFeedback.ai_analysis, null, 2)}
                        </pre>
                      </div>
                      {selectedFeedback.ai_suggested_fix && (
                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                          <h4 className="font-medium mb-2">Suggested Fix</h4>
                          <pre className="text-sm whitespace-pre-wrap">
                            {JSON.stringify(selectedFeedback.ai_suggested_fix, null, 2)}
                          </pre>
                        </div>
                      )}
                      {selectedFeedback.ai_confidence && (
                        <p className="text-sm text-muted-foreground">
                          Confidence: {(selectedFeedback.ai_confidence * 100).toFixed(0)}%
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <IconRobot className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>No AI analysis yet</p>
                      <p className="text-xs">Super BeeBot will analyze this feedback automatically</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <IconMessageReport className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Select a feedback item to view details</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

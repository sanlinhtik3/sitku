import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Hash, Calendar, FolderOpen } from "lucide-react";
import { calculateContentMetrics } from "@/lib/contentMetrics";
import { formatDistanceToNow } from "date-fns";
import { Progress } from "@/components/ui/progress";

interface ContentRow {
  id: string;
  title: string;
  content: string;
  topic?: string;
  tone?: string;
  style?: string;
  language?: string;
  category?: string;
  is_template?: boolean;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

interface ContentAnalyticsDashboardProps {
  contents: ContentRow[];
}

export const ContentAnalyticsDashboard = ({ contents }: ContentAnalyticsDashboardProps) => {
  // Calculate metrics for all content
  const contentWithMetrics = contents.map(content => ({
    ...content,
    metrics: calculateContentMetrics(content.content, content.title)
  }));

  // Top performing content by SEO score
  const topBySEO = [...contentWithMetrics]
    .sort((a, b) => b.metrics.seoScore - a.metrics.seoScore)
    .slice(0, 5);

  // Recent content
  const recentContent = [...contents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Aggregate keyword analysis
  const allKeywords: Record<string, { count: number; totalDensity: number; occurrences: number }> = {};
  contentWithMetrics.forEach(content => {
    content.metrics.topKeywords.forEach(kw => {
      if (!allKeywords[kw.word]) {
        allKeywords[kw.word] = { count: 0, totalDensity: 0, occurrences: 0 };
      }
      allKeywords[kw.word].count += kw.count;
      allKeywords[kw.word].totalDensity += kw.density;
      allKeywords[kw.word].occurrences += 1;
    });
  });

  const topKeywordsOverall = Object.entries(allKeywords)
    .map(([word, data]) => ({
      word,
      count: data.count,
      avgDensity: data.totalDensity / data.occurrences,
      occurrences: data.occurrences
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate overall statistics
  const avgSEOScore = contentWithMetrics.reduce((sum, c) => sum + c.metrics.seoScore, 0) / contentWithMetrics.length || 0;
  const avgWordCount = contentWithMetrics.reduce((sum, c) => sum + c.metrics.wordCount, 0) / contentWithMetrics.length || 0;
  const totalWords = contentWithMetrics.reduce((sum, c) => sum + c.metrics.wordCount, 0);

  // Category distribution
  const categoryData: Record<string, number> = {};
  contents.forEach(content => {
    const cat = content.category || 'uncategorized';
    categoryData[cat] = (categoryData[cat] || 0) + 1;
  });

  const categoryList = Object.entries(categoryData).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = Math.max(...Object.values(categoryData));

  // SEO score distribution
  const seoRanges = { 'Excellent (80-100)': 0, 'Good (60-79)': 0, 'Fair (40-59)': 0, 'Poor (0-39)': 0 };
  contentWithMetrics.forEach(c => {
    const score = c.metrics.seoScore;
    if (score >= 80) seoRanges['Excellent (80-100)']++;
    else if (score >= 60) seoRanges['Good (60-79)']++;
    else if (score >= 40) seoRanges['Fair (40-59)']++;
    else seoRanges['Poor (0-39)']++;
  });

  const maxSEOCount = Math.max(...Object.values(seoRanges));

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contents.length}</div>
            <p className="text-xs text-muted-foreground">pieces of content</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg SEO Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgSEOScore.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">out of 100</p>
            <Progress value={avgSEOScore} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Word Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgWordCount.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">words per piece</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Words</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">across all content</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Content by Category
            </CardTitle>
            <CardDescription>Distribution of content across categories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoryList.map(([category, count]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">{category}</span>
                  <span className="text-muted-foreground">{count} ({((count / contents.length) * 100).toFixed(0)}%)</span>
                </div>
                <Progress value={(count / maxCategoryCount) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO Score Distribution</CardTitle>
            <CardDescription>Quality distribution of your content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(seoRanges).map(([range, count]) => (
              <div key={range} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{range}</span>
                  <span className="text-muted-foreground">{count} pieces</span>
                </div>
                <Progress value={(count / maxSEOCount) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Content and Keywords */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Performing Content
            </CardTitle>
            <CardDescription>Highest SEO scores</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topBySEO.map((content, index) => (
              <div key={content.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                <Badge variant="default" className="mt-1 shrink-0">{index + 1}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{content.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      SEO: {content.metrics.seoScore}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {content.metrics.wordCount} words
                    </span>
                    {content.category && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {content.category}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Top Keywords
            </CardTitle>
            <CardDescription>Most frequently used keywords across all content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topKeywordsOverall.map((keyword, index) => (
              <div key={keyword.word} className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{index + 1}</Badge>
                  <span className="font-medium text-sm">{keyword.word}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {keyword.count}x
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {keyword.occurrences} posts
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Recent Content
          </CardTitle>
          <CardDescription>Latest content created</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentContent.map((content) => (
            <div key={content.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{content.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {content.category && (
                    <Badge variant="secondary" className="text-xs capitalize">{content.category}</Badge>
                  )}
                  {content.topic && (
                    <Badge variant="outline" className="text-xs">{content.topic}</Badge>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                {formatDistanceToNow(new Date(content.created_at), { addSuffix: true })}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

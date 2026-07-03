import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Info } from "lucide-react";
import { calculateContentMetrics } from "@/lib/contentMetrics";

interface AIContentSuggestionsProps {
  content: string;
  title: string;
}

export const AIContentSuggestions = ({ content, title }: AIContentSuggestionsProps) => {
  const metrics = calculateContentMetrics(content, title);
  const suggestions: Array<{ type: 'error' | 'warning' | 'success'; message: string }> = [];

  // Analyze SEO score and provide specific suggestions
  if (metrics.seoScore < 60) {
    suggestions.push({ type: 'error', message: 'SEO score is low. Content needs significant improvements.' });
  } else if (metrics.seoScore < 80) {
    suggestions.push({ type: 'warning', message: 'SEO score is moderate. Some improvements recommended.' });
  } else {
    suggestions.push({ type: 'success', message: 'Excellent SEO score! Content is well-optimized.' });
  }

  // Word count suggestions
  if (metrics.wordCount < 300) {
    suggestions.push({ type: 'error', message: 'Content is too short. Aim for at least 300 words for better SEO.' });
  } else if (metrics.wordCount > 2000) {
    suggestions.push({ type: 'warning', message: 'Content is quite long. Consider breaking it into multiple sections or posts.' });
  }

  // Heading analysis
  const hasHeadings = /#{1,6}\s/.test(content);
  if (!hasHeadings) {
    suggestions.push({ type: 'error', message: 'Add headings (H1, H2, H3) to improve structure and readability.' });
  } else {
    const headingCount = (content.match(/#{1,6}\s/g) || []).length;
    if (headingCount < 3) {
      suggestions.push({ type: 'warning', message: 'Add more headings to break up content and improve scanability.' });
    }
  }

  // Paragraph structure
  if (metrics.paragraphCount < 3) {
    suggestions.push({ type: 'warning', message: 'Use more paragraphs to improve readability. Break up large text blocks.' });
  }

  // Readability
  const avgWordsPerSentence = metrics.wordCount / metrics.sentenceCount;
  if (avgWordsPerSentence > 25) {
    suggestions.push({ type: 'warning', message: 'Sentences are too long. Aim for 15-20 words per sentence for better readability.' });
  } else if (avgWordsPerSentence < 10) {
    suggestions.push({ type: 'warning', message: 'Sentences are very short. Vary sentence length for better flow.' });
  }

  // Keyword density
  if (metrics.topKeywords.length > 0 && metrics.topKeywords[0].density > 5) {
    suggestions.push({ 
      type: 'error', 
      message: `Keyword stuffing detected. The word "${metrics.topKeywords[0].word}" appears ${metrics.topKeywords[0].count} times (${metrics.topKeywords[0].density.toFixed(1)}% density). Reduce usage.` 
    });
  } else if (metrics.topKeywords.length > 0 && metrics.topKeywords[0].density > 3) {
    suggestions.push({ 
      type: 'warning', 
      message: `High keyword density for "${metrics.topKeywords[0].word}" (${metrics.topKeywords[0].density.toFixed(1)}%). Consider reducing usage.` 
    });
  }

  // Title length
  const titleWords = title.split(/\s+/).filter(w => w.length > 0).length;
  if (titleWords < 5) {
    suggestions.push({ type: 'warning', message: 'Title is too short. Aim for 5-10 words for better SEO.' });
  } else if (titleWords > 15) {
    suggestions.push({ type: 'warning', message: 'Title is too long. Keep it under 15 words for better SEO.' });
  }

  const getIcon = (type: 'error' | 'warning' | 'success') => {
    switch (type) {
      case 'error': return <AlertCircle className="h-4 w-4" />;
      case 'warning': return <Info className="h-4 w-4" />;
      case 'success': return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getVariant = (type: 'error' | 'warning' | 'success') => {
    switch (type) {
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      case 'success': return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI Content Suggestions
          <Badge variant="outline">{suggestions.length} suggestions</Badge>
        </CardTitle>
        <CardDescription>
          Recommendations to improve content quality and SEO performance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
            <Badge variant={getVariant(suggestion.type)} className="mt-0.5">
              {getIcon(suggestion.type)}
            </Badge>
            <p className="text-sm flex-1">{suggestion.message}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

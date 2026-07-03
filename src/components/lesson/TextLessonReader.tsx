import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FileText, Clock, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { GeminiContentViewer } from "@/components/ui/GeminiContentViewer";

interface TextLessonReaderProps {
  content: string;
  title: string;
  className?: string;
}

export const TextLessonReader = ({ content, title, className }: TextLessonReaderProps) => {
  const [readingProgress, setReadingProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Calculate reading time (average 200 words per minute)
  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;
      
      const element = contentRef.current;
      const scrollTop = window.scrollY;
      const elementTop = element.offsetTop;
      const elementHeight = element.offsetHeight;
      const windowHeight = window.innerHeight;
      
      const scrollableHeight = elementHeight - windowHeight;
      const scrolled = scrollTop - elementTop;
      
      if (scrolled <= 0) {
        setReadingProgress(0);
      } else if (scrolled >= scrollableHeight) {
        setReadingProgress(100);
      } else {
        setReadingProgress(Math.round((scrolled / scrollableHeight) * 100));
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-muted z-50">
        <div 
          className="h-full bg-primary transition-all duration-150 ease-out"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Reading Stats */}
      <Card className="mb-6 p-4 bg-muted/30 border-border/50">
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Text Lesson</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{readingTime} min read</span>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>{wordCount.toLocaleString()} words</span>
          </div>
          <Badge variant="outline" className="ml-auto">
            {readingProgress}% read
          </Badge>
        </div>
      </Card>

      {/* Content */}
      <div ref={contentRef}>
        <GeminiContentViewer content={content} type="html" />
      </div>
    </div>
  );
};
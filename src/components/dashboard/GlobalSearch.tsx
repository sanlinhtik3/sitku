import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search, BookOpen, FileText, Sparkles, GraduationCap, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Fetch published courses
  const { data: courses } = useQuery({
    queryKey: ["global-search-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, slug, category, difficulty")
        .eq("is_published", true)
        .limit(8)
        .order("view_count", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch published posts/articles
  const { data: posts } = useQuery({
    queryKey: ["global-search-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, title, slug")
        .eq("is_published", true)
        .limit(5)
        .order("view_count", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const handleSelect = (type: string, slug?: string) => {
    setOpen(false);
    switch (type) {
      case "course":
        navigate(`/courses/${slug}`);
        break;
      case "post":
        navigate(`/learn/${slug}`);
        break;
      case "browse-all":
        navigate("/courses");
        break;
      case "my-progress":
        navigate("/learn");
        break;
      case "articles":
        navigate("/learn");
        break;
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-9 w-9 sm:h-10 sm:w-10 border-primary/30 hover:border-primary/50 hover:bg-primary/10 bg-background/50 backdrop-blur-sm"
        aria-label="Search (⌘K)"
      >
        <Search className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search courses, articles..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Quick Actions - Most used */}
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => handleSelect("browse-all")}
              className="gap-2"
            >
              <BookOpen className="h-4 w-4 text-primary" />
              <span>Browse All Courses</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleSelect("my-progress")}
              className="gap-2"
            >
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span>Continue Learning</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleSelect("articles")}
              className="gap-2"
            >
              <FileText className="h-4 w-4 text-violet-500" />
              <span>View Articles</span>
            </CommandItem>
          </CommandGroup>

          {/* Courses */}
          {courses && courses.length > 0 && (
            <CommandGroup heading="Popular Courses">
              {courses.map((course) => (
                <CommandItem
                  key={course.id}
                  onSelect={() => handleSelect("course", course.slug)}
                  className="gap-2"
                >
                  <GraduationCap className="h-4 w-4 text-blue-500" />
                  <div className="flex flex-col">
                    <span>{course.title}</span>
                    {course.category && (
                      <span className="text-xs text-muted-foreground">
                        {course.category} • {course.difficulty || "All levels"}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Posts/Articles */}
          {posts && posts.length > 0 && (
            <CommandGroup heading="Articles">
              {posts.map((post) => (
                <CommandItem
                  key={post.id}
                  onSelect={() => handleSelect("post", post.slug)}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>{post.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

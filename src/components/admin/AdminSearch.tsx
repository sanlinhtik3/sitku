import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Search, BookOpen, Users, FileText, Sparkles } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"

export function AdminSearch() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const { data: courses } = useQuery({
    queryKey: ["admin-search-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, slug")
        .limit(10)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data
    },
    enabled: open,
  })

  const { data: users } = useQuery({
    queryKey: ["admin-search-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .limit(10)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data
    },
    enabled: open,
  })

  const { data: posts } = useQuery({
    queryKey: ["admin-search-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, title, slug")
        .limit(10)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data
    },
    enabled: open,
  })

  const handleSelect = (type: string, id: string, slug?: string) => {
    setOpen(false)
    switch (type) {
      case "course":
        navigate(`/courses/${slug}`)
        break
      case "user":
        window.location.hash = "users"
        break
      case "post":
        navigate(`/learn/${slug}`)
        break
      case "ai-content":
        window.location.hash = "ai-content-writer"
        break
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-9 w-9"
        aria-label="Search (⌘K)"
      >
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search courses, users, content..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {courses && courses.length > 0 && (
            <CommandGroup heading="Courses">
              {courses.map((course) => (
                <CommandItem
                  key={course.id}
                  onSelect={() => handleSelect("course", course.id, course.slug)}
                  className="gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>{course.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {users && users.length > 0 && (
            <CommandGroup heading="Users">
              {users.map((user) => (
                <CommandItem
                  key={user.user_id}
                  onSelect={() => handleSelect("user", user.user_id)}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  <span>{user.full_name || "Unnamed User"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {posts && posts.length > 0 && (
            <CommandGroup heading="Posts">
              {posts.map((post) => (
                <CommandItem
                  key={post.id}
                  onSelect={() => handleSelect("post", post.id, post.slug)}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span>{post.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => handleSelect("ai-content", "")}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span>AI Content Writer</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

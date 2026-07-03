import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Bell, Clock, UserCheck, ShoppingCart, BookOpen } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDistanceToNow } from "date-fns"

export function AdminNotifications() {
  const navigate = useNavigate()

  const { data: pendingEnrollments } = useQuery({
    queryKey: ["admin-pending-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          id,
          created_at,
          course_id,
          courses(title)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  const { data: pendingOrders } = useQuery({
    queryKey: ["admin-pending-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_orders")
        .select("id, created_at, credits_purchased")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  const { data: creatorApplications } = useQuery({
    queryKey: ["admin-pending-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_applications")
        .select("id, created_at, user_id")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  const { data: pendingCourses } = useQuery({
    queryKey: ["admin-pending-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, created_at")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  const totalPending =
    (pendingEnrollments?.length || 0) +
    (pendingOrders?.length || 0) +
    (creatorApplications?.length || 0) +
    (pendingCourses?.length || 0)

  const handleNotificationClick = (type: string, id?: string) => {
    switch (type) {
      case "enrollment":
        window.location.hash = "enrollments"
        break
      case "order":
        window.location.hash = "credit-orders"
        break
      case "application":
        window.location.hash = "creator-applications"
        break
      case "course":
        window.location.hash = "course-approval"
        break
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalPending > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
            >
              {totalPending > 9 ? "9+" : totalPending}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {totalPending > 0 && (
            <Badge variant="secondary" className="ml-2">
              {totalPending} pending
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <ScrollArea className="h-[400px]">
          {totalPending === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No pending items
            </div>
          ) : (
            <>
              {pendingEnrollments && pendingEnrollments.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Pending Enrollments
                  </div>
                  {pendingEnrollments.map((enrollment) => (
                    <DropdownMenuItem
                      key={enrollment.id}
                      onClick={() => handleNotificationClick("enrollment", enrollment.id)}
                      className="cursor-pointer gap-3 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          New enrollment request
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {enrollment.courses?.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(enrollment.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {pendingOrders && pendingOrders.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Pending Orders
                  </div>
                  {pendingOrders.map((order) => (
                    <DropdownMenuItem
                      key={order.id}
                      onClick={() => handleNotificationClick("order", order.id)}
                      className="cursor-pointer gap-3 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
                        <ShoppingCart className="h-4 w-4 text-success" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          Credit purchase order
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.credits_purchased} credits
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(order.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {creatorApplications && creatorApplications.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Creator Applications
                  </div>
                  {creatorApplications.map((app) => (
                    <DropdownMenuItem
                      key={app.id}
                      onClick={() => handleNotificationClick("application", app.id)}
                      className="cursor-pointer gap-3 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                        <UserCheck className="h-4 w-4 text-accent" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          New creator application
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Pending review
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(app.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {pendingCourses && pendingCourses.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Course Approvals
                  </div>
                  {pendingCourses.map((course) => (
                    <DropdownMenuItem
                      key={course.id}
                      onClick={() => handleNotificationClick("course", course.id)}
                      className="cursor-pointer gap-3 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/10">
                        <BookOpen className="h-4 w-4 text-secondary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none line-clamp-1">
                          {course.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Awaiting approval
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(course.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

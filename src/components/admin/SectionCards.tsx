import { useEffect, useState } from "react"
import { IconTrendingUp, IconBook, IconUsers, IconUserCheck, IconFileText } from "@tabler/icons-react"
import { supabase } from "@/integrations/supabase/client"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SectionCards() {
  const [totalCourses, setTotalCourses] = useState(0)
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalEnrollments, setTotalEnrollments] = useState(0)
  const [activePosts, setActivePosts] = useState(0)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    const { count: coursesCount } = await supabase
      .from("courses")
      .select("*", { count: "exact", head: true })

    const { count: usersCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })

    const { count: enrollmentsCount } = await supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })

    const { count: postsCount } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("is_published", true)

    setTotalCourses(coursesCount || 0)
    setTotalUsers(usersCount || 0)
    setTotalEnrollments(enrollmentsCount || 0)
    setActivePosts(postsCount || 0)
  }

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Courses</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalCourses}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconBook className="size-3" />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Available courses
          </div>
          <div className="text-muted-foreground">
            Active learning content
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Users</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalUsers}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUsers className="size-3" />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Registered users
          </div>
          <div className="text-muted-foreground">
            Platform members
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Enrollments</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalEnrollments}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserCheck className="size-3" />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Course enrollments
          </div>
          <div className="text-muted-foreground">
            Student participation
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active Posts</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {activePosts}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconFileText className="size-3" />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Published content
          </div>
          <div className="text-muted-foreground">
            Blog posts live
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

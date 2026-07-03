import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { formatLocalDate } from "@/lib/dateUtils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Pencil, Trash2, Plus } from "lucide-react"

export const AdminCoupons = () => {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<any>(null)
  const [formData, setFormData] = useState({
    code: "",
    discount_percentage: 10,
    max_uses: 100,
    valid_from: formatLocalDate(),
    valid_until: formatLocalDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    is_active: true,
    access_duration_days: 30,
    applicable_course_ids: [] as string[],
  })

  const [courseFilter, setCourseFilter] = useState<'all' | 'specific'>('all')
  
  // Fetch all courses for the dropdown
  const { data: courses } = useQuery({
    queryKey: ['courses-for-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, thumbnail_url')
        .order('title')
      if (error) throw error
      return data
    },
  })

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("coupons").insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] })
      toast.success("Coupon created successfully")
      setIsDialogOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create coupon")
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("coupons").update(data).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] })
      toast.success("Coupon updated successfully")
      setIsDialogOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update coupon")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] })
      toast.success("Coupon deleted successfully")
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete coupon")
    },
  })

  const resetForm = () => {
    setFormData({
      code: "",
      discount_percentage: 10,
      max_uses: 100,
      valid_from: formatLocalDate(),
      valid_until: formatLocalDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      is_active: true,
      access_duration_days: 30,
      applicable_course_ids: [],
    })
    setCourseFilter('all')
    setEditingCoupon(null)
  }

  const handleEdit = (coupon: any) => {
    setEditingCoupon(coupon)
    const hasSpecificCourses = coupon.applicable_course_ids && coupon.applicable_course_ids.length > 0
    setCourseFilter(hasSpecificCourses ? 'specific' : 'all')
    setFormData({
      code: coupon.code,
      discount_percentage: coupon.discount_percentage,
      max_uses: coupon.max_uses,
      valid_from: formatLocalDate(new Date(coupon.valid_from)),
      valid_until: formatLocalDate(new Date(coupon.valid_until)),
      is_active: coupon.is_active,
      access_duration_days: coupon.access_duration_days || 30,
      applicable_course_ids: coupon.applicable_course_ids || [],
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...formData,
      code: formData.code.toUpperCase(),
      applicable_course_ids: courseFilter === 'all' ? null : formData.applicable_course_ids,
    }

    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const generateCode = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase()
    setFormData({ ...formData, code })
  }

  if (isLoading) {
    return <div>Loading coupons...</div>
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Coupon Management</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true) }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCoupon ? "Edit Coupon" : "Create New Coupon"}</DialogTitle>
              <DialogDescription>
                Set up a discount coupon for course enrollments
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Coupon Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="SUMMER2024"
                    required
                  />
                  <Button type="button" variant="outline" onClick={generateCode}>
                    Generate
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount">Discount Percentage</Label>
                <Input
                  id="discount"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.discount_percentage}
                  onChange={(e) => setFormData({ ...formData, discount_percentage: parseInt(e.target.value) })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_uses">Maximum Uses</Label>
                <Input
                  id="max_uses"
                  type="number"
                  min="1"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: parseInt(e.target.value) })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valid_from">Valid From</Label>
                  <Input
                    id="valid_from"
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valid_until">Valid Until</Label>
                  <Input
                    id="valid_until"
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="access_duration">Access Duration</Label>
                <select
                  id="access_duration"
                  value={formData.access_duration_days}
                  onChange={(e) => setFormData({ ...formData, access_duration_days: parseInt(e.target.value) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Course Applicability</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="all_courses"
                      checked={courseFilter === 'all'}
                      onChange={() => {
                        setCourseFilter('all')
                        setFormData({ ...formData, applicable_course_ids: [] })
                      }}
                      className="rounded-full"
                    />
                    <Label htmlFor="all_courses" className="font-normal cursor-pointer">All Courses</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="specific_courses"
                      checked={courseFilter === 'specific'}
                      onChange={() => setCourseFilter('specific')}
                      className="rounded-full"
                    />
                    <Label htmlFor="specific_courses" className="font-normal cursor-pointer">Specific Courses</Label>
                  </div>
                  
                  {courseFilter === 'specific' && (
                    <div className="ml-6 space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                      {courses?.map((course: any) => (
                        <div key={course.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`course-${course.id}`}
                            checked={formData.applicable_course_ids.includes(course.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  applicable_course_ids: [...formData.applicable_course_ids, course.id]
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  applicable_course_ids: formData.applicable_course_ids.filter(id => id !== course.id)
                                })
                              }
                            }}
                            className="rounded"
                          />
                          <Label htmlFor={`course-${course.id}`} className="font-normal cursor-pointer flex items-center gap-2">
                            {course.thumbnail_url && (
                              <img src={course.thumbnail_url} alt="" className="w-8 h-8 rounded object-cover" />
                            )}
                            <span>{course.title}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingCoupon ? "Update" : "Create"} Coupon
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Access Duration</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Applicable To</TableHead>
              <TableHead>Valid Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon: any) => {
              const usagePercent = (coupon.current_uses / coupon.max_uses) * 100
              return (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-semibold">{coupon.code}</TableCell>
                  <TableCell>{coupon.discount_percentage}%</TableCell>
                  <TableCell>{coupon.access_duration_days || 30} days</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{coupon.current_uses} / {coupon.max_uses}</span>
                      </div>
                      <Progress value={usagePercent} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell>
                    {!coupon.applicable_course_ids || coupon.applicable_course_ids.length === 0 ? (
                      <Badge variant="secondary">All Courses</Badge>
                    ) : (
                      <Badge variant="outline">{coupon.applicable_course_ids.length} Course(s)</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(coupon.valid_from).toLocaleDateString()} - {new Date(coupon.valid_until).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={coupon.is_active ? "default" : "secondary"}>
                      {coupon.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(coupon)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this coupon?")) {
                            deleteMutation.mutate(coupon.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
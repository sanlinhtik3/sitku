import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { createColumns, EnrollmentRow } from "./enrollments/columns";
import { EnrollmentDetailDialog } from "./enrollments/EnrollmentDetailDialog";

interface Enrollment {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  coupon_id: string | null;
  discount_applied: number;
  final_price: number;
  access_duration_days: number;
  access_expires_at: string | null;
  is_expired: boolean;
  payment_method_id: string | null;
  payment_receipt_url: string | null;
  payment_notes: string | null;
  payment_submitted_at: string | null;
  courses: {
    title: string;
    price: number;
  };
  coupons?: {
    code: string;
  } | null;
  payment_methods?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

interface Profile {
  full_name: string;
  user_id: string;
}

const ENROLLMENTS_PER_PAGE = 8;

export const AdminEnrollments = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrollmentRow | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchEnrollments();
  }, [searchQuery, statusFilter, currentPage]);

  const fetchEnrollments = async () => {
    setLoading(true);
    const from = currentPage * ENROLLMENTS_PER_PAGE;
    const to = from + ENROLLMENTS_PER_PAGE - 1;

    let query = supabase
      .from("enrollments")
      .select(`
        id,
        user_id,
        status,
        created_at,
        coupon_id,
        discount_applied,
        final_price,
        access_duration_days,
        access_expires_at,
        is_expired,
        payment_method_id,
        payment_receipt_url,
        payment_notes,
        payment_submitted_at,
        courses (title, price),
        coupons (code),
        payment_methods (id, name, type)
      `, { count: 'exact' })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: enrollmentData, error, count } = await query;

    if (!error && enrollmentData) {
      setEnrollments(enrollmentData as Enrollment[]);
      setTotalCount(count || 0);
      
      // Fetch profiles separately
      const userIds = enrollmentData.map(e => e.user_id);
      if (userIds.length > 0) {
        let profileQuery = supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        if (searchQuery) {
          profileQuery = profileQuery.ilike('full_name', `%${searchQuery}%`);
        }

        const { data: profileData } = await profileQuery;
        
        if (profileData) {
          const profileMap: Record<string, string> = {};
          profileData.forEach((p: Profile) => {
            profileMap[p.user_id] = p.full_name;
          });
          setProfiles(profileMap);
        }
      }
    }
    setLoading(false);
  };

  const handleUpdateStatus = async (id: string, status: "approved" | "denied") => {
    const { error } = await supabase
      .from("enrollments")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update enrollment");
    } else {
      toast.success(`Enrollment ${status}`);
      fetchEnrollments();
    }
  };

  const totalPages = Math.ceil(totalCount / ENROLLMENTS_PER_PAGE);
  const pendingCount = enrollments.filter(e => e.status === "pending").length;

  // Transform data for the table
  const tableData: EnrollmentRow[] = enrollments.map((enrollment) => ({
    id: enrollment.id,
    user_id: enrollment.user_id,
    course_id: enrollment.courses ? enrollment.courses.title : "",
    status: enrollment.status,
    created_at: enrollment.created_at,
    payment_receipt_url: enrollment.payment_receipt_url,
    final_price: enrollment.final_price,
    discount_applied: enrollment.discount_applied,
    payment_notes: enrollment.payment_notes,
    payment_submitted_at: enrollment.payment_submitted_at,
    access_duration_days: enrollment.access_duration_days,
    access_expires_at: enrollment.access_expires_at,
    is_expired: enrollment.is_expired,
    user_name: profiles[enrollment.user_id] || "Unknown",
    course_title: enrollment.courses?.title || "Unknown Course",
    payment_method_name: enrollment.payment_methods?.name || null,
  }));

  const columns = createColumns(
    (id) => handleUpdateStatus(id, "approved"),
    (id) => handleUpdateStatus(id, "denied"),
    (enrollment) => {
      setSelectedEnrollment(enrollment);
      setDetailDialogOpen(true);
    }
  );

  return (
    <div className="space-y-6">
      <EnrollmentDetailDialog
        enrollment={selectedEnrollment}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onApprove={(id) => handleUpdateStatus(id, "approved")}
        onDeny={(id) => handleUpdateStatus(id, "denied")}
      />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Enrollment Requests</h2>
        <div className="flex gap-2">
          <Badge variant="outline">{totalCount} Total</Badge>
          {pendingCount > 0 && <Badge variant="default">{pendingCount} Pending</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <Select value={statusFilter} onValueChange={(value) => {
          setStatusFilter(value);
          setCurrentPage(0);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={tableData}
        searchKey="user_name"
        searchPlaceholder="Search by student name..."
        isLoading={loading}
      />

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                className={currentPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  onClick={() => setCurrentPage(i)}
                  isActive={currentPage === i}
                  className="cursor-pointer"
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                className={currentPage === totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};

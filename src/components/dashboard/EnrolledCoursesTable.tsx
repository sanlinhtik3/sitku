import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Crown, Calendar } from "lucide-react";
import { CourseDetailModal } from "./CourseDetailModal";

interface EnrolledCourse {
  id: string;
  course_id: string;
  status: string;
  access_expires_at: string | null;
  is_expired: boolean;
  courses: {
    id: string;
    slug: string;
    title: string;
    description: string;
    thumbnail_url: string;
    category: string;
    instructor_name: string | null;
    difficulty: string | null;
    is_free: boolean;
    lesson_count?: number;
  };
}

interface EnrolledCoursesTableProps {
  enrolledCourses: EnrolledCourse[];
  premiumCourses: Array<{ courseId: string; daysRemaining: number; expiresAt: Date }>;
}

export const EnrolledCoursesTable = ({ enrolledCourses, premiumCourses }: EnrolledCoursesTableProps) => {
  const [selectedCourse, setSelectedCourse] = useState<EnrolledCourse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getCourseExpiryInfo = (courseId: string) => {
    return premiumCourses.find(pc => pc.courseId === courseId);
  };

  const calculateDaysRemaining = (expiryDate: string | null): number | null => {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleViewDetails = (course: EnrolledCourse) => {
    setSelectedCourse(course);
    setIsModalOpen(true);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <>
      <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/50">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="font-bold">Course</TableHead>
              <TableHead className="font-bold">Category</TableHead>
              <TableHead className="font-bold">Type</TableHead>
              <TableHead className="font-bold">Expires</TableHead>
              <TableHead className="text-right font-bold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrolledCourses.map((enrollment) => {
              const expiryInfo = getCourseExpiryInfo(enrollment.course_id);
              const isPremium = !!expiryInfo;

              return (
                <TableRow key={enrollment.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div className="relative h-12 w-12 rounded-md overflow-hidden">
                      <img
                        src={enrollment.courses.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=500"}
                        alt={enrollment.courses.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{enrollment.courses.title}</div>
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {enrollment.courses.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {enrollment.courses.category || "General"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isPremium ? (
                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0">
                        <Crown className="h-3 w-3 mr-1" />
                        Premium
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Free</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {expiryInfo ? (
                        <div>
                          <div className="font-medium">{expiryInfo.daysRemaining}d left</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(enrollment.access_expires_at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          {formatDate(enrollment.access_expires_at)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(enrollment)}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedCourse && (
        <CourseDetailModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          course={selectedCourse}
          daysRemaining={calculateDaysRemaining(selectedCourse.access_expires_at)}
        />
      )}
    </>
  );
};

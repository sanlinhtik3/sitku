import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PublicLayout } from "@/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Lock, Unlock, Play, Clock, CheckCircle, Ticket, AlertCircle, Check, X, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCourseViewTracking } from "@/hooks/useViewTracking";
import { PaymentModal, PaymentData } from "@/components/PaymentModal";
import { usePageMeta, buildOgImageUrl } from "@/hooks/usePageMeta";
import { JsonLd, buildCourseSchema } from "@/components/SEO/JsonLd";

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
  is_free: boolean;
  price: number;
  instructor_name: string;
}

interface Lesson {
  id: string;
  slug: string;
  title: string;
  description: string;
  is_locked: boolean;
  order_index: number;
  duration_minutes: number;
  section_id: string;
}

interface Section {
  id: string;
  title: string;
  description?: string;
  order_index: number;
  lessons: Lesson[];
}

interface CouponValidation {
  valid: boolean;
  error?: string;
  coupon?: {
    code: string;
    discount_percentage: number;
    access_duration_days: number;
    original_price: number;
    discounted_price: number;
    savings: number;
    expires_at: string;
  };
}

const CourseDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrollmentStatus, setEnrollmentStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [couponValidation, setCouponValidation] = useState<CouponValidation | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Track view after 3 seconds
  useCourseViewTracking(course?.id);

  // Dynamic SEO metadata
  const pageMeta = useMemo(() => {
    if (!course) return {};
    return {
      title: `${course.title} | ZOE CRYPTO Courses`,
      description: course.description?.substring(0, 155) || `Learn ${course.title} - free crypto course on ZOE CRYPTO`,
      ogImage: course.thumbnail_url || buildOgImageUrl(course.title, course.instructor_name, 'course'),
    };
  }, [course]);
  usePageMeta(pageMeta);

  const courseSchema = useMemo(() => {
    if (!course) return null;
    return buildCourseSchema({
      title: course.title,
      description: course.description,
      slug: course.slug,
      thumbnail_url: course.thumbnail_url,
      instructor_name: course.instructor_name,
      is_free: course.is_free,
    });
  }, [course]);

  useEffect(() => {
    if (slug) {
      fetchCourseData();
    }
    fetchPaymentMethods();
  }, [slug, user]);

  const fetchPaymentMethods = async () => {
    const { data } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('display_order');
    
    if (data) setPaymentMethods(data);
  };

  const fetchCourseData = async () => {
    const { data: courseData } = await supabase
      .from("courses")
      .select("*")
      .eq("slug", slug)
      .single();

    if (courseData) {
      setCourse(courseData);
    } else {
      navigate("/courses");
      return;
    }

    // Fetch sections
    const { data: sectionsData } = await supabase
      .from("lesson_sections")
      .select("*")
      .eq("course_id", courseData?.id)
      .order("order_index");

    // Check if user is admin or creator
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user?.id || "")
      .single();

    const isAdmin = roleData?.role === "admin";
    const isCreator = courseData?.created_by === user?.id;

    // If course is not published and user is not admin or creator, deny access
    if (!courseData.is_published && !isAdmin && !isCreator) {
      toast.error("This course is not available");
      navigate("/courses");
      return;
    }

    // Fetch lessons - admins and creators can see all, regular users only see published and non-private
    let lessonsQuery = supabase
      .from("lessons")
      .select("*")
      .eq("course_id", courseData?.id)
      .order("order_index");

    // For regular users, filter to published and non-private lessons only
    if (!isAdmin && !isCreator) {
      lessonsQuery = lessonsQuery
        .eq("is_published", true)
        .eq("is_private", false);
    }

    const { data: lessonsData } = await lessonsQuery;

    // Group lessons by section
    if (sectionsData && lessonsData) {
      const sectionsWithLessons: Section[] = sectionsData.map(section => ({
        ...section,
        lessons: lessonsData.filter(lesson => lesson.section_id === section.id)
      }));
      setSections(sectionsWithLessons);
    }

    if (user && courseData) {
      const { data: enrollmentData } = await supabase
        .from("enrollments")
        .select("status")
        .eq("user_id", user.id)
        .eq("course_id", courseData.id)
        .maybeSingle();

      if (enrollmentData) {
        setEnrollmentStatus(enrollmentData.status);
        setIsEnrolled(enrollmentData.status === "approved");
      }
    }

    setLoading(false);
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    setValidatingCoupon(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-coupon', {
        body: {
          couponCode: couponCode.trim(),
          courseId: course?.id,
        },
      });

      if (error) throw error;

      setCouponValidation(data);
      
      if (data.valid) {
        toast.success(`Coupon applied! ${data.coupon.discount_percentage}% discount`);
      } else {
        toast.error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to validate coupon");
      setCouponValidation({ valid: false, error: "Failed to validate coupon" });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode("");
    setCouponValidation(null);
    toast.info("Coupon removed");
  };

  const handleEnroll = async () => {
    if (!user) {
      toast.error("Please sign in to enroll");
      return;
    }

    // Validate coupon first if provided and not already validated
    if (couponCode.trim() && !couponValidation?.valid) {
      toast.error("Please apply your coupon code first");
      return;
    }

    // For free courses, enroll directly
    if (course?.is_free) {
      await enrollDirectly();
      return;
    }

    // For paid courses, show payment modal
    setShowPaymentModal(true);
  };

  const enrollDirectly = async () => {
    setEnrolling(true);
    
    // Optimistic UI update for free courses
    const wasFree = course?.is_free;
    const previousStatus = enrollmentStatus;
    const previousIsEnrolled = isEnrolled;
    
    if (wasFree) {
      // Immediately show enrolled state for free courses
      setIsEnrolled(true);
      setEnrollmentStatus('approved');
      toast.success("Enrollment successful! Redirecting to dashboard...");
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('enroll-with-coupon', {
        body: {
          courseId: course?.id,
          couponCode: couponValidation?.valid ? couponCode.trim() : null,
        },
      });

      if (error) throw error;

      if (data.error) {
        // Revert optimistic update on error
        setIsEnrolled(previousIsEnrolled);
        setEnrollmentStatus(previousStatus);
        toast.error(data.error);
      } else {
        if (!wasFree) {
          toast.success(data.message);
        }
        setEnrollmentStatus(data.enrollment.status);
        if (data.enrollment.status === 'approved') {
          setIsEnrolled(true);
          // Redirect to dashboard after a short delay
          setTimeout(() => navigate('/dashboard'), 1500);
        }
        setCouponCode("");
        setCouponValidation(null);
      }
    } catch (error: any) {
      // Revert optimistic update on error
      setIsEnrolled(previousIsEnrolled);
      setEnrollmentStatus(previousStatus);
      toast.error(error.message || "Failed to enroll");
    } finally {
      setEnrolling(false);
    }
  };

  const handlePaymentSubmit = async (paymentData: PaymentData) => {
    setEnrolling(true);
    try {
      // 1. Upload receipt to storage
      const receiptPath = `${user!.id}/${Date.now()}_${paymentData.receiptFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(receiptPath, paymentData.receiptFile);

      if (uploadError) throw uploadError;

      // 2. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment-receipts')
        .getPublicUrl(receiptPath);

      // 3. Create enrollment with payment info
      const { data, error } = await supabase.functions.invoke('enroll-with-coupon', {
        body: {
          courseId: course?.id,
          couponCode: couponValidation?.valid ? couponCode.trim() : null,
          paymentMethodId: paymentData.paymentMethodId,
          paymentReceiptUrl: publicUrl,
          paymentNotes: paymentData.notes,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Payment submitted! Awaiting admin approval.");
        setShowPaymentModal(false);
        fetchCourseData(); // Refresh enrollment status
        setCouponCode("");
        setCouponValidation(null);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to submit payment");
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary">Loading course...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Course not found</h2>
          <Link to="/courses">
            <Button variant="hero">Browse Courses</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PublicLayout>
      {courseSchema && <JsonLd data={courseSchema} />}
      <div className="min-h-screen bg-background pb-20 md:pb-8">
      
        <main className="py-6 sm:py-8">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Course Info */}
            <div className="lg:col-span-2">
              <div className="mb-4 sm:mb-6">
                <img 
                  src={course.thumbnail_url || "https://images.unsplash.com/photo-1639322537228-f710d846310a?w=800"} 
                  alt={course.title}
                  className="w-full h-48 sm:h-56 md:h-64 object-cover rounded-lg"
                />
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 flex-wrap">
                <Badge variant="outline" className="text-xs sm:text-sm">{course.category}</Badge>
                <Badge className="text-xs sm:text-sm">{course.is_free ? "Free" : `$${course.price}`}</Badge>
              </div>
              
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">{course.title}</h1>
              <p className="text-muted-foreground text-sm sm:text-base md:text-lg mb-4 sm:mb-6">{course.description}</p>
              
              {course.instructor_name && (
                <p className="text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8">
                  Instructor: <span className="text-foreground font-medium">{course.instructor_name}</span>
                </p>
              )}

              {/* Course Content */}
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Course Content</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {sections.reduce((total, section) => total + section.lessons.length, 0)} lessons in {sections.length} sections
                  </p>
                </div>

                {sections.map((section, sectionIndex) => (
                  <div key={section.id} className="space-y-2">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                      <div className="h-px flex-1 bg-border" />
                      <h3 className="text-base sm:text-lg font-semibold text-foreground px-2">
                        {section.title}
                      </h3>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {section.lessons.map((lesson, lessonIndex) => {
                      const canAccess = !lesson.is_locked || isEnrolled || course.is_free;
                      const isLocked = lesson.is_locked && !canAccess;
                      const globalIndex = sections
                        .slice(0, sectionIndex)
                        .reduce((sum, s) => sum + s.lessons.length, 0) + lessonIndex;
                      
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => canAccess && navigate(`/course/${course.slug}/lesson/${lesson.slug}`)}
                          disabled={isLocked}
                          className={`w-full flex items-center gap-2 sm:gap-3 md:gap-4 p-3 sm:p-4 rounded-lg border transition-all group min-h-[44px] ${
                            isLocked 
                              ? 'border-yellow-500/30 bg-yellow-500/5 cursor-not-allowed opacity-70' 
                              : 'border-border/40 hover:border-primary/50 hover:bg-muted/30'
                          }`}
                        >
                          {/* Episode Number */}
                          <span className="text-xs sm:text-sm font-mono font-semibold text-muted-foreground w-6 sm:w-8 flex-shrink-0">
                            {String(globalIndex + 1).padStart(2, '0')}
                          </span>

                          {/* Icon + Title */}
                          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                            <Play className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${
                              isLocked ? 'text-yellow-500/50' : 'text-muted-foreground group-hover:text-primary'
                            } transition-colors`} />
                            <span className={`text-xs sm:text-sm font-medium text-left truncate ${
                              isLocked ? 'text-muted-foreground' : ''
                            }`}>{lesson.title}</span>
                          </div>

                          {/* Duration */}
                          {lesson.duration_minutes && (
                            <div className="hidden sm:flex items-center gap-1 text-xs sm:text-sm text-muted-foreground flex-shrink-0">
                              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span>{lesson.duration_minutes} min</span>
                            </div>
                          )}

                          {/* Status Icon */}
                          <div className="flex-shrink-0">
                            {lesson.is_locked ? (
                              canAccess ? (
                                // Premium lesson but user has access (enrolled)
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              ) : (
                                // Premium lesson and user doesn't have access
                                <Lock className="h-4 w-4 text-red-500" />
                              )
                            ) : (
                              // Free lesson
                              <Unlock className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Enrollment Card */}
            <div className="lg:col-span-1">
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm sticky top-24">
                <CardContent className="p-6 space-y-4">
                  {!user ? (
                    <>
                      <p className="text-sm text-muted-foreground">Sign in to enroll in this course</p>
                      <Button variant="hero" className="w-full" onClick={() => navigate("/auth")}>
                        Sign In to Enroll
                      </Button>
                    </>
                  ) : isEnrolled ? (
                    <>
                      <div className="flex items-center gap-2 text-success">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-semibold">You're enrolled!</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Access all course lessons</p>
                      <Button variant="hero" className="w-full" onClick={() => navigate("/dashboard")}>
                        Go to Dashboard
                      </Button>
                    </>
                  ) : enrollmentStatus === "pending" ? (
                    <>
                      <div className="text-center py-4">
                        <Clock className="h-12 w-12 text-primary mx-auto mb-3" />
                        <p className="font-semibold mb-2">Enrollment Pending</p>
                        <p className="text-sm text-muted-foreground">
                          Your request is awaiting admin approval
                        </p>
                      </div>
                    </>
                  ) : enrollmentStatus === "denied" ? (
                    <>
                      <div className="text-center py-4">
                        <p className="font-semibold mb-2 text-destructive">Enrollment Denied</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Your enrollment request was not approved
                        </p>
                        <Button disabled variant="destructive" className="w-full">
                          Enrollment Denied
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold">
                        {course.is_free ? "Free Course" : `$${course.price}`}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {course.is_free ? "Enroll for free to access this course" : "Request enrollment to access this course"}
                      </p>
                      
                      {!course.is_free && (
                        <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                          {!couponValidation?.valid ? (
                            <>
                              <Label htmlFor="coupon" className="flex items-center gap-2 text-sm">
                                <Ticket className="h-4 w-4" />
                                Have a coupon code?
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  id="coupon"
                                  placeholder="Enter coupon code"
                                  value={couponCode}
                                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                  className="font-mono"
                                  disabled={validatingCoupon}
                                />
                                <Button 
                                  onClick={handleValidateCoupon}
                                  disabled={validatingCoupon || !couponCode.trim()}
                                  size="sm"
                                  variant="outline"
                                >
                                  {validatingCoupon ? "Checking..." : "Apply"}
                                </Button>
                              </div>
                              
                              {couponValidation?.valid === false && couponValidation.error && (
                                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  <span>{couponValidation.error}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between p-3 bg-success/10 rounded-md">
                                <div className="flex items-center gap-2">
                                  <Check className="h-5 w-5 text-success" />
                                  <span className="font-semibold text-success">Coupon Applied!</span>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={handleRemoveCoupon}
                                  className="h-8"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Original Price:</span>
                                  <span className="line-through">${couponValidation.coupon.original_price.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-success">
                                  <span>Discount ({couponValidation.coupon.discount_percentage}%):</span>
                                  <span>-${couponValidation.coupon.savings.toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-border my-2" />
                                <div className="flex justify-between font-bold text-base">
                                  <span>Final Price:</span>
                                  <span className="text-primary">${couponValidation.coupon.discounted_price.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground pt-2">
                                  <Clock className="h-3 w-3" />
                                  <span className="text-xs">Access Duration: {couponValidation.coupon.access_duration_days} days</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <Button 
                        variant="hero" 
                        className="w-full" 
                        onClick={handleEnroll}
                        disabled={enrolling || validatingCoupon}
                      >
                        {enrolling ? "Processing..." : (course.is_free ? "Enroll for Free" : 
                          couponValidation?.valid ? `Enroll for $${couponValidation.coupon.discounted_price.toFixed(2)}` : 
                          "Request Enrollment")}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        courseTitle={course?.title || ""}
        finalPrice={couponValidation?.valid ? couponValidation.coupon.discounted_price : course?.price || 0}
        paymentMethods={paymentMethods}
        onSubmitPayment={handlePaymentSubmit}
        isLoading={enrolling}
      />
      </div>
    </PublicLayout>
  );
};

export default CourseDetail;

import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";

// All admin modules lazy-loaded — only the active hash loads its chunk
const AdminCourses = lazy(() => import("@/components/admin/AdminCourses").then(m => ({ default: m.AdminCourses })));
const AdminUsers = lazy(() => import("@/components/admin/AdminUsers").then(m => ({ default: m.AdminUsers })));
const AdminProSubscriptions = lazy(() => import("@/components/admin/AdminProSubscriptions").then(m => ({ default: m.AdminProSubscriptions })));
const AdminEnrollments = lazy(() => import("@/components/admin/AdminEnrollments").then(m => ({ default: m.AdminEnrollments })));
const AdminPosts = lazy(() => import("@/components/admin/AdminPosts").then(m => ({ default: m.AdminPosts })));
const AdminCoupons = lazy(() => import("@/components/admin/AdminCoupons").then(m => ({ default: m.AdminCoupons })));
const EnhancedDashboardStats = lazy(() => import("@/components/admin/EnhancedDashboardStats").then(m => ({ default: m.EnhancedDashboardStats })));
const AdminPaymentMethods = lazy(() => import("@/components/admin/AdminPaymentMethods").then(m => ({ default: m.AdminPaymentMethods })));
const AdminTransactions = lazy(() => import("@/components/admin/AdminTransactions").then(m => ({ default: m.AdminTransactions })));
const UserStatisticsDashboard = lazy(() => import("@/components/admin/UserStatisticsDashboard").then(m => ({ default: m.UserStatisticsDashboard })));
const AdminCreatorApplications = lazy(() => import("@/components/admin/AdminCreatorApplications").then(m => ({ default: m.AdminCreatorApplications })));
const CreatorManagement = lazy(() => import("@/components/admin/CreatorManagement").then(m => ({ default: m.CreatorManagement })));
const CourseApproval = lazy(() => import("@/components/admin/CourseApproval").then(m => ({ default: m.CourseApproval })));
const AdminTheme = lazy(() => import("@/components/admin/AdminTheme").then(m => ({ default: m.AdminTheme })));
const AIContentWriter = lazy(() => import("@/components/admin/AIContentWriter").then(m => ({ default: m.AIContentWriter })));
const MasterKnowledgeHub = lazy(() => import("@/components/admin/MasterKnowledgeHub").then(m => ({ default: m.MasterKnowledgeHub })));
const AIContentLibrary = lazy(() => import("@/components/admin/AIContentLibrary").then(m => ({ default: m.AIContentLibrary })));
const AdminCreditPlans = lazy(() => import("@/components/admin/AdminCreditPlans").then(m => ({ default: m.AdminCreditPlans })));
const AdminCreditOrders = lazy(() => import("@/components/admin/AdminCreditOrders").then(m => ({ default: m.AdminCreditOrders })));
const AdminReferrals = lazy(() => import("@/components/admin/AdminReferrals").then(m => ({ default: m.AdminReferrals })));
const AdminSessionSettings = lazy(() => import("@/components/admin/AdminSessionSettings").then(m => ({ default: m.AdminSessionSettings })));
const AdminWorkspaces = lazy(() => import("@/components/admin/AdminWorkspaces").then(m => ({ default: m.AdminWorkspaces })));
const AdminCategories = lazy(() => import("@/components/admin/AdminCategories").then(m => ({ default: m.AdminCategories })));

const AdminAIContent = lazy(() => import("@/components/admin/ai-content").then(m => ({ default: m.AdminAIContent })));
const AdminFeatureFlags = lazy(() => import("@/components/admin/AdminFeatureFlags").then(m => ({ default: m.AdminFeatureFlags })));
const AdminCampaigns = lazy(() => import("@/components/admin/AdminCampaigns").then(m => ({ default: m.AdminCampaigns })));
const AdminSRTSettings = lazy(() => import("@/components/admin/AdminSRTSettings").then(m => ({ default: m.AdminSRTSettings })));
const AdminBeeBotPrompts = lazy(() => import("@/components/admin/beebot-prompts").then(m => ({ default: m.AdminBeeBotPrompts })));
const AdminFeedbackCenter = lazy(() => import("@/components/admin/AdminFeedbackCenter").then(m => ({ default: m.AdminFeedbackCenter })));
const AdminFlowState = lazy(() => import("@/components/admin/AdminFlowState").then(m => ({ default: m.AdminFlowState })));
const AdminTokenQuotas = lazy(() => import("@/components/admin/AdminTokenQuotas").then(m => ({ default: m.AdminTokenQuotas })));
const AdminSubAgentMonitor = lazy(() => import("@/components/admin/AdminSubAgentMonitor").then(m => ({ default: m.AdminSubAgentMonitor })));
const NeuroDigitalBrain = lazy(() => import("@/components/admin/NeuroDigitalBrain").then(m => ({ default: m.NeuroDigitalBrain })));
const AdminHeartbeatMonitor = lazy(() => import("@/components/admin/AdminHeartbeatMonitor").then(m => ({ default: m.AdminHeartbeatMonitor })));

const AdminDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash) {
      navigate('#stats', { replace: true });
    }
  }, [location.hash, navigate]);

  const renderContent = () => {
    const hash = location.hash.replace('#', '');
    
    switch (hash) {
      case 'courses': return <AdminCourses />;
      case 'posts': return <AdminPosts />;
      case 'categories': return <AdminCategories />;
      case 'users': return <AdminUsers />;
      case 'enrollments': return <AdminEnrollments />;
      case 'coupons': return <AdminCoupons />;
      case 'payment-methods': return <AdminPaymentMethods />;
      case 'transactions': return <AdminTransactions />;
      case 'user-statistics': return <UserStatisticsDashboard />;
      case "creator-applications": return <AdminCreatorApplications />;
      case "creator-management": return <CreatorManagement />;
      case "course-approval": return <CourseApproval />;
      case "theme": return <AdminTheme />;
      case "ai-content-writer": return <AIContentWriter />;
      case "ai-content-settings": return <AdminAIContent />;
      case "master-hub": return <MasterKnowledgeHub />;
      case "my-workspace": return <AIContentLibrary />;
      case "credit-plans": return <AdminCreditPlans />;
      case "credit-orders": return <AdminCreditOrders />;
      case "referrals": return <AdminReferrals />;
      case "session-settings": return <AdminSessionSettings />;
      case "workspaces": return <AdminWorkspaces />;
      case "feedback-center": return <AdminFeedbackCenter />;
      
      case "feature-flags": return <AdminFeatureFlags />;
      case "campaigns": return <AdminCampaigns />;
      case "srt-settings": return <AdminSRTSettings />;
      case "pro-subscriptions": return <AdminProSubscriptions />;
      case "beebot-prompts": return <AdminBeeBotPrompts />;
      case "flowstate": return <AdminFlowState />;
      case "token-quotas": return <AdminTokenQuotas />;
      case "sub-agents": return <AdminSubAgentMonitor />;
      case "neuro-digital-brain": return <NeuroDigitalBrain />;
      case "heartbeat-monitor": return <AdminHeartbeatMonitor />;
      case "stats":
      default: return <EnhancedDashboardStats />;
    }
  };

  return (
    <AdminLayout>
      <Suspense fallback={null}>
        {renderContent()}
      </Suspense>
    </AdminLayout>
  );
};

export default AdminDashboard;

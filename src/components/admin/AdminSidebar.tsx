import { useLocation } from "react-router-dom"
import {
  IconDashboard,
  IconBook,
  IconUsers,
  IconTicket,
  IconFileText,
  IconSchool,
  IconUserCheck,
  IconSettings,
  IconHelp,
  IconLayoutGrid,
  IconCreditCard,
  IconReceipt,
  IconShield,
  IconChartBar,
  IconPalette,
  IconSparkles,
  IconDatabase,
  IconServer,
  IconBriefcase,
  IconEye,
  
  IconToggleRight,
  IconSpeakerphone,
  IconBrain,
} from "@tabler/icons-react"
import { NavMain } from "./NavMain"
import { NavSecondary } from "./NavSecondary"
import { NavUser } from "./NavUser"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const adminMenuGroups = [
  { 
    title: "Dashboard", 
    icon: IconDashboard, 
    url: "/admin#stats",
    isActive: true,
  },
  {
    title: "Analytics",
    icon: IconChartBar,
    isActive: false,
    items: [
      { title: "User Statistics", url: "/admin#user-statistics", icon: IconChartBar },
    ]
  },
  {
    title: "Content Management",
    icon: IconBook,
    isActive: true,
    items: [
      { title: "Courses", url: "/admin#courses", icon: IconBook },
      { title: "Course Approval", url: "/admin#course-approval", icon: IconUserCheck },
      { title: "Posts", url: "/admin#posts", icon: IconFileText },
      { title: "Categories", url: "/admin#categories", icon: IconLayoutGrid },
      { title: "Campaigns", url: "/admin#campaigns", icon: IconSpeakerphone },
    ]
  },
  {
    title: "User Management", 
    icon: IconUsers,
    isActive: false,
    items: [
      { title: "All Users", url: "/admin#users", icon: IconUsers },
      { title: "Creator Applications", url: "/admin#creator-applications", icon: IconUserCheck },
      { title: "Creator Management", url: "/admin#creator-management", icon: IconUserCheck },
      { title: "Enrollments", url: "/admin#enrollments", icon: IconUserCheck },
      { title: "Referrals", url: "/admin#referrals", icon: IconSparkles },
      { title: "Coupons", url: "/admin#coupons", icon: IconTicket },
      { title: "Payment Methods", url: "/admin#payment-methods", icon: IconCreditCard },
    ]
  },
  {
    title: "Transactions",
    icon: IconReceipt,
    url: "/admin#transactions",
    isActive: false,
  },
  {
    title: "Security",
    icon: IconShield,
    isActive: false,
    items: [
      { title: "Security Center", url: "/admin/security", icon: IconShield },
      { title: "Auth Settings", url: "/admin/auth-settings", icon: IconShield },
      { title: "Session Settings", url: "/admin#session-settings", icon: IconShield },
      { title: "Session Monitor", url: "/admin/session-monitor", icon: IconShield },
      { title: "Security Check", url: "/admin/security-check", icon: IconShield },
    ]
  },
  {
    title: "System",
    icon: IconDatabase,
    isActive: false,
    items: [
      { title: "Database Health", url: "/admin/database-health", icon: IconDatabase },
      { title: "Schema Validation", url: "/admin/schema-validation", icon: IconServer },
    ]
  },
  {
    title: "System Oversight",
    icon: IconEye,
    isActive: false,
    items: [
      { title: "All Workspaces", url: "/admin#workspaces", icon: IconBriefcase },
      { title: "Feedback Center", url: "/admin#feedback-center", icon: IconSpeakerphone },
    ]
  },
  {
    title: "Subscriptions",
    icon: IconCreditCard,
    isActive: false,
    items: [
      { title: "Pro Subscriptions", url: "/admin#pro-subscriptions", icon: IconCreditCard },
      { title: "Credit Plans", url: "/admin#credit-plans", icon: IconCreditCard },
      { title: "Credit Orders", url: "/admin#credit-orders", icon: IconReceipt },
    ]
  },
  {
    title: "AI Tools",
    icon: IconSparkles,
    isActive: false,
    items: [
      { title: "NeuroDigitalBrain", url: "/admin#neuro-digital-brain", icon: IconBrain },
      { title: "Sub-Agent Swarm", url: "/admin#sub-agents", icon: IconBrain },
      { title: "BeeBot Prompts", url: "/admin#beebot-prompts", icon: IconBriefcase },
      { title: "Intelligence Panel", url: "/admin#token-quotas", icon: IconCreditCard },
      { title: "AI Content", url: "/admin#ai-content-settings", icon: IconSparkles },
      { title: "Central Data Hub", url: "/admin#master-hub", icon: IconServer },
      { title: "My Workspace", url: "/admin#my-workspace", icon: IconSchool },
      
      { title: "Easy SRT", url: "/admin#srt-settings", icon: IconSparkles },
      { title: "FlowState", url: "/admin#flowstate", icon: IconReceipt },
      { title: "Heartbeat Monitor", url: "/admin#heartbeat-monitor", icon: IconSparkles },
    ]
  },
  {
    title: "Settings",
    icon: IconSettings,
    isActive: false,
    items: [
      { title: "Theme", url: "/admin#theme", icon: IconPalette },
      { title: "Feature Flags", url: "/admin#feature-flags", icon: IconToggleRight },
    ]
  }
]

const navSecondaryItems = [
  { title: "Settings", url: "#", icon: IconSettings },
  { title: "Get Help", url: "#", icon: IconHelp },
]

export function AdminSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
            >
              <a href="/admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <IconLayoutGrid className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Learning Platform</span>
                  <span className="truncate text-xs">Admin</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={adminMenuGroups} />
        <NavSecondary items={navSecondaryItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
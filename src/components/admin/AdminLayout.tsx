import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AdminSidebar } from "./AdminSidebar"
import { SiteHeader } from "./SiteHeader"
import { ReactNode } from "react"

interface AdminLayoutProps {
  children: ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <SidebarProvider
      defaultOpen={true}
      style={
        {
          "--sidebar-width": "280px",
          "--sidebar-width-mobile": "280px",
          "--header-height": "64px",
        } as React.CSSProperties
      }
    >
      <div className="min-h-screen flex w-full bg-background overflow-x-hidden">
        <AdminSidebar />
        <SidebarInset className="flex flex-col w-full min-w-0">
          <SiteHeader />
          <main className="flex-1 w-full overflow-x-hidden">
            <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 max-w-[100vw] mx-auto">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
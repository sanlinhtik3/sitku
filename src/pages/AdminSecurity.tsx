import { AdminLayout } from "@/components/admin/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TwoFactorSetup } from "@/components/admin/TwoFactorSetup";
import { AuditLogsViewer } from "@/components/admin/AuditLogsViewer";
import { SessionManagement } from "@/components/admin/SessionManagement";
import { Shield } from "lucide-react";

export default function AdminSecurity() {
  return (
    <AdminLayout>
      <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Security Center</h1>
      </div>
      
      <Tabs defaultValue="2fa" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="2fa">Two-Factor Auth</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="2fa" className="space-y-4">
          <TwoFactorSetup />
        </TabsContent>
        
        <TabsContent value="audit" className="space-y-4">
          <AuditLogsViewer />
        </TabsContent>
        
        <TabsContent value="sessions" className="space-y-4">
          <SessionManagement />
        </TabsContent>
      </Tabs>
      </div>
    </AdminLayout>
  );
}

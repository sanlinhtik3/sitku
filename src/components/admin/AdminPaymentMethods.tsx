import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, Loader2, Image as ImageIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  display_order: number;
  qr_code_url?: string;
  account_number?: string;
  account_name?: string;
  instructions?: string;
  is_active: boolean;
  created_at: string;
}

export const AdminPaymentMethods = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "qr_code",
    qr_code_file: null as File | null,
    account_number: "",
    account_name: "",
    instructions: "",
    is_active: true,
  });

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setMethods(data || []);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      toast({
        title: "Error",
        description: "Failed to load payment methods",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (method?: PaymentMethod) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        name: method.name,
        type: method.type,
        qr_code_file: null,
        account_number: method.account_number || "",
        account_name: method.account_name || "",
        instructions: method.instructions || "",
        is_active: method.is_active,
      });
    } else {
      setEditingMethod(null);
      setFormData({
        name: "",
        type: "qr_code",
        qr_code_file: null,
        account_number: "",
        account_name: "",
        instructions: "",
        is_active: true,
      });
    }
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Payment method name is required",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      let qrCodeUrl = editingMethod?.qr_code_url || "";

      // Upload QR code if provided
      if (formData.qr_code_file && formData.type === "qr_code") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileExt = formData.qr_code_file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("payment-qr-codes")
          .upload(filePath, formData.qr_code_file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("payment-qr-codes")
          .getPublicUrl(filePath);

        qrCodeUrl = publicUrl;
      }

      const methodData = {
        name: formData.name,
        type: formData.type,
        qr_code_url: formData.type === "qr_code" ? qrCodeUrl : null,
        account_number: formData.type !== "qr_code" ? formData.account_number : null,
        account_name: formData.type === "account_number" ? formData.account_name : null,
        instructions: formData.instructions || null,
        is_active: formData.is_active,
        display_order: editingMethod ? editingMethod.display_order : methods.length,
      };

      if (editingMethod) {
        const { error } = await supabase
          .from("payment_methods")
          .update(methodData)
          .eq("id", editingMethod.id);

        if (error) throw error;
        toast({ title: "Success", description: "Payment method updated successfully" });
      } else {
        const { error } = await supabase
          .from("payment_methods")
          .insert([methodData]);

        if (error) throw error;
        toast({ title: "Success", description: "Payment method added successfully" });
      }

      setShowDialog(false);
      fetchMethods();
    } catch (error) {
      console.error("Error saving payment method:", error);
      toast({
        title: "Error",
        description: "Failed to save payment method",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!methodToDelete) return;

    try {
      const { error } = await supabase
        .from("payment_methods")
        .delete()
        .eq("id", methodToDelete.id);

      if (error) {
        // Handle FK constraint error specifically
        if (error.code === '23503') {
          toast({
            title: "Cannot Delete",
            description: "This payment method is being used by existing records. Please try again.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({ title: "Success", description: "Payment method deleted successfully" });
      fetchMethods();
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast({
        title: "Error",
        description: "Failed to delete payment method",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setMethodToDelete(null);
    }
  };

  const handleToggleActive = async (method: PaymentMethod) => {
    try {
      const { error } = await supabase
        .from("payment_methods")
        .update({ is_active: !method.is_active })
        .eq("id", method.id);

      if (error) throw error;
      fetchMethods();
      toast({ 
        title: "Success", 
        description: `Payment method ${!method.is_active ? 'activated' : 'deactivated'}` 
      });
    } catch (error) {
      console.error("Error toggling status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleReorder = async (method: PaymentMethod, direction: 'up' | 'down') => {
    const currentIndex = methods.findIndex(m => m.id === method.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= methods.length) return;

    const newMethods = [...methods];
    [newMethods[currentIndex], newMethods[newIndex]] = [newMethods[newIndex], newMethods[currentIndex]];

    try {
      const updates = newMethods.map((m, idx) => ({
        id: m.id,
        display_order: idx,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("payment_methods")
          .update({ display_order: update.display_order })
          .eq("id", update.id);

        if (error) throw error;
      }

      fetchMethods();
    } catch (error) {
      console.error("Error reordering:", error);
      toast({
        title: "Error",
        description: "Failed to reorder payment methods",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Payment Methods</h2>
          <p className="text-muted-foreground">Manage payment options for course enrollments</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Payment Method
        </Button>
      </div>

      {methods.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No payment methods configured yet.</p>
            <Button onClick={() => handleOpenDialog()} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Payment Method
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {methods.map((method, index) => (
            <Card key={method.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReorder(method, 'up')}
                        disabled={index === 0}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReorder(method, 'down')}
                        disabled={index === methods.length - 1}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {method.name}
                        <Badge variant={method.is_active ? "default" : "secondary"}>
                          {method.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="capitalize">{method.type.replace('_', ' ')}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(method)}
                    >
                      {method.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(method)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMethodToDelete(method);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {method.type === 'qr_code' && method.qr_code_url && (
                    <div>
                      <p className="text-sm font-medium mb-2">QR Code:</p>
                      <img 
                        src={method.qr_code_url} 
                        alt={`${method.name} QR`}
                        className="max-w-xs rounded border"
                      />
                    </div>
                  )}
                  {method.account_number && (
                    <div>
                      <p className="text-sm font-medium">
                        {method.type === 'crypto' ? 'Wallet Address' : 'Account Number'}:
                      </p>
                      <p className="font-mono text-sm text-muted-foreground">{method.account_number}</p>
                    </div>
                  )}
                  {method.account_name && (
                    <div>
                      <p className="text-sm font-medium">Account Name:</p>
                      <p className="text-sm text-muted-foreground">{method.account_name}</p>
                    </div>
                  )}
                  {method.instructions && (
                    <div>
                      <p className="text-sm font-medium">Instructions:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{method.instructions}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMethod ? 'Edit' : 'Add'} Payment Method</DialogTitle>
            <DialogDescription>
              Configure payment details that users will see when enrolling in courses
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Method Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Binance Pay, KBZ Pay"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Payment Type *</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr_code">QR Code</SelectItem>
                  <SelectItem value="account_number">Account Number</SelectItem>
                  <SelectItem value="crypto">Cryptocurrency</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === 'qr_code' && (
              <div className="space-y-2">
                <Label htmlFor="qr_code">QR Code Image {!editingMethod && '*'}</Label>
                <Input
                  id="qr_code"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFormData({ ...formData, qr_code_file: e.target.files?.[0] || null })}
                />
                {editingMethod?.qr_code_url && !formData.qr_code_file && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground mb-2">Current QR Code:</p>
                    <img src={editingMethod.qr_code_url} alt="Current QR" className="max-w-xs rounded border" />
                  </div>
                )}
              </div>
            )}

            {(formData.type === 'account_number' || formData.type === 'crypto') && (
              <div className="space-y-2">
                <Label htmlFor="account_number">
                  {formData.type === 'crypto' ? 'Wallet Address' : 'Account Number'} *
                </Label>
                <Input
                  id="account_number"
                  placeholder={formData.type === 'crypto' ? '0x...' : '123-456-789'}
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className={formData.type === 'crypto' ? 'font-mono' : ''}
                />
              </div>
            )}

            {formData.type === 'account_number' && (
              <div className="space-y-2">
                <Label htmlFor="account_name">Account Name *</Label>
                <Input
                  id="account_name"
                  placeholder="Account holder name"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="instructions">Payment Instructions</Label>
              <Textarea
                id="instructions"
                placeholder="Step-by-step instructions for users..."
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="active">Active (visible to users)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>{editingMethod ? 'Update' : 'Add'} Method</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the payment method "{methodToDelete?.name}". 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

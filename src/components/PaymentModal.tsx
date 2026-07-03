import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, FileText, Image as ImageIcon, AlertCircle } from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  display_order: number;
  qr_code_url?: string;
  account_number?: string;
  account_name?: string;
  instructions?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  finalPrice: number;
  paymentMethods: PaymentMethod[];
  onSubmitPayment: (data: PaymentData) => void;
  isLoading: boolean;
}

export interface PaymentData {
  paymentMethodId: string;
  receiptFile: File;
  notes?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

export const PaymentModal = ({
  isOpen,
  onClose,
  courseTitle,
  finalPrice,
  paymentMethods,
  onSubmitPayment,
  isLoading,
}: PaymentModalProps) => {
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 5MB");
      return;
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, or PDF files are allowed");
      return;
    }

    setReceiptFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl("");
    }
  };

  const handleSubmit = () => {
    if (!selectedMethodId) {
      setError("Please select a payment method");
      return;
    }

    if (!receiptFile) {
      setError("Please upload your payment receipt");
      return;
    }

    onSubmitPayment({
      paymentMethodId: selectedMethodId,
      receiptFile,
      notes: notes.trim(),
    });
  };

  const handleClose = () => {
    if (!isLoading) {
      setSelectedMethodId("");
      setReceiptFile(null);
      setNotes("");
      setError("");
      setPreviewUrl("");
      onClose();
    }
  };

  const selectedMethod = paymentMethods.find(m => m.id === selectedMethodId);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Complete Payment for {courseTitle}</DialogTitle>
          <DialogDescription>
            Amount to Pay: <span className="text-xl font-bold text-primary">${finalPrice.toFixed(2)}</span>
          </DialogDescription>
        </DialogHeader>

        {paymentMethods.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No payment methods available. Please contact support to complete your enrollment.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-semibold mb-3 block">Select Payment Method</Label>
              <Tabs value={selectedMethodId} onValueChange={setSelectedMethodId}>
                <TabsList className="grid w-full grid-cols-auto" style={{ gridTemplateColumns: `repeat(${paymentMethods.length}, minmax(0, 1fr))` }}>
                  {paymentMethods.map((method) => (
                    <TabsTrigger key={method.id} value={method.id}>
                      {method.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {paymentMethods.map((method) => (
                  <TabsContent key={method.id} value={method.id} className="mt-4 space-y-4">
                    <div className="border rounded-lg p-4 bg-muted/30">
                      {method.type === 'qr_code' && method.qr_code_url && (
                        <div className="flex flex-col items-center space-y-3">
                          <p className="text-sm font-medium">Scan QR Code to Pay</p>
                          <img 
                            src={method.qr_code_url} 
                            alt={`${method.name} QR Code`}
                            className="max-w-xs rounded-lg border-2 border-border"
                          />
                        </div>
                      )}

                      {method.type === 'account_number' && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Transfer to Account</p>
                          {method.account_number && (
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">Account Number</span>
                              <span className="font-mono text-sm">{method.account_number}</span>
                            </div>
                          )}
                          {method.account_name && (
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">Account Name</span>
                              <span className="font-mono text-sm">{method.account_name}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {method.type === 'crypto' && method.account_number && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Cryptocurrency Wallet</p>
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Wallet Address</span>
                            <span className="font-mono text-xs break-all">{method.account_number}</span>
                          </div>
                        </div>
                      )}

                      {method.instructions && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium mb-2">Instructions:</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{method.instructions}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {selectedMethod && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="receipt" className="text-base font-semibold">
                    Upload Payment Receipt <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="receipt"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      disabled={isLoading}
                      className="cursor-pointer"
                    />
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Accepted formats: JPG, PNG, PDF (Max 5MB)
                  </p>
                </div>

                {receiptFile && (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <p className="text-sm font-medium mb-3">Receipt Preview:</p>
                    {previewUrl ? (
                      <img 
                        src={previewUrl} 
                        alt="Receipt preview"
                        className="max-w-sm rounded border"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="h-5 w-5 text-primary" />
                        <span>{receiptFile.name}</span>
                        <span className="text-muted-foreground">
                          ({(receiptFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-base font-semibold">
                    Additional Notes <span className="text-muted-foreground text-sm font-normal">(Optional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any additional information about your payment..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isLoading}
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {notes.length}/500
                  </p>
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || !selectedMethodId || !receiptFile || paymentMethods.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Payment Request"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

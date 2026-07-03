import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Section {
  id: string;
  title: string;
  description?: string;
  order_index: number;
}

interface SectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section?: Section | null;
  onSave: (data: { title: string; description?: string }) => Promise<void>;
  title: string;
  description: string;
}

export function SectionDialog({
  open,
  onOpenChange,
  section,
  onSave,
  title,
  description,
}: SectionDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (section) {
      setFormData({
        title: section.title || "",
        description: section.description || "",
      });
    } else {
      setFormData({ title: "", description: "" });
    }
  }, [section, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onOpenChange(false);
      setFormData({ title: "", description: "" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-title">Section Title *</Label>
              <Input
                id="section-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Introduction, Advanced Topics"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-description">Description (Optional)</Label>
              <Textarea
                id="section-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this section..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Section"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

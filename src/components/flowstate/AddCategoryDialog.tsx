import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { toast } from "sonner";
import { Loader2 } from "@/components/flowstate/solarIcons";
import { cn } from "@/lib/utils";
import { CATEGORY_ICON_OPTIONS, CategoryIcon } from "./CategoryIcon";

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "income" | "expense";
  userId: string;
  onSuccess: () => void;
}

const COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#F97316", // Orange
];

export function AddCategoryDialog({ open, onOpenChange, type, userId, onSuccess }: AddCategoryDialogProps) {
  const [name, setName] = useState("");
  const [nameMy, setNameMy] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string>(CATEGORY_ICON_OPTIONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const addCategoryMutation = useMutation({
    mutationFn: async () => {
      await financeStore.addCategory(userId, {
        name,
        name_my: nameMy.trim() || null,
        icon: selectedIcon,
        color: selectedColor,
        type,
        group: "Custom",
      });
    },
    onSuccess: () => {
      toast.success("Category added");
      onSuccess();
      onOpenChange(false);
      setName("");
      setNameMy("");
      setSelectedIcon(CATEGORY_ICON_OPTIONS[0]);
      setSelectedColor(COLORS[0]);
    },
    onError: () => {
      toast.error("Failed to add category");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    addCategoryMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flowstate-entry-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add {type === "income" ? "Income" : "Expense"} Category
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category Name */}
          <div className="space-y-2">
            <Label>Category Name</Label>
            <Input
              placeholder="e.g., Groceries"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Myanmar name <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="ဥပမာ ကုန်စုံဝယ်ယူမှု"
              value={nameMy}
              onChange={(event) => setNameMy(event.target.value)}
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>Solar icon</Label>
            <div className="grid max-h-36 grid-cols-8 gap-2 overflow-y-auto pr-1">
              {CATEGORY_ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  aria-label={`Use ${icon} icon`}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-[var(--radius)] transition-colors",
                    selectedIcon === icon
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <CategoryIcon icon={icon} color={selectedIcon === icon ? "currentColor" : selectedColor} />
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    selectedColor === color && "ring-2 ring-offset-2 ring-offset-background"
                  )}
                  style={{ 
                    backgroundColor: color,
                    ...(selectedColor === color && { boxShadow: `0 0 0 2px ${color}` }),
                  }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 rounded-[var(--radius)] bg-muted/50 p-3">
            <CategoryIcon
              icon={selectedIcon}
              color={selectedColor}
              containerClassName="h-10 w-10 rounded-[var(--radius)]"
              style={{ backgroundColor: `${selectedColor}20` }}
            />
            <div>
              <p className="font-medium">{name || "Category Name"}</p>
              <p className="text-xs text-muted-foreground">{nameMy || `Custom ${type}`}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={addCategoryMutation.isPending || !name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {addCategoryMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Add Category"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

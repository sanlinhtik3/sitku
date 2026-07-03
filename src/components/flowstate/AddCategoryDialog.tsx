import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "income" | "expense";
  userId: string;
  onSuccess: () => void;
}

const ICONS = [
  { name: "Briefcase", emoji: "💼" },
  { name: "ShoppingCart", emoji: "🛒" },
  { name: "Utensils", emoji: "🍽️" },
  { name: "Car", emoji: "🚗" },
  { name: "Home", emoji: "🏠" },
  { name: "Heart", emoji: "❤️" },
  { name: "Gamepad2", emoji: "🎮" },
  { name: "GraduationCap", emoji: "🎓" },
  { name: "Plane", emoji: "✈️" },
  { name: "Gift", emoji: "🎁" },
  { name: "Wallet", emoji: "💰" },
  { name: "CreditCard", emoji: "💳" },
  { name: "Coffee", emoji: "☕" },
  { name: "Music", emoji: "🎵" },
  { name: "Book", emoji: "📚" },
  { name: "Dumbbell", emoji: "🏋️" },
];

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
  const [selectedIcon, setSelectedIcon] = useState(ICONS[0].name);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const addCategoryMutation = useMutation({
    mutationFn: async () => {
      await financeStore.addCategory(userId, { name, icon: selectedIcon, color: selectedColor, type });
    },
    onSuccess: () => {
      toast.success("Category added");
      onSuccess();
      onOpenChange(false);
      setName("");
      setSelectedIcon(ICONS[0].name);
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
      <DialogContent className="sm:max-w-md">
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

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-8 gap-2">
              {ICONS.map((icon) => (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() => setSelectedIcon(icon.name)}
                  className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center text-lg transition-all",
                    selectedIcon === icon.name
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {icon.emoji}
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
          <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
            <div 
              className="h-10 w-10 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundColor: `${selectedColor}20` }}
            >
              {ICONS.find(i => i.name === selectedIcon)?.emoji}
            </div>
            <div>
              <p className="font-medium">{name || "Category Name"}</p>
              <p className="text-xs text-muted-foreground capitalize">{type}</p>
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

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronRight } from "@/components/flowstate/solarIcons";
import { CategoryIcon } from "./CategoryIcon";
import {
  CATEGORY_GROUP_ORDER,
  categorySearchText,
  isLegacyBroadSystemCategory,
} from "@/lib/flowstate/categoryCatalog";
import type { TransactionCategory } from "@/hooks/useFlowState";
import { cn } from "@/lib/utils";

interface CategoryPickerProps {
  categories: TransactionCategory[];
  value: string;
  onValueChange: (value: string) => void;
  type?: "income" | "expense";
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}

export function CategoryPicker({
  categories,
  value,
  onValueChange,
  type,
  placeholder = "Choose a category",
  allowEmpty = false,
  emptyLabel = "Uncategorized",
  className,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((category) => category.id === value);

  const groups = useMemo(() => {
    const grouped = new Map<string, TransactionCategory[]>();
    categories
      .filter((category) =>
        (!type || category.type === type)
        && !isLegacyBroadSystemCategory(category)
      )
      .forEach((category) => {
        const group = category.group || (category.is_system ? "General" : "Custom");
        grouped.set(group, [...(grouped.get(group) || []), category]);
      });

    return [...grouped.entries()]
      .map(([name, rows]) => ({
        name,
        rows: rows.sort((a, b) =>
          (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)
        ),
      }))
      .sort((a, b) => {
        const aIndex = CATEGORY_GROUP_ORDER.indexOf(a.name);
        const bIndex = CATEGORY_GROUP_ORDER.indexOf(b.name);
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
  }, [categories, type]);

  const choose = (id: string) => {
    onValueChange(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-12 w-full justify-between border-border/50 bg-muted/30 px-3 font-normal hover:bg-muted/50",
            !selected && value !== "none" && "text-muted-foreground",
            className,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <CategoryIcon
                icon={selected.icon}
                color={selected.color}
                containerClassName="h-8 w-8 shrink-0 rounded-[var(--radius)]"
                style={{ backgroundColor: `${selected.color}18` }}
              />
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-medium">{selected.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {selected.group || selected.name_my || selected.type}
                </span>
              </span>
            </span>
          ) : (
            <span>{value === "none" ? emptyLabel : placeholder}</span>
          )}
          <ChevronRight className="h-4 w-4 rotate-90 opacity-45" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(430px,calc(100vw-2rem))] overflow-hidden border-border/60 bg-popover p-0 shadow-xl"
      >
        <Command>
          <CommandInput placeholder="Search food, electricity, rent..." />
          <CommandList className="max-h-[min(420px,60vh)]">
            <CommandEmpty>No matching category.</CommandEmpty>
            {allowEmpty && (
              <CommandGroup heading="General">
                <CommandItem value={emptyLabel} onSelect={() => choose("none")} className="min-h-11">
                  <CategoryIcon icon="more" containerClassName="mr-3 h-8 w-8 rounded-[var(--radius)] bg-muted" />
                  <span className="flex-1">{emptyLabel}</span>
                  {value === "none" && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup key={group.name} heading={group.name}>
                {group.rows.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={categorySearchText(category)}
                    onSelect={() => choose(category.id)}
                    className="min-h-12 gap-3 py-2"
                  >
                    <CategoryIcon
                      icon={category.icon}
                      color={category.color}
                      containerClassName="h-8 w-8 shrink-0 rounded-[var(--radius)]"
                      style={{ backgroundColor: `${category.color}18` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{category.name}</span>
                      {category.name_my && (
                        <span className="block truncate text-[10px] text-muted-foreground">{category.name_my}</span>
                      )}
                    </span>
                    {value === category.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Virtualized transaction list. Below THRESHOLD it renders plainly (zero behavior
// change for small vaults); above it, only the visible rows are in the DOM so a
// 2k-transaction list stays smooth on a 4GB device. Mirrors the proven pattern in
// ChatMessageList (threshold + estimateSize + measureElement). It virtualizes
// against the SHARED tabs scroller (passed via scrollParentRef) using `scrollMargin`,
// so there's no nested scroll container.

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TransactionRow } from "./TransactionRow";
import type { Transaction } from "@/hooks/useFlowState";

const THRESHOLD = 50;     // below this, plain render — no virtualization overhead
const ROW_EST = 72;       // TransactionRow (~p-3) + 8px gap; measureElement corrects it

interface Props {
  transactions: Transaction[];
  scrollParentRef: React.RefObject<HTMLElement>;
  primaryCurrency: string;
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
  isDeleting: boolean;
}

export function VirtualTransactionList({ transactions, scrollParentRef, primaryCurrency, onDelete, onEdit, isDeleting }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = transactions.length >= THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? transactions.length : 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_EST,
    overscan: 10,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ROW_EST,
    getItemKey: (i) => transactions[i]?.id ?? i,
    // The list lives partway down the shared scroller — offset the virtual window.
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  if (!shouldVirtualize) {
    return (
      <div className="space-y-2">
        {transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            primaryCurrency={primaryCurrency}
            onDelete={onDelete}
            onEdit={onEdit}
            isDeleting={isDeleting}
          />
        ))}
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  const scrollMargin = virtualizer.options.scrollMargin;

  return (
    <div ref={containerRef} style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
      {items.map((vi) => {
        const tx = transactions[vi.index];
        if (!tx) return null;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start - scrollMargin}px)`,
              paddingBottom: 8,
            }}
          >
            <TransactionRow
              transaction={tx}
              primaryCurrency={primaryCurrency}
              onDelete={onDelete}
              onEdit={onEdit}
              isDeleting={isDeleting}
            />
          </div>
        );
      })}
    </div>
  );
}

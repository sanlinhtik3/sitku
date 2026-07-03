"use client";

import * as React from "react";
import { ColumnDef, ColumnFiltersState, SortingState, VisibilityState, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  onSearchChange?: (value: string) => void;
  pageIndex?: number;
  onPageChange?: (index: number) => void;
}
export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Filter...",
  isLoading = false,
  onSearchChange,
  pageIndex: externalPageIndex,
  onPageChange
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [internalPageIndex, setInternalPageIndex] = React.useState(0);
  
  // Use external pagination if provided, otherwise internal
  const currentPageIndex = externalPageIndex !== undefined ? externalPageIndex : internalPageIndex;
  
  const table = useReactTable({
    data,
    columns,
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      const newState = typeof updater === 'function' 
        ? updater({ pageIndex: currentPageIndex, pageSize: 10 })
        : updater;
      if (onPageChange) {
        onPageChange(newState.pageIndex);
      } else {
        setInternalPageIndex(newState.pageIndex);
      }
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: { pageIndex: currentPageIndex, pageSize: 10 }
    }
  });
  const handleSearchChange = (value: string) => {
    setGlobalFilter(value);
    onSearchChange?.(value);
  };
  return <div className="w-full">
      {/* Top Section: Search + Columns */}
      

      {/* Table Container */}
      <div className="w-full overflow-x-auto rounded-md border">
        <Table className="w-full table-auto">
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
              return <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>;
            })}
              </TableRow>)}
          </TableHeader>
          <TableBody>
            {isLoading ?
          // Loading skeleton
          Array.from({
            length: 5
          }).map((_, index) => <TableRow key={`skeleton-${index}`}>
                  {columns.map((_, cellIndex) => <TableCell key={`skeleton-cell-${cellIndex}`}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>)}
                </TableRow>) : table.getRowModel().rows?.length ? table.getRowModel().rows.map(row => <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map(cell => <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>)}
                </TableRow>) : <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  ရလဒ်မရှိပါ။
                </TableCell>
              </TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Bottom Section: Selection Info + Pagination */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>;
}
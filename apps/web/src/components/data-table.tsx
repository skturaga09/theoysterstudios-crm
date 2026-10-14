import { Button, cn, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, spring } from "@pinnacle/ui";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useListNav } from "../lib/hooks";

/** Row checkbox with indeterminate support (header). */
function Check({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "grid size-4 place-items-center rounded-[4px] border transition-colors duration-150",
        checked || indeterminate ? "border-ink bg-ink text-on-ink" : "border-line-2 bg-surface hover:border-ink-3",
      )}
    >
      {checked && <svg viewBox="0 0 16 16" className="size-3"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {!checked && indeterminate && <span className="h-0.5 w-2 rounded bg-current" />}
    </button>
  );
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchPlaceholder,
  initialSort,
  bulkActions,
  onRowClick,
  noun,
  empty,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchPlaceholder: string;
  initialSort?: SortingState;
  bulkActions?: (ids: string[], clear: () => void) => ReactNode;
  onRowClick?: (row: T) => void;
  noun: [string, string];
  empty: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [selection, setSelection] = useState<RowSelectionState>({});
  const q = params.get("q") ?? "";

  const select: ColumnDef<T, unknown> = {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Check
        label="Select all"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onChange={() => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected())}
      />
    ),
    cell: ({ row }) => <Check label="Select row" checked={row.getIsSelected()} onChange={() => row.toggleSelected()} />,
  };

  const table = useReactTable({
    data,
    columns: bulkActions ? [select, ...columns] : columns,
    state: { sorting, columnVisibility: visibility, rowSelection: selection, globalFilter: q },
    getRowId: (r) => r.id,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    onGlobalFilterChange: (v: string) => setParams(v ? { q: v } : {}, { replace: true }),
    globalFilterFn: (row, _col, value: string) => JSON.stringify(row.original).toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const rows = table.getRowModel().rows;
  const [active] = useListNav(rows.length, (i) => onRowClick?.(rows[i]!.original));
  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-[320px]">
          <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => table.setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="pl-8" />
        </label>
        {q && (
          <Button variant="ghost" size="sm" onClick={() => table.setGlobalFilter("")}>
            <X strokeWidth={1.5} /> Clear
          </Button>
        )}
        <span className="ml-auto font-mono text-[11.5px] text-ink-3">{total} {total === 1 ? noun[0] : noun[1]}</span>
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <Columns3 strokeWidth={1.5} /> Columns
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>Show columns</MenuLabel>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <MenuItem key={c.id} checked={c.getIsVisible()} onSelect={() => c.toggleVisibility()}>
                  {String(c.columnDef.header)}
                </MenuItem>
              ))}
          </MenuContent>
        </Menu>
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full border-collapse t-dense">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const right = (h.column.columnDef.meta as { align?: string } | undefined)?.align === "right";
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "h-9 border-b border-line px-3 font-mono text-[10.5px] font-medium tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase",
                        right ? "text-right" : "text-left",
                        h.column.id === "select" && "w-10",
                      )}
                    >
                      {h.column.getCanSort() ? (
                        <button className="uppercase hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())} {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                data-nav-index={i}
                onClick={() => onRowClick?.(r.original)}
                className={cn(
                  "cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-hover",
                  (r.getIsSelected() || active === i) && "bg-hover",
                )}
              >
                {r.getVisibleCells().map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "h-11 px-3 align-middle whitespace-nowrap",
                      (c.column.columnDef.meta as { align?: string } | undefined)?.align === "right" && "text-right",
                    )}
                  >
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="py-8">{empty}</div>}
      </div>

      {total > pageSize && (
        <div className="mt-3 flex items-center justify-end gap-2 font-mono text-[11.5px] text-ink-3">
          {pageIndex * pageSize + 1}–{Math.min(total, (pageIndex + 1) * pageSize)} of {total}
          <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ChevronLeft strokeWidth={1.5} />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <ChevronRight strokeWidth={1.5} />
          </Button>
        </div>
      )}

      <AnimatePresence>
        {bulkActions && selectedIds.length > 0 && (
          <motion.div
            role="toolbar"
            aria-label="Bulk actions"
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 12, x: "-50%" }}
            transition={spring.snappy}
            className="fixed bottom-6 left-1/2 z-30 flex items-center gap-1 rounded-panel bg-ink py-1.5 pr-1.5 pl-4 text-on-ink shadow-pop"
          >
            <span className="mr-2 font-mono text-[12px] tnum">{selectedIds.length} selected</span>
            {bulkActions(selectedIds, () => setSelection({}))}
            <button aria-label="Clear selection" onClick={() => setSelection({})} className="grid size-7 place-items-center rounded-control text-on-ink/70 hover:bg-on-ink/10 hover:text-on-ink">
              <X size={14} strokeWidth={1.5} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Button styled for the inverted bulk bar. */
export function BulkButton({ children, ...p }: React.ComponentProps<"button">) {
  return (
    <button {...p} className="inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12.5px] text-on-ink/85 hover:bg-on-ink/10 hover:text-on-ink">
      {children}
    </button>
  );
}

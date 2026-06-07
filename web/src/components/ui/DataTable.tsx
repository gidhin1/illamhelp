"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel
} from "@tanstack/react-table";

interface DataTableProps<TData, TValue> {
  ariaLabel: string;
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  ariaLabel,
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  // TanStack Table manages internal callback state that React Compiler intentionally skips.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="table-wrapper" aria-label={ariaLabel}>
      <div className="table-container">
        <table aria-label={ariaLabel} className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="table-empty">
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-card-list">
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id} className="table-card-row motion-row-change">
              {row.getVisibleCells().map((cell) => {
                const header = cell.column.columnDef.header;
                const label = typeof header === "string" ? header : cell.column.id;
                return (
                  <div key={cell.id} className="table-card-field">
                    <span className="table-card-label">{label}</span>
                    <span className="table-card-value">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                );
              })}
            </article>
          ))
        ) : (
          <div className="table-empty">No results.</div>
        )}
      </div>
      <div className="table-pagination">
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="button ghost"
        >
          Previous
        </button>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="button ghost"
        >
          Next
        </button>
      </div>
    </div>
  );
}

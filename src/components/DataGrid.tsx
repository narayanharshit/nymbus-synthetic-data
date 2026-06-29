"use client";

import * as React from "react";
import { ChevronDown, Columns3, Search, X } from "lucide-react";
import { cn } from "./ui";

export interface GridColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Provide to make the column sortable (click its header). */
  sortValue?: (row: T) => number | string;
  align?: "right";
  defaultHidden?: boolean;
}

const MAX_ROWS = 200;

/**
 * Professional data grid: results toolbar (filter, optional category, column
 * visibility), sticky uppercase headers, 1px column rules, monospace right-
 * aligned numerics, sortable columns, and a row-count footer.
 */
export function DataGrid<T>({
  rows,
  rowKey,
  columns,
  searchText,
  tagsOf,
  category,
  amountFilter,
  scenarioFilter,
  onClearScenario,
  toolbarRight,
  footerExtra,
}: {
  rows: T[];
  rowKey: (r: T) => string;
  columns: GridColumn<T>[];
  searchText: (r: T) => string;
  tagsOf?: (r: T) => string[];
  category?: { label: string; options: string[]; of: (r: T) => string };
  /** Enables a $min/$max range filter on |of(row)| (e.g. amount or balance). */
  amountFilter?: { of: (r: T) => number };
  /** A named, externally-applied row filter (e.g. a Test scenario). */
  scenarioFilter?: { label: string; test: (r: T) => boolean } | null;
  onClearScenario?: () => void;
  toolbarRight?: React.ReactNode;
  footerExtra?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [flaggedOnly, setFlaggedOnly] = React.useState(false);
  const [cat, setCat] = React.useState("all");
  const [amtMin, setAmtMin] = React.useState("");
  const [amtMax, setAmtMax] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [hidden, setHidden] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.filter((c) => c.defaultHidden).map((c) => [c.key, true])),
  );
  const [colsOpen, setColsOpen] = React.useState(false);

  const shownColumns = columns.filter((c) => !hidden[c.key]);

  const visibleRows = React.useMemo(() => {
    let r = rows;
    if (scenarioFilter) r = r.filter(scenarioFilter.test);
    const needle = query.trim().toLowerCase();
    if (needle) r = r.filter((x) => searchText(x).toLowerCase().includes(needle));
    if (flaggedOnly && tagsOf) r = r.filter((x) => tagsOf(x).length > 0);
    if (category && cat !== "all") r = r.filter((x) => category.of(x) === cat);
    if (amountFilter) {
      const lo = amtMin.trim() ? Number(amtMin) * 100 : null;
      const hi = amtMax.trim() ? Number(amtMax) * 100 : null;
      if (lo !== null || hi !== null) {
        r = r.filter((x) => {
          const v = Math.abs(amountFilter.of(x));
          return (lo === null || v >= lo) && (hi === null || v <= hi);
        });
      }
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const sv = col.sortValue;
        r = [...r].sort((a, b) => {
          const av = sv(a);
          const bv = sv(b);
          const cmp =
            typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return r;
  }, [rows, query, flaggedOnly, cat, amtMin, amtMax, sortKey, sortDir, columns, searchText, tagsOf, category, amountFilter, scenarioFilter]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        {scenarioFilter && (
          <span className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-weak px-2 py-1 text-[12px] font-medium text-accent">
            Scenario: {scenarioFilter.label}
            <button onClick={onClearScenario} aria-label="Clear scenario filter" className="hover:text-accent-hover">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 focus-within:border-accent">
          <Search className="h-3.5 w-3.5 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            className="w-32 bg-transparent py-1 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
        {category && (
          <div className="relative">
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="appearance-none rounded-md border border-line bg-surface py-1 pl-2 pr-6 text-[12px] text-ink focus:border-accent focus:outline-none"
            >
              <option value="all">{category.label}: all</option>
              {category.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1.5 h-3.5 w-3.5 text-ink-faint" />
          </div>
        )}
        {tagsOf && (
          <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="accent-accent"
            />
            Flagged only
          </label>
        )}
        {amountFilter && (
          <div className="flex items-center gap-1 text-[12px] text-ink-faint">
            <span>$</span>
            <input
              value={amtMin}
              onChange={(e) => setAmtMin(e.target.value)}
              placeholder="min"
              inputMode="numeric"
              className="tnum w-16 rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
            />
            <span>–</span>
            <input
              value={amtMax}
              onChange={(e) => setAmtMax(e.target.value)}
              placeholder="max"
              inputMode="numeric"
              className="tnum w-16 rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setColsOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink hover:bg-sunken"
            >
              <Columns3 className="h-3.5 w-3.5 text-ink-muted" /> Columns
            </button>
            {colsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setColsOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-surface p-1 shadow-md">
                  {columns.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 rounded px-2 py-1 text-[12px] text-ink hover:bg-sunken"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden[c.key]}
                        onChange={(e) => setHidden((h) => ({ ...h, [c.key]: !e.target.checked }))}
                        className="accent-accent"
                      />
                      {c.header}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          {toolbarRight}
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {shownColumns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sortValue && toggleSort(c.key)}
                  className={cn(
                    "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-sunken px-3 py-1.5 text-left text-[11px] font-medium text-ink-muted",
                    c.align === "right" && "text-right",
                    c.sortValue && "cursor-pointer select-none hover:text-ink",
                  )}
                >
                  {c.header}
                  {c.sortValue && sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.slice(0, MAX_ROWS).map((row) => (
              <tr key={rowKey(row)} className="group">
                {shownColumns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap border-b border-line px-3 py-[7px] text-[12px] text-ink group-hover:bg-sunken",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px] text-ink-faint">
        <span className="mn font-mono tnum">
          {Math.min(visibleRows.length, MAX_ROWS).toLocaleString()} of {rows.length.toLocaleString()} rows
          {visibleRows.length !== rows.length ? ` · filtered` : ""}
        </span>
        {footerExtra}
      </div>
    </div>
  );
}

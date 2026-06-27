import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  GitFork,
  MessageSquarePlus,
  Play,
  Sparkles,
  Table2,
  Trash2,
  X
} from 'lucide-react';
import { Button, Card, Textarea } from '@/components/ui';
import {
  deleteSession,
  getDatasets,
  getSessions,
  getTableRows,
  getTables,
  getTopology,
  getTopologies,
  startSession,
  type DatasetInfo,
  type DiagramInfo,
  type SessionRow,
  type TableInfo,
  type TableRows
} from '@/lib/api';
import { TopologyWidget } from '@/workspace/widgets/TopologyWidget';
import type { TopologySpec } from '@shared/types';

type Tab = 'sessions' | 'topologies' | 'data';

export function DatasetPage({
  datasetId,
  onBack,
  onOpenSession
}: {
  datasetId: string;
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [tab, setTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [topologies, setTopologies] = useState<DiagramInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTopologyId, setSelectedTopologyId] = useState<string | null>(null);
  const [topologySpec, setTopologySpec] = useState<TopologySpec | null>(null);
  const [topologyLoading, setTopologyLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [tableRows, setTableRows] = useState<TableRows | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [starting, setStarting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTopologyId(null);
    setTopologySpec(null);
    setSelectedTable(null);
    setTablePage(1);
    setTableRows(null);
    getDatasets().then(ds => {
      const nextDataset = ds.find(d => d.id === datasetId) ?? null;
      setDataset(nextDataset);
      if (nextDataset?.startDate) {
        setRangeFrom(nextDataset.startDate);
        if (nextDataset.days && nextDataset.days > 0) {
          const end = new Date(`${nextDataset.startDate}T00:00:00`);
          end.setDate(end.getDate() + nextDataset.days - 1);
          setRangeTo(end.toISOString().slice(0, 10));
        } else {
          setRangeTo('');
        }
      } else {
        setRangeFrom('');
        setRangeTo('');
      }
    });
    getSessions(datasetId).then(setSessions).catch(() => {});
    getTopologies(datasetId).then(setTopologies).catch(() => {});
    getTables(datasetId).then(setTables).catch(() => {});
  }, [datasetId]);

  useEffect(() => {
    if (!selectedTopologyId) return;
    let alive = true;
    setTopologyLoading(true);
    getTopology(datasetId, selectedTopologyId)
      .then(spec => {
        if (alive) setTopologySpec(spec);
      })
      .catch(() => {
        if (alive) setTopologySpec(null);
      })
      .finally(() => {
        if (alive) setTopologyLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [datasetId, selectedTopologyId]);

  useEffect(() => {
    if (!selectedTable) return;
    let alive = true;
    setTableLoading(true);
    getTableRows(datasetId, selectedTable, tablePage)
      .then(rows => {
        if (alive) setTableRows(rows);
      })
      .catch(() => {
        if (alive) setTableRows(null);
      })
      .finally(() => {
        if (alive) setTableLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [datasetId, selectedTable, tablePage]);

  const totalPages = useMemo(() => {
    if (!tableRows) return 1;
    return Math.max(1, Math.ceil(tableRows.totalRows / tableRows.pageSize));
  }, [tableRows]);

  const selectTable = (table: string) => {
    setSelectedTable(table);
    setTablePage(1);
  };

  const formatCell = (value: unknown) => {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const start = async () => {
    setStarting(true);
    try {
      const id = await startSession(datasetId, prompt.trim() || undefined, {
        from: rangeFrom || undefined,
        to: rangeTo || undefined
      });
      onOpenSession(id);
    } finally {
      setStarting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    try {
      await deleteSession(deleteTarget.id);
      setSessions(current => current.filter(session => session.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteError('Could not delete this session. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[image:var(--workspace-background)] text-[var(--foreground)]">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to datasets">
          <ArrowLeft />
        </Button>
        <span className="text-[15px] font-semibold">{dataset?.name ?? datasetId}</span>
        {dataset?.scenario && (
          <span className="text-[12px] text-[var(--muted-foreground)]">
            {dataset.scenario}
          </span>
        )}
      </header>

      <nav className="flex gap-1 border-b border-[var(--border)] px-3">
        {(['sessions', 'topologies', 'data'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] capitalize ${
              tab === t
                ? 'border-[var(--primary)] text-[var(--foreground)]'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-6xl">
          {tab === 'sessions' && (
            <>
              {/* Launcher */}
              <Card className="p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles size={16} className="text-[var(--primary)]" />
                  New analysis
                </div>
                <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
                  Describe what you want to look at — or leave it blank for a general analysis.
                </p>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start();
                  }}
                  rows={3}
                  placeholder="e.g. Something feels off this week — help me understand it."
                  className="mt-3"
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1.5">
                      <CalendarRange size={14} /> From
                    </span>
                    <input
                      type="date"
                      value={rangeFrom}
                      max={rangeTo || undefined}
                      onChange={e => setRangeFrom(e.target.value)}
                      className="h-9 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1.5">
                      <CalendarRange size={14} /> To
                    </span>
                    <input
                      type="date"
                      value={rangeTo}
                      min={rangeFrom || undefined}
                      onChange={e => setRangeTo(e.target.value)}
                      className="h-9 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)]"
                    />
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="primary" onClick={start} disabled={starting}>
                    <Play size={15} /> {starting ? 'Starting…' : 'Start analysis'}
                  </Button>
                </div>
              </Card>

              {/* Existing sessions */}
              <div className="mt-6 mb-2 text-[12px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Sessions
              </div>
              {sessions.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-[var(--border)] p-3 text-[13px] text-[var(--muted-foreground)]">
                  <MessageSquarePlus size={15} /> No sessions yet — start one above.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sessions.map(s => (
                    <Card
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenSession(s.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && e.currentTarget === e.target) {
                          onOpenSession(s.id);
                        }
                      }}
                      className="group flex cursor-pointer items-center gap-3 p-3 transition hover:border-[var(--primary)] focus-within:border-[var(--primary)]"
                    >
                      <GitFork size={15} className="shrink-0 text-[var(--muted-foreground)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{s.name}</div>
                        <div className="text-[12px] text-[var(--muted-foreground)]">
                          updated {new Date(s.updated_at).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="icon"
                        aria-label={`Delete ${s.name}`}
                        title="Delete session"
                        onClick={e => {
                          e.stopPropagation();
                          setDeleteError(null);
                          setDeleteTarget(s);
                        }}
                        onKeyDown={e => e.stopPropagation()}
                        className="h-8 w-8 opacity-100 transition duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      >
                        <Trash2 />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'topologies' && (
            <div className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                {topologies.map(t => (
                  <Card
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTopologyId(t.id)}
                    onKeyDown={e => e.key === 'Enter' && setSelectedTopologyId(t.id)}
                    className={`flex cursor-pointer items-center gap-3 p-3 transition hover:border-[var(--primary)] ${
                      selectedTopologyId === t.id ? 'border-[var(--primary)]' : ''
                    }`}
                  >
                    <GitFork size={15} className="shrink-0 text-[var(--primary)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{t.name}</div>
                      <div className="text-[12px] text-[var(--muted-foreground)]">
                        {t.nodes} nodes
                      </div>
                    </div>
                  </Card>
                ))}
                {topologies.length === 0 && (
                  <div className="text-[13px] text-[var(--muted-foreground)]">
                    No topology diagrams in this dataset.
                  </div>
                )}
              </div>

              <div className="min-w-0">
                {topologyLoading && (
                  <Card className="p-4 text-[13px] text-[var(--muted-foreground)]">
                    Loading topology...
                  </Card>
                )}
                {!topologyLoading && topologySpec && (
                  <TopologyWidget spec={topologySpec} />
                )}
                {!topologyLoading && !topologySpec && topologies.length > 0 && (
                  <Card className="p-4 text-[13px] text-[var(--muted-foreground)]">
                    Select a topology to inspect the full diagram.
                  </Card>
                )}
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                {tables.map(t => (
                  <Card
                    key={t.table}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectTable(t.table)}
                    onKeyDown={e => e.key === 'Enter' && selectTable(t.table)}
                    className={`flex cursor-pointer items-center gap-3 p-3 transition hover:border-[var(--primary)] ${
                      selectedTable === t.table ? 'border-[var(--primary)]' : ''
                    }`}
                  >
                    <Table2 size={15} className="shrink-0 text-[var(--primary)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13px]">{t.table}</div>
                      <div className="text-[12px] text-[var(--muted-foreground)]">
                        {t.rows.toLocaleString()} rows
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="min-w-0 overflow-hidden p-0">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13px] font-semibold">
                      {selectedTable ?? 'Select a data type'}
                    </div>
                    {tableRows && (
                      <div className="text-[12px] text-[var(--muted-foreground)]">
                        {tableRows.totalRows.toLocaleString()} rows
                      </div>
                    )}
                  </div>
                  {tableRows && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTablePage(p => Math.max(1, p - 1))}
                        disabled={tableLoading || tablePage <= 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft />
                      </Button>
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        {tablePage} / {totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                        disabled={tableLoading || tablePage >= totalPages}
                        aria-label="Next page"
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="overflow-auto">
                  {tableLoading && (
                    <div className="p-4 text-[13px] text-[var(--muted-foreground)]">
                      Loading rows...
                    </div>
                  )}
                  {!tableLoading && !tableRows && (
                    <div className="p-4 text-[13px] text-[var(--muted-foreground)]">
                      Choose a data type to preview paginated rows.
                    </div>
                  )}
                  {!tableLoading && tableRows && (
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead className="sticky top-0 bg-[var(--secondary)]">
                        <tr>
                          {tableRows.columns.map(column => (
                            <th
                              key={column}
                              className="border-b border-[var(--border)] px-3 py-2 font-medium text-[var(--muted-foreground)]"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.rows.map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className="border-b border-[var(--border)] last:border-b-0"
                          >
                            {tableRows.columns.map(column => (
                              <td
                                key={column}
                                className="max-w-[260px] truncate px-3 py-2 font-mono"
                                title={formatCell(row[column])}
                              >
                                {formatCell(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => {
              if (!deletingId) setDeleteTarget(null);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-session-title"
              className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--popover)] p-4 text-[var(--popover-foreground)] shadow-2xl"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--destructive)]/15 text-[var(--destructive)]">
                  <Trash2 size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="delete-session-title" className="text-[14px] font-semibold">
                    Delete session?
                  </h2>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--muted-foreground)]">
                    This will remove "{deleteTarget.name}" and its saved session decisions.
                  </p>
                  {deleteError && (
                    <p className="mt-3 rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-3 py-2 text-[12px] text-[var(--destructive)]">
                      {deleteError}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close dialog"
                  disabled={!!deletingId}
                  onClick={() => setDeleteTarget(null)}
                  className="h-8 w-8"
                >
                  <X />
                </Button>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={!!deletingId}
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={!!deletingId}
                  onClick={confirmDelete}
                >
                  <Trash2 size={15} />
                  {deletingId ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

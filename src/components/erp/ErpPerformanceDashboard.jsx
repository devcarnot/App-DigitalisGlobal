'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import {
  classifyProjectPipeline,
  PIPELINE_LABELS,
  PIPELINE_ORDER,
} from '../../lib/erp-project-pipeline';
import {
  ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS,
  ERP_SEARCH_ICON_WRAP_CLASS,
  filterListBySearch,
} from '../../lib/erp-list-search';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpExportCsvButton from './ErpExportCsvButton';
import ErpNativeSelect from './ErpNativeSelect';
import ErpConfirmDialog from './ErpConfirmDialog';

function IconSearch({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

/** Visual theme for each pipeline bucket — keeps the table/KPIs coherent. */
const PIPELINE_THEME = {
  pending:   { dot: 'bg-slate-400',   cell: 'bg-slate-100 text-slate-700 border-slate-200',              kpi: 'from-slate-50 via-white to-slate-100 border-slate-200/80',                                        kpiText: 'text-slate-800' },
  active:    { dot: 'bg-sky-500',     cell: 'bg-sky-100 text-sky-800 border-sky-200',                    kpi: 'from-sky-50 via-white to-cyan-100/70 border-sky-200/80',                                          kpiText: 'text-sky-900' },
  review:    { dot: 'bg-violet-500',  cell: 'bg-violet-100 text-violet-800 border-violet-200',           kpi: 'from-violet-50 via-white to-fuchsia-100/60 border-violet-200/80',                                kpiText: 'text-violet-900' },
  done:      { dot: 'bg-emerald-500', cell: 'bg-emerald-100 text-emerald-800 border-emerald-200',        kpi: 'from-emerald-50 via-white to-teal-100/70 border-emerald-200/80',                                  kpiText: 'text-emerald-900' },
  late:      { dot: 'bg-rose-500',    cell: 'bg-rose-100 text-rose-800 border-rose-200',                 kpi: 'from-rose-50 via-white to-red-100/70 border-rose-200/80',                                         kpiText: 'text-rose-900' },
  cancelled: { dot: 'bg-zinc-500',    cell: 'bg-zinc-100 text-zinc-700 border-zinc-200',                 kpi: 'from-zinc-50 via-white to-slate-100 border-zinc-200/80',                                          kpiText: 'text-zinc-800' },
};

/** Zero values should look quiet; non-zero should pop with the status color. */
function countCellClass(key, value) {
  if (!value) return 'bg-slate-50 text-slate-300 border-slate-100';
  return PIPELINE_THEME[key]?.cell || 'bg-slate-100 text-slate-700 border-slate-200';
}

function pipelineDotClass(key) {
  return PIPELINE_THEME[key]?.dot || 'bg-slate-400';
}

/** Deterministic gradient avatar for a member name — keeps rows visually scannable. */
const AVATAR_GRADIENTS = [
  'from-cyan-400 to-teal-600',
  'from-violet-400 to-fuchsia-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-600',
  'from-sky-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-lime-400 to-emerald-600',
  'from-indigo-400 to-violet-600',
];
function avatarGradientFor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initialsFor(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const INTERNAL_ROLES = ['admin', 'team_lead', 'team_member'];
const CHUNK = 80;

function isMissingBoardColumnError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    (msg.includes('board_column') && (msg.includes('does not exist') || msg.includes('schema cache'))) || code === '42703'
  );
}

async function fetchScopedMembers(supabaseClient, profile, uid) {
  if (!profile || !uid) return [];
  if (isErpGlobalAdmin(profile.role)) {
    const { data, error } = await supabaseClient
      .from('erp_profiles')
      .select('id, full_name, role')
      .in('role', INTERNAL_ROLES)
      .order('full_name', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }
  const { data: myM, error: mErr } = await supabaseClient.from('erp_project_members').select('project_id').eq('user_id', uid);
  if (mErr) throw new Error(mErr.message);
  const pids = [...new Set((myM || []).map((r) => r.project_id).filter(Boolean))];
  if (pids.length === 0) return [];
  const { data: peers, error: p2Err } = await supabaseClient
    .from('erp_project_members')
    .select('user_id')
    .in('project_id', pids);
  if (p2Err) throw new Error(p2Err.message);
  const uids = [...new Set((peers || []).map((r) => r.user_id).filter(Boolean))];
  if (uids.length === 0) return [];
  const { data, error: pErr } = await supabaseClient
    .from('erp_profiles')
    .select('id, full_name, role')
    .in('id', uids)
    .in('role', INTERNAL_ROLES)
    .order('full_name', { ascending: true });
  if (pErr) throw new Error(pErr.message);
  return data || [];
}

async function fetchProjectsForIds(supabaseClient, projectIds) {
  const out = [];
  for (let i = 0; i < projectIds.length; i += CHUNK) {
    const slice = projectIds.slice(i, i + CHUNK);
    let { data, error } = await supabaseClient
      .from('erp_projects')
      .select('id, deadline_date, board_column')
      .in('id', slice);
    if (error && isMissingBoardColumnError(error)) {
      const r2 = await supabaseClient.from('erp_projects').select('id, deadline_date').in('id', slice);
      data = (r2.data || []).map((p) => ({ ...p, board_column: 'todo' }));
      error = r2.error;
    }
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

async function fetchRootTasksByProject(supabaseClient, projectIds) {
  const map = {};
  for (let i = 0; i < projectIds.length; i += CHUNK) {
    const slice = projectIds.slice(i, i + CHUNK);
    const { data, error } = await supabaseClient
      .from('erp_tasks')
      .select('project_id, status')
      .in('project_id', slice)
      .is('parent_task_id', null);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const pid = row.project_id;
      if (!pid) continue;
      if (!map[pid]) map[pid] = [];
      map[pid].push(row);
    }
  }
  return map;
}

export default function ErpPerformanceDashboard() {
  const { session, profile } = useErpSession();
  const uid = session?.user?.id;

  const [members, setMembers] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [dimensions, setDimensions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [nameById, setNameById] = useState({});
  const [reviewScoresMap, setReviewScoresMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newMax, setNewMax] = useState(10);
  const [revieweeId, setRevieweeId] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');
  const [scoreDraft, setScoreDraft] = useState({});

  const [editingDimId, setEditingDimId] = useState(null);
  const [dimEdit, setDimEdit] = useState({ label: '', max_points: 10, sort_order: 0, is_active: true });

  const [editingReviewId, setEditingReviewId] = useState(null);
  const [reviewEditScores, setReviewEditScores] = useState({});
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState(null);

  const load = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setMatrix([]);
      setDimensions([]);
      setReviews([]);
      setReviewScoresMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const mems = await fetchScopedMembers(supabase, profile, uid);
      setMembers(mems);
      const memberIds = new Set(mems.map((m) => m.id));

      const { data: memRows, error: mrErr } = await supabase
        .from('erp_project_members')
        .select('user_id, project_id')
        .in('user_id', [...memberIds]);
      if (mrErr) throw new Error(mrErr.message);

      const projectsByUser = {};
      const allProjectIds = new Set();
      for (const row of memRows || []) {
        if (!memberIds.has(row.user_id) || !row.project_id) continue;
        allProjectIds.add(row.project_id);
        if (!projectsByUser[row.user_id]) projectsByUser[row.user_id] = [];
        projectsByUser[row.user_id].push(row.project_id);
      }

      const pidList = [...allProjectIds];
      const projectRows = pidList.length ? await fetchProjectsForIds(supabase, pidList) : [];
      const projectById = Object.fromEntries(projectRows.map((p) => [p.id, p]));
      const tasksByProject = pidList.length ? await fetchRootTasksByProject(supabase, pidList) : {};

      const asOf = new Date();
      const rows = mems.map((m) => {
        const counts = { pending: 0, active: 0, review: 0, done: 0, late: 0, cancelled: 0 };
        const pids = projectsByUser[m.id] || [];
        for (const pid of pids) {
          const proj = projectById[pid];
          if (!proj) continue;
          const bucket = classifyProjectPipeline(proj, tasksByProject[pid] || [], asOf);
          counts[bucket] += 1;
        }
        return { member: m, counts, total: pids.length };
      });
      setMatrix(rows);

      const { data: dims, error: dErr } = await supabase
        .from('erp_review_dimensions')
        .select('id, label, sort_order, max_points, is_active')
        .order('sort_order', { ascending: true });
      if (dErr) throw new Error(dErr.message);
      setDimensions(dims || []);

      const ridList = [...memberIds];
      let revData = [];
      if (ridList.length) {
        for (let i = 0; i < ridList.length; i += CHUNK) {
          const slice = ridList.slice(i, i + CHUNK);
          const { data: chunk, error: rErr } = await supabase
            .from('erp_performance_reviews')
            .select('id, reviewee_id, reviewer_id, review_period, notes, created_at')
            .in('reviewee_id', slice)
            .order('created_at', { ascending: false })
            .limit(100);
          if (rErr) throw new Error(rErr.message);
          revData.push(...(chunk || []));
        }
      }
      revData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setReviews(revData.slice(0, 80));

      const extraIds = new Set();
      for (const r of revData) {
        if (r.reviewer_id) extraIds.add(r.reviewer_id);
      }
      const allNameIds = [...new Set([...memberIds, ...extraIds])];
      const nb = Object.fromEntries(mems.map((m) => [m.id, m.full_name?.trim() || 'Member']));
      if (allNameIds.length) {
        for (let i = 0; i < allNameIds.length; i += CHUNK) {
          const slice = allNameIds.slice(i, i + CHUNK);
          const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', slice);
          for (const p of profs || []) {
            nb[p.id] = p.full_name?.trim() || nb[p.id] || 'Member';
          }
        }
      }
      setNameById(nb);

      const reviewIds = revData.map((r) => r.id);
      const scoreMap = {};
      if (reviewIds.length) {
        for (let i = 0; i < reviewIds.length; i += CHUNK) {
          const slice = reviewIds.slice(i, i + CHUNK);
          const { data: sc, error: sErr } = await supabase
            .from('erp_performance_review_scores')
            .select('review_id, dimension_id, points')
            .in('review_id', slice);
          if (sErr) throw new Error(sErr.message);
          for (const s of sc || []) {
            if (!scoreMap[s.review_id]) scoreMap[s.review_id] = {};
            scoreMap[s.review_id][s.dimension_id] = Number(s.points);
          }
        }
      }
      setReviewScoresMap(scoreMap);
    } catch (e) {
      setError(e?.message || 'Could not load performance data');
      setMatrix([]);
      setDimensions([]);
      setReviews([]);
      setReviewScoresMap({});
    } finally {
      setLoading(false);
    }
  }, [uid, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const activeDims = useMemo(() => dimensions.filter((d) => d.is_active), [dimensions]);

  useEffect(() => {
    const next = {};
    for (const d of activeDims) {
      next[d.id] = scoreDraft[d.id] ?? '';
    }
    setScoreDraft((prev) => ({ ...next, ...prev }));
  }, [activeDims]);

  async function saveDimension(d) {
    setBusy(true);
    setError('');
    try {
      const { error: uErr } = await supabase
        .from('erp_review_dimensions')
        .update({
          label: dimEdit.label.trim(),
          max_points: Math.min(100, Math.max(1, Number(dimEdit.max_points) || 10)),
          sort_order: Number(dimEdit.sort_order) || 0,
          is_active: dimEdit.is_active,
        })
        .eq('id', d.id);
      if (uErr) throw new Error(uErr.message);
      setEditingDimId(null);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not save dimension');
    } finally {
      setBusy(false);
    }
  }

  async function addDimension() {
    if (!newLabel.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { error: iErr } = await supabase.from('erp_review_dimensions').insert({
        label: newLabel.trim(),
        max_points: Math.min(100, Math.max(1, Number(newMax) || 10)),
        sort_order: dimensions.length + 1,
        is_active: true,
      });
      if (iErr) throw new Error(iErr.message);
      setNewLabel('');
      setNewMax(10);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not add dimension');
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    if (!revieweeId || !uid) return;
    setBusy(true);
    setError('');
    try {
      const { data: rev, error: rErr } = await supabase
        .from('erp_performance_reviews')
        .insert({
          reviewee_id: revieweeId,
          reviewer_id: uid,
          review_period: period.trim() || null,
          notes: notes.trim() || null,
        })
        .select('id')
        .single();
      if (rErr) throw new Error(rErr.message);
      const rid = rev.id;
      const rows = [];
      for (const d of activeDims) {
        const raw = scoreDraft[d.id];
        const n = raw === '' || raw == null ? null : Number(raw);
        if (n == null || Number.isNaN(n)) continue;
        const pts = Math.min(d.max_points, Math.max(0, n));
        rows.push({ review_id: rid, dimension_id: d.id, points: pts });
      }
      if (rows.length) {
        const { error: sErr } = await supabase.from('erp_performance_review_scores').insert(rows);
        if (sErr) throw new Error(sErr.message);
      }
      setNotes('');
      setPeriod('');
      setRevieweeId('');
      setScoreDraft({});
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save review');
    } finally {
      setBusy(false);
    }
  }

  async function loadReviewForEdit(review) {
    setEditingReviewId(review.id);
    const map = reviewScoresMap[review.id] || {};
    const next = {};
    for (const d of dimensions.filter((x) => x.is_active)) {
      next[d.id] = map[d.id] != null ? String(map[d.id]) : '';
    }
    setReviewEditScores(next);
  }

  async function saveReviewEdit() {
    if (!editingReviewId) return;
    setBusy(true);
    setError('');
    try {
      const { error: delErr } = await supabase.from('erp_performance_review_scores').delete().eq('review_id', editingReviewId);
      if (delErr) throw new Error(delErr.message);
      const rows = [];
      for (const d of dimensions.filter((x) => x.is_active)) {
        const raw = reviewEditScores[d.id];
        const n = raw === '' || raw == null ? null : Number(raw);
        if (n == null || Number.isNaN(n)) continue;
        const pts = Math.min(d.max_points, Math.max(0, n));
        rows.push({ review_id: editingReviewId, dimension_id: d.id, points: pts });
      }
      if (rows.length) {
        const { error: insErr } = await supabase.from('erp_performance_review_scores').insert(rows);
        if (insErr) throw new Error(insErr.message);
      }
      setEditingReviewId(null);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not update review');
    } finally {
      setBusy(false);
    }
  }

  async function executeDeleteReview() {
    const id = confirmDeleteReviewId;
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const { error: dErr } = await supabase.from('erp_performance_reviews').delete().eq('id', id);
      if (dErr) throw new Error(dErr.message);
      setConfirmDeleteReviewId(null);
      if (editingReviewId === id) setEditingReviewId(null);
      await load();
    } catch (e) {
      setError(e?.message || 'Could not delete');
    } finally {
      setBusy(false);
    }
  }

  function startEditDim(d) {
    setEditingDimId(d.id);
    setDimEdit({
      label: d.label,
      max_points: d.max_points,
      sort_order: d.sort_order,
      is_active: d.is_active,
    });
  }

  const matrixFiltered = useMemo(
    () => filterListBySearch(matrix, pipelineSearch, ({ member }) => [member?.full_name]),
    [matrix, pipelineSearch],
  );

  /** Aggregated pipeline counts across all in-scope members (for the KPI strip). */
  const pipelineTotals = useMemo(() => {
    const t = { pending: 0, active: 0, review: 0, done: 0, late: 0, cancelled: 0, assignments: 0 };
    for (const row of matrix) {
      for (const k of PIPELINE_ORDER) t[k] += row.counts?.[k] || 0;
      t.assignments += row.total || 0;
    }
    return t;
  }, [matrix]);

  const pipelineMatrixExportColumns = useMemo(
    () => [
      { header: 'Member', value: (row) => row.member?.full_name?.trim() || 'Member' },
      ...PIPELINE_ORDER.map((k) => ({
        header: PIPELINE_LABELS[k],
        value: (row) => row.counts[k],
      })),
      { header: 'Total', value: (row) => row.total },
    ],
    [],
  );

  return (
    <div className="w-full space-y-6 text-[13px] leading-snug text-slate-800">
      <ErpAdminPageHero eyebrow="People" title="Performance" accent="violet" />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500" />
        </div>
      ) : (
        <>
          {/* KPI strip — aggregate pipeline breakdown across everyone in scope */}
          <section
            aria-label="Pipeline summary"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8"
          >
            <div className="col-span-2 rounded-2xl border border-[#103D4D]/15 bg-gradient-to-br from-[#103D4D] via-slate-900 to-teal-900 p-4 text-white shadow-[0_18px_40px_-18px_rgba(16,61,77,0.55)] ring-1 ring-white/10">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/85">Team</p>
              <p className="mt-1 text-3xl font-black tabular-nums">{matrix.length}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-cyan-100/80">
                {matrix.length === 1 ? 'member in scope' : 'members in scope'}
              </p>
              <p className="mt-2 text-[11px] font-semibold text-white/90">
                <span className="tabular-nums">{pipelineTotals.assignments}</span>{' '}
                <span className="font-medium text-cyan-100/70">project assignments</span>
              </p>
            </div>
            {PIPELINE_ORDER.map((k) => {
              const theme = PIPELINE_THEME[k];
              const n = pipelineTotals[k] || 0;
              const pct = pipelineTotals.assignments
                ? Math.round((n / pipelineTotals.assignments) * 100)
                : 0;
              return (
                <div
                  key={k}
                  className={`rounded-2xl border bg-gradient-to-br p-3 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.25)] ring-1 ring-white/40 ${theme.kpi}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${theme.dot}`} aria-hidden />
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${theme.kpiText}`}>
                      {PIPELINE_LABELS[k]}
                    </p>
                  </div>
                  <p className={`mt-1 text-2xl font-black tabular-nums ${theme.kpiText}`}>{n}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    {pct}% of total
                  </p>
                </div>
              );
            })}
          </section>

          <section className="overflow-hidden rounded-2xl border border-cyan-200/45 bg-white/90 shadow-[0_18px_48px_-24px_rgba(16,61,77,0.25)] ring-1 ring-cyan-900/[0.04]">
            <div className="flex flex-col gap-3 border-b border-cyan-100/80 bg-gradient-to-br from-[#103D4D] via-slate-900 to-teal-900 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20"
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-cyan-200">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M3 12h18M3 16.5h18" />
                  </svg>
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/80">Pipeline</p>
                  <h2 className="text-base font-extrabold tracking-tight text-white">Projects per member</h2>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                {matrix.length > 0 ? (
                  <div className={`${ERP_SEARCH_ICON_WRAP_CLASS} max-w-md`}>
                    <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 z-[2] h-4 w-4 -translate-y-1/2 text-white/70" />
                    <label className="block">
                      <span className="sr-only">Search members</span>
                      <input
                        type="search"
                        value={pipelineSearch}
                        onChange={(e) => setPipelineSearch(e.target.value)}
                        placeholder="Search member name…"
                        className={`${ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS} border-white/20 bg-white/10 text-white placeholder:text-white/55 focus:border-cyan-300/70 focus:bg-white/15`}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                ) : null}
                {matrixFiltered.length > 0 ? (
                  <ErpExportCsvButton
                    filename={`performance-pipeline-${new Date().toISOString().slice(0, 10)}`}
                    rows={matrixFiltered}
                    columns={pipelineMatrixExportColumns}
                    className="self-start sm:self-auto"
                  />
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[68rem] table-fixed border-separate border-spacing-0 text-left text-[13px]">
                <colgroup>
                  <col className="w-[26%]" />
                  {PIPELINE_ORDER.map((k) => (
                    <col key={k} className="w-[10%]" />
                  ))}
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="sticky left-0 z-[2] border-b border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-left shadow-[1px_0_0_rgba(226,232,240,0.95)]">
                      Member
                    </th>
                    {PIPELINE_ORDER.map((k) => (
                      <th key={k} className="border-b border-slate-200/90 px-1 py-3 text-center tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${pipelineDotClass(k)}`} aria-hidden />
                          {PIPELINE_LABELS[k]}
                        </span>
                      </th>
                    ))}
                    <th className="border-b border-slate-200/90 px-1 py-3 text-center tabular-nums text-[#103D4D]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrixFiltered.map(({ member, counts, total }, rowIdx) => {
                    const nm = member.full_name?.trim() || 'Member';
                    return (
                      <tr
                        key={member.id}
                        className={`group border-b border-slate-100/90 transition-colors hover:bg-gradient-to-r hover:from-cyan-50/50 hover:via-white hover:to-violet-50/30 ${
                          rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/35'
                        }`}
                      >
                        <td
                          className={`sticky left-0 z-[1] border-b border-slate-100/90 px-4 py-2.5 font-semibold text-slate-900 shadow-[1px_0_0_rgba(226,232,240,0.95)] backdrop-blur-[1px] ${
                            rowIdx % 2 === 0 ? 'bg-white/98' : 'bg-slate-50/70'
                          } group-hover:bg-cyan-50/60`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-black text-white shadow-sm ring-2 ring-white ${avatarGradientFor(
                                nm,
                              )}`}
                              aria-hidden
                            >
                              {initialsFor(nm)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">{nm}</p>
                              {member.role ? (
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  {String(member.role).replace(/_/g, ' ')}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        {PIPELINE_ORDER.map((k) => (
                          <td
                            key={k}
                            className="border-b border-slate-100/90 px-1 py-2.5 text-center tabular-nums"
                          >
                            <span
                              className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${countCellClass(
                                k,
                                counts[k],
                              )}`}
                            >
                              {counts[k]}
                            </span>
                          </td>
                        ))}
                        <td className="border-b border-slate-100/90 px-1 py-2.5 text-center tabular-nums">
                          <span
                            className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-full border px-2.5 py-0.5 text-[12px] font-black ${
                              total
                                ? 'border-[#103D4D]/20 bg-gradient-to-br from-[#103D4D] to-teal-700 text-white shadow-sm'
                                : 'border-slate-200 bg-slate-50 text-slate-300'
                            }`}
                          >
                            {total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {matrix.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-slate-500">No members in scope.</p>
              ) : matrixFiltered.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-slate-500">No members match your search.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-violet-200/45 bg-gradient-to-br from-white via-violet-50/20 to-white p-4 shadow-[0_12px_36px_-20px_rgba(91,33,182,0.2)] ring-1 ring-violet-900/[0.04] sm:p-6">
            <h2 className="text-sm font-bold tracking-tight text-violet-950">Review dimensions</h2>
            <ul className="mt-4 space-y-3">
              {dimensions.map((d) => (
                <li
                  key={d.id}
                  className="rounded-2xl border border-slate-200/70 bg-white/95 px-4 py-3 shadow-sm ring-1 ring-slate-900/[0.03]"
                >
                  {editingDimId === d.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="flex flex-col text-[10px] font-bold uppercase text-slate-500">
                        Label
                        <input
                          value={dimEdit.label}
                          onChange={(e) => setDimEdit((x) => ({ ...x, label: e.target.value }))}
                          className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-sm font-medium text-slate-900"
                        />
                      </label>
                      <label className="flex flex-col text-[10px] font-bold uppercase text-slate-500">
                        Max pts
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={dimEdit.max_points}
                          onChange={(e) => setDimEdit((x) => ({ ...x, max_points: e.target.value }))}
                          className="mt-0.5 w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex flex-col text-[10px] font-bold uppercase text-slate-500">
                        Sort
                        <input
                          type="number"
                          value={dimEdit.sort_order}
                          onChange={(e) => setDimEdit((x) => ({ ...x, sort_order: e.target.value }))}
                          className="mt-0.5 w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={dimEdit.is_active}
                          onChange={(e) => setDimEdit((x) => ({ ...x, is_active: e.target.checked }))}
                        />
                        Active
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveDimension(d)}
                        className="rounded-lg bg-[#103D4D] px-3 py-1.5 text-[11px] font-bold text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDimId(null)}
                        className="text-[11px] font-bold text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {d.label}{' '}
                        <span className="text-slate-500 font-normal">
                          (max {d.max_points} pts){' '}
                          {!d.is_active ? <span className="text-rose-600">· inactive</span> : null}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditDim(d)}
                        className="rounded-lg border border-[#103D4D]/25 bg-[#103D4D]/[0.06] px-3 py-1.5 text-xs font-semibold text-[#103D4D] shadow-sm transition hover:border-[#103D4D]/40 hover:bg-[#103D4D]/10"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200/80 pt-5 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[12rem] flex-1 flex-col text-[11px] font-semibold text-slate-600">
                New dimension
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Leadership"
                  className="mt-0.5 rounded-lg border border-cyan-200/70 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex w-full flex-col sm:w-auto sm:min-w-[7rem] text-[11px] font-semibold text-slate-600">
                Max points
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newMax}
                  onChange={(e) => setNewMax(e.target.value)}
                  className="mt-0.5 w-24 rounded-lg border border-cyan-200/70 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy || !newLabel.trim()}
                onClick={() => void addDimension()}
                className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Add dimension
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200/50 bg-white/90 p-4 shadow-md sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-900">New performance review</h2>
            <form onSubmit={(e) => void submitReview(e)} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-[10px] font-bold uppercase text-teal-900/75">
                  Team member
                  <ErpNativeSelect
                    required
                    value={revieweeId}
                    onChange={(e) => setRevieweeId(e.target.value)}
                    className="mt-1 rounded-xl border border-cyan-200/70 bg-white !pl-3 !pr-10 py-2 text-sm font-medium text-slate-900"
                  >
                    <option value="">Select…</option>
                    {members
                      .filter((m) => m.id !== uid)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name?.trim() || m.id}
                        </option>
                      ))}
                  </ErpNativeSelect>
                </label>
                <label className="flex flex-col text-[10px] font-bold uppercase text-teal-900/75">
                  Period (optional)
                  <input
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="e.g. 2026 Q1"
                    className="mt-1 rounded-xl border border-cyan-200/70 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeDims.map((d) => (
                  <label key={d.id} className="flex flex-col text-[10px] font-bold uppercase text-slate-500">
                    {d.label} (0–{d.max_points})
                    <input
                      type="number"
                      min={0}
                      max={d.max_points}
                      step="0.5"
                      value={scoreDraft[d.id] ?? ''}
                      onChange={(e) => setScoreDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                      className="mt-0.5 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                    />
                  </label>
                ))}
              </div>
              <label className="flex flex-col text-[10px] font-bold uppercase text-teal-900/75">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 rounded-xl border border-cyan-200/70 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !revieweeId}
                className="rounded-xl bg-[#103D4D] px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-40"
              >
                Save review
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-md sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Recent reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No reviews yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {reviews.map((r) => {
                  const smap = reviewScoresMap[r.id] || {};
                  const scoredDimIds = Object.keys(smap).filter((id) => smap[id] != null);
                  const total = scoredDimIds.reduce((s, id) => s + (Number(smap[id]) || 0), 0);
                  const maxTot = scoredDimIds.reduce((s, id) => {
                    const d = dimensions.find((x) => x.id === id);
                    return s + (d ? d.max_points : 0);
                  }, 0);
                  return (
                    <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">
                            {nameById[r.reviewee_id] || 'Member'} ← reviewed by {nameById[r.reviewer_id] || 'Lead'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {r.review_period || 'No period'} · {new Date(r.created_at).toLocaleString()}
                          </p>
                          {r.notes ? <p className="mt-1 text-[11px] text-slate-600">{r.notes}</p> : null}
                          <ul className="mt-2 space-y-0.5 text-[11px]">
                            {dimensions.map((d) =>
                              smap[d.id] != null ? (
                                <li key={d.id}>
                                  <span className="font-semibold text-slate-700">{d.label}:</span>{' '}
                                  <span className="tabular-nums">{smap[d.id]}</span> / {d.max_points}
                                </li>
                              ) : null,
                            )}
                          </ul>
                          <p className="mt-1 text-[11px] font-bold text-[#103D4D]">
                            Total {total.toFixed(1)} / {maxTot}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(r.reviewer_id === uid || profile?.role === 'admin') && (
                            <>
                              <button
                                type="button"
                                onClick={() => loadReviewForEdit(r)}
                                className="rounded-lg border border-cyan-200 bg-white px-2 py-1 text-[11px] font-bold text-[#103D4D]"
                              >
                                Edit scores
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteReviewId(r.id)}
                                className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-bold text-rose-700"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {editingReviewId === r.id ? (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <p className="text-[10px] font-bold uppercase text-slate-500">Update scores</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {dimensions
                              .filter((d) => d.is_active)
                              .map((d) => (
                                <label key={d.id} className="text-[10px] font-bold uppercase text-slate-500">
                                  {d.label}
                                  <input
                                    type="number"
                                    min={0}
                                    max={d.max_points}
                                    step="0.5"
                                    value={reviewEditScores[d.id] ?? ''}
                                    onChange={(e) =>
                                      setReviewEditScores((s) => ({ ...s, [d.id]: e.target.value }))
                                    }
                                    className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                  />
                                </label>
                              ))}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveReviewEdit()}
                              className="rounded-lg bg-[#103D4D] px-3 py-1.5 text-[11px] font-bold text-white"
                            >
                              Save scores
                            </button>
                            <button type="button" onClick={() => setEditingReviewId(null)} className="text-[11px] font-bold text-slate-600">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <ErpConfirmDialog
        open={confirmDeleteReviewId != null}
        title="Delete performance review?"
        confirmLabel="Delete review"
        tone="danger"
        busy={busy && confirmDeleteReviewId != null}
        onCancel={() => !busy && setConfirmDeleteReviewId(null)}
        onConfirm={() => void executeDeleteReview()}
      >
        <p>This permanently removes this review record. This cannot be undone.</p>
      </ErpConfirmDialog>
    </div>
  );
}

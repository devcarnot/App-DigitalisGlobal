'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { useErpSession } from '../../../../components/erp/useErpSession';
import { erpAuthorizedFetch } from '../../../../lib/erp-client-api';
import { isErpAdminEquivalent } from '../../../../lib/erp-roles';
import { mergeTeamDirectoryWithDefaults, buildBulkInvitePayloads, parseEmailLines } from '../../../../lib/erp-team-directory';
import { ERP_LIST_SEARCH_INPUT_CLASS, filterListBySearch } from '../../../../lib/erp-list-search';
import AdminTeamDirectory from '../../../../components/admin/AdminTeamDirectory';
import ErpExportCsvButton from '../../../../components/erp/ErpExportCsvButton';
import ErpFunctionalTeamSection from '../../../../components/erp/ErpFunctionalTeamSection';
import { AdminRecentInvitationsList } from '../../../../components/admin/AdminRecentInvitations';
import Link from 'next/link';
import ErpNativeSelect from '../../../../components/erp/ErpNativeSelect';
import ErpConfirmDialog from '../../../../components/erp/ErpConfirmDialog';

const inputClass =
  'w-full rounded-xl border border-cyan-200/70 bg-white/90 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner shadow-cyan-900/[0.04] transition-all duration-200 focus:border-[#103D4D]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-400/20';

const labelClass =
  'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-teal-900/75 mb-2';

function ErpInvitesPageInner() {
  const searchParams = useSearchParams();
  const { session, profile } = useErpSession();
  const userId = session?.user?.id;
  const [projects, setProjects] = useState([]);
  const [invites, setInvites] = useState([]);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [deletingUserId, setDeletingUserId] = useState(null);
  /** Preset directory checkboxes: email -> checked */
  const [teamPresetSelected, setTeamPresetSelected] = useState({});
  const [teamDirectoryRows, setTeamDirectoryRows] = useState([]);
  const [clientEmails, setClientEmails] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastBatchDetail, setLastBatchDetail] = useState(null);
  const [deletingInviteId, setDeletingInviteId] = useState(null);
  const [workspaceUserSearch, setWorkspaceUserSearch] = useState('');
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState(null);
  const [confirmRemoveWorkspaceUser, setConfirmRemoveWorkspaceUser] = useState(null);
  const [confirmBatchNoProjectOpen, setConfirmBatchNoProjectOpen] = useState(false);

  const mergedDirectoryEntries = useMemo(() => mergeTeamDirectoryWithDefaults(teamDirectoryRows), [teamDirectoryRows]);

  const persistTeamEmailsToDirectory = useCallback(
    async (payloadString) => {
      const emails = parseEmailLines(payloadString).filter((e) => e.includes('@'));
      if (emails.length === 0 || !userId || !supabase) return;
      for (const email of emails) {
        // Upsert with ignoreDuplicates so re-pasting an email already in the
        // directory is a silent no-op instead of a 409 in the browser console.
        const { error } = await supabase
          .from('erp_team_directory_emails')
          .upsert({ email, created_by: userId }, { onConflict: 'email', ignoreDuplicates: true });
        if (error && error.code !== '23505' && !String(error.message || '').toLowerCase().includes('does not exist')) {
          console.warn('erp_team_directory_emails', error);
        }
      }
    },
    [userId],
  );

  const load = useCallback(async () => {
    const [projsRes, invRes, dirRes] = await Promise.all([
      supabase.from('erp_projects').select('id, name').order('name'),
      supabase.from('erp_invitations').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('erp_team_directory_emails').select('email, full_name, directory_role').order('email'),
    ]);
    setProjects(projsRes.data || []);
    setInvites(invRes.data || []);
    const dirErr = dirRes.error;
    const dirRows = dirRes.data;
    if (!dirErr && Array.isArray(dirRows)) {
      setTeamDirectoryRows(dirRows);
    } else if (String(dirErr?.message || '').toLowerCase().includes('column')) {
      setTeamDirectoryRows([]);
    }
  }, []);

  const loadWorkspaceUsers = useCallback(async () => {
    if (!isErpAdminEquivalent(profile?.role)) return;
    setUsersError('');
    setUsersLoading(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/users');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsersError(data.error || 'Could not load workspace users');
        setWorkspaceUsers([]);
        return;
      }
      setWorkspaceUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setUsersError(err?.message || 'Could not load workspace users');
      setWorkspaceUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (projects.length === 0) return;
    const q = searchParams.get('project');
    if (q && projects.some((p) => p.id === q)) {
      setProjectId(q);
      return;
    }
    setProjectId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev;
      return projects[0].id;
    });
  }, [projects, searchParams]);

  useEffect(() => {
    if (isErpAdminEquivalent(profile?.role)) {
      loadWorkspaceUsers();
    }
  }, [profile?.role, loadWorkspaceUsers]);

  const workspaceUsersFiltered = useMemo(
    () =>
      filterListBySearch(workspaceUsers, workspaceUserSearch, (u) => [
        u.email,
        u.full_name,
        String(u.role || '').replace(/_/g, ' '),
      ]),
    [workspaceUsers, workspaceUserSearch],
  );

  const workspaceUsersExportColumns = useMemo(
    () => [
      { header: 'Email', value: (u) => u.email || '' },
      { header: 'Name', value: (u) => u.full_name || '' },
      { header: 'Role', value: (u) => String(u.role || '').replace(/_/g, ' ') },
      {
        header: 'Joined',
        value: (u) => (u.created_at ? new Date(u.created_at).toLocaleDateString() : ''),
      },
      {
        header: 'Last sign-in',
        value: (u) => (u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : ''),
      },
    ],
    [],
  );

  const handleDirectoryAdd = useCallback(
    async ({ fullName, email, sendInvite, workspaceRole = 'team_member' }) => {
      if (!userId) return { error: 'Not signed in.' };
      const roleKey = String(workspaceRole || 'team_member').trim().toLowerCase() || 'team_member';
      const { error: upErr } = await supabase.from('erp_team_directory_emails').upsert(
        {
          email,
          full_name: fullName,
          directory_role: roleKey,
          created_by: userId,
        },
        { onConflict: 'email' },
      );
      if (upErr) {
        const msg = String(upErr.message || '');
        if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('full_name')) {
          return {
            error:
              'Database migration missing: run Supabase migration 016_erp_team_directory_names_roles.sql (adds full_name and directory_role).',
          };
        }
        return { error: upErr.message || 'Could not save directory entry.' };
      }

      const canInvite = isErpAdminEquivalent(profile?.role);
      if (sendInvite && canInvite) {
        const body = { projectId: projectId || null, invites: [{ email, globalRole: roleKey }] };
        const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { error: data.error || 'Could not send invitation.' };
        await persistTeamEmailsToDirectory(email);
      }

      setError('');
      setMessage('');
      await load();
      return {
        message: sendInvite && canInvite ? 'Saved to directory and invitation email sent.' : 'Saved to directory.',
      };
    },
    [userId, profile?.role, projectId, persistTeamEmailsToDirectory, load],
  );

  async function executeDeleteInvite() {
    const inv = confirmDeleteInvite;
    if (!inv?.id) return;
    setError('');
    setMessage('');
    setDeletingInviteId(inv.id);
    try {
      const { error: delErr } = await supabase.from('erp_invitations').delete().eq('id', inv.id);
      if (delErr) {
        setError(delErr.message);
        return;
      }
      setConfirmDeleteInvite(null);
      setMessage('Invitation removed.');
      await load();
    } finally {
      setDeletingInviteId(null);
    }
  }

  async function runBulkInviteSubmit() {
    setError('');
    setMessage('');
    setLastBatchDetail(null);

    const { invites: dirInvites } = buildBulkInvitePayloads(teamPresetSelected, mergedDirectoryEntries);
    const clientList = parseEmailLines(clientEmails);
    const clientInvites = clientList.map((email) => ({ email, globalRole: 'client' }));
    const allInvites = [...dirInvites, ...clientInvites];
    const hasTeamSelection = dirInvites.length > 0;
    const hasClientEmails = clientInvites.length > 0;
    if (!hasTeamSelection && !hasClientEmails) {
      setError('Select at least one person in the team directory, or enter at least one client email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId || null,
          invites: allInvites,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }

      await persistTeamEmailsToDirectory(dirInvites.map((i) => i.email).join('\n'));

      const { summary, results } = data;
      setLastBatchDetail({ results });

      if (summary.failed === 0) {
        setMessage(`Sent ${summary.sent} invitation email${summary.sent === 1 ? '' : 's'}.`);
        setTeamPresetSelected({});
        setClientEmails('');
      } else if (summary.sent > 0) {
        setError(`Partially sent: ${summary.sent} ok, ${summary.failed} failed. See list below.`);
      } else {
        setError(data.results?.[0]?.error || 'No emails were sent. Try again or check your email provider.');
      }

      await load();
    } catch (err) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const { invites: dirInvites } = buildBulkInvitePayloads(teamPresetSelected, mergedDirectoryEntries);
    const clientList = parseEmailLines(clientEmails);
    const clientInvites = clientList.map((email) => ({ email, globalRole: 'client' }));
    const allInvites = [...dirInvites, ...clientInvites];
    const hasTeamSelection = dirInvites.length > 0;
    const hasClientEmails = clientInvites.length > 0;
    if (!hasTeamSelection && !hasClientEmails) {
      setError('Select at least one person in the team directory, or enter at least one client email.');
      return;
    }
    if (!projectId) {
      setConfirmBatchNoProjectOpen(true);
      return;
    }
    await runBulkInviteSubmit();
  }

  function requestDeleteInvite(inv) {
    if (!inv?.id) return;
    setConfirmDeleteInvite(inv);
  }

  async function executeDeleteWorkspaceUser() {
    const row = confirmRemoveWorkspaceUser;
    if (!row?.id || row.id === session?.user?.id) return;
    setUsersError('');
    setDeletingUserId(row.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/admin/users/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsersError(data.error || 'Could not remove user');
        return;
      }
      setConfirmRemoveWorkspaceUser(null);
      await load();
      await loadWorkspaceUsers();
    } catch (err) {
      setUsersError(err?.message || 'Request failed');
    } finally {
      setDeletingUserId(null);
    }
  }

  function requestDeleteWorkspaceUser(row) {
    if (!row?.id || row.id === session?.user?.id) return;
    setConfirmRemoveWorkspaceUser(row);
  }

  function formatRole(role) {
    if (!role) return '—';
    return String(role).replace(/_/g, ' ');
  }

  if (!isErpAdminEquivalent(profile?.role)) {
    return (
      <div className="rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-slate-900/[0.03] via-white/90 to-violet-50/50 backdrop-blur-sm p-10 text-center max-w-md mx-auto shadow-lg shadow-cyan-900/10 text-teal-900/80 space-y-4">
        <p className="font-medium">Only workspace admins and team leads can manage invitations and users.</p>
        <Link
          href="/erp/dashboard"
          className="inline-flex rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  const panelCard =
    'rounded-2xl border border-cyan-200/45 bg-white/85 backdrop-blur-md overflow-hidden shadow-[0_12px_40px_-12px_rgba(16,61,77,0.16)] ring-1 ring-white/60';

  return (
    <div className="space-y-10 max-w-5xl">
      <header className="relative sm:pl-2">
        <div
          className="absolute -left-4 top-1 h-12 w-1.5 rounded-full bg-gradient-to-b from-slate-900 via-violet-700 to-cyan-500 opacity-95 hidden sm:block shadow-md shadow-violet-900/30"
          aria-hidden
        />
        <h1 className="text-3xl font-bold erp-brand-text">
          Invites & users
        </h1>
      </header>

      <div className={`${panelCard} flex flex-col`}>
        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-sm font-bold text-[#103D4D] flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-[#103D4D] text-white shadow-md shadow-teal-900/25">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              Invite by role (bulk)
            </h2>
          </div>

          <div className="rounded-xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/50 p-4 ring-1 ring-cyan-400/15 sm:p-5 shadow-sm shadow-cyan-900/5">
            <label className={`${labelClass} text-cyan-950/90`}>Team directory</label>
            <AdminTeamDirectory
              embedded
              mergedEntries={mergedDirectoryEntries}
              teamPresetSelected={teamPresetSelected}
              onTogglePreset={(em) => setTeamPresetSelected((prev) => ({ ...prev, [em]: !prev[em] }))}
              onSelectAllShown={(emails) =>
                setTeamPresetSelected((prev) => {
                  const next = { ...prev };
                  for (const e of emails) next[e] = true;
                  return next;
                })
              }
              onClearPresets={() => setTeamPresetSelected({})}
              canSendInvites={isErpAdminEquivalent(profile?.role)}
              projectId={projectId}
              onAddMember={handleDirectoryAdd}
            />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="rounded-xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 ring-1 ring-emerald-400/20 shadow-sm shadow-emerald-900/5">
              <label className={`${labelClass} text-emerald-950/90`}>Client emails (bulk)</label>
              <textarea
                value={clientEmails}
                onChange={(e) => setClientEmails(e.target.value)}
                rows={2}
                className={`${inputClass} resize-y font-mono text-[13px]`}
                placeholder="client@example.com — separate with commas or new lines"
              />
            </div>

            <div>
              <label className={labelClass}>Attach this batch to a project</label>
              <ErpNativeSelect
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={`${inputClass} cursor-pointer !pr-10`}
              >
                <option value="">Workspace only — no project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </ErpNativeSelect>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-emerald-700">{message}</p>}

            {lastBatchDetail?.results?.length > 0 && (
              <ul className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
                {lastBatchDetail.results.map((r, i) => (
                  <li key={`${r.email}-${i}`} className={r.ok ? 'text-emerald-700' : 'text-red-600'}>
                    {r.email} ({r.globalRole}) — {r.ok ? 'sent' : r.error}
                  </li>
                ))}
              </ul>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 shadow-lg shadow-teal-900/25 hover:shadow-xl transition-all"
            >
              {submitting ? 'Sending…' : 'Send all invitation emails'}
            </button>
          </form>
        </div>
      </div>

      {isErpAdminEquivalent(profile?.role) && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-[#103D4D] flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 shadow-sm" aria-hidden />
              Workspace accounts
            </h2>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <label className="min-w-0 sm:max-w-xs">
                <span className="sr-only">Search workspace accounts</span>
                <input
                  type="search"
                  value={workspaceUserSearch}
                  onChange={(e) => setWorkspaceUserSearch(e.target.value)}
                  placeholder="Search email, name, role…"
                  className={ERP_LIST_SEARCH_INPUT_CLASS}
                  autoComplete="off"
                />
              </label>
              <ErpExportCsvButton
                filename={`workspace-accounts-${new Date().toISOString().slice(0, 10)}`}
                rows={workspaceUsersFiltered}
                columns={workspaceUsersExportColumns}
                label="Export CSV"
                className="self-start px-4 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => loadWorkspaceUsers()}
                disabled={usersLoading}
                className="self-start rounded-xl border border-cyan-200/80 bg-white/90 px-4 py-2 text-sm font-bold text-teal-900 hover:bg-cyan-50 hover:border-cyan-300 disabled:opacity-50 shadow-sm"
              >
                {usersLoading ? 'Refreshing…' : 'Refresh list'}
              </button>
            </div>
          </div>
          {usersError && <p className="text-sm text-red-600 mb-3">{usersError}</p>}
          <div className={`${panelCard} overflow-hidden`}>
            {usersLoading && workspaceUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading users…</div>
            ) : workspaceUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No workspace accounts found.</div>
            ) : workspaceUsersFiltered.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No accounts match your search.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 hidden md:table-cell">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3 hidden lg:table-cell">Joined</th>
                      <th className="px-4 py-3 hidden lg:table-cell">Last sign-in</th>
                      <th className="px-4 py-3 text-right w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaceUsersFiltered.map((u) => {
                      const isSelf = u.id === session?.user?.id;
                      return (
                        <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <span className="break-all">{u.email || '—'}</span>
                            {isSelf && (
                              <span className="ml-2 text-xs font-semibold text-neutral-900 whitespace-nowrap">(you)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{u.full_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 capitalize">{formatRole(u.role)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                            {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isSelf ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => requestDeleteWorkspaceUser(u)}
                                disabled={deletingUserId === u.id}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                {deletingUserId === u.id ? 'Removing…' : 'Remove'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 shadow-sm" aria-hidden />
            Recent invitations
          </h2>
          <p className="text-[11px] text-slate-500">Newest first (up to 100). Accepted and pending.</p>
        </div>
        <AdminRecentInvitationsList
          invites={invites}
          deletingInviteId={deletingInviteId}
          onDeleteInvite={requestDeleteInvite}
        />
      </section>

      <ErpFunctionalTeamSection />

      <ErpConfirmDialog
        open={confirmDeleteInvite != null}
        title={confirmDeleteInvite?.accepted_at ? 'Remove invitation record?' : 'Delete pending invitation?'}
        confirmLabel="Remove"
        tone="danger"
        busy={deletingInviteId != null}
        onCancel={() => !deletingInviteId && setConfirmDeleteInvite(null)}
        onConfirm={() => void executeDeleteInvite()}
      >
        <p>
          {confirmDeleteInvite?.accepted_at
            ? `Remove the record for ${confirmDeleteInvite.email}? The user already joined; this only deletes the invitation row from the list.`
            : `Delete the pending invitation for ${confirmDeleteInvite?.email}? The invite link will stop working.`}
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmRemoveWorkspaceUser != null}
        title="Remove workspace account?"
        confirmLabel="Remove permanently"
        tone="danger"
        busy={deletingUserId != null}
        onCancel={() => !deletingUserId && setConfirmRemoveWorkspaceUser(null)}
        onConfirm={() => void executeDeleteWorkspaceUser()}
      >
        <p>
          Permanently remove{' '}
          <span className="font-semibold">
            {confirmRemoveWorkspaceUser?.email || confirmRemoveWorkspaceUser?.full_name || confirmRemoveWorkspaceUser?.id}
          </span>{' '}
          from the workspace? Their auth account will be deleted, they will be removed from all projects, and their messages
          and tasks they created will be removed. This cannot be undone.
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmBatchNoProjectOpen}
        title="Send without a project?"
        confirmLabel="Send invitations"
        tone="teal"
        busy={submitting}
        onCancel={() => !submitting && setConfirmBatchNoProjectOpen(false)}
        onConfirm={async () => {
          setConfirmBatchNoProjectOpen(false);
          await runBulkInviteSubmit();
        }}
      >
        <p>
          No project is selected. Invited people will get workspace access but will not be added to any project — their
          Projects page will stay empty until you invite them with a project attached.
        </p>
      </ErpConfirmDialog>
    </div>
  );
}

export default function ErpInvitesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 rounded-full border-[3px] border-cyan-200 border-t-[#103D4D] border-r-violet-500 animate-spin shadow-md" />
        </div>
      }
    >
      <ErpInvitesPageInner />
    </Suspense>
  );
}

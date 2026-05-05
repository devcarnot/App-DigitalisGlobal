'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpAdminEquivalent } from '../../lib/erp-roles';
import { mergeTeamDirectoryWithDefaults, buildBulkInvitePayloads, parseEmailLines } from '../../lib/erp-team-directory';
import AdminTeamDirectory from './AdminTeamDirectory';
import { ERP_PROJECT_TYPES, normalizeErpProjectType } from '../../lib/erp-project-types';
import ErpNativeSelect from '../erp/ErpNativeSelect';
import ErpConfirmDialog from '../erp/ErpConfirmDialog';

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-slate-50/40 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner shadow-slate-900/[0.02] transition-all duration-200 focus:border-sky-400/70 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/12';

const labelClass = 'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mb-2';

const MAX_PROJECT_BRIEF_FILES = 8;
const MAX_PROJECT_BRIEF_FILE_BYTES = 12 * 1024 * 1024;

const IcoFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);
const IcoMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);
const IcoArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);
const IcoSpark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  </svg>
);
const IcoChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);
const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

const listScrollClass =
  'max-h-[min(320px,38vh)] overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.55)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/60 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400/70';

function emailInitialChar(email) {
  if (!email || typeof email !== 'string') return '?';
  const c = email.trim()[0];
  return c ? c.toUpperCase() : '?';
}

function shortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function inviteRoleBadgeClass(role) {
  const r = (role || '').toLowerCase();
  if (r === 'client') return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80';
  if (r === 'team_lead') return 'bg-violet-50 text-violet-800 ring-violet-200/80';
  return 'bg-sky-50 text-sky-800 ring-sky-200/80';
}

function PanelCard({ icon: Icon, title, subtitle, children, delay = 0, compact = false }) {
  const pad = compact ? 'p-4 sm:p-5' : 'p-6 sm:p-7';
  const headMb = compact ? 'mb-3' : 'mb-6';
  const iconWrap = compact
    ? 'h-10 w-10 rounded-xl shadow-md shadow-sky-500/15 ring-1 ring-white'
    : 'h-12 w-12 rounded-2xl shadow-lg shadow-sky-500/25 ring-2 ring-white';
  const titleCls = compact
    ? 'text-base font-bold tracking-tight text-slate-900'
    : 'text-lg font-bold tracking-tight text-slate-900 sm:text-xl';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-[#589CD5]/20 bg-white/95 shadow-[0_8px_36px_-14px_rgba(88,156,213,0.22)] ring-1 ring-[#52C4C9]/12 backdrop-blur-sm transition-shadow duration-300 hover:border-[#589CD5]/35 hover:shadow-[0_16px_48px_-16px_rgba(88,156,213,0.26)] ${compact ? '' : 'min-h-0'}`}
    >
      <div className={`flex flex-col ${pad}`}>
        <div className={`flex items-start gap-3 ${headMb}`}>
          <span
            className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-[#589CD5] to-[#52C4C9] text-white ${iconWrap}`}
          >
            <Icon />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className={titleCls}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">{subtitle}</p>}
          </div>
        </div>
        <div className={compact ? 'flex flex-col' : 'flex min-h-0 flex-1 flex-col'}>{children}</div>
      </div>
    </motion.div>
  );
}

export default function AdminErpPanel() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [invites, setInvites] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState('custom');
  const [descriptionFiles, setDescriptionFiles] = useState([]);
  const briefFileInputRef = useRef(null);
  const [startDate, setStartDate] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [creating, setCreating] = useState(false);
  /** Preset directory checkboxes: email -> checked */
  const [teamPresetSelected, setTeamPresetSelected] = useState({});
  const [clientEmails, setClientEmails] = useState('');
  const [projectId, setProjectId] = useState('');
  const defaultInviteProjectAppliedRef = useRef(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastBatchDetail, setLastBatchDetail] = useState(null);
  /** Loaded from `erp_team_directory_emails` (merged with DEFAULT_TEAM_ROSTER in UI). */
  const [teamDirectoryRows, setTeamDirectoryRows] = useState([]);
  const [deletingProjectId, setDeletingProjectId] = useState(null);
  const [deletingInviteId, setDeletingInviteId] = useState(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null);
  const [confirmDeleteInviteRow, setConfirmDeleteInviteRow] = useState(null);
  const [confirmBatchNoProjectPanel, setConfirmBatchNoProjectPanel] = useState(false);

  const userId = session?.user?.id;

  const mergedDirectoryEntries = useMemo(() => mergeTeamDirectoryWithDefaults(teamDirectoryRows), [teamDirectoryRows]);

  useEffect(() => {
    if (!supabase?.auth) return;
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const { data } = await supabase.from('erp_profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data || null);
    setProfileLoading(false);
  }, [userId]);

  const loadData = useCallback(async () => {
    if (!profile || !['admin', 'team_lead'].includes(profile.role)) return;
    const { data: projs } = await supabase
      .from('erp_projects')
      .select('id, name, description, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    setProjects(projs || []);
    const { data: inv } = await supabase.from('erp_invitations').select('*').order('created_at', { ascending: false }).limit(40);
    setInvites(inv || []);

    const { data: dirRows, error: dirErr } = await supabase
      .from('erp_team_directory_emails')
      .select('email, full_name, directory_role')
      .order('email');
    if (!dirErr && Array.isArray(dirRows)) {
      setTeamDirectoryRows(dirRows);
    } else if (String(dirErr?.message || '').toLowerCase().includes('column')) {
      setTeamDirectoryRows([]);
    }
  }, [profile]);

  const persistTeamEmailsToDirectory = useCallback(async (payloadString) => {
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
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (projects.length === 0 || defaultInviteProjectAppliedRef.current) return;
    defaultInviteProjectAppliedRef.current = true;
    setProjectId((prev) => prev || projects[0].id);
  }, [projects]);

  async function handleCreateProject(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLastBatchDetail(null);
    if (!userId || !name.trim()) return;
    if (!startDate || !deadlineDate) {
      setError('Start date and deadline are required.');
      return;
    }
    if (startDate > deadlineDate) {
      setError('Deadline must be on or after start date.');
      return;
    }
    setCreating(true);
    try {
      const { data: project, error: pErr } = await supabase
        .from('erp_projects')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          project_type: normalizeErpProjectType(projectType),
          project_type_ids: [normalizeErpProjectType(projectType)],
          created_by: userId,
          start_date: startDate,
          deadline_date: deadlineDate,
        })
        .select()
        .single();
      if (pErr) {
        setError(pErr.message);
        return;
      }
      const { error: mErr } = await supabase.from('erp_project_members').insert({
        project_id: project.id,
        user_id: userId,
        role: 'project_lead',
      });
      if (mErr) {
        setError(mErr.message);
        return;
      }
      const { error: chErr } = await supabase.from('erp_project_channels').insert({
        project_id: project.id,
        name: 'General',
        sort_order: 0,
        is_general: true,
        created_by: userId,
      });
      if (chErr) {
        setError(chErr.message);
        return;
      }
      await supabase.from('erp_activity_log').insert({
        project_id: project.id,
        user_id: userId,
        action: 'project_created',
        meta: { name: name.trim(), source: 'admin_portal' },
      });

      let uploadErr = '';
      const attachmentMeta = [];
      const hadBriefFiles = descriptionFiles.length > 0;
      if (descriptionFiles.length > 0) {
        for (const file of descriptionFiles) {
          if (file.size > MAX_PROJECT_BRIEF_FILE_BYTES) {
            uploadErr = `“${file.name}” is larger than 12 MB.`;
            break;
          }
        }
        if (!uploadErr) {
          for (const file of descriptionFiles) {
            const safe = `${Date.now()}_${String(file.name).replace(/[^\w.\-()+\s]/g, '_').replace(/\s+/g, '_')}`;
            const path = `${project.id}/${userId}/brief_${safe}`;
            const { error: upErr } = await supabase.storage.from('erp-files').upload(path, file, { upsert: false });
            if (upErr) {
              uploadErr = upErr.message;
              break;
            }
            attachmentMeta.push({
              path,
              name: file.name,
              mime: file.type || 'application/octet-stream',
            });
          }
        }
        if (!uploadErr && attachmentMeta.length > 0) {
          const { error: attErr } = await supabase
            .from('erp_projects')
            .update({ description_attachments: attachmentMeta })
            .eq('id', project.id);
          if (attErr) uploadErr = attErr.message;
        }
      }

      setName('');
      setProjectType('custom');
      setDescription('');
      setDescriptionFiles([]);
      setStartDate('');
      setDeadlineDate('');
      if (uploadErr) {
        setError(`Project was created, but uploading brief files failed: ${uploadErr}`);
        setMessage('Project created (without some brief files).');
      } else {
        setMessage(
          hadBriefFiles && attachmentMeta.length > 0 ? 'Project created with brief attachments.' : 'Project created.'
        );
      }
      loadData();
    } finally {
      setCreating(false);
    }
  }

  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  async function handleClaimAdmin() {
    setClaimError('');
    setClaiming(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/claim-admin', { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimError(data.error || 'Could not update role');
        return;
      }
      window.location.reload();
    } catch (err) {
      setClaimError(err?.message || 'Request failed');
    } finally {
      setClaiming(false);
    }
  }

  async function executeDeleteProject() {
    const project = confirmDeleteProject;
    if (!project?.id || !project?.name) return;
    setError('');
    setMessage('');
    setDeletingProjectId(project.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/projects/${project.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not delete project');
        return;
      }
      setConfirmDeleteProject(null);
      setProjectId((prev) => (prev === project.id ? '' : prev));
      setMessage(`Project “${project.name}” was deleted.`);
      await loadData();
    } catch (err) {
      setError(err?.message || 'Request failed');
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function executeDeleteInviteRow() {
    const inv = confirmDeleteInviteRow;
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
      setConfirmDeleteInviteRow(null);
      setMessage('Invitation removed.');
      await loadData();
    } finally {
      setDeletingInviteId(null);
    }
  }

  async function runBatchInvitesSubmit() {
    setError('');
    setMessage('');
    setLastBatchDetail(null);
    setInviteSubmitting(true);
    const { invites: dirInvites } = buildBulkInvitePayloads(teamPresetSelected, mergedDirectoryEntries);
    const clientList = parseEmailLines(clientEmails);
    const clientInvites = clientList.map((email) => ({ email, globalRole: 'client' }));
    const allInvites = [...dirInvites, ...clientInvites];
    if (allInvites.length === 0) {
      setError('Select at least one person in the team directory, or enter at least one client email.');
      setInviteSubmitting(false);
      return;
    }
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
        setError(data.error || 'Batch invite failed');
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
        setError(
          `Partially sent: ${summary.sent} ok, ${summary.failed} failed. See details below. Invitations may still be saved.`
        );
        setMessage('');
      } else {
        setError(data.results?.[0]?.error || 'No emails were sent. Try again or check your email provider.');
      }

      await loadData();
    } catch (err) {
      setError(err?.message || 'Request failed');
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleBatchInvites(e) {
    e.preventDefault();
    if (!projectId) {
      setConfirmBatchNoProjectPanel(true);
      return;
    }
    await runBatchInvitesSubmit();
  }

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

      const isAdmin = isErpAdminEquivalent(profile?.role);
      if (sendInvite && isAdmin) {
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
      await loadData();
      return {
        message:
          sendInvite && isAdmin ? 'Saved to directory and invitation email sent.' : 'Saved to directory.',
      };
    },
    [userId, profile?.role, projectId, persistTeamEmailsToDirectory, loadData],
  );

  if (profileLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4"
      >
        <h2 className="text-lg font-bold text-slate-800">ERP workspace not linked</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          This Supabase account has no row in <code className="text-xs bg-slate-100 px-1 rounded">erp_profiles</code>.
          Link it once as an admin from your machine (uses the service role key from{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">.env.local</code>, not Vercel):
        </p>
        <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto">
          npm run erp:bootstrap-admin -- your@email.com
        </pre>
        <p className="text-slate-500 text-sm">
          Use the same email you use for <strong>/admin/login</strong>. After that, refresh this page.
        </p>
        <Link href="/erp/login" className="inline-block text-sm font-medium text-sky-600 hover:underline">
          Open ERP sign-in →
        </Link>
      </motion.div>
    );
  }

  if (!['admin', 'team_lead'].includes(profile.role)) {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-slate-700 text-sm space-y-4">
        <p>
          Your workspace role is{' '}
          <span className="font-semibold capitalize">{profile.role?.replace(/_/g, ' ')}</span>. Projects and invites here require{' '}
          <strong>admin</strong> or <strong>team lead</strong> in <code className="text-xs bg-white/80 px-1 rounded">erp_profiles</code>{' '}
          (separate from signing into <code className="text-xs bg-white/80 px-1 rounded">/admin</code>).
        </p>
        <p className="text-slate-600">
          If you should manage ERP from this tab, click below — only works when your sign-in email is allow-listed on the server.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleClaimAdmin}
            disabled={claiming}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#589CD5] to-[#52C4C9] text-white text-sm font-semibold shadow-lg shadow-[#589CD5]/25 disabled:opacity-50"
          >
            {claiming ? 'Updating…' : 'Grant ERP admin (allow-listed email)'}
          </button>
          <Link href="/erp/dashboard" className="text-sky-600 font-medium hover:underline text-sm">
            Go to ERP dashboard
          </Link>
        </div>
        {claimError && <p className="text-red-600 text-sm pt-1">{claimError}</p>}
      </div>
    );
  }

  const btnPrimary =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#589CD5] to-[#52C4C9] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:shadow-xl hover:shadow-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto';

  const canManageInvites = isErpAdminEquivalent(profile?.role);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#589CD5]/35 bg-gradient-to-br from-sky-100/50 via-white to-cyan-100/40 p-4 shadow-[0_16px_56px_-20px_rgba(88,156,213,0.35)] ring-1 ring-[#52C4C9]/20 sm:p-5">
      <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#589CD5]/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-[#52C4C9]/25 blur-3xl" aria-hidden />
      <div className="relative space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-[#589CD5]/30 bg-gradient-to-r from-[#589CD5]/12 via-white to-[#52C4C9]/15 p-5 shadow-md ring-1 ring-white/80 sm:p-6"
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#589CD5]/15 blur-2xl" aria-hidden />
        <div className="relative flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#589CD5] to-[#52C4C9] text-white shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <IcoSpark />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">ERP workspace tools</p>
              <p className="mt-0.5 text-sm text-slate-600">Projects, team directory, and invites. Statistics live in the ERP app.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link
              href="/erp/dashboard"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#589CD5]/40 bg-white px-5 py-2.5 text-sm font-bold text-[#103D4D] shadow-sm transition-all hover:border-[#589CD5] hover:bg-sky-50 hover:shadow-md"
            >
              Open ERP
              <span className="transition-transform group-hover:translate-x-0.5">
                <IcoArrow />
              </span>
            </Link>
            {isErpAdminEquivalent(profile?.role) && (
              <Link
                href="/erp/admin/statistics"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#589CD5] to-[#52C4C9] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:shadow-xl hover:shadow-sky-500/35"
              >
                Statistics
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      {(message || error) && (
        <div
          className={`rounded-2xl border px-5 py-4 text-sm shadow-sm ${
            error
              ? 'border-red-200/90 bg-gradient-to-br from-red-50 to-white text-red-800'
              : 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white text-emerald-900'
          }`}
        >
          {error && <p className="font-semibold">{error}</p>}
          {message && <p className={error ? 'mt-2 text-emerald-800' : 'font-medium'}>{message}</p>}
        </div>
      )}

      {lastBatchDetail?.results?.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.1)] ring-1 ring-slate-900/[0.03]">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Per-recipient result</p>
          <ul className="max-h-52 space-y-2 overflow-y-auto text-xs">
            {lastBatchDetail.results.map((r, i) => (
              <li
                key={`${r.email}-${i}`}
                className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-3 py-2 ${
                  r.ok ? 'bg-emerald-50/80 text-emerald-900' : 'bg-red-50/80 text-red-800'
                }`}
              >
                <span className="font-mono font-medium">{r.email}</span>
                <span className="text-[11px] opacity-90">
                  ({r.globalRole?.replace(/_/g, ' ')}) — {r.ok ? 'Sent' : r.error || 'Failed'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
        <PanelCard
          compact
          icon={IcoFolder}
          title="New ERP project"
          subtitle="Essentials only — expand for description or brief files."
          delay={0}
        >
          <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Project name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
                placeholder="e.g. Acme website"
              />
            </div>
            <div>
              <label className={labelClass}>Project type</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 z-[2] -translate-y-1/2 text-slate-500" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15m-15 5.25h15m-15 5.25h15" />
                  </svg>
                </span>
                <ErpNativeSelect
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  className={`${inputClass} cursor-pointer !pl-11 !pr-10 font-semibold`}
                >
                  {ERP_PROJECT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </ErpNativeSelect>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Deadline</label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  required
                  min={startDate || undefined}
                  className={inputClass}
                />
              </div>
            </div>
            <details className="group rounded-xl border border-slate-200/70 bg-slate-50/50 open:border-sky-200/60 open:bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100/60 [&::-webkit-details-marker]:hidden">
                <span>
                  Description & files <span className="font-normal text-slate-500">(optional)</span>
                </span>
                <span className="shrink-0 text-[10px] text-slate-400 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div className="space-y-3 border-t border-slate-100 p-3">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-y`}
                  placeholder="Goals, scope, or notes…"
                />
                <input
                  ref={briefFileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = '';
                    if (!list.length) return;
                    setDescriptionFiles((prev) => [...prev, ...list].slice(0, MAX_PROJECT_BRIEF_FILES));
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => briefFileInputRef.current?.click()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Add brief files
                  </button>
                </div>
                {descriptionFiles.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {descriptionFiles.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      >
                        <span className="max-w-[200px] truncate">{f.name}</span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => setDescriptionFiles((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Remove file"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
            <button type="submit" disabled={creating} className={btnPrimary}>
              {creating ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </PanelCard>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="group/card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#589CD5]/20 bg-white/95 shadow-[0_8px_30px_-12px_rgba(88,156,213,0.18)] ring-1 ring-[#52C4C9]/10"
        >
          <div className="border-b border-sky-100/80 bg-gradient-to-br from-sky-50/40 via-white to-cyan-50/20 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#589CD5] to-[#52C4C9] text-white shadow-md shadow-sky-500/20 ring-1 ring-white">
                  <IcoFolder />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight text-slate-900">Your projects</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Open workspace or delete (admins / team leads).</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-sky-800 shadow-sm ring-1 ring-sky-200/70">
                {projects.length}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-4 sm:p-5">
            {projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-600">No projects yet</p>
                <p className="mt-1 text-xs text-slate-400">Create one in the card above.</p>
              </div>
            ) : (
              <ul className={`space-y-2.5 ${listScrollClass}`}>
                {projects.map((p, i) => (
                  <motion.li
                    key={p.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.24) }}
                    className="flex items-stretch gap-3 rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm transition-all duration-200 hover:border-sky-300/50 hover:shadow-md sm:p-3.5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 text-sky-600 ring-1 ring-slate-200/80">
                      <IcoFolder />
                    </span>
                    <div className="min-w-0 flex-1 self-center py-0.5">
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.description}</p>
                      ) : (
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          {p.updated_at ? `Updated ${shortDate(p.updated_at)}` : 'Workspace'}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 self-center sm:flex-row sm:items-center">
                      <Link
                        href={`/erp/projects/${p.id}`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-[#589CD5] to-[#52C4C9] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Open
                        <IcoChevronRight />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProject(p)}
                        disabled={deletingProjectId === p.id}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200/90 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
                        title="Delete project permanently"
                      >
                        <IcoTrash />
                        {deletingProjectId === p.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>

        {canManageInvites ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="group/card flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-violet-200/40 bg-white/95 shadow-[0_8px_30px_-12px_rgba(139,92,246,0.15)] ring-1 ring-violet-500/10"
        >
          <div className="border-b border-violet-100/80 bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/25 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/25 ring-1 ring-white">
                  <IcoMail />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight text-slate-900">Recent invitations</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Latest invites — delete to revoke pending links.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-violet-900 shadow-sm ring-1 ring-violet-200/70">
                {invites.length}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-4 sm:p-5">
            {invites.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-600">No invitations yet</p>
                <p className="mt-1 text-xs text-slate-400">They appear here after you send bulk invites.</p>
              </div>
            ) : (
              <ul className={`space-y-2.5 ${listScrollClass}`}>
                {invites.map((inv, i) => {
                  const accepted = !!inv.accepted_at;
                  return (
                    <motion.li
                      key={inv.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.24) }}
                      className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm transition-all duration-200 hover:border-violet-200/90 hover:shadow-md sm:p-3.5"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 text-sm font-bold text-violet-800 ring-1 ring-violet-200/60">
                        {emailInitialChar(inv.email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[13px] font-semibold text-slate-900">{inv.email}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${inviteRoleBadgeClass(inv.global_role)}`}
                          >
                            {inv.global_role?.replace(/_/g, ' ') || 'Member'}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                              accepted
                                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200/80'
                                : 'bg-amber-50 text-amber-900 ring-amber-200/80'
                            }`}
                          >
                            {accepted ? 'Accepted' : 'Pending'}
                          </span>
                          {inv.created_at && (
                            <span className="text-[10px] font-medium text-slate-400">{shortDate(inv.created_at)}</span>
                          )}
                        </div>
                      </div>
                      {!accepted && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteInviteRow(inv)}
                          disabled={deletingInviteId === inv.id}
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-red-200/90 bg-white px-2.5 py-2 text-[11px] font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
                          title="Remove invitation record"
                        >
                          <IcoTrash />
                          {deletingInviteId === inv.id ? '…' : 'Delete'}
                        </button>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>
        </motion.div>
        ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="w-full min-w-0 overflow-hidden rounded-2xl border border-violet-200/30 bg-white/90 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.1)] ring-1 ring-violet-500/10"
        >
          <div className="px-4 py-5 sm:px-5">
            <h3 className="text-base font-bold text-slate-900">Recent invitations</h3>
            <p className="mt-1 text-xs text-slate-500">Admins see invite history here.</p>
          </div>
        </motion.div>
        )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
        {canManageInvites ? (
        <PanelCard
          icon={IcoMail}
          title="Bulk invitations"
          delay={0.06}
        >
          <div className="flex flex-1 flex-col gap-5">
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 ring-1 ring-sky-900/[0.04] sm:p-5">
              <label className={`${labelClass} text-sky-800/80`}>Team directory</label>
              <p className="mb-4 text-xs text-sky-900/70">
                Search by name or email (like Gmail). Each person&apos;s checked invite uses the workspace role stored with
                them in the directory (team lead vs other roles). Add people below — they appear in the list for next time.
              </p>
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

            <form onSubmit={handleBatchInvites} className="flex flex-col gap-5">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/35 p-4 ring-1 ring-emerald-900/[0.04]">
                <label className={`${labelClass} text-emerald-900/80`}>Clients</label>
                <textarea
                  value={clientEmails}
                  onChange={(e) => setClientEmails(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-y font-mono text-[13px]`}
                  placeholder="client@theircompany.com"
                />
              </div>

              <div>
                <label className={labelClass}>Attach invites to project</label>
                <ErpNativeSelect
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={`${inputClass} cursor-pointer !pr-10`}
                >
                  <option value="">Workspace only — no project (not recommended)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </ErpNativeSelect>
              </div>

              <button type="submit" disabled={inviteSubmitting} className={btnPrimary}>
                {inviteSubmitting ? 'Sending…' : 'Send all invitation emails'}
              </button>
            </form>
          </div>
        </PanelCard>
        ) : (
        <PanelCard icon={IcoMail} title="Bulk invitations" delay={0.06}>
          <p className="text-sm text-slate-500">
            <Link href="/erp/admin/invites" className="font-semibold text-sky-600 hover:underline">
              Open Invites & users
            </Link>
          </p>
        </PanelCard>
        )}
        </div>
      </div>
      </div>

      <ErpConfirmDialog
        open={confirmDeleteProject != null}
        title="Delete project?"
        confirmLabel="Delete project"
        tone="danger"
        busy={deletingProjectId != null}
        onCancel={() => !deletingProjectId && setConfirmDeleteProject(null)}
        onConfirm={() => void executeDeleteProject()}
      >
        <p>
          Delete project <span className="font-semibold">“{confirmDeleteProject?.name}”</span>? This permanently removes the
          project, memberships, messages, tasks, activity, invitations tied to it, and files in storage. You cannot undo this.
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmDeleteInviteRow != null}
        title={confirmDeleteInviteRow?.accepted_at ? 'Remove invitation record?' : 'Delete pending invitation?'}
        confirmLabel="Remove"
        tone="danger"
        busy={deletingInviteId != null}
        onCancel={() => !deletingInviteId && setConfirmDeleteInviteRow(null)}
        onConfirm={() => void executeDeleteInviteRow()}
      >
        <p>
          {confirmDeleteInviteRow?.accepted_at
            ? `Remove the record for ${confirmDeleteInviteRow.email}? They already joined; this only deletes the invitation row.`
            : `Delete the pending invitation for ${confirmDeleteInviteRow?.email}? The invite link will stop working.`}
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmBatchNoProjectPanel}
        title="Send without a project?"
        confirmLabel="Send invitations"
        tone="teal"
        busy={inviteSubmitting}
        onCancel={() => !inviteSubmitting && setConfirmBatchNoProjectPanel(false)}
        onConfirm={async () => {
          setConfirmBatchNoProjectPanel(false);
          await runBatchInvitesSubmit();
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

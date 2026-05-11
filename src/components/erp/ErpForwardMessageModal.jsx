'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import ErpUserAvatar from './ErpUserAvatar';
import { erpModalBackdropClass } from './ErpModalFormPrimitives';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';

/**
 * Unified destination picker for forwarding a message.
 *
 * The modal lets the user forward to:
 *   - any workspace member (DM)        → erp_direct_messages
 *   - any group they're a member of    → erp_group_messages
 *   - any project channel they belong  → erp_messages (project_id + channel_id)
 *
 * Loads all three lists in parallel on open, supports a global search that
 * filters across every destination type, and uses single-select + a single
 * "Forward" CTA. Attachments are forwarded by reference (same storage path)
 * so we never re-upload the file.
 *
 * @typedef {{ body?: string, attachments?: Array<{ path: string, name?: string, mime?: string }>, senderName?: string }} ForwardSource
 */

const TAB_ALL = 'all';
const TAB_PEOPLE = 'people';
const TAB_GROUPS = 'groups';
const TAB_CHANNELS = 'channels';

const PANEL_CLASS =
  'relative z-[1] flex max-h-[min(92dvh,640px)] w-full max-w-[min(calc(100vw-2rem),520px)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_28px_70px_-28px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/[0.04] dark:border-teal-900/55 dark:bg-[#0e1824] dark:shadow-[0_28px_70px_-28px_rgba(0,0,0,0.7)] dark:ring-white/[0.03]';

function quoteMarkdown(body) {
  const trimmed = String(body || '').replace(/\s+$/g, '');
  if (!trimmed) return '';
  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * Build the forwarded message body. Uses a markdown blockquote so renderers
 * already in the app (`ChatMessageHtml`) display it as a quoted attribution.
 */
export function buildForwardedBody({ body, senderName }) {
  const attribution = `> _Forwarded${senderName ? ` from **${senderName.replace(/[*_`]/g, '')}**` : ''}_`;
  const quoted = quoteMarkdown(body);
  if (!quoted) return attribution;
  return `${attribution}\n>\n${quoted}`;
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a.path === 'string' && a.path)
    .map((a) => ({
      path: a.path,
      name: a.name || 'file',
      mime: a.mime || 'application/octet-stream',
    }));
}

function IconSearch({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function IconForward({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M4 18v-4a4 4 0 014-4h12" />
    </svg>
  );
}

function IconGroup({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m7-3.13a4 4 0 100-8 4 4 0 000 8zm5 0a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

function IconHash({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinecap="round" d="M5 9h14M5 15h14M9 4l-2 16M17 4l-2 16" />
    </svg>
  );
}

export default function ErpForwardMessageModal({ open, source, myId, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState(TAB_ALL);
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState([]);
  const [groups, setGroups] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(null); // { type, id, label, ... }
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const searchInputRef = useRef(null);

  const trimmedSearch = search.trim().toLowerCase();

  /** Load all destinations in parallel as soon as the modal opens. */
  const loadDestinations = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    setErr('');
    try {
      const [peopleRes, groupMemRes, projectMemRes] = await Promise.all([
        supabase
          .from('erp_profiles')
          .select('id, full_name, avatar_path, role')
          .neq('id', myId)
          .order('full_name', { ascending: true })
          .limit(500),
        supabase.from('erp_message_group_members').select('group_id').eq('user_id', myId),
        supabase.from('erp_project_members').select('project_id').eq('user_id', myId).limit(500),
      ]);

      setPeople(peopleRes.data || []);

      const groupIds = [
        ...new Set(((groupMemRes.data || []).map((r) => r.group_id).filter(Boolean))),
      ];
      if (groupIds.length === 0) {
        setGroups([]);
      } else {
        const { data: gr } = await supabase
          .from('erp_message_groups')
          .select('id, name, updated_at')
          .in('id', groupIds)
          .order('updated_at', { ascending: false });
        setGroups(gr || []);
      }

      const projectIds = [
        ...new Set(((projectMemRes.data || []).map((r) => r.project_id).filter(Boolean))),
      ];
      if (projectIds.length === 0) {
        setChannels([]);
      } else {
        const [{ data: projs }, { data: chans }] = await Promise.all([
          supabase.from('erp_projects').select('id, name').in('id', projectIds).is('deleted_at', null),
          supabase
            .from('erp_project_channels')
            .select('id, project_id, name, is_general, sort_order')
            .in('project_id', projectIds)
            .order('sort_order', { ascending: true }),
        ]);
        const projectNameById = {};
        for (const p of projs || []) projectNameById[p.id] = p.name || 'Project';
        const enriched = (chans || []).map((c) => ({
          ...c,
          projectName: projectNameById[c.project_id] || 'Project',
        }));
        setChannels(enriched);
      }
    } catch (e) {
      setErr(e?.message || 'Could not load destinations');
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(TAB_ALL);
    setSearch('');
    setSelected(null);
    setErr('');
    void loadDestinations();
    // Focus search after mount.
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);
  }, [open, loadDestinations]);

  /** Esc closes the modal. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const filteredPeople = useMemo(() => {
    if (!trimmedSearch) return people;
    return people.filter((p) =>
      String(p.full_name || '').toLowerCase().includes(trimmedSearch),
    );
  }, [people, trimmedSearch]);

  const filteredGroups = useMemo(() => {
    if (!trimmedSearch) return groups;
    return groups.filter((g) => String(g.name || '').toLowerCase().includes(trimmedSearch));
  }, [groups, trimmedSearch]);

  const filteredChannels = useMemo(() => {
    if (!trimmedSearch) return channels;
    return channels.filter((c) => {
      const hay = `${c.name || ''} ${c.projectName || ''}`.toLowerCase();
      return hay.includes(trimmedSearch);
    });
  }, [channels, trimmedSearch]);

  const tabs = useMemo(() => {
    const list = [{ id: TAB_ALL, label: 'All', count: filteredPeople.length + filteredGroups.length + filteredChannels.length }];
    if (filteredPeople.length || activeTab === TAB_PEOPLE) {
      list.push({ id: TAB_PEOPLE, label: 'People', count: filteredPeople.length });
    }
    if (filteredGroups.length || activeTab === TAB_GROUPS) {
      list.push({ id: TAB_GROUPS, label: 'Groups', count: filteredGroups.length });
    }
    if (filteredChannels.length || activeTab === TAB_CHANNELS) {
      list.push({ id: TAB_CHANNELS, label: 'Channels', count: filteredChannels.length });
    }
    return list;
  }, [filteredPeople.length, filteredGroups.length, filteredChannels.length, activeTab]);

  const selectPerson = (p) => setSelected({ type: 'person', id: p.id, label: p.full_name || 'Member', profile: p });
  const selectGroup = (g) => setSelected({ type: 'group', id: g.id, label: g.name || 'Group' });
  const selectChannel = (c) =>
    setSelected({
      type: 'channel',
      id: c.id,
      projectId: c.project_id,
      label: `${c.projectName} · #${c.name || 'general'}`,
    });

  const handleForward = useCallback(async () => {
    if (!selected || !myId || !source || busy) return;
    setBusy(true);
    setErr('');
    try {
      const attachments = normalizeAttachments(source.attachments);
      const body = buildForwardedBody(source);

      if (selected.type === 'person') {
        const row = {
          sender_id: myId,
          recipient_id: selected.id,
          body,
        };
        if (attachments.length) row.attachments = attachments;
        const { data: inserted, error } = await supabase
          .from('erp_direct_messages')
          .insert(row)
          .select('id')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (inserted?.id) {
          erpAuthorizedFetch('/api/erp/notify-dm', {
            method: 'POST',
            body: JSON.stringify({ messageId: inserted.id }),
          }).catch(() => {});
        }
      } else if (selected.type === 'group') {
        const row = {
          group_id: selected.id,
          sender_id: myId,
          body,
        };
        if (attachments.length) row.attachments = attachments;
        const { error } = await supabase.from('erp_group_messages').insert(row);
        if (error) throw new Error(error.message);
      } else if (selected.type === 'channel') {
        const row = {
          project_id: selected.projectId,
          channel_id: selected.id,
          user_id: myId,
          body,
          attachments,
        };
        const { data: inserted, error } = await supabase
          .from('erp_messages')
          .insert(row)
          .select('id')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (inserted?.id) {
          erpAuthorizedFetch('/api/erp/notify-message', {
            method: 'POST',
            body: JSON.stringify({ messageId: inserted.id }),
          }).catch(() => {});
        }
      }

      onSuccess?.(selected);
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'Could not forward message');
    } finally {
      setBusy(false);
    }
  }, [selected, myId, source, busy, onSuccess, onClose]);

  if (!open) return null;

  const showAll = activeTab === TAB_ALL;
  const showPeople = showAll || activeTab === TAB_PEOPLE;
  const showGroups = showAll || activeTab === TAB_GROUPS;
  const showChannels = showAll || activeTab === TAB_CHANNELS;

  const empty =
    !loading &&
    filteredPeople.length === 0 &&
    filteredGroups.length === 0 &&
    filteredChannels.length === 0;

  const sourcePreview = String(source?.body || '').replace(/\s+/g, ' ').trim().slice(0, 110);
  const attachmentCount = normalizeAttachments(source?.attachments).length;

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-6"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => !busy && onClose?.()}
          className={erpModalBackdropClass}
        />
        <div className={PANEL_CLASS} role="dialog" aria-modal="true" aria-labelledby="erp-forward-title">
          <header className="relative shrink-0 bg-gradient-to-br from-[#0d3343] via-[#103D4D] to-teal-700 px-5 py-4 text-white sm:px-6 dark:from-[#0a1f29] dark:via-[#0e2c3a] dark:to-teal-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                  <IconForward className="h-5 w-5 text-cyan-100" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/90">Share</p>
                  <h2 id="erp-forward-title" className="mt-0.5 truncate text-lg font-bold tracking-tight text-white">
                    Forward message
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !busy && onClose?.()}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white/95 shadow-sm backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {(sourcePreview || attachmentCount > 0) ? (
              <div className="mt-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11.5px] text-cyan-50/95 backdrop-blur-sm">
                {sourcePreview ? (
                  <p className="line-clamp-2">{sourcePreview}</p>
                ) : (
                  <p className="italic text-cyan-100/80">No text — attachments only</p>
                )}
                {attachmentCount > 0 ? (
                  <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-cyan-200/90">
                    📎 {attachmentCount} attachment{attachmentCount === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </header>

          <div className="shrink-0 border-b border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-teal-900/45 dark:bg-[#0a1218]/60 sm:px-5">
            <label className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
                <IconSearch />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people, groups, channels…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-inner shadow-slate-900/[0.03] placeholder:text-slate-400 focus:border-[#103D4D]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 dark:border-teal-800/55 dark:bg-[#101a22] dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-black/40 dark:focus:border-teal-600/55 dark:focus:ring-teal-500/25"
              />
            </label>
            <div role="tablist" aria-label="Forward destination tabs" className="mt-2.5 flex flex-wrap gap-1.5">
              {tabs.map((t) => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                      active
                        ? 'bg-[#103D4D] text-white ring-1 ring-cyan-300/60 dark:bg-teal-700/80 dark:ring-teal-500/40'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-[#101a22] dark:text-slate-300 dark:ring-teal-900/55 dark:hover:bg-[#152230]'
                    }`}
                  >
                    {t.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'}`}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:thin] sm:px-3">
            {loading ? (
              <p className="px-3 py-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                Loading destinations…
              </p>
            ) : empty ? (
              <p className="px-3 py-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {trimmedSearch ? `No matches for "${search.trim()}".` : 'Nothing to forward to yet.'}
              </p>
            ) : (
              <div className="space-y-3">
                {showPeople && filteredPeople.length > 0 ? (
                  <DestinationGroup label="People" count={filteredPeople.length}>
                    {filteredPeople.map((p) => {
                      const active = selected?.type === 'person' && selected?.id === p.id;
                      return (
                        <DestinationRow
                          key={p.id}
                          active={active}
                          onClick={() => selectPerson(p)}
                          icon={<ErpUserAvatar profile={p} size="sm" />}
                          title={p.full_name || 'Member'}
                          subtitle={p.role ? p.role.replace(/_/g, ' ') : null}
                        />
                      );
                    })}
                  </DestinationGroup>
                ) : null}

                {showGroups && filteredGroups.length > 0 ? (
                  <DestinationGroup label="Groups" count={filteredGroups.length}>
                    {filteredGroups.map((g) => {
                      const active = selected?.type === 'group' && selected?.id === g.id;
                      return (
                        <DestinationRow
                          key={g.id}
                          active={active}
                          onClick={() => selectGroup(g)}
                          icon={
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 ring-2 ring-white shadow-sm dark:bg-violet-950/55 dark:text-violet-200 dark:ring-[#0e1824]">
                              <IconGroup className="h-4 w-4" />
                            </span>
                          }
                          title={g.name || 'Group'}
                          subtitle="Group chat"
                        />
                      );
                    })}
                  </DestinationGroup>
                ) : null}

                {showChannels && filteredChannels.length > 0 ? (
                  <DestinationGroup label="Project channels" count={filteredChannels.length}>
                    {filteredChannels.map((c) => {
                      const active = selected?.type === 'channel' && selected?.id === c.id;
                      return (
                        <DestinationRow
                          key={c.id}
                          active={active}
                          onClick={() => selectChannel(c)}
                          icon={
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-[#103D4D] ring-2 ring-white shadow-sm dark:bg-teal-950/55 dark:text-teal-200 dark:ring-[#0e1824]">
                              <IconHash className="h-4 w-4" />
                            </span>
                          }
                          title={`#${c.name || 'general'}`}
                          subtitle={c.projectName}
                        />
                      );
                    })}
                  </DestinationGroup>
                ) : null}
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200/80 bg-slate-50/80 px-5 py-3 dark:border-teal-900/50 dark:bg-[#0a1218]">
            {err ? (
              <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                {err}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[12px] text-slate-500 dark:text-slate-400">
                {selected ? (
                  <>
                    Sending to{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{selected.label}</span>
                  </>
                ) : (
                  'Choose a destination to forward to.'
                )}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => !busy && onClose?.()}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleForward}
                  disabled={!selected || busy}
                  className="inline-flex items-center gap-1.5 rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconForward className="h-3.5 w-3.5" />
                  {busy ? 'Forwarding…' : 'Forward'}
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

function DestinationGroup({ label, count, children }) {
  return (
    <section>
      <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
        <span className="ml-1.5 font-semibold tabular-nums text-slate-400 dark:text-slate-500">{count}</span>
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function DestinationRow({ active, onClick, icon, title, subtitle }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
          active
            ? 'bg-cyan-50 ring-1 ring-cyan-300/70 dark:bg-teal-950/45 dark:ring-teal-700/55'
            : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] font-semibold ${active ? 'text-[#0a3344] dark:text-teal-100' : 'text-slate-800 dark:text-slate-100'}`}>
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-[11px] capitalize text-slate-500 dark:text-slate-400">
              {subtitle}
            </span>
          ) : null}
        </span>
        {active ? (
          <svg className="h-4 w-4 shrink-0 text-cyan-700 dark:text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4 10-10" />
          </svg>
        ) : null}
      </button>
    </li>
  );
}

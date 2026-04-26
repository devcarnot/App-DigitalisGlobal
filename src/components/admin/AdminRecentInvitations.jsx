'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import ErpConfirmDialog from '../erp/ErpConfirmDialog';

const scrollClass =
  'max-h-[min(420px,50vh)] overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.55)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/60 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400/70';

const panelCard =
  'rounded-2xl border border-cyan-200/45 bg-white/85 backdrop-blur-md overflow-hidden shadow-[0_12px_40px_-12px_rgba(16,61,77,0.16)] ring-1 ring-white/60';

/**
 * Recent invitation rows (pending + accepted history). Used on Invites & users and Users.
 */
export function AdminRecentInvitationsList({ invites, deletingInviteId, onDeleteInvite }) {
  if (invites.length === 0) {
    return (
      <div className={panelCard}>
        <div className="p-8 text-center">
          <p className="text-slate-500 text-sm">No invitations yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={scrollClass}>
      <ul className="space-y-3">
        {invites.map((inv) => (
          <li
            key={inv.id}
            className="group relative overflow-hidden rounded-xl border border-white/80 bg-white/90 backdrop-blur-sm px-4 py-4 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-[0_4px_20px_-8px_rgba(88,156,213,0.12)] ring-1 ring-slate-900/[0.03] transition-all hover:shadow-[0_8px_28px_-8px_rgba(88,156,213,0.18)]"
          >
            <span
              className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${inv.accepted_at ? 'bg-gradient-to-b from-emerald-400 to-teal-500' : 'bg-gradient-to-b from-violet-700 to-cyan-600'}`}
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 pl-2 sm:pl-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="text-slate-900 font-semibold truncate">{inv.email}</span>
              <span className="text-slate-500 capitalize text-sm">{inv.global_role?.replace(/_/g, ' ')}</span>
              <span className="text-slate-500 text-xs font-medium">
                {inv.accepted_at ? `Accepted ${new Date(inv.accepted_at).toLocaleDateString()}` : 'Pending'}
              </span>
              {inv.created_at ? (
                <span className="text-slate-400 text-xs font-medium hidden sm:inline">
                  Sent {new Date(inv.created_at).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            {!inv.accepted_at && (
              <button
                type="button"
                onClick={() => onDeleteInvite?.(inv)}
                disabled={deletingInviteId === inv.id}
                className="shrink-0 self-start sm:self-center rounded-lg border border-red-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingInviteId === inv.id ? 'Removing…' : 'Delete'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const INVITE_PAGE_LIMIT = 100;

/**
 * Self-contained recent invitations for the Workspace Users page (same data as Invites & users).
 */
export default function AdminRecentInvitationsSection() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [deletingInviteId, setDeletingInviteId] = useState(null);
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('erp_invitations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(INVITE_PAGE_LIMIT);
      if (error) throw new Error(error.message);
      setInvites(data || []);
    } catch (e) {
      setErr(e?.message || 'Could not load invitations');
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  function requestDeleteInvite(inv) {
    if (!inv?.id) return;
    setConfirmDeleteInvite(inv);
  }

  async function executeDeleteInvite() {
    const inv = confirmDeleteInvite;
    if (!inv?.id) return;
    setErr('');
    setDeletingInviteId(inv.id);
    try {
      const { error: delErr } = await supabase.from('erp_invitations').delete().eq('id', inv.id);
      if (delErr) {
        setErr(delErr.message);
        return;
      }
      setConfirmDeleteInvite(null);
      await loadInvites();
    } finally {
      setDeletingInviteId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 shadow-sm" aria-hidden />
          Recent invitations
        </h2>
        <p className="text-[11px] text-slate-500 max-w-xl">
          Pending and accepted invites (newest first, up to {INVITE_PAGE_LIMIT}).           Bulk sending stays on{' '}
          <Link href="/erp/admin/invites" className="font-semibold text-[#103D4D] hover:underline">
            Invites & users
          </Link>
          .
        </p>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? (
        <div className={`${panelCard} p-8 text-center text-slate-500 text-sm`}>Loading invitations…</div>
      ) : (
        <AdminRecentInvitationsList
          invites={invites}
          deletingInviteId={deletingInviteId}
          onDeleteInvite={requestDeleteInvite}
        />
      )}

      <ErpConfirmDialog
        open={confirmDeleteInvite != null}
        title={confirmDeleteInvite?.accepted_at ? 'Remove invitation record?' : 'Delete pending invitation?'}
        confirmLabel={confirmDeleteInvite?.accepted_at ? 'Remove' : 'Delete'}
        tone="danger"
        busy={deletingInviteId != null && deletingInviteId === confirmDeleteInvite?.id}
        onCancel={() => setConfirmDeleteInvite(null)}
        onConfirm={() => void executeDeleteInvite()}
      >
        {confirmDeleteInvite?.accepted_at ? (
          <p>
            Remove the record for <span className="font-semibold">{confirmDeleteInvite.email}</span>? The user
            already joined; this only deletes the invitation row from the list.
          </p>
        ) : (
          <p>
            Delete the pending invitation for <span className="font-semibold">{confirmDeleteInvite?.email}</span>?
            The invite link will stop working.
          </p>
        )}
      </ErpConfirmDialog>
    </section>
  );
}

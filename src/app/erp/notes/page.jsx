'use client';

import ErpNotesBoard from '../../../components/erp/notes/ErpNotesBoard';
import { useErpSession } from '../../../components/erp/useErpSession';

/**
 * Personal Kanban "Notes" board for admin / HR / team manager roles.
 *
 * The sidebar entry is RBAC-gated through the `notes` module; this page
 * also re-checks `erpCan('notes', 'view')` so a stale link or direct
 * navigation never leaks the board to a member / client.
 */
export default function ErpNotesPage() {
  const { profile, session, erpCan, loading } = useErpSession();
  const userId = session?.user?.id || null;
  const canView = erpCan?.('notes', 'view');

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <header className="rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-800 px-4 py-4 text-white shadow-xl shadow-teal-900/25 ring-1 ring-slate-900/20 sm:px-6 sm:py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Workspace</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Notes</h1>
        </header>
        <div className="h-32 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/50" />
      </div>
    );
  }

  if (!profile || !userId) {
    return null;
  }

  if (!canView) {
    return (
      <div className="w-full space-y-4">
        <header className="rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-800 px-4 py-4 text-white shadow-xl shadow-teal-900/25 ring-1 ring-slate-900/20 sm:px-6 sm:py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Workspace</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Notes</h1>
        </header>
        <p className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-600 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-300">
          Notes are available to admins, HR, and team managers. Ask your workspace
          admin to grant access from <strong>Users &amp; Roles → Notes</strong> if you
          need it.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <header className="rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-800 px-4 py-4 text-white shadow-xl shadow-teal-900/25 ring-1 ring-slate-900/20 sm:px-6 sm:py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Workspace</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Notes</h1>
        <p className="mt-1 text-xs text-cyan-100/85 sm:text-sm">
          Your private Kanban — drag what is next between columns. Visible only to you.
        </p>
      </header>
      <ErpNotesBoard userId={userId} />
    </div>
  );
}

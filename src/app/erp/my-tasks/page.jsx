'use client';

import MyTasksBoard from '../../../components/erp/MyTasksBoard';
import { useErpSession } from '../../../components/erp/useErpSession';

export default function ErpMyTasksPage() {
  const { profile } = useErpSession();
  const title = profile?.role === 'client' ? 'Task' : 'My tasks';
  return (
    <div className="w-full space-y-4">
      <header className="rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-800 px-4 py-4 text-white shadow-xl shadow-teal-900/25 ring-1 ring-slate-900/20 sm:px-6 sm:py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Pipeline</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
      </header>
      <MyTasksBoard standalonePage />
    </div>
  );
}

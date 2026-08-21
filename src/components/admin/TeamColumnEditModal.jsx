'use client';

import { useEffect, useState } from 'react';
import ErpCreatableSelect from '../erp/ErpCreatableSelect';

/**
 * Edit team column: display name + assigned team lead.
 */
export default function TeamColumnEditModal({
  open,
  teamId,
  teamLabel,
  currentLeadId,
  teamLeadOptions = [],
  saving = false,
  onClose,
  onSave,
}) {
  const [label, setLabel] = useState('');
  const [leadId, setLeadId] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel(teamLabel || '');
    setLeadId(currentLeadId || '');
    setLocalError('');
  }, [open, teamLabel, currentLeadId]);

  if (!open || !teamId) return null;

  function handleSubmit(e) {
    e.preventDefault();
    const nameTrim = label.trim();
    if (!nameTrim) {
      setLocalError('Team name is required.');
      return;
    }
    setLocalError('');
    void onSave?.({ teamId, teamLabel: nameTrim, teamLeadId: leadId || '' });
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] dark:bg-black/60 sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => !saving && onClose?.()} />
      <form
        className="relative z-[701] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-teal-900/55 dark:bg-[#0e1824]"
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Edit team</h2>
        <p className="mt-1 font-mono text-[10px] text-slate-400">{teamId}</p>

        {localError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
            {localError}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team name</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] dark:border-teal-800/45 dark:bg-[#0a1018] dark:text-slate-100"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team lead</span>
            <div className="mt-1">
              <ErpCreatableSelect
                valueId={leadId}
                options={[{ id: '', label: 'No team lead' }, ...teamLeadOptions]}
                onChange={setLeadId}
                placeholder="Select team lead…"
                canCreate={false}
                compact
                menuMaxHeight={200}
                className="w-full"
              />
            </div>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onClose?.()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 disabled:opacity-50 dark:border-teal-800/45 dark:bg-[#131b24] dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg erp-brand-fill px-4 py-2 text-[12px] font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

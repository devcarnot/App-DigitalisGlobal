'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { useErpSession } from './useErpSession';
import {
  applyAttendancePolicyOverride,
  shiftPolicySubtitleFromPolicy,
} from '../../lib/erp-attendance-policy';
import {
  attendancePolicyFromForm,
  attendancePolicyToForm,
  normalizeAttendancePolicy,
} from '../../lib/erp-workspace-settings';

const inputClass =
  'mt-1 w-full rounded-xl border border-cyan-200/70 bg-white px-3 py-2 text-sm dark:border-teal-800/60 dark:bg-[#0c141a] dark:text-white';
const labelClass =
  'text-[11px] font-bold uppercase tracking-wide text-teal-800/70 dark:text-teal-300/70';

export default function ErpAdminOfficeHoursPanel() {
  const { erpCan, refreshWorkspaceSettings } = useErpSession();
  const canEdit = erpCan('settings', 'edit');

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(/** @type {string | null} */ (null));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(/** @type {string | null} */ (null));
  const [savedAt, setSavedAt] = useState(/** @type {number | null} */ (null));
  const [form, setForm] = useState(() =>
    attendancePolicyToForm(normalizeAttendancePolicy(null)),
  );

  const preview = useMemo(() => {
    const { policy } = attendancePolicyFromForm(form);
    return shiftPolicySubtitleFromPolicy(policy);
  }, [form]);

  const load = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/workspace-settings');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadErr(j.error || `HTTP ${res.status}`);
        return;
      }
      if (j.attendancePolicy) {
        setForm(attendancePolicyToForm(j.attendancePolicy));
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onSave = useCallback(async () => {
    if (!canEdit) return;
    setSaveErr(null);
    const { policy, error } = attendancePolicyFromForm(form);
    if (error) {
      setSaveErr(error);
      return;
    }
    setSaving(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/workspace-settings', {
        method: 'PATCH',
        body: JSON.stringify({ attendancePolicy: policy }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveErr(j.error || `HTTP ${res.status}`);
        return;
      }
      if (j.attendancePolicy) {
        setForm(attendancePolicyToForm(j.attendancePolicy));
        applyAttendancePolicyOverride(j.attendancePolicy);
      }
      await refreshWorkspaceSettings?.();
      setSavedAt(Date.now());
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [canEdit, form, refreshWorkspaceSettings]);

  return (
    <section className="rounded-2xl border border-cyan-200/50 bg-white/90 p-5 shadow-sm dark:border-teal-900/50 dark:bg-[#0a1520]/90 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-teal-950 dark:text-white">Office hours</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-teal-800/75 dark:text-teal-200/75">
            Defines when people are early, on time, or late, and how many net hours count as a full
            day. Times are in {form.timezoneLabel} (Asia/Karachi).
          </p>
        </div>
        <div className="rounded-xl border border-cyan-100/80 bg-cyan-50/60 px-3 py-2 text-[12px] text-teal-900/85 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-100/90">
          Preview: {preview}
        </div>
      </div>

      {loadErr ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{loadErr}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-teal-800/70 dark:text-teal-200/70">Loading settings…</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className={labelClass}>Shift name</span>
            <input
              value={form.shiftName}
              onChange={(e) => setField('shiftName', e.target.value)}
              disabled={!canEdit}
              className={inputClass}
              placeholder="Morning shift"
            />
          </label>

          <label className="block">
            <span className={labelClass}>Shift start</span>
            <input
              type="time"
              value={form.shiftStart}
              onChange={(e) => setField('shiftStart', e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Shift end</span>
            <input
              type="time"
              value={form.shiftEnd}
              onChange={(e) => setField('shiftEnd', e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Late after (grace)</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={120}
                value={form.arrivalGraceMinutes}
                onChange={(e) => setField('arrivalGraceMinutes', e.target.value)}
                disabled={!canEdit}
                className={`${inputClass} mt-0`}
              />
              <span className="text-[12px] text-teal-800/70 dark:text-teal-200/70">min after start</span>
            </div>
          </label>

          <label className="block">
            <span className={labelClass}>Full day hours</span>
            <input
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={form.fullDayHours}
              onChange={(e) => setField('fullDayHours', e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Half day hours</span>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={form.halfDayHours}
              onChange={(e) => setField('halfDayHours', e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Full day grace</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={120}
                value={form.fullDayGraceMinutes}
                onChange={(e) => setField('fullDayGraceMinutes', e.target.value)}
                disabled={!canEdit}
                className={`${inputClass} mt-0`}
              />
              <span className="text-[12px] text-teal-800/70 dark:text-teal-200/70">min under full day</span>
            </div>
          </label>
        </div>
      )}

      {saveErr ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{saveErr}</p> : null}
      {savedAt && !saveErr ? (
        <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">Settings saved.</p>
      ) : null}

      {canEdit ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void onSave()}
            className="inline-flex items-center justify-center rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save office hours'}
          </button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-teal-800/70 dark:text-teal-200/70">
          You can view these settings but not edit them.
        </p>
      )}
    </section>
  );
}

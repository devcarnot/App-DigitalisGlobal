'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useErpSession } from './useErpSession';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpAccessDeniedCard from './ErpAccessDeniedCard';
import ErpAdminOfficeHoursPanel from './ErpAdminOfficeHoursPanel';
import ErpAdminRolesPanel from './ErpAdminRolesPanel';

/** @typedef {'office' | 'roles'} AdminTabId */

const TAB_CLASS_ACTIVE =
  'rounded-xl px-3 py-1.5 text-sm font-semibold bg-[#103D4D] text-white shadow-md dark:bg-teal-700';
const TAB_CLASS_IDLE =
  'rounded-xl px-3 py-1.5 text-sm font-semibold bg-white/80 text-teal-900/80 hover:bg-cyan-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15';

export default function ErpAdministration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { erpCan } = useErpSession();

  const canViewOffice = erpCan('settings', 'view');
  const canViewRoles = erpCan('settings_roles', 'view');
  const canViewPage = canViewOffice || canViewRoles;

  const availableTabs = useMemo(() => {
    /** @type {{ id: AdminTabId, label: string }[]} */
    const tabs = [];
    if (canViewOffice) tabs.push({ id: 'office', label: 'Office hours' });
    if (canViewRoles) tabs.push({ id: 'roles', label: 'Users & Roles' });
    return tabs;
  }, [canViewOffice, canViewRoles]);

  const tabParam = searchParams.get('tab');
  const activeTab = useMemo(() => {
    if (tabParam === 'roles' && canViewRoles) return 'roles';
    if (tabParam === 'office' && canViewOffice) return 'office';
    return availableTabs[0]?.id || 'office';
  }, [tabParam, canViewOffice, canViewRoles, availableTabs]);

  const setActiveTab = useCallback(
    (/** @type {AdminTabId} */ tabId) => {
      router.replace(`/erp/admin/administration?tab=${tabId}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    if (tabParam === 'roles' && !canViewRoles && canViewOffice) {
      router.replace('/erp/admin/administration?tab=office', { scroll: false });
    } else if (tabParam === 'office' && !canViewOffice && canViewRoles) {
      router.replace('/erp/admin/administration?tab=roles', { scroll: false });
    }
  }, [tabParam, canViewOffice, canViewRoles, router]);

  if (!canViewPage) {
    return <ErpAccessDeniedCard message="You do not have access to Administration." />;
  }

  return (
    <div className="space-y-8">
      <ErpAdminPageHero
        eyebrow="Workspace"
        title="Administration"
        description="Office hours, attendance rules, and workspace access — users, roles, and permissions."
        accent="teal"
      />

      {availableTabs.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-b border-cyan-100/60 pb-3 dark:border-teal-900/50">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? TAB_CLASS_ACTIVE : TAB_CLASS_IDLE}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === 'office' && canViewOffice ? <ErpAdminOfficeHoursPanel /> : null}
      {activeTab === 'roles' && canViewRoles ? (
        <section className="rounded-2xl border border-violet-200/40 bg-white/90 p-5 shadow-sm dark:border-teal-900/50 dark:bg-[#0a1520]/90 sm:p-6">
          <div className="mb-6">
            <h2 className="text-base font-bold text-teal-950 dark:text-white">Users & Roles</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-teal-800/75 dark:text-teal-200/75">
              Set defaults by workspace role, then optionally fine-tune access for individual people.
            </p>
          </div>
          <ErpAdminRolesPanel />
        </section>
      ) : null}
    </div>
  );
}

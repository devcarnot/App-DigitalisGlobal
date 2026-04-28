'use client';

import React, { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Breadcrumbs from '../Breadcrumbs';
import { useErpBreadcrumb } from './ErpBreadcrumbContext';
import { useErpSession } from './useErpSession';

const WS = { href: '/erp/dashboard', label: 'Workspace' };

function itemsForPath(pathname, labels) {
  if (!pathname || pathname === '/erp') {
    return [WS, { label: 'Home' }];
  }

  if (pathname === '/erp/dashboard') {
    return [WS, { label: 'Home' }];
  }

  if (pathname === '/erp/projects') {
    return [WS, { label: 'Projects' }];
  }

  if (pathname === '/erp/my-tasks') {
    return [WS, { label: labels?.myTasks || 'My tasks' }];
  }

  if (pathname === '/erp/inbox') {
    return [WS, { label: 'Recent Activity' }];
  }

  if (pathname === '/erp/messages') {
    return [WS, { label: 'Messages' }];
  }

  if (pathname === '/erp/leave') {
    return [WS, { label: 'Leave' }];
  }

  if (pathname === '/erp/attendance') {
    return [WS, { label: 'Attendance' }];
  }

  const projectMatch = pathname.match(/^\/erp\/projects\/([^/]+)$/);
  if (projectMatch) {
    const title = labels.project || 'Project';
    return [WS, { href: '/erp/projects', label: 'Projects' }, { label: title }];
  }

  if (pathname === '/erp/account') {
    return [WS, { label: 'Account' }];
  }

  if (pathname.startsWith('/erp/admin/invites')) {
    return [WS, { label: 'Invites & users' }];
  }

  if (pathname === '/erp/admin/users') {
    return [WS, { label: 'Users' }];
  }

  if (pathname === '/erp/admin/members') {
    return [WS, { label: 'Members' }];
  }

  if (pathname === '/erp/admin/attendance') {
    return [WS, { label: 'Attendance' }];
  }

  if (pathname === '/erp/admin/clients') {
    return [WS, { label: 'Clients' }];
  }

  if (pathname === '/erp/admin/statistics') {
    return [WS, { label: 'Statistics' }];
  }

  if (pathname === '/erp/admin/finance') {
    return [WS, { label: 'Finance' }];
  }

  if (pathname === '/erp/admin/performance') {
    return [WS, { label: 'Performance' }];
  }

  const rest = pathname.replace(/^\/erp\/?/, '').replace(/\/$/, '');
  if (rest) {
    const label = rest
      .split('/')
      .map((s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(' · ');
    return [WS, { label: label || 'ERP' }];
  }

  return [WS, { label: 'Dashboard' }];
}

export default function ErpBreadcrumbs() {
  const pathname = usePathname() || '';
  const { labels, setBreadcrumbLabel } = useErpBreadcrumb();
  const { profile } = useErpSession();

  const mergedLabels = useMemo(() => {
    const myTasks = profile?.role === 'client' ? 'Task' : 'My tasks';
    return { ...(labels || {}), myTasks };
  }, [labels, profile?.role]);

  useEffect(() => {
    if (!/^\/erp\/projects\/[^/]+$/.test(pathname)) {
      setBreadcrumbLabel('project', null);
    }
  }, [pathname, setBreadcrumbLabel]);

  const items = useMemo(() => itemsForPath(pathname, mergedLabels), [pathname, mergedLabels]);

  return (
    <div className="mb-3 sm:mb-4 rounded-2xl border border-cyan-200/40 bg-white/60 backdrop-blur-sm px-3 py-2.5 shadow-sm shadow-cyan-900/5 dark:border-teal-800/45 dark:bg-gradient-to-r dark:from-slate-900/92 dark:to-teal-950/35 dark:shadow-black/25">
      <Breadcrumbs
        items={items}
        linkClassName="font-semibold text-teal-800/90 hover:text-[#103D4D] transition-colors dark:text-teal-300 dark:hover:text-teal-200"
        currentClassName="font-bold text-[#103D4D] dark:text-teal-200"
        chevronClassName="!text-cyan-400/90 dark:!text-teal-700/90"
      />
    </div>
  );
}

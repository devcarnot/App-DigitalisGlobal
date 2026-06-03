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

  if (pathname === '/erp/admin/trash') {
    return [WS, { label: 'Trash' }];
  }

  if (pathname === '/erp/admin/roles') {
    return [WS, { label: 'Users & Roles' }];
  }

  if (pathname === '/erp/notes') {
    return [WS, { label: 'Notes' }];
  }

  if (pathname === '/erp/files') {
    return [WS, { label: 'Files' }];
  }

  if (pathname === '/erp/meetings') {
    return [WS, { label: 'Meetings' }];
  }

  if (pathname === '/erp/announcements') {
    return [WS, { label: 'Announcements' }];
  }

  if (pathname === '/erp/remote') {
    return [WS, { label: 'Remote' }];
  }

  if (pathname === '/erp/search') {
    return [WS, { label: 'Search' }];
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
    <div className="mb-1 max-lg:mb-0.5 sm:mb-4 rounded-lg border border-cyan-200/40 bg-white/60 px-2 py-1 shadow-sm shadow-cyan-900/5 max-lg:rounded-md max-lg:px-2 max-lg:py-0.5 dark:border-teal-800/35 dark:bg-[#0c121a] dark:[background-image:none] dark:shadow-black/20 sm:px-3 sm:py-2.5 sm:rounded-2xl">
      <Breadcrumbs
        items={items}
        linkClassName="font-semibold text-teal-800/90 hover:text-[#103D4D] transition-colors dark:text-slate-400 dark:hover:text-slate-200"
        currentClassName="font-bold text-[#103D4D] dark:font-semibold dark:text-slate-100"
        chevronClassName="!text-cyan-400/90 dark:!text-slate-600"
      />
    </div>
  );
}

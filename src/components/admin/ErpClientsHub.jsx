'use client';

import React, { useState } from 'react';
import { useErpSession } from '../erp/useErpSession';
import ErpClientRoster from './ErpClientRoster';
import ErpClientLeadPipeline from './ErpClientLeadPipeline';
import ErpAddClientModal from './ErpAddClientModal';

/**
 * Clients & CRM shell: roster of joined clients vs Kanban pipeline for prospects/leads.
 */
export default function ErpClientsHub() {
  const { erpCan } = useErpSession();
  const canAddClient = erpCan('clients', 'create');

  const [tab, setTab] = useState('list');
  const [addClientOpen, setAddClientOpen] = useState(false);
  /** Which sub-tab opens first in ErpAddClientModal (invite vs pipeline lead). */
  const [addModalDefaultTab, setAddModalDefaultTab] = useState('invite');
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  const bumpAfterAdd = () => {
    setListRefreshKey((k) => k + 1);
    setPipelineRefreshKey((k) => k + 1);
  };

  const tabBtn = (active) =>
    `inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold transition sm:px-4 ${
      active
        ? 'border-[#6366f1] text-[#4338ca] dark:border-violet-400 dark:text-violet-200'
        : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200/90 pb-0 dark:border-teal-900/55 sm:flex-row sm:items-stretch sm:justify-between">
        <div role="tablist" aria-label="Clients views" className="flex gap-2">
          <button type="button" role="tab" aria-selected={tab === 'list'} className={tabBtn(tab === 'list')} onClick={() => setTab('list')}>
            Client list
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pipeline'}
            className={tabBtn(tab === 'pipeline')}
            onClick={() => setTab('pipeline')}
          >
            Lead pipeline
          </button>
        </div>
        {canAddClient ? (
          <div className="flex shrink-0 items-center pb-3 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                setAddModalDefaultTab(tab === 'pipeline' ? 'lead' : 'invite');
                setAddClientOpen(true);
              }}
              className="inline-flex w-full items-center justify-center rounded-2xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg sm:w-auto"
            >
              + Add Client
            </button>
          </div>
        ) : null}
      </div>

      <ErpAddClientModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onSuccess={bumpAfterAdd}
        defaultTab={addModalDefaultTab}
      />

      {tab === 'list' ? <ErpClientRoster showAddButton={false} refreshKey={listRefreshKey} /> : null}
      {tab === 'pipeline' ? <ErpClientLeadPipeline refreshKey={pipelineRefreshKey} /> : null}
    </div>
  );
}

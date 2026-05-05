/** CRM lead pipeline Kanban stages (persisted as `erp_crm_leads.pipeline_stage`). */

export const CRM_PIPELINE_STAGES = [
  {
    id: 'new_lead',
    label: 'New Leads',
    bar: 'border-t-sky-500 bg-gradient-to-b from-sky-500/25 to-transparent',
  },
  {
    id: 'contacted',
    label: 'Contacted',
    bar: 'border-t-violet-500 bg-gradient-to-b from-violet-500/25 to-transparent',
  },
  {
    id: 'proposal_sent',
    label: 'Proposal Sent',
    bar: 'border-t-amber-500 bg-gradient-to-b from-amber-500/25 to-transparent',
  },
  {
    id: 'negotiating',
    label: 'Negotiating',
    bar: 'border-t-orange-600 bg-gradient-to-b from-orange-500/28 to-transparent',
  },
  {
    id: 'won',
    label: 'Won',
    bar: 'border-t-emerald-500 bg-gradient-to-b from-emerald-500/25 to-transparent',
  },
  {
    id: 'lost',
    label: 'Lost',
    bar: 'border-t-rose-600 bg-gradient-to-b from-rose-500/25 to-transparent',
  },
];

export const CRM_PIPELINE_STAGE_IDS = CRM_PIPELINE_STAGES.map((s) => s.id);
export const CRM_PIPELINE_STAGE_SET = new Set(CRM_PIPELINE_STAGE_IDS);

const PLATFORM_TAILWIND = {
  direct: 'bg-slate-400',
  upwork: 'bg-[#14a800]',
  airtasker: 'bg-orange-400',
  fiverr: 'bg-[#1dbf73]',
  referral: 'bg-violet-500',
};

/**
 * @param {string | null | undefined} platformId
 * @returns {string} tailwind bg class for a small dot on lead cards
 */
export function crmLeadPlatformDotClass(platformId) {
  const key = String(platformId || '').toLowerCase();
  return PLATFORM_TAILWIND[key] || 'bg-teal-500';
}

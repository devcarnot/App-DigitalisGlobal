export const ERP_PROJECT_TYPES = [
  { id: 'shopify', label: 'Shopify' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'squarespace', label: 'Squarespace' },
  { id: 'wix', label: 'Wix' },
  { id: 'custom', label: 'Custom' },
  { id: 'digital_marketing', label: 'Digital marketing' },
  { id: 'logo_designing', label: 'Logo designing' },
  { id: 'brochure_designing', label: 'Brochure designing' },
  { id: 'branding', label: 'Branding' },
  { id: 'packaging_designing', label: 'Packaging designing' },
  { id: 'social_media_designing', label: 'Social media designing' },
  { id: 'menu_design', label: 'Menu design' },
  { id: 'stationary', label: 'Stationary' },
  { id: 'business_development', label: 'Business development' },
  { id: 'seo', label: 'SEO' },
];

export const ERP_PROJECT_TYPE_IDS = ERP_PROJECT_TYPES.map((t) => t.id);

export function normalizeErpProjectType(raw) {
  const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  return ERP_PROJECT_TYPE_IDS.includes(v) ? v : 'custom';
}

/** @param {{ project_type?: string, project_type_ids?: string[] } | null | undefined} row */
export function projectTypeIdsFromProject(row) {
  if (!row) return ['custom'];
  const raw = row.project_type_ids;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }
  const legacy = row.project_type ? String(row.project_type).trim() : '';
  return legacy ? [legacy] : ['custom'];
}

/**
 * Human-readable labels for a project's type(s).
 * @param {{ project_type?: string, project_type_ids?: string[] } | null | undefined} row
 * @param {{ id: string, label: string }[]} [catalog]
 */
export function projectTypeLabelsFromProject(row, catalog = ERP_PROJECT_TYPES) {
  const byId = new Map(catalog.map((t) => [t.id, t.label]));
  const ids = projectTypeIdsFromProject(row);
  const labels = [];
  for (const id of ids) {
    if (id === 'custom') continue;
    const label = byId.get(id) || id.replace(/_/g, ' ');
    if (label) labels.push(label);
  }
  if (labels.length === 0) {
    labels.push(byId.get('custom') || 'Custom');
  }
  return labels;
}


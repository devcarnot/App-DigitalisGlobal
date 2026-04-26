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


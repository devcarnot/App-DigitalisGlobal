/**
 * Department list for the careers posting form in the admin dashboard.
 *
 * Editable string list: kept in sync with what the public marketing site's
 * `/careers` filters expect. Add a new department here when HR opens hiring
 * for a team that doesn't appear yet; remove when a team no longer hires.
 *
 * Imported as: `import { DEPARTMENTS } from '@/data/careersDepartments'`.
 */
export const DEPARTMENTS = [
  'Engineering',
  'Design',
  'Product',
  'Marketing',
  'Sales',
  'Customer Success',
  'Operations',
  'Finance',
  'People & HR',
  'Data & Analytics',
  'IT & Security',
  'Content',
  'Other',
];

export default DEPARTMENTS;

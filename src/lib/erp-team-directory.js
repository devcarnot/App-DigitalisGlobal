/**
 * Default roster merged with `erp_team_directory_emails` for admin / invites UIs.
 */

/** @type {{ email: string, fullName: string, role: 'team_lead'|'team_member' }[]} */
export const DEFAULT_TEAM_ROSTER = [
  { email: 'saadicarnot.pk@gmail.com', fullName: 'Saad', role: 'team_lead' },
  { email: 'ameer.hamza928942@gmail.com', fullName: 'Ameer Hamza', role: 'team_lead' },
  { email: 'imeanhamza@gmail.com', fullName: 'Hamza', role: 'team_lead' },
  { email: 'dev.zohaibkazmi@gmail.com', fullName: 'Zohaib', role: 'team_lead' },
  { email: 'yasir2626@gmail.com', fullName: 'Yasir', role: 'team_lead' },
  { email: 'alimirza0006@gmail.com', fullName: 'Ali Shibli', role: 'team_member' },
  { email: 'ansariiii9966@gmail.com', fullName: 'Siraj', role: 'team_member' },
  { email: 'farrukhzaman469@gmail.com', fullName: 'Farrukh', role: 'team_member' },
  { email: 'syedmubasher433@gmail.com', fullName: 'Mubasher', role: 'team_member' },
  { email: 'faizanraza113@gmail.com', fullName: 'Faizan', role: 'team_member' },
  { email: 'ahmad.jamal.dev@gmail.com', fullName: 'Ahmed Jamal', role: 'team_member' },
  { email: 'abdulrafih140@gmail.com', fullName: 'Abdul Rafeh', role: 'team_member' },
  { email: 'abdulmoeezkhan387@gmail.com', fullName: 'Moeez', role: 'team_member' },
  { email: 'abdullahhabib6789@gmail.com', fullName: 'Abdullah', role: 'team_member' },
  { email: 'mansoorabbbasi12@gmail.com', fullName: 'Mansoor', role: 'team_member' },
];

export function parseEmailLines(text) {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {Array<{ email: string, full_name?: string|null, directory_role?: string|null }>} teamDirectoryRows
 * @returns {{ email: string, fullName: string, role: 'team_lead'|'team_member' }[]}
 */
export function mergeTeamDirectoryWithDefaults(teamDirectoryRows) {
  const defaultMap = new Map(DEFAULT_TEAM_ROSTER.map((x) => [x.email.toLowerCase(), x]));
  const fromDb = new Map((teamDirectoryRows || []).map((r) => [String(r.email).toLowerCase(), r]));
  const emails = new Set([...defaultMap.keys(), ...fromDb.keys()]);
  const rows = [...emails].map((em) => {
    const db = fromDb.get(em);
    const def = defaultMap.get(em);
    const role = db
      ? db.directory_role === 'team_lead'
        ? 'team_lead'
        : 'team_member'
      : def?.role === 'team_lead'
        ? 'team_lead'
        : 'team_member';
    const fullName = (db?.full_name && String(db.full_name).trim()) || def?.fullName || '';
    return { email: em, fullName, role };
  });
  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'team_lead' ? -1 : 1;
    return (a.fullName || a.email).localeCompare(b.fullName || b.email, undefined, { sensitivity: 'base' });
  });
  return rows;
}

/** Checkbox picks from directory: team leads → managers, members → team. */
export function buildBulkInvitePayloads(presetSelected, mergedDirectoryEntries) {
  const dirTeam = [];
  const dirManagers = [];
  for (const e of mergedDirectoryEntries) {
    if (!presetSelected[e.email]) continue;
    if (e.role === 'team_lead') dirManagers.push(e.email);
    else dirTeam.push(e.email);
  }
  const teamPayload = [...new Set(dirTeam)].join('\n');
  const managerPayload = [...new Set(dirManagers)].join('\n');
  return { teamPayload, managerPayload };
}

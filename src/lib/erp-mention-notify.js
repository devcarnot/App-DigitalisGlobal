/**
 * Parse @displayName mentions from project chat body (matches composer: `@${full_name} `).
 * Longest names first to reduce ambiguity when one name is a prefix of another.
 *
 * @param {string} body
 * @param {Array<{ user_id: string }>} members
 * @param {Record<string, string>} nameByUserId: trimmed display names from erp_profiles
 * @returns {string[]} distinct mentioned user ids (excluding sender handled by caller)
 */
export function parseMentionedUserIdsFromBody(body, members, nameByUserId) {
  const text = typeof body === 'string' ? body : '';
  if (!text || !members?.length) return [];

  const sorted = [...members].sort((a, b) => {
    const la = (nameByUserId[a.user_id] || '').trim().length;
    const lb = (nameByUserId[b.user_id] || '').trim().length;
    return lb - la;
  });

  const mentioned = new Set();
  for (const m of sorted) {
    const uid = m.user_id;
    const raw = (nameByUserId[uid] || '').trim();
    if (!raw) continue;
    const needle = `@${raw}`;
    let idx = 0;
    while (idx < text.length) {
      const i = text.indexOf(needle, idx);
      if (i === -1) break;
      const after = text[i + needle.length];
      if (after === undefined || /\s/.test(after) || /[.,!?;:]/.test(after)) {
        mentioned.add(uid);
        break;
      }
      idx = i + 1;
    }
  }
  return [...mentioned];
}

/**
 * Roman Urdu / Hinglish voice lexicon. STT fixes + action/feature synonyms for this ERP.
 */

/** @typedef {'create' | 'delete' | 'edit' | 'open' | 'search' | 'send' | 'approve' | 'reject' | 'restore' | 'invite' | 'assign' | 'complete' | 'cancel' | 'apply'} VoiceActionKind */

/** Ordered STT normalizations (longer phrases first). */
const STT_REPLACEMENTS = [
  [/\bbana\s+de\b/g, 'bana do'],
  [/\bbana\s+d\b/g, 'bana do'],
  [/\bbna\s+de\b/g, 'bna do'],
  [/\bbna\s+d\b/g, 'bna do'],
  [/\bproject\s+bnao\b/g, 'project banao'],
  [/\bproject\s+bna\b/g, 'project banao'],
  [/\bcreate\s+kiya\b/g, 'create karo'],
  [/\bproject\s+kiya\b/g, 'project banao'],
  [/\bbana\s+kiya\b/g, 'bana do'],
  [/\bkr\s*do\b/g, 'kar do'],
  [/\bkrdo\b/g, 'kar do'],
  [/\bkardo\b/g, 'kar do'],
  [/\bkrdlo\b/g, 'kar do'],
  [/\bkr\s*dena\b/g, 'kar do'],
  [/\bkr\s*de\b/g, 'kar do'],
  [/\bkr\s*lo\b/g, 'kar lo'],
  [/\bkrlo\b/g, 'kar lo'],
  [/\bkr\s*na\b/g, 'karna'],
  [/\bkrna\b/g, 'karna'],
  [/\bkr\s*ni\b/g, 'karni'],
  [/\bkarni\b/g, 'karni'],
  [/\bchahye\b/g, 'chahiye'],
  [/\bchaye\b/g, 'chahiye'],
  [/\belan\b/g, 'announcement'],
  [/\belaan\b/g, 'announcement'],
  [/\bihlaan\b/g, 'announcement'],
  [/\bilaan\b/g, 'announcement'],
  [/\bpaigham\b/g, 'message'],
  [/\bpaigam\b/g, 'message'],
  [/\bpaighaam\b/g, 'message'],
  [/\bsms\b/g, 'message'],
  [/\bwhatsapp\b/g, 'message'],
  [/\bmulakaat\b/g, 'meeting'],
  [/\bmeeting\s+rakh\b/g, 'meeting schedule'],
  [/\bmeeting\s+fix\b/g, 'meeting schedule'],
  [/\bghar\s+se\s+kaam\b/g, 'remote work'],
  [/\bghar\s+se\b/g, 'remote'],
  [/\bdhundho\b/g, 'search'],
  [/\bdhoondho\b/g, 'search'],
  [/\bdhoondh\b/g, 'search'],
  [/\btalash\b/g, 'search'],
  [/\btalaash\b/g, 'search'],
  [/\bkholo\b/g, 'open'],
  [/\bkhol\b/g, 'open'],
  [/\bkhula\b/g, 'open'],
  [/\bdikhao\b/g, 'open'],
  [/\bdikha do\b/g, 'open'],
  [/\ble jao\b/g, 'open'],
  [/\ble chalo\b/g, 'open'],
  [/\bpar jao\b/g, 'open'],
  [/\bpe jao\b/g, 'open'],
  [/\bhatao\b/g, 'delete'],
  [/\bhata\s+do\b/g, 'delete'],
  [/\bmitao\b/g, 'delete'],
  [/\bmita\s+do\b/g, 'delete'],
  [/\buda\s+do\b/g, 'delete'],
  [/\bkhatam\s+karo\b/g, 'delete'],
  [/\bmanzoor\b/g, 'approve'],
  [/\bmanzoori\b/g, 'approve'],
  [/\bmana\s+kar\s+do\b/g, 'reject'],
  [/\bmana\s+karo\b/g, 'reject'],
  [/\bna\s+manzoor\b/g, 'reject'],
  [/\bhan\b/g, 'haan'],
  [/\bhn\b/g, 'haan'],
  [/\bjee\s+haan\b/g, 'haan'],
  [/\bjee\b/g, 'haan'],
  [/\bsahi\s+hai\b/g, 'theek hai'],
  [/\bbilkul\s+sahi\b/g, 'bilkul'],
  [/\bsab\s+ko\b/g, 'sabko'],
  [/\btamam\s+ko\b/g, 'sabko'],
  [/\bpuri\s+team\b/g, 'sabko'],
  [/\bsari\s+team\b/g, 'sabko'],
  [/\bhazri\b/g, 'attendance'],
  [/\bhazri\s+laga\b/g, 'check in'],
  [/\bcheckin\b/g, 'check in'],
  [/\bcheck-in\b/g, 'check in'],
  [/\bcheckout\b/g, 'check out'],
  [/\bcheck-out\b/g, 'check out'],
  [/\bbreak\s+shuru\b/g, 'break start'],
  [/\bbreak\s+khatam\b/g, 'break end'],
  [/\bbreak\s+start\b/g, 'break start'],
  [/\bbreak\s+end\b/g, 'break end'],
  [/\blunch\s+break\b/g, 'break start'],
  [/\btea\s+break\b/g, 'break start'],
  [/\bho\s+gaya\b/g, 'done'],
  [/\bcomplete\s+ho\s+gaya\b/g, 'complete'],
  [/\bmukammal\b/g, 'complete'],
  [/\bmukamal\b/g, 'complete'],
  [/\btayar\b/g, 'complete'],
  [/\bteam\s+manager\b/g, 'team lead'],
  [/\bteam\s+manger\b/g, 'team lead'],
  [/\bsuperadmin\b/g, 'super admin'],
  [/\bsuper\s+administrator\b/g, 'super admin'],
  [/\bgraphic\s+designer\b/g, 'graphic designer'],
  [/\bgraphic\s+design\b/g, 'graphic designer'],
  [/\bmarketing\s+team\b/g, 'marketing'],
  [/\bmohammed\b/g, 'muhammad'],
  [/\bmohammad\b/g, 'muhammad'],
  [/\bmohd\b/g, 'muhammad'],
  [/\bmuhammed\b/g, 'muhammad'],
  [/\bamir\b/g, 'ameer'],
  [/\badministrator\b/g, 'admin'],
  [/\bmasla\b/g, 'issue'],
  [/\bmasle\b/g, 'issues'],
  [/\bmasail\b/g, 'issues'],
  [/\bmasla\s+hal\b/g, 'issue resolve'],
  [/\bmasla\s+hal\s+karo\b/g, 'issue resolve'],
  [/\bmasla\s+hal\s+kar\s+do\b/g, 'issue resolve'],
];

/** Filler words stripped before matching (not meaning). */
const FILLER_WORDS = /\b(mujhe|mujhay|meray|mera|mere|zara|please|plz|sun|suno|bolo|kaho|matlab|means|like|bas|sirf|thoda|thori|ek|aik|one|toh|to|hi|bhi|na|ni|nahi|nhi|yar|yaar|bhai|jan|ji|ok|okay|theek|thik|shukriya|thanks|thank you)\b/g;

/** @type {Record<VoiceActionKind, RegExp>} */
export const ROMAN_ACTION_PATTERNS = {
  create: /\b(create|add|banao|bnao|bana|banaye|banana|new|naya|nayi|daalo|dalo|daal|dal|likho|likh|post|publish|schedule|fix|rakh|book|jama|shamil|jodo|bana do|bna do|bana de|bna de)\b/,
  delete: /\b(delete|remove|hatao|hata do|mitao|mita do|khatam|drop|del|uda do|nikalo|kato|mita)\b/,
  edit: /\b(edit|update|change|badlo|modify|theek karo|sahi karo|update karo)\b/,
  open: /\b(open|go to|goto|show|display|kholo|khol|dikhao|dikha do|le jao|le chalo|chalo|jao|par jao|pe jao|page|wala page|wale page)\b/,
  search: /\b(search|find|lookup|dhundo|dhoondho|dhoondh|talash|talaash|khojo|khoj)\b/,
  send: /\b(send|bhejo|bhej do|bhejna|message|dm|notify|punch|forward)\b/,
  approve: /\b(approve|manzoor|accept|ok kar do|theek hai kar do|pass karo)\b/,
  reject: /\b(reject|decline|mana|refuse|na kar do|na manzoor|decline karo)\b/,
  restore: /\b(restore|recover|wapas|undo|wapis|phir se lao)\b/,
  invite: /\b(invite|invitation|bulao|daakhla|bulawa|new user)\b/,
  assign: /\b(assign|allocate|de do|lagao|rakho|jodo|shamil)\b/,
  complete: /\b(complete|done|finish|mukammal|mukamal|tayar|ho gaya|khatam karo|mark done|close task)\b/,
  cancel: /\b(cancel|band karo|ruko|abort|withdraw|wapis le lo|cancel karo|cancel kar do)\b/,
  apply: /\b(apply|request|chahiye|chahye|laga do|le lo|apply karo|apply kar do|darj karo)\b/,
};

/** Nav aliases keyed by ERP module slug. */
export const ROMAN_NAV_ALIASES = {
  dashboard: ['home', 'dashboard', 'ghar', 'main', 'home page', 'asli page', 'mera dashboard'],
  projects: ['projects', 'project', 'project list', 'sare project', 'tamam project', 'project wala'],
  tasks: ['tasks', 'task', 'my tasks', 'my task', 'kaam', 'mere kaam', 'meray kaam', 'task list'],
  notes: ['notes', 'note', 'notepad', 'yaad dash', 'yad dash', 'cheet', 'cheetain', 'notepad wala'],
  files: ['files', 'file', 'documents', 'document', 'docs', 'fails', 'file wala', 'documents wala'],
  messages: ['messages', 'message', 'chat', 'dm', 'inbox chat', 'paigham', 'paigam', 'chat wala', 'message wala'],
  meetings: ['meetings', 'meeting', 'calendar meetings', 'mulakaat', 'meeting wala', 'calendar'],
  announcements: ['announcements', 'announcement', 'updates', 'news', 'elan', 'elaan', 'ilaan', 'khabar', 'update wala'],
  clients: ['clients', 'client', 'crm', 'customer', 'gahak', 'client wala', 'customers'],
  members: ['members', 'member', 'team members', 'team member', 'banday', 'bande', 'log', 'staff', 'team wala'],
  attendance: ['attendance', 'attendance page', 'hazri', 'hazri page', 'time in', 'time out'],
  attendance_admin: ['attendance admin', 'admin attendance', 'hazri admin', 'attendance control'],
  leave: ['leave', 'chutti', 'holiday leave', 'chutti page', 'chutti wala', 'time off'],
  remote: ['remote', 'remote work', 'wfh', 'ghar se kaam', 'ghar se', 'work from home', 'remote wala'],
  performance: ['performance', 'performance page', 'performance wala', 'kaarkardagi'],
  statistics: ['statistics', 'stats', 'statistics wala', 'report stats', 'andaaz'],
  finance: ['finance', 'money', 'finance wala', 'paisa', 'accounts', 'accounting'],
  inbox: ['inbox', 'activity', 'notifications', 'recent activity', 'activity wala', 'updates inbox'],
  trash: ['trash', 'deleted', 'kachra', 'recycle', 'trash wala', 'delete wala'],
  settings_roles: ['roles', 'users and roles', 'permissions', 'user roles', 'access', 'role wala', 'permission wala', 'users roles'],
  invites: ['invites', 'invite users', 'invite user', 'new user', 'dawat', 'invite wala', 'bulawa'],
  users: ['users', 'user list', 'user wala', 'sare user'],
  account: ['account', 'profile', 'settings', 'mera account', 'meri profile', 'account wala'],
  search_page: ['search page', 'global search', 'talash page', 'search wala'],
};

/**
 * Apply Roman Urdu STT normalization.
 * @param {string} t: already lowercased + basic normalize
 */
export function applyRomanUrduNormalization(t) {
  let out = String(t || '');
  for (const [re, rep] of STT_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  out = out.replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * @param {string} t
 * @param {VoiceActionKind} kind
 */
export function hasRomanAction(t, kind) {
  return ROMAN_ACTION_PATTERNS[kind]?.test(t) ?? false;
}

/**
 * @param {string} moduleKey
 * @param {string} t
 */
export function matchesRomanNav(moduleKey, t) {
  const aliases = ROMAN_NAV_ALIASES[moduleKey] || [];
  return aliases.some((a) => {
    const al = a.toLowerCase();
    return t === al || t.includes(` ${al} `) || t.startsWith(`${al} `) || t.endsWith(` ${al}`);
  });
}

/** Roman Urdu confirm phrases. */
export const ROMAN_CONFIRM = /^(yes|haan|han|ha|y|confirm|ok|okay|theek|thik|kar do|kardo|krdo|done|go ahead|proceed|bilkul|theek hai|thik hai|jee|jee haan|sahi hai|bilkul sahi|theek hai kar do)(\s|$|\.|!)?$/;

/** Roman Urdu cancel phrases. */
export const ROMAN_CANCEL = /^(no|nahi|nah|nhi|cancel|stop|mat|ruko|abort|band karo|nahi chahiye|mat karo|rehne do)(\s|$|\.|!)?$/;

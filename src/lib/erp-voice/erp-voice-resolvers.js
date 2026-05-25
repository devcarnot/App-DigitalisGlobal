/**
 * Resolve people / projects / tasks for voice commands — with disambiguation.
 */

import {
  enrichPersonCandidate,
  formatPersonChoiceMessage,
} from './erp-voice-disambiguation';

/**
 * @param {typeof fetch} fetchFn
 * @param {string} query
 */
export async function searchPeople(fetchFn, query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const res = await fetchFn(`/api/erp/me/search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return data.people || [];
}

/**
 * @param {typeof fetch} fetchFn
 * @param {string} name
 */
export async function resolvePersonByName(fetchFn, name) {
  const q = String(name || '').trim();
  if (q.length < 2) return { kind: 'not_found', query: q };

  const people = await searchPeople(fetchFn, q);
  if (people.length === 0) return { kind: 'not_found', query: q };

  const qLower = q.toLowerCase();
  const exactMatches = people.filter((p) => p.full_name?.toLowerCase() === qLower);
  if (exactMatches.length === 1) {
    return { kind: 'resolved', person: exactMatches[0] };
  }

  const qWords = qLower.split(/\s+/).filter(Boolean);
  const wordMatches = people.filter((p) => {
    const fn = (p.full_name || '').toLowerCase();
    return qWords.every((w) => fn.includes(w));
  });
  if (wordMatches.length === 1) {
    return { kind: 'resolved', person: wordMatches[0] };
  }

  const pool = wordMatches.length > 1 ? wordMatches : people;
  if (pool.length === 1) {
    return { kind: 'resolved', person: pool[0] };
  }

  const candidates = pool.slice(0, 6).map(enrichPersonCandidate);
  return {
    kind: 'ambiguous',
    query: q,
    candidates,
    messageEn: formatPersonChoiceMessage(q, candidates),
  };
}

/**
 * @param {typeof fetch} fetchFn
 * @param {string[]} names
 */
export async function resolvePeopleByNames(fetchFn, names) {
  const ids = [];
  const notFound = [];
  const resolved = [];
  const seen = new Set();

  for (const rawName of names) {
    const name = String(rawName || '').trim();
    if (!name) continue;
    const result = await resolvePersonByName(fetchFn, name);
    if (result.kind === 'not_found') {
      notFound.push(name);
      continue;
    }
    if (result.kind === 'ambiguous') {
      return {
        ids: [],
        notFound: [],
        resolved: [],
        ambiguous: result,
      };
    }
    const person = result.person;
    if (!person?.id) {
      notFound.push(name);
      continue;
    }
    if (!seen.has(person.id)) {
      seen.add(person.id);
      ids.push(person.id);
      resolved.push({ id: person.id, name: person.full_name || name, person });
    }
  }

  return { ids, notFound, resolved, ambiguous: null };
}

/**
 * Attach resolved person or return a voice result asking the user to pick.
 * @param {object} intent
 * @param {typeof fetch} fetchFn
 * @param {'personName' | 'memberNames'} field
 */
export async function attachResolvedPerson(intent, fetchFn, field = 'personName') {
  if (intent.personId) return { intent, blocked: null };

  const name = field === 'personName' ? intent.personName : intent.memberNames?.[0];
  if (!name) return { intent, blocked: { ok: false, messageEn: 'Which person?' } };

  const result = await resolvePersonByName(fetchFn, name);
  if (result.kind === 'not_found') {
    return { intent, blocked: { ok: false, messageEn: `Could not find "${name}".` } };
  }
  if (result.kind === 'ambiguous') {
    return {
      intent: {
        ...intent,
        awaitingPersonPick: true,
        personCandidates: result.candidates,
        personQuery: result.query,
      },
      blocked: {
        ok: true,
        needsChoice: true,
        messageEn: result.messageEn,
      },
    };
  }

  return {
    intent: {
      ...intent,
      personId: result.person.id,
      personName: result.person.full_name || name,
      resolvedPerson: result.person,
    },
    blocked: null,
  };
}

export async function findProjectByName(fetchFn, name) {
  const q = String(name || '').trim();
  if (q.length < 2) return null;
  const res = await fetchFn(`/api/erp/me/search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const projects = data.projects || [];
  if (projects.length === 0) return null;
  const exact = projects.find((p) => p.name?.toLowerCase() === q.toLowerCase());
  return exact || projects[0];
}

export async function findTaskByTitle(supabase, title, projectId) {
  const q = String(title || '').trim();
  if (q.length < 2) return null;

  let query = supabase.from('erp_tasks').select('id, title, project_id, assignee_ids').ilike('title', `%${q}%`);
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(8);
  if (error || !data?.length) return null;

  const exact = data.find((t) => t.title?.toLowerCase() === q.toLowerCase());
  return exact || data[0];
}

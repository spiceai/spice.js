/**
 * Helpers for reconciling the /v1/search wire format with the public search types.
 */

import type { SearchMatch, SearchResponse } from './interfaces';

function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  return Array.isArray(value) ? 'array' : typeof value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return describeType(value) === 'object';
}

/**
 * Maps a single match from the runtime's wire format to {@link SearchMatch}, or
 * returns why it is not one.
 *
 * The runtime always serializes `dataset` and the similarity score, which it
 * names `_score` (older runtimes sent `score`, accepted here too). A match
 * missing either is malformed: defaulting them would hand the caller a result
 * with no dataset or no score that looks legitimate. `data`, `primary_key` and
 * `metadata` are omitted entirely when empty, so they are filled in as `{}`.
 */
function normalizeSearchMatch(match: unknown): SearchMatch | string {
  if (!isObject(match)) {
    return `is ${describeType(match)}`;
  }
  if (typeof match.dataset !== 'string') {
    return "has no string 'dataset'";
  }
  const score = match._score ?? match.score;
  if (typeof score !== 'number') {
    return "has no number '_score'";
  }
  const maps = {} as Pick<
    SearchMatch,
    'matches' | 'primary_key' | 'data' | 'metadata'
  >;
  for (const field of ['matches', 'primary_key', 'data', 'metadata'] as const) {
    const value = match[field] ?? {};
    if (!isObject(value)) {
      return `has a non-object '${field}'`;
    }
    maps[field] = value;
  }
  return { dataset: match.dataset, score, ...maps };
}

/**
 * Maps a `/v1/search` response from the runtime's wire format to
 * {@link SearchResponse}.
 *
 * The runtime always serializes `results` and `duration_ms`, so a 200 without
 * them (an error envelope from a proxy, an empty object) is rejected with an
 * error naming the response, rather than read as an empty answer or failing
 * with a TypeError in the caller.
 *
 * @throws Error when the payload is not a search response.
 */
export function normalizeSearchResponse(payload: unknown): SearchResponse {
  const malformed = (problem: string) =>
    new Error(
      `Search request failed: malformed /v1/search response: ${problem}`,
    );

  if (!isObject(payload)) {
    throw malformed(
      `expected a JSON object, received ${describeType(payload)}`,
    );
  }
  if (!Array.isArray(payload.results)) {
    throw malformed("no array 'results'");
  }
  if (typeof payload.duration_ms !== 'number') {
    throw malformed("no number 'duration_ms'");
  }

  const results = payload.results.map((entry: unknown, index: number) => {
    const match = normalizeSearchMatch(entry);
    if (typeof match === 'string') {
      throw malformed(`result ${index} ${match}`);
    }
    return match;
  });
  return { duration_ms: payload.duration_ms, results };
}

/**
 * Helpers for reconciling the /v1/search wire format with the public search types.
 */
import type { SearchMatch, SearchResponse, WireSearchMatch, WireSearchResponse } from './interfaces';
/**
 * Maps a single match from the runtime's wire format to {@link SearchMatch}.
 *
 * The runtime serializes the similarity score as `_score`, and omits `data`,
 * `primary_key` and `metadata` entirely when they are empty. Consumers of
 * `SearchMatch` expect `score` and expect the four objects to always be present,
 * so both are reconciled here.
 */
export declare function normalizeSearchMatch(match: WireSearchMatch): SearchMatch;
/**
 * Maps a `/v1/search` response from the runtime's wire format to
 * {@link SearchResponse}.
 */
export declare function normalizeSearchResponse(response: WireSearchResponse): SearchResponse;

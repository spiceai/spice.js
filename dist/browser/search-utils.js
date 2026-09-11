/**
 * Helpers for reconciling the /v1/search wire format with the public search types.
 */
/**
 * Maps a single match from the runtime's wire format to {@link SearchMatch}.
 *
 * The runtime serializes the similarity score as `_score`, and omits `data`,
 * `primary_key` and `metadata` entirely when they are empty. Consumers of
 * `SearchMatch` expect `score` and expect the four objects to always be present,
 * so both are reconciled here.
 */
export function normalizeSearchMatch(match) {
    return {
        dataset: match.dataset,
        score: match._score,
        matches: match.matches ?? {},
        primary_key: match.primary_key ?? {},
        data: match.data ?? {},
        metadata: match.metadata ?? {},
    };
}
/**
 * Maps a `/v1/search` response from the runtime's wire format to
 * {@link SearchResponse}.
 */
export function normalizeSearchResponse(response) {
    return {
        duration_ms: response.duration_ms,
        results: response.results.map(normalizeSearchMatch),
    };
}
//# sourceMappingURL=search-utils.js.map
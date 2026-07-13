export const EMPTY_REVIEW_TAXONOMY = {
  opportunity_structure: [],
  edge_source: [],
  failure_type: [],
  review_conclusion: [],
};

export const EMPTY_REVIEW = {
  opportunity_structure: '',
  edge_source: '',
  failure_type: '',
  review_conclusion: '',
  entry_thesis: '',
  invalidation_valid_evidence: '',
  invalidation_trigger_evidence: '',
  invalidation_boundary: '',
  management_actions: '',
  exit_reason: '',
  tags: [],
  research_notes: '',
};

export const REVIEW_FIELD_KEYS = [
  'opportunity_structure',
  'edge_source',
  'failure_type',
  'review_conclusion',
  'entry_thesis',
  'invalidation_valid_evidence',
  'invalidation_trigger_evidence',
  'invalidation_boundary',
  'management_actions',
  'exit_reason',
  'research_notes',
];

export function normalizeText(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed || null;
}

import type Database from 'better-sqlite3';
import { relevances, type Relevance } from './classifier.ts';
import type { Candidate } from './discovery.ts';

export const filters = [...relevances, 'saved'] as const;
export type Filter = typeof filters[number];

export const parseFilter = (value: unknown): Filter | null => filters.includes(value as Filter) ? value as Filter : null;

// Relevance filters include outdated labels; unclassified papers never match a label.
export function filterCandidates(candidates: Candidate[], filter: Filter | null) {
  if (!filter) return candidates;
  return candidates.filter((paper) => filter === 'saved' ? !!paper.savedAt : paper.classification?.relevance === filter);
}

export type Counts = Record<Relevance, number> & { retrieved: number; scanned: number; saved: number; outdated: number };

// "Scanned" counts every stored result, including outdated ones.
export function countCandidates(candidates: Candidate[]): Counts {
  const counts: Counts = { retrieved: candidates.length, scanned: 0, relevant: 0, maybe: 0, irrelevant: 0, saved: 0, outdated: 0 };
  for (const paper of candidates) {
    if (paper.savedAt) counts.saved++;
    if (!paper.classification) continue;
    counts.scanned++;
    counts[paper.classification.relevance]++;
    if (paper.classification.outdated) counts.outdated++;
  }
  return counts;
}

// Returns false when the topic/paper pair does not exist. Saving twice keeps the first save time.
export function setSaved(db: Database.Database, topicId: string, paperId: string, saved: boolean) {
  return db.prepare('UPDATE topic_papers SET saved_at = CASE WHEN ? THEN coalesce(saved_at, ?) END WHERE topic_id = ? AND paper_id = ?')
    .run(Number(saved), new Date().toISOString(), topicId, paperId).changes > 0;
}

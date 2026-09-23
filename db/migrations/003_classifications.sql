-- Successful results only; the latest failure lives on topic_papers so it never replaces a result.
CREATE TABLE classifications (
  topic_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  relevance TEXT NOT NULL CHECK (relevance IN ('relevant', 'maybe', 'irrelevant')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  profile_revision INTEGER NOT NULL,
  model TEXT NOT NULL,
  config_version TEXT NOT NULL,
  test_service INTEGER NOT NULL CHECK (test_service IN (0, 1)),
  latency_ms INTEGER NOT NULL,
  classified_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, paper_id),
  FOREIGN KEY (topic_id, paper_id) REFERENCES topic_papers(topic_id, paper_id) ON DELETE CASCADE
);

-- A claim expires so a crash mid-request leaves the paper retryable.
ALTER TABLE topic_papers ADD COLUMN claimed_until TEXT;
ALTER TABLE topic_papers ADD COLUMN last_error TEXT;
ALTER TABLE topic_papers ADD COLUMN failed_at TEXT;

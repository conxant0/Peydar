-- A save belongs to one topic/paper pair, so it cannot duplicate or leak across topics.
ALTER TABLE topic_papers ADD COLUMN saved_at TEXT;

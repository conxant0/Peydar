CREATE TABLE papers (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  abstract TEXT,
  authors TEXT NOT NULL,
  year INTEGER,
  publication_date TEXT,
  venue TEXT,
  url TEXT NOT NULL,
  citation_count INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE topic_papers (
  topic_id TEXT NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  query TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, paper_id)
);

CREATE INDEX topic_papers_paper ON topic_papers(paper_id);

CREATE TABLE discovery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
  queries TEXT NOT NULL,
  new_papers INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX discovery_runs_topic ON discovery_runs(topic_id, id);

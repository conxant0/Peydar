CREATE TABLE research_topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  interests TEXT NOT NULL,
  non_interests TEXT NOT NULL,
  profile_revision INTEGER NOT NULL DEFAULT 1 CHECK (profile_revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

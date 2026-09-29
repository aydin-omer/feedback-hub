-- Migration number: 0001 	 2026-09-29T09:17:10.322Z
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  email TEXT,
  type TEXT,
  sentiment TEXT,
  urgency TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'unclassified',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_feedback_created_at ON feedback (created_at);
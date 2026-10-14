-- Migration number: 0002 	 2026-10-14T13:27:22.514Z
ALTER TABLE feedback ADD COLUMN ip_hash TEXT;

CREATE INDEX idx_feedback_ip_hash_created_at ON feedback (ip_hash, created_at);
-- Migration: Add entity_name to activity_logs for better UX
-- Safe: IF NOT EXISTS

ALTER TABLE activity_logs 
ADD COLUMN IF NOT EXISTS entity_name TEXT;

-- Index for performance (optional, since created_at is primary)
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_name 
ON activity_logs(entity_name) WHERE entity_name IS NOT NULL;


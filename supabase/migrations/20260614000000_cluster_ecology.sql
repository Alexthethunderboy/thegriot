-- Migration: 20260614000000_cluster_ecology.sql
-- Description: Add ecology JSONB column to clusters table to store flora and fauna.

ALTER TABLE clusters
ADD COLUMN ecology JSONB DEFAULT '{}'::jsonb;

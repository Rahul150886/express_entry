-- Migration: Add raw score columns to spouse_language_tests table
-- Run this in VS Code PostgreSQL Explorer (F5 or right-click → Run Query)

ALTER TABLE spouse_language_tests
  ADD COLUMN IF NOT EXISTS reading   FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS writing   FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speaking  FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS listening FLOAT NOT NULL DEFAULT 0;

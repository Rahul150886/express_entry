-- Run this against your PostgreSQL database
-- Add extended spouse fields to applicants
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS spouse_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS spouse_dob DATE,
  ADD COLUMN IF NOT EXISTS spouse_nationality VARCHAR(100),
  ADD COLUMN IF NOT EXISTS spouse_noc_code VARCHAR(20);

-- Add person labelling to documents
ALTER TABLE application_documents
  ADD COLUMN IF NOT EXISTS person_label VARCHAR(50) NOT NULL DEFAULT 'applicant',
  ADD COLUMN IF NOT EXISTS person_note VARCHAR(200) NOT NULL DEFAULT '';

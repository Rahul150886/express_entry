-- ============================================================
-- Migration: Student Visa Module — Phase 1 & 2
-- Run in Adminer at http://localhost:8080
-- or: docker exec -i express_entry_db psql -U postgres -d express_entry
-- ============================================================

-- Student Visa Profile
CREATE TABLE IF NOT EXISTS student_profiles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Personal context
    nationality                 VARCHAR(100) NOT NULL DEFAULT '',
    current_country             VARCHAR(100) NOT NULL DEFAULT '',
    dob                         DATE,

    -- Academic background
    current_education_level     VARCHAR(50)  NOT NULL DEFAULT '',
    gpa                         FLOAT,
    gpa_scale                   FLOAT,
    field_of_study              VARCHAR(200) NOT NULL DEFAULT '',
    institution_name            VARCHAR(200) NOT NULL DEFAULT '',
    graduation_year             INTEGER,
    has_gaps                    BOOLEAN DEFAULT FALSE,
    gap_explanation             TEXT,

    -- Language test
    language_test               VARCHAR(20)  NOT NULL DEFAULT '',
    ielts_overall               FLOAT,
    ielts_listening             FLOAT,
    ielts_reading               FLOAT,
    ielts_writing               FLOAT,
    ielts_speaking              FLOAT,
    pte_overall                 FLOAT,
    toefl_total                 INTEGER,

    -- Study preferences
    target_level                VARCHAR(50)  NOT NULL DEFAULT '',
    target_field                VARCHAR(200) NOT NULL DEFAULT '',
    target_countries            JSONB        DEFAULT '[]',
    preferred_intake            VARCHAR(20)  NOT NULL DEFAULT '',
    target_university           VARCHAR(200) NOT NULL DEFAULT '',

    -- Financial
    annual_budget_usd           INTEGER,
    has_sponsor                 BOOLEAN DEFAULT FALSE,
    sponsor_relationship        VARCHAR(100),
    sponsor_annual_income_usd   INTEGER,
    has_savings                 BOOLEAN DEFAULT FALSE,
    savings_usd                 INTEGER,

    -- Work experience
    work_experience_years       FLOAT,
    work_field                  VARCHAR(200),
    has_refusal                 BOOLEAN DEFAULT FALSE,
    refusal_countries           JSONB DEFAULT '[]',

    -- AI-generated results (cached)
    eligibility_result          JSONB,
    eligibility_generated_at    TIMESTAMP,

    created_at                  TIMESTAMP DEFAULT NOW(),
    updated_at                  TIMESTAMP DEFAULT NOW()
);

-- AI-generated student documents (SOPs, financial letters, etc.)
CREATE TABLE IF NOT EXISTS student_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type    VARCHAR(50)  NOT NULL,  -- sop | financial_letter | study_plan | cover_letter
    country     VARCHAR(50)  NOT NULL DEFAULT '',
    university  VARCHAR(200) NOT NULL DEFAULT '',
    program     VARCHAR(200) NOT NULL DEFAULT '',
    content     TEXT         NOT NULL,
    word_count  INTEGER,
    version     INTEGER DEFAULT 1,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id   ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_user_id  ON student_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_doc_type ON student_documents(doc_type);

-- Auto-update updated_at on student_profiles
CREATE OR REPLACE FUNCTION update_student_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at ON student_profiles;
CREATE TRIGGER trg_student_profiles_updated_at
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION update_student_profile_updated_at();

-- Verify
SELECT 'student_profiles created' AS status WHERE EXISTS (
    SELECT FROM information_schema.tables WHERE table_name = 'student_profiles'
);
SELECT 'student_documents created' AS status WHERE EXISTS (
    SELECT FROM information_schema.tables WHERE table_name = 'student_documents'
);

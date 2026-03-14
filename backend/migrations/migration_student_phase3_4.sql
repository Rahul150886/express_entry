-- ============================================================
-- Migration: Student Visa Phase 3 (Tracker) + Phase 4 (Financial)
-- Run in Adminer at http://localhost:8080
-- ============================================================

-- Required for gen_random_uuid() default on id columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Student Application Tracker
CREATE TABLE IF NOT EXISTS student_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- University info
    university_name         VARCHAR(200) NOT NULL,
    program_name            VARCHAR(200) NOT NULL,
    country                 VARCHAR(50)  NOT NULL,
    city                    VARCHAR(100) NOT NULL DEFAULT '',
    intake                  VARCHAR(30)  NOT NULL DEFAULT '',
    duration_years          FLOAT,
    tuition_usd             INTEGER,
    ranking                 INTEGER,
    website_url             VARCHAR(500),
    notes                   TEXT,
    is_favourite            BOOLEAN DEFAULT FALSE,

    -- Pipeline status
    status                  VARCHAR(30) NOT NULL DEFAULT 'researching',
    -- researching | applied | offer_received | offer_accepted | visa_applied | visa_approved | rejected

    -- Key dates
    application_deadline    DATE,
    applied_date            DATE,
    offer_date              DATE,
    visa_applied_date       DATE,
    visa_decision_date      DATE,
    tuition_deposit_due     DATE,

    -- Offer info
    offer_letter_received   BOOLEAN DEFAULT FALSE,
    offer_conditions        TEXT,
    scholarship_amount_usd  INTEGER,

    -- Document checklist as JSON array
    doc_checklist           JSONB DEFAULT '[]',

    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

-- Scholarship Reference Table
CREATE TABLE IF NOT EXISTS scholarships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(300) NOT NULL,
    provider        VARCHAR(200) NOT NULL,
    country         VARCHAR(50)  NOT NULL,
    level           VARCHAR(50)  NOT NULL DEFAULT 'any',
    amount_usd      INTEGER,
    is_full         BOOLEAN DEFAULT FALSE,
    deadline_note   VARCHAR(200),
    eligibility     TEXT,
    url             VARCHAR(500),
    fields          JSONB DEFAULT '["any"]',
    nationalities   JSONB DEFAULT '["any"]',
    min_gpa         FLOAT,
    min_ielts       FLOAT,
    active          BOOLEAN DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_student_apps_user_id  ON student_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_student_apps_status   ON student_applications(status);
CREATE INDEX IF NOT EXISTS idx_scholarships_country  ON scholarships(country);
CREATE INDEX IF NOT EXISTS idx_scholarships_level    ON scholarships(level);
CREATE INDEX IF NOT EXISTS idx_scholarships_active   ON scholarships(active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_student_app_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_apps_updated_at ON student_applications;
CREATE TRIGGER trg_student_apps_updated_at
    BEFORE UPDATE ON student_applications
    FOR EACH ROW EXECUTE FUNCTION update_student_app_updated_at();

-- Seed scholarships
INSERT INTO scholarships (id, name, provider, country, level, amount_usd, is_full, deadline_note, eligibility, url, nationalities, min_gpa, active)
VALUES
  (gen_random_uuid(), 'Vanier Canada Graduate Scholarship', 'Government of Canada', 'canada', 'phd', 50000, FALSE, 'Annually in October', 'PhD students demonstrating academic excellence, research potential, and leadership. Open to all nationalities.', 'https://vanier.gc.ca', '["any"]', 3.7, TRUE),
  (gen_random_uuid(), 'Ontario Trillium Scholarship', 'Government of Ontario', 'canada', 'phd', 40000, FALSE, 'Via university — check annually', 'International PhD students at Ontario universities.', 'https://www.ontario.ca/page/ontario-trillium-scholarship', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'University of Toronto International Scholarship', 'University of Toronto', 'canada', 'bachelors', 12000, FALSE, 'Annually in January', 'Top international undergrad applicants.', 'https://future.utoronto.ca', '["any"]', 3.8, TRUE),
  (gen_random_uuid(), 'Chevening Scholarship', 'UK Government (FCDO)', 'uk', 'masters', 45000, TRUE, 'Annually in November', 'Future leaders from 160+ countries. Minimum 2 years work experience. Masters only.', 'https://www.chevening.org', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'Commonwealth Scholarship', 'Commonwealth Scholarship Commission', 'uk', 'masters', 40000, TRUE, 'Annually in December', 'Citizens of low and middle income Commonwealth countries.', 'https://cscuk.fcdo.gov.uk', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'Rhodes Scholarship', 'Rhodes Trust', 'uk', 'masters', 60000, TRUE, 'Annually in August–October', 'Academic excellence, leadership, character. Oxford University only.', 'https://www.rhodeshouse.ox.ac.uk', '["any"]', 3.9, TRUE),
  (gen_random_uuid(), 'Australia Awards Scholarship', 'Australian Government (DFAT)', 'australia', 'masters', 50000, TRUE, 'Varies by country — typically April–June', 'Citizens of participating developing countries.', 'https://www.australiaawards.gov.au', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'Fulbright Foreign Student Program', 'US Government (ECA)', 'usa', 'masters', 35000, TRUE, 'Varies by home country — typically Feb–Oct', 'Graduate-level study or research. Citizens of eligible countries.', 'https://foreign.fulbrightonline.org', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'Hubert H. Humphrey Fellowship', 'US Government (ECA)', 'usa', 'any', 30000, TRUE, 'Via local US Embassy — typically Feb–April', 'Mid-career professionals from developing countries.', 'https://www.humphreyfellowship.org', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'DAAD Scholarship', 'DAAD (German Academic Exchange)', 'germany', 'masters', 14400, FALSE, 'Annually in October–November', 'Outstanding foreign students and researchers.', 'https://www.daad.de/en', '["any"]', 3.5, TRUE),
  (gen_random_uuid(), 'Heinrich Böll Foundation Scholarship', 'Heinrich Böll Foundation', 'germany', 'any', 13200, FALSE, 'Twice yearly — March and September', 'Committed to green politics, human rights, ecology.', 'https://www.boell.de/en/scholarships', '["any"]', NULL, TRUE),
  (gen_random_uuid(), 'Konrad-Adenauer-Stiftung Scholarship', 'KAS Foundation', 'germany', 'any', 13200, FALSE, 'Annually in January and July', 'Above-average academic performance and civic/political engagement.', 'https://www.kas.de/en', '["any"]', 3.5, TRUE);

-- Verify
SELECT 'student_applications created' AS status WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'student_applications');
SELECT 'scholarships created + seeded' AS status WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'scholarships');
SELECT COUNT(*) AS scholarship_count FROM scholarships;

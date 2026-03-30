"""
Database Models — SQLAlchemy ORM
All tables for Express Entry PR application
"""

from __future__ import annotations
from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey,
    Integer, JSON, String, Text, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncAttrs, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column

from loguru import logger
from infrastructure.config import get_settings

settings = get_settings()

# Create engine at module load time
logger.info(f"Database: engine URL = {str(settings.async_database_url)[:50]}...")
engine = create_async_engine(settings.async_database_url, pool_size=settings.DATABASE_POOL_SIZE, echo=settings.DEBUG)
logger.info(f"Database: async engine created  pool_size={settings.DATABASE_POOL_SIZE}  echo={settings.DEBUG}")

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(AsyncAttrs, DeclarativeBase):
    pass


# ─────────────────────────────────────────────
# User & Auth
# ─────────────────────────────────────────────

class UserDB(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    push_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="user", uselist=False)
    notifications: Mapped[list["NotificationDB"]] = relationship("NotificationDB", back_populates="user")


class RefreshTokenDB(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# Applicant Profile
# ─────────────────────────────────────────────

class ApplicantDB(Base):
    __tablename__ = "applicants"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    nationality: Mapped[str] = mapped_column(String(100), nullable=False)
    country_of_residence: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    marital_status: Mapped[str] = mapped_column(String(50), nullable=False, default="single")
    has_spouse: Mapped[bool] = mapped_column(Boolean, default=False)
    has_provincial_nomination: Mapped[bool] = mapped_column(Boolean, default=False)
    has_sibling_in_canada: Mapped[bool] = mapped_column(Boolean, default=False)
    has_certificate_of_qualification: Mapped[bool] = mapped_column(Boolean, default=False)

    # Personal details for IRCC form
    city_of_birth: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    province_of_destination: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Passport / travel document
    passport_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    passport_country_of_issue: Mapped[str | None] = mapped_column(String(100), nullable=True)
    passport_issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    passport_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # CRS Score (stored as JSON)
    crs_score_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    eligible_programs: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    # Spouse info (denormalized for performance)
    spouse_education_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    spouse_canadian_work_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Spouse extended profile
    spouse_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    spouse_dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    spouse_nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    spouse_noc_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Profile verification state — computed after each document review
    # Structure: {field_key: {status, profile_value, doc_value, doc_id, message, acknowledged}}
    profile_verification: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=dict)

    profile_created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    profile_updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user: Mapped["UserDB"] = relationship("UserDB", back_populates="applicant")
    language_tests: Mapped[list["LanguageTestDB"]] = relationship("LanguageTestDB", back_populates="applicant", cascade="all, delete-orphan")
    work_experiences: Mapped[list["WorkExperienceDB"]] = relationship("WorkExperienceDB", back_populates="applicant", cascade="all, delete-orphan")
    education: Mapped["EducationDB | None"] = relationship("EducationDB", back_populates="applicant", uselist=False, cascade="all, delete-orphan")
    job_offer: Mapped["JobOfferDB | None"] = relationship("JobOfferDB", back_populates="applicant", uselist=False, cascade="all, delete-orphan")
    documents: Mapped[list["ApplicationDocumentDB"]] = relationship("ApplicationDocumentDB", back_populates="applicant", cascade="all, delete-orphan")
    cases: Mapped[list["ApplicationCaseDB"]] = relationship("ApplicationCaseDB", back_populates="applicant")
    crs_history: Mapped[list["CrsScoreHistoryDB"]] = relationship("CrsScoreHistoryDB", back_populates="applicant")
    chat_history: Mapped[list["AiChatMessageDB"]] = relationship("AiChatMessageDB", back_populates="applicant")
    spouse_language_test: Mapped["SpouseLanguageTestDB | None"] = relationship("SpouseLanguageTestDB", back_populates="applicant", uselist=False)


class LanguageTestDB(Base):
    __tablename__ = "language_tests"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    test_type: Mapped[str] = mapped_column(String(20), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="first")
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="english")
    reading: Mapped[float] = mapped_column(Float, nullable=False)
    writing: Mapped[float] = mapped_column(Float, nullable=False)
    speaking: Mapped[float] = mapped_column(Float, nullable=False)
    listening: Mapped[float] = mapped_column(Float, nullable=False)
    test_date: Mapped[date] = mapped_column(Date, nullable=False)
    registration_number: Mapped[str] = mapped_column(String(100), default="")
    # CLB equivalents
    clb_speaking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clb_listening: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clb_reading: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clb_writing: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="language_tests")


class SpouseLanguageTestDB(Base):
    __tablename__ = "spouse_language_tests"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"), unique=True)
    test_type: Mapped[str] = mapped_column(String(20), nullable=False)
    reading:   Mapped[float] = mapped_column(Float, nullable=False, default=0)
    writing:   Mapped[float] = mapped_column(Float, nullable=False, default=0)
    speaking:  Mapped[float] = mapped_column(Float, nullable=False, default=0)
    listening: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    clb_speaking: Mapped[int] = mapped_column(Integer, nullable=False)
    clb_listening: Mapped[int] = mapped_column(Integer, nullable=False)
    clb_reading: Mapped[int] = mapped_column(Integer, nullable=False)
    clb_writing: Mapped[int] = mapped_column(Integer, nullable=False)
    test_date: Mapped[date] = mapped_column(Date, nullable=False)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="spouse_language_test")


class WorkExperienceDB(Base):
    __tablename__ = "work_experiences"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    noc_code: Mapped[str] = mapped_column(String(10), nullable=False)
    noc_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    teer_level: Mapped[str] = mapped_column(String(5), nullable=False)
    experience_type: Mapped[str] = mapped_column(String(20), nullable=False)
    employer_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    job_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    hours_per_week: Mapped[float] = mapped_column(Float, nullable=False, default=40.0)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="work_experiences")


class EducationDB(Base):
    __tablename__ = "education"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"), unique=True)
    level: Mapped[str] = mapped_column(String(50), nullable=False)
    field_of_study: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    is_canadian: Mapped[bool] = mapped_column(Boolean, default=False)
    is_three_year_or_more: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    eca_organization: Mapped[str | None] = mapped_column(String(50), nullable=True)
    eca_reference_number: Mapped[str] = mapped_column(String(100), default="")
    eca_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="education")


class JobOfferDB(Base):
    __tablename__ = "job_offers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"), unique=True)
    employer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    noc_code: Mapped[str] = mapped_column(String(10), nullable=False)
    teer_level: Mapped[str] = mapped_column(String(5), nullable=False)
    is_lmia_exempt: Mapped[bool] = mapped_column(Boolean, default=False)
    lmia_number: Mapped[str] = mapped_column(String(100), default="")
    annual_salary: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="job_offer")


class ApplicationDocumentDB(Base):
    __tablename__ = "application_documents"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    person_label: Mapped[str] = mapped_column(String(50), nullable=False, default="applicant")  # applicant | spouse | child_1 | child_2 etc
    person_note: Mapped[str] = mapped_column(String(200), nullable=False, default="")  # custom note
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    blob_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    ai_extracted_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_review_notes: Mapped[str] = mapped_column(Text, default="")
    ai_issues: Mapped[list | None] = mapped_column(JSON, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    rejection_reason: Mapped[str] = mapped_column(Text, default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="documents")


# ─────────────────────────────────────────────
# Draws & Cases
# ─────────────────────────────────────────────

class DrawDB(Base):
    __tablename__ = "draws"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    draw_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    draw_type: Mapped[str] = mapped_column(String(50), nullable=False)
    draw_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    minimum_crs: Mapped[int] = mapped_column(Integer, nullable=False)
    invitations_issued: Mapped[int] = mapped_column(Integer, nullable=False)
    targeted_program: Mapped[str | None] = mapped_column(String(100), nullable=True)
    targeted_noc_codes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tie_breaking_rule: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_url: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ApplicationCaseDB(Base):
    __tablename__ = "application_cases"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    draw_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("draws.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="in_pool")
    ita_received_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    application_submitted_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ircc_application_number: Mapped[str] = mapped_column(String(100), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="cases")
    draw: Mapped["DrawDB | None"] = relationship("DrawDB")
    checklist_items: Mapped[list["ChecklistItemDB"]] = relationship("ChecklistItemDB", back_populates="case", cascade="all, delete-orphan")
    timeline: Mapped[list["ApplicationTimelineDB"]] = relationship("ApplicationTimelineDB", back_populates="case", cascade="all, delete-orphan")


class ChecklistItemDB(Base):
    __tablename__ = "checklist_items"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("application_cases.id"))
    section: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    document_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_not_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    document_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("application_documents.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    tips: Mapped[str] = mapped_column(Text, default="")
    common_mistakes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    case: Mapped["ApplicationCaseDB"] = relationship("ApplicationCaseDB", back_populates="checklist_items")


class ApplicationTimelineDB(Base):
    __tablename__ = "application_timeline"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("application_cases.id"))
    event: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_automated: Mapped[bool] = mapped_column(Boolean, default=True)

    case: Mapped["ApplicationCaseDB"] = relationship("ApplicationCaseDB", back_populates="timeline")


# ─────────────────────────────────────────────
# Notifications & History
# ─────────────────────────────────────────────

class NotificationDB(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False)  # draw_alert, deadline, document, general
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    extra_data: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["UserDB"] = relationship("UserDB", back_populates="notifications")


class CrsScoreHistoryDB(Base):
    __tablename__ = "crs_score_history"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    core_human_capital: Mapped[int] = mapped_column(Integer, nullable=False)
    spouse_factors: Mapped[int] = mapped_column(Integer, nullable=False)
    skill_transferability: Mapped[int] = mapped_column(Integer, nullable=False)
    additional_points: Mapped[int] = mapped_column(Integer, nullable=False)
    breakdown_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="crs_history")


class AiChatMessageDB(Base):
    __tablename__ = "ai_chat_messages"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    session_id: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user/assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    applicant: Mapped["ApplicantDB"] = relationship("ApplicantDB", back_populates="chat_history")


# ─────────────────────────────────────────────
# DB Session Dependency
# ─────────────────────────────────────────────

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            logger.error(f"DB session rollback triggered: {type(e).__name__}: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    logger.info("Database: running create_all (create missing tables)...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    tables = list(Base.metadata.tables.keys())
    logger.info(f"Database: tables ready ({len(tables)}): {tables}")


# ─────────────────────────────────────────────
# IELTS Preparation
# ─────────────────────────────────────────────

class IeltsProgressDB(Base):
    __tablename__ = "ielts_progress"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    applicant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("applicants.id"))
    session_type: Mapped[str] = mapped_column(String(20), nullable=False)   # diagnostic, practice
    skill: Mapped[str] = mapped_column(String(20), nullable=False)           # reading, writing, listening, speaking, all
    level: Mapped[str] = mapped_column(String(20), nullable=False)           # beginner, intermediate, advanced
    band_score: Mapped[float | None] = mapped_column(Float, nullable=True)   # estimated band 4.0–9.0
    questions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    answers_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    feedback_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    vocabulary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# Student Visa Module
# ─────────────────────────────────────────────

class StudentProfileDB(Base):
    __tablename__ = "student_profiles"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), unique=True)

    # Personal context
    nationality: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    current_country: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Academic background
    current_education_level: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    # bachelors | masters | diploma | high_school
    gpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    gpa_scale: Mapped[float | None] = mapped_column(Float, nullable=True)   # e.g. 4.0 or 10.0
    field_of_study: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    institution_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    graduation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_gaps: Mapped[bool] = mapped_column(Boolean, default=False)
    gap_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Language test
    language_test: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    # ielts | pte | toefl | duolingo | none
    ielts_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    ielts_listening: Mapped[float | None] = mapped_column(Float, nullable=True)
    ielts_reading: Mapped[float | None] = mapped_column(Float, nullable=True)
    ielts_writing: Mapped[float | None] = mapped_column(Float, nullable=True)
    ielts_speaking: Mapped[float | None] = mapped_column(Float, nullable=True)
    pte_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    toefl_total: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Study preferences
    target_level: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    # bachelors | masters | phd | diploma | language_course
    target_field: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    target_countries: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    # ["canada", "uk", "australia", "usa", "germany"]
    preferred_intake: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    # jan | may | sep | flexible
    target_university: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    # free text — user enters manually

    # Financial
    annual_budget_usd: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Total budget per year including tuition + living
    has_sponsor: Mapped[bool] = mapped_column(Boolean, default=False)
    sponsor_relationship: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sponsor_annual_income_usd: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_savings: Mapped[bool] = mapped_column(Boolean, default=False)
    savings_usd: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Work experience
    work_experience_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    work_field: Mapped[str | None] = mapped_column(String(200), nullable=True)
    has_refusal: Mapped[bool] = mapped_column(Boolean, default=False)
    refusal_countries: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    # AI-generated results (cached)
    eligibility_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    eligibility_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["UserDB"] = relationship("UserDB")


class StudentDocumentDB(Base):
    """AI-generated documents for student visa applications."""
    __tablename__ = "student_documents"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # sop | financial_letter | study_plan | cover_letter | motivation_letter
    country: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    university: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    program: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["UserDB"] = relationship("UserDB")


# ─────────────────────────────────────────────
# Student Visa — Application Tracker & Financial
# ─────────────────────────────────────────────

class StudentApplicationDB(Base):
    """One row per university the student is tracking."""
    __tablename__ = "student_applications"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))

    # University info
    university_name:   Mapped[str] = mapped_column(String(200), nullable=False)
    program_name:      Mapped[str] = mapped_column(String(200), nullable=False)
    country:           Mapped[str] = mapped_column(String(50),  nullable=False)
    city:              Mapped[str] = mapped_column(String(100), nullable=False, default="")
    intake:            Mapped[str] = mapped_column(String(30),  nullable=False, default="")   # Sep 2025 / Jan 2026
    duration_years:    Mapped[float | None] = mapped_column(Float, nullable=True)
    tuition_usd:       Mapped[int | None]   = mapped_column(Integer, nullable=True)           # annual
    ranking:           Mapped[int | None]   = mapped_column(Integer, nullable=True)           # QS rank
    website_url:       Mapped[str | None]   = mapped_column(String(500), nullable=True)
    notes:             Mapped[str | None]   = mapped_column(Text, nullable=True)
    is_favourite:      Mapped[bool]         = mapped_column(Boolean, default=False)

    # Application pipeline status
    # researching → applied → offer_received → offer_accepted → visa_applied → visa_approved | rejected
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="researching")

    # Key dates
    application_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    applied_date:         Mapped[date | None] = mapped_column(Date, nullable=True)
    offer_date:           Mapped[date | None] = mapped_column(Date, nullable=True)
    visa_applied_date:    Mapped[date | None] = mapped_column(Date, nullable=True)
    visa_decision_date:   Mapped[date | None] = mapped_column(Date, nullable=True)
    tuition_deposit_due:  Mapped[date | None] = mapped_column(Date, nullable=True)

    # Offer letter info
    offer_letter_received: Mapped[bool]        = mapped_column(Boolean, default=False)
    offer_conditions:      Mapped[str | None]  = mapped_column(Text, nullable=True)
    scholarship_amount_usd: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Document checklist — stored as JSON list of {id, label, done, due_date}
    doc_checklist: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["UserDB"] = relationship("UserDB")


class ScholarshipDB(Base):
    """Curated scholarship reference table — seeded, not user-created."""
    __tablename__ = "scholarships"

    id:            Mapped[UUID]        = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name:          Mapped[str]         = mapped_column(String(300), nullable=False)
    provider:      Mapped[str]         = mapped_column(String(200), nullable=False)
    country:       Mapped[str]         = mapped_column(String(50),  nullable=False)   # destination country
    level:         Mapped[str]         = mapped_column(String(50),  nullable=False)   # bachelors|masters|phd|any
    amount_usd:    Mapped[int | None]  = mapped_column(Integer, nullable=True)
    is_full:       Mapped[bool]        = mapped_column(Boolean, default=False)
    deadline_note: Mapped[str | None]  = mapped_column(String(200), nullable=True)   # "Annually in January"
    eligibility:   Mapped[str | None]  = mapped_column(Text, nullable=True)
    url:           Mapped[str | None]  = mapped_column(String(500), nullable=True)
    fields:        Mapped[list | None] = mapped_column(JSON, nullable=True)           # ["any"] or ["engineering","cs"]
    nationalities: Mapped[list | None] = mapped_column(JSON, nullable=True)           # ["any"] or ["india","nigeria"]
    min_gpa:       Mapped[float | None]= mapped_column(Float, nullable=True)
    min_ielts:     Mapped[float | None]= mapped_column(Float, nullable=True)
    active:        Mapped[bool]        = mapped_column(Boolean, default=True)
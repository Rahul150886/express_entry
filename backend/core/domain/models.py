"""
Domain Models — Express Entry PR Application
Core entities, value objects, and enumerations
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


# ─────────────────────────────────────────────
# Enumerations
# ─────────────────────────────────────────────

class MaritalStatus(str, Enum):
    SINGLE = "single"
    MARRIED = "married"
    COMMON_LAW = "common_law"
    SEPARATED = "separated"
    DIVORCED = "divorced"
    WIDOWED = "widowed"


class LanguageTestType(str, Enum):
    IELTS = "ielts"
    CELPIP = "celpip"
    TEF = "tef"
    TCF = "tcf"


class LanguageRole(str, Enum):
    FIRST = "first"       # Primary official language
    SECOND = "second"     # Secondary official language


class EducationLevel(str, Enum):
    LESS_THAN_SECONDARY = "less_than_secondary"
    SECONDARY = "secondary"                         # High school diploma
    ONE_YEAR_POST_SECONDARY = "one_year_post_secondary"
    TWO_YEAR_POST_SECONDARY = "two_year_post_secondary"
    BACHELORS = "bachelors"
    TWO_OR_MORE_DEGREES = "two_or_more_degrees"     # Two+ certificates
    MASTERS = "masters"
    PHD = "phd"


class TeerLevel(str, Enum):
    TEER_0 = "0"
    TEER_1 = "1"
    TEER_2 = "2"
    TEER_3 = "3"
    TEER_4 = "4"
    TEER_5 = "5"


class ExperienceType(str, Enum):
    CANADIAN = "canadian"
    FOREIGN = "foreign"


class DocumentType(str, Enum):
    PASSPORT = "passport"
    LANGUAGE_TEST_RESULT = "language_test_result"
    EDUCATION_CREDENTIAL = "education_credential"
    ECA_REPORT = "eca_report"
    EMPLOYMENT_LETTER = "employment_letter"
    PAY_STUBS = "pay_stubs"
    T4_SLIPS = "t4_slips"
    POLICE_CERTIFICATE = "police_certificate"
    MEDICAL_EXAM = "medical_exam"
    BIRTH_CERTIFICATE = "birth_certificate"
    MARRIAGE_CERTIFICATE = "marriage_certificate"
    PROVINCIAL_NOMINATION = "provincial_nomination"
    JOB_OFFER_LETTER = "job_offer_letter"
    REFERENCE_LETTER = "reference_letter"
    PHOTO = "photo"


class DocumentStatus(str, Enum):
    PENDING = "pending"
    AI_PROCESSING = "ai_processing"
    AI_REVIEWED = "ai_reviewed"
    VERIFIED = "verified"
    REJECTED = "rejected"
    EXPIRED = "expired"


class DrawType(str, Enum):
    NO_OCCUPATION_RESTRICTION = "no_occupation_restriction"
    STEM = "stem"
    FRENCH = "french"
    HEALTHCARE = "healthcare"
    TRADE = "trade"
    TRANSPORT = "transport"
    AGRICULTURE = "agriculture"
    PNP = "pnp"


class CaseStatus(str, Enum):
    IN_POOL = "in_pool"
    ITA_RECEIVED = "ita_received"
    APPLICATION_SUBMITTED = "application_submitted"
    ADDITIONAL_DOCS_REQUESTED = "additional_docs_requested"
    MEDICAL_REQUESTED = "medical_requested"
    BIOMETRICS_REQUESTED = "biometrics_requested"
    DECISION_MADE = "decision_made"
    COPR_ISSUED = "copr_issued"
    LANDED = "landed"


class ApplicationProgram(str, Enum):
    FSW = "federal_skilled_worker"
    FST = "federal_skilled_trades"
    CEC = "canadian_experience_class"


class EcaOrganization(str, Enum):
    WES = "wes"
    ICES = "ices"
    IQAS = "iqas"
    NNAS = "nnas"
    CES = "ces"
    ICES_INTERNATIONAL = "ices_international"
    MCC = "mcc"
    PEBC = "pebc"


# ─────────────────────────────────────────────
# Value Objects
# ─────────────────────────────────────────────

@dataclass(frozen=True)
class ClbScores:
    """Canadian Language Benchmark equivalents"""
    speaking: int
    listening: int
    reading: int
    writing: int

    @property
    def lowest(self) -> int:
        return min(self.speaking, self.listening, self.reading, self.writing)

    @property
    def is_clb7_or_higher(self) -> bool:
        return self.lowest >= 7

    @property
    def is_clb9_or_higher(self) -> bool:
        return self.lowest >= 9

    @property
    def is_nclc7_or_higher(self) -> bool:
        """For French (TEF/TCF)"""
        return self.lowest >= 7


@dataclass(frozen=True)
class CrsScore:
    core_human_capital: int
    spouse_factors: int
    skill_transferability: int
    additional_points: int
    calculated_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def total(self) -> int:
        return (self.core_human_capital + self.spouse_factors +
                self.skill_transferability + self.additional_points)

    def breakdown(self) -> dict:
        return {
            "core_human_capital": self.core_human_capital,
            "spouse_factors": self.spouse_factors,
            "skill_transferability": self.skill_transferability,
            "additional_points": self.additional_points,
            "total": self.total,
            "calculated_at": self.calculated_at.isoformat()
        }


@dataclass(frozen=True)
class AiExtractionResult:
    document_type: DocumentType
    extracted_fields: dict
    confidence: float
    issues: list[str] = field(default_factory=list)
    raw_text: str = ""


# ─────────────────────────────────────────────
# Domain Entities
# ─────────────────────────────────────────────

@dataclass
class LanguageTest:
    id: UUID = field(default_factory=uuid4)
    applicant_id: UUID = field(default_factory=uuid4)
    test_type: LanguageTestType = LanguageTestType.IELTS
    role: LanguageRole = LanguageRole.FIRST
    language: str = "english"  # english / french
    reading: float = 0.0
    writing: float = 0.0
    speaking: float = 0.0
    listening: float = 0.0
    test_date: date = field(default_factory=date.today)
    registration_number: str = ""
    clb_equivalent: Optional[ClbScores] = None

    @property
    def expiry_date(self) -> date:
        return self.test_date.replace(year=self.test_date.year + 2)

    @property
    def is_expired(self) -> bool:
        return date.today() > self.expiry_date

    @property
    def days_until_expiry(self) -> int:
        return (self.expiry_date - date.today()).days


@dataclass
class WorkExperience:
    id: UUID = field(default_factory=uuid4)
    applicant_id: UUID = field(default_factory=uuid4)
    noc_code: str = ""
    noc_title: str = ""
    teer_level: TeerLevel = TeerLevel.TEER_1
    experience_type: ExperienceType = ExperienceType.CANADIAN
    employer_name: str = ""
    job_title: str = ""
    start_date: date = field(default_factory=date.today)
    end_date: Optional[date] = None
    hours_per_week: float = 40.0
    is_current: bool = False

    @property
    def total_months(self) -> int:
        end = self.end_date or date.today()
        return (end.year - self.start_date.year) * 12 + (end.month - self.start_date.month)

    @property
    def total_years(self) -> float:
        return self.total_months / 12

    @property
    def is_eligible_hours(self) -> bool:
        """Must be at least 30 hours/week to count"""
        return self.hours_per_week >= 30


@dataclass
class Education:
    id: UUID = field(default_factory=uuid4)
    applicant_id: UUID = field(default_factory=uuid4)
    level: EducationLevel = EducationLevel.BACHELORS
    field_of_study: str = ""
    institution_name: str = ""
    country: str = ""
    is_canadian: bool = False
    completion_date: Optional[date] = None
    is_three_year_or_more: bool = False
    eca_organization: Optional[EcaOrganization] = None
    eca_reference_number: str = ""
    eca_completion_date: Optional[date] = None


@dataclass
class JobOffer:
    id: UUID = field(default_factory=uuid4)
    applicant_id: UUID = field(default_factory=uuid4)
    employer_name: str = ""
    noc_code: str = ""
    teer_level: TeerLevel = TeerLevel.TEER_1
    is_lmia_exempt: bool = False
    lmia_number: str = ""
    annual_salary: float = 0.0

    @property
    def is_noc_teer_00(self) -> bool:
        return self.noc_code.startswith("0") and self.teer_level == TeerLevel.TEER_0

    @property
    def points(self) -> int:
        """200 pts for NOC 00, 50 pts for others"""
        return 200 if self.is_noc_teer_00 else 50


@dataclass
class ApplicationDocument:
    id: UUID = field(default_factory=uuid4)
    applicant_id: UUID = field(default_factory=uuid4)
    document_type: DocumentType = DocumentType.PASSPORT
    file_name: str = ""
    blob_url: str = ""
    file_size_bytes: int = 0
    mime_type: str = ""
    status: DocumentStatus = DocumentStatus.PENDING
    ai_extraction: Optional[AiExtractionResult] = None
    ai_review_notes: str = ""
    expiry_date: Optional[date] = None
    rejection_reason: str = ""
    uploaded_at: datetime = field(default_factory=datetime.utcnow)
    verified_at: Optional[datetime] = None

    @property
    def is_expired(self) -> bool:
        if self.expiry_date is None:
            return False
        return date.today() > self.expiry_date


@dataclass
class ChecklistItem:
    id: UUID = field(default_factory=uuid4)
    case_id: UUID = field(default_factory=uuid4)
    title: str = ""
    description: str = ""
    document_type: Optional[DocumentType] = None
    is_required: bool = True
    is_completed: bool = False
    is_not_applicable: bool = False
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    notes: str = ""


@dataclass
class ApplicationTimeline:
    id: UUID = field(default_factory=uuid4)
    case_id: UUID = field(default_factory=uuid4)
    event: str = ""
    description: str = ""
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    is_automated: bool = True


@dataclass
class Draw:
    id: UUID = field(default_factory=uuid4)
    draw_number: str = ""
    draw_type: DrawType = DrawType.NO_OCCUPATION_RESTRICTION
    draw_date: datetime = field(default_factory=datetime.utcnow)
    minimum_crs: int = 0
    invitations_issued: int = 0
    targeted_program: Optional[str] = None
    targeted_noc_codes: list[str] = field(default_factory=list)
    tie_breaking_rule: Optional[str] = None  # date of profile creation
    source_url: str = ""


@dataclass
class ApplicationCase:
    id: UUID = field(default_factory=uuid4)
    applicant_id: UUID = field(default_factory=uuid4)
    draw_id: Optional[UUID] = None
    status: CaseStatus = CaseStatus.IN_POOL
    ita_received_date: Optional[datetime] = None
    application_submitted_date: Optional[datetime] = None
    checklist: list[ChecklistItem] = field(default_factory=list)
    timeline: list[ApplicationTimeline] = field(default_factory=list)
    ircc_application_number: str = ""
    notes: str = ""

    @property
    def ita_deadline(self) -> Optional[datetime]:
        if self.ita_received_date:
            return self.ita_received_date + timedelta(days=60)
        return None

    @property
    def days_until_deadline(self) -> Optional[int]:
        if self.ita_deadline:
            return (self.ita_deadline - datetime.utcnow()).days
        return None

    @property
    def completed_checklist_count(self) -> int:
        return sum(1 for item in self.checklist if item.is_completed)

    @property
    def checklist_progress_pct(self) -> float:
        required = [i for i in self.checklist if i.is_required and not i.is_not_applicable]
        if not required:
            return 0.0
        completed = sum(1 for i in required if i.is_completed)
        return (completed / len(required)) * 100


@dataclass
class SpouseProfile:
    education_level: EducationLevel = EducationLevel.BACHELORS
    canadian_work_years: float = 0.0
    language_test: Optional[LanguageTest] = None


@dataclass
class Applicant:
    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    full_name: str = ""
    date_of_birth: date = field(default_factory=date.today)
    nationality: str = ""
    country_of_residence: str = ""
    marital_status: MaritalStatus = MaritalStatus.SINGLE
    has_spouse: bool = False

    # Profile components
    language_tests: list[LanguageTest] = field(default_factory=list)
    work_experiences: list[WorkExperience] = field(default_factory=list)
    education: Optional[Education] = None
    spouse_profile: Optional[SpouseProfile] = None
    job_offer: Optional[JobOffer] = None
    documents: list[ApplicationDocument] = field(default_factory=list)
    active_case: Optional[ApplicationCase] = None

    # Flags
    has_provincial_nomination: bool = False
    has_sibling_in_canada: bool = False
    has_certificate_of_qualification: bool = False

    # Computed
    current_crs_score: Optional[CrsScore] = None
    eligible_programs: list[ApplicationProgram] = field(default_factory=list)
    profile_created_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def age(self) -> int:
        today = date.today()
        return (today.year - self.date_of_birth.year -
                ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)))

    @property
    def primary_language_test(self) -> Optional[LanguageTest]:
        return next((t for t in self.language_tests
                     if t.role == LanguageRole.FIRST and not t.is_expired), None)

    @property
    def secondary_language_test(self) -> Optional[LanguageTest]:
        return next((t for t in self.language_tests
                     if t.role == LanguageRole.SECOND and not t.is_expired), None)

    @property
    def canadian_work_years(self) -> float:
        return sum(exp.total_years for exp in self.work_experiences
                   if exp.experience_type == ExperienceType.CANADIAN
                   and exp.is_eligible_hours)

    @property
    def foreign_work_years(self) -> float:
        return sum(exp.total_years for exp in self.work_experiences
                   if exp.experience_type == ExperienceType.FOREIGN
                   and exp.is_eligible_hours)

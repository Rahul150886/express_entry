"""
FastAPI Application — Express Entry PR
Main app with all routes, auth, WebSocket, and middleware
"""

from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Annotated, AsyncGenerator, Optional
from uuid import UUID, uuid4

def _safe_blob_name(filename: str) -> str:
    """Sanitise a filename for use as an Azure blob name segment.
    Replaces spaces and problematic characters with underscores.
    Prevents double URL-encoding issues when filenames contain spaces/brackets.
    """
    import re, unicodedata
    # Normalise unicode to closest ASCII (résumé → resume)
    filename = unicodedata.normalize('NFKD', filename).encode('ascii', 'ignore').decode('ascii')
    # Replace spaces, brackets, and other special chars with underscores
    safe = re.sub(r"[^\w.\-]", "_", filename)
    # Collapse multiple underscores
    safe = re.sub(r"_+", "_", safe)
    return safe or "document"

import uvicorn
from fastapi import (
    Depends, FastAPI, File, Form, HTTPException,
    Query, Request, UploadFile, WebSocket, WebSocketDisconnect, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from loguru import logger
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from infrastructure.config import get_settings
from infrastructure.persistence.database import (
    get_db, init_db,
    UserDB, ApplicantDB, DrawDB, ApplicationDocumentDB,
    ApplicationCaseDB, ChecklistItemDB, NotificationDB,
    CrsScoreHistoryDB, AiChatMessageDB, IeltsProgressDB, LanguageTestDB,
    WorkExperienceDB, EducationDB, JobOfferDB, SpouseLanguageTestDB
)
from infrastructure.ai.ai_services import (
    IeltsService,
    DocumentIntelligenceService,
    DocumentReviewService,
    NocFinderService,
    CrsPredictionService,
    ChecklistGeneratorService,
    ImmigrationAssistantService,
    VectorKnowledgeBase,
    ScoreSimulatorService,
    PNPMatcherService,
    DrawFrequencyPredictorService,
    StudyPlanService,
    LetterWriterService,
    PeerComparisonService,
    EligibilityCheckerService,
    TranscriptGeneratorService,
    WorkExperienceLetterService,
    StudentEligibilityService,
    StudentSOPService,
    StudentFinancialLetterService,
    StudentVisaRiskService,
)
from infrastructure.storage.blob_storage import BlobStorageService
from infrastructure.notifications.notification_service import NotificationService
from core.application.services.crs_calculator import CrsCalculatorService
from core.domain.models import (
    DocumentType, ClbScores, LanguageTestType, LanguageRole,
    ExperienceType, TeerLevel, EducationLevel
)

settings = get_settings()

# ─────────────────────────────────────────────
# Auth Setup
# ─────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db)
) -> UserDB:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"JWT validation failed: {type(e).__name__}: {e}")
        raise credentials_exception

    result = await db.execute(select(UserDB).where(UserDB.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


# ─────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ApplicantProfileRequest(BaseModel):
    full_name: str
    date_of_birth: str  # YYYY-MM-DD
    nationality: str
    country_of_residence: str
    marital_status: str
    has_spouse: bool
    has_provincial_nomination: bool = False
    has_sibling_in_canada: bool = False
    has_certificate_of_qualification: bool = False
    # Extended personal fields
    city_of_birth: Optional[str] = None
    province_of_destination: Optional[str] = None
    # Passport fields (used by Chrome extension autofill)
    passport_number: Optional[str] = None
    passport_country_of_issue: Optional[str] = None
    passport_issue_date: Optional[str] = None   # YYYY-MM-DD
    passport_expiry_date: Optional[str] = None  # YYYY-MM-DD
    # Spouse fields
    spouse_education_level: Optional[str] = None
    spouse_canadian_work_years: Optional[float] = None
    spouse_name: Optional[str] = None
    spouse_dob: Optional[str] = None  # YYYY-MM-DD
    spouse_nationality: Optional[str] = None
    spouse_noc_code: Optional[str] = None


class LanguageTestRequest(BaseModel):
    test_type: str
    role: str = "first"
    language: str = "english"
    reading: float
    writing: float
    speaking: float
    listening: float
    test_date: Optional[str] = None  # defaults to today if not provided
    registration_number: str = ""
    clb_reading: Optional[int] = None
    clb_writing: Optional[int] = None
    clb_speaking: Optional[int] = None
    clb_listening: Optional[int] = None


class WorkExperienceRequest(BaseModel):
    noc_code: str
    noc_title: str = ""
    teer_level: str
    experience_type: str
    employer_name: str
    job_title: str = ""
    start_date: str
    end_date: Optional[str] = None
    hours_per_week: float = 40.0
    is_current: bool = False


class EducationRequest(BaseModel):
    level: str
    field_of_study: str = ""
    institution_name: str = ""
    country: str = ""
    is_canadian: bool = False
    is_three_year_or_more: bool = False
    completion_date: Optional[str] = None
    eca_organization: Optional[str] = None
    eca_reference_number: str = ""


class JobOfferRequest(BaseModel):
    employer_name: str
    noc_code: str
    teer_level: str
    is_lmia_exempt: bool = False
    lmia_number: str = ""
    annual_salary: float = 0


class NocFinderRequest(BaseModel):
    job_title: str
    job_duties: str
    country: str = "International"


class ChatMessageRequest(BaseModel):
    message: str
    session_id: str
    history: list[dict] = []


# ─────────────────────────────────────────────
# WebSocket Connection Manager
# ─────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}  # user_id -> websocket

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws
        logger.info(f"WebSocket connected: {user_id}")

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)
        logger.info(f"WebSocket disconnected: {user_id}")

    async def send_personal(self, user_id: str, data: dict):
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def broadcast(self, data: dict):
        disconnected = []
        for uid, ws in self.active.items():
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(uid)
        for uid in disconnected:
            self.disconnect(uid)


ws_manager = ConnectionManager()


# ─────────────────────────────────────────────
# Service Instances
# ─────────────────────────────────────────────

crs_calculator       = CrsCalculatorService()
doc_intelligence     = DocumentIntelligenceService()
doc_reviewer         = DocumentReviewService()
noc_finder           = NocFinderService()
crs_predictor        = CrsPredictionService()
checklist_generator  = ChecklistGeneratorService()
ai_assistant         = ImmigrationAssistantService()
score_simulator      = ScoreSimulatorService()
pnp_matcher          = PNPMatcherService()
draw_predictor       = DrawFrequencyPredictorService()
study_plan_service   = StudyPlanService()
letter_writer        = LetterWriterService()
peer_comparison      = PeerComparisonService()
eligibility_checker  = EligibilityCheckerService()
transcript_generator = TranscriptGeneratorService()
work_letter_service  = WorkExperienceLetterService()
ielts_service = IeltsService()
blob_storage = BlobStorageService()
notification_service = NotificationService()


# ─────────────────────────────────────────────
# App Lifespan
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Express Entry PR API...")
    logger.info(f"  ENV            : {settings.APP_ENV}")
    logger.info(f"  DATABASE_URL   : {settings.DATABASE_URL[:40] if settings.DATABASE_URL else 'NOT SET'}...")
    logger.info(f"  REDIS_URL      : {settings.REDIS_URL}")
    logger.info(f"  AZURE_OPENAI   : {'✓ configured' if settings.AZURE_OPENAI_API_KEY else '✗ NOT SET — AI endpoints will return 503'}")
    logger.info(f"  AZURE_DOC_INTEL: {'✓ configured' if settings.AZURE_DOC_INTELLIGENCE_KEY else '✗ NOT SET — document AI disabled'}")
    logger.info(f"  AZURE_STORAGE  : {'✓ configured' if settings.AZURE_STORAGE_CONNECTION_STRING else '✗ NOT SET — using local disk storage'}")
    logger.info(f"  SENDGRID       : {'✓ configured' if settings.SENDGRID_API_KEY else '✗ NOT SET — emails disabled'}")
    logger.info(f"  CHROMA         : {settings.CHROMA_HOST}:{settings.CHROMA_PORT}")
    
    # Try to initialize database, but continue if it fails (for deployment without DB yet)
    try:
        if settings.DATABASE_URL and "localhost" not in settings.DATABASE_URL:
            await init_db()
            logger.info("Database tables initialised")
        else:
            logger.warning("Database URL not properly configured, skipping DB init")
    except Exception as e:
        logger.warning(f"Database initialization failed: {e}. Continuing without DB...")
    
    yield
    logger.info("Shutting down...")


# ─────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────

app = FastAPI(
    title="Express Entry PR API",
    description="End-to-end Canada Express Entry permanent residence application assistant",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Request / Response Logging Middleware
# ─────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid4())[:8]
    start = time.perf_counter()
    # Log incoming request
    logger.info(
        f"[{request_id}] ▶ {request.method} {request.url.path}"
        + (f"?{request.url.query}" if request.url.query else "")
        + f"  client={request.client.host if request.client else 'unknown'}"
    )
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000
        logger.error(f"[{request_id}] ✗ UNHANDLED {request.method} {request.url.path} — {type(exc).__name__}: {exc}  ({elapsed:.1f}ms)")
        raise
    elapsed = (time.perf_counter() - start) * 1000
    level = "warning" if response.status_code >= 400 else "info"
    getattr(logger, level)(
        f"[{request_id}] {'✓' if response.status_code < 400 else '✗'} "
        f"{request.method} {request.url.path} → {response.status_code}  ({elapsed:.1f}ms)"
    )
    return response

v1 = settings.API_V1_PREFIX


# ─────────────────────────────────────────────
# Auth Routes
# ─────────────────────────────────────────────

@app.post(f"{v1}/auth/register", response_model=TokenResponse, tags=["Auth"])
async def register(request: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    logger.info(f"REGISTER attempt: email={request.email}")
    existing = await db.execute(select(UserDB).where(UserDB.email == request.email))
    if existing.scalar_one_or_none():
        logger.warning(f"REGISTER failed — email already exists: {request.email}")
        raise HTTPException(status_code=400, detail="Email already registered")

    user = UserDB(
        id=uuid4(),
        email=request.email,
        hashed_password=hash_password(request.password),
        full_name=request.full_name,
    )
    db.add(user)
    await db.flush()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    try:
        await notification_service.send_welcome_email(user.email, user.full_name)
    except Exception as e:
        logger.warning(f"Welcome email failed (non-critical): {e}")

    logger.info(f"REGISTER success: user_id={user.id}  email={user.email}")
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@app.post(f"{v1}/auth/login", response_model=TokenResponse, tags=["Auth"])
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserDB).where(UserDB.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning(f"LOGIN failed — bad credentials for: {form_data.username}")
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    user.last_login = datetime.utcnow()
    logger.info(f"LOGIN success: user_id={user.id}  email={user.email}")

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)})
    )


# ─────────────────────────────────────────────
# Applicant Profile Routes
# ─────────────────────────────────────────────

@app.post(f"{v1}/profile", tags=["Profile"])
async def create_profile(
    request: ApplicantProfileRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(
        select(ApplicantDB).where(ApplicantDB.user_id == current_user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Profile already exists. Use PUT to update.")

    from datetime import date as ddate
    dob = ddate.fromisoformat(request.date_of_birth)

    applicant = ApplicantDB(
        id=uuid4(),
        user_id=current_user.id,
        full_name=request.full_name,
        date_of_birth=dob,
        nationality=request.nationality,
        country_of_residence=request.country_of_residence,
        marital_status=request.marital_status,
        has_spouse=request.has_spouse,
        has_provincial_nomination=request.has_provincial_nomination,
        has_sibling_in_canada=request.has_sibling_in_canada,
        has_certificate_of_qualification=request.has_certificate_of_qualification,
        spouse_education_level=request.spouse_education_level,
        spouse_canadian_work_years=request.spouse_canadian_work_years,
        spouse_name=request.spouse_name,
        spouse_dob=ddate.fromisoformat(request.spouse_dob) if request.spouse_dob else None,
        spouse_nationality=request.spouse_nationality,
        spouse_noc_code=request.spouse_noc_code,
    )
    db.add(applicant)
    logger.info(f"PROFILE created: applicant_id={applicant.id}  user_id={current_user.id}")
    return {"id": str(applicant.id), "message": "Profile created successfully"}


@app.put(f"{v1}/profile", tags=["Profile"])
async def update_profile(
    request: ApplicantProfileRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ApplicantDB).where(ApplicantDB.user_id == current_user.id))
    applicant = result.scalar_one_or_none()
    if not applicant:
        raise HTTPException(status_code=404, detail="Profile not found. Use POST to create.")

    from datetime import date as ddate
    applicant.full_name = request.full_name
    applicant.date_of_birth = ddate.fromisoformat(request.date_of_birth)
    applicant.nationality = request.nationality
    applicant.country_of_residence = request.country_of_residence
    applicant.marital_status = request.marital_status
    applicant.has_spouse = request.has_spouse
    applicant.has_provincial_nomination = request.has_provincial_nomination
    applicant.has_sibling_in_canada = request.has_sibling_in_canada
    applicant.has_certificate_of_qualification = request.has_certificate_of_qualification
    # New fields
    if request.city_of_birth is not None:
        applicant.city_of_birth = request.city_of_birth
    if request.province_of_destination is not None:
        applicant.province_of_destination = request.province_of_destination
    if request.passport_number is not None:
        applicant.passport_number = request.passport_number
    if request.passport_country_of_issue is not None:
        applicant.passport_country_of_issue = request.passport_country_of_issue
    if request.passport_issue_date:
        applicant.passport_issue_date = ddate.fromisoformat(request.passport_issue_date)
    if request.passport_expiry_date:
        applicant.passport_expiry_date = ddate.fromisoformat(request.passport_expiry_date)
    # Spouse fields
    applicant.spouse_education_level = request.spouse_education_level
    applicant.spouse_canadian_work_years = request.spouse_canadian_work_years
    applicant.spouse_name = request.spouse_name
    applicant.spouse_dob = ddate.fromisoformat(request.spouse_dob) if request.spouse_dob else None
    applicant.spouse_nationality = request.spouse_nationality
    applicant.spouse_noc_code = request.spouse_noc_code

    logger.info(f"PROFILE updated: applicant_id={applicant.id}  user_id={current_user.id}")
    return {"id": str(applicant.id), "message": "Profile updated successfully"}


@app.get(f"{v1}/profile", tags=["Profile"])
async def get_profile(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ApplicantDB)
        .options(
            selectinload(ApplicantDB.language_tests),
            selectinload(ApplicantDB.work_experiences),
            selectinload(ApplicantDB.education),
            selectinload(ApplicantDB.job_offer),
            selectinload(ApplicantDB.documents),
        )
        .where(ApplicantDB.user_id == current_user.id)
    )
    applicant = result.scalar_one_or_none()
    if not applicant:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Fetch latest CRS breakdown for subcategory display
    history_result = await db.execute(
        select(CrsScoreHistoryDB)
        .where(CrsScoreHistoryDB.applicant_id == applicant.id)
        .order_by(CrsScoreHistoryDB.recorded_at.desc())
        .limit(1)
    )
    latest_history = history_result.scalar_one_or_none()

    # Return as dict so we can attach breakdown
    from sqlalchemy.inspection import inspect as sa_inspect
    data = {c.key: getattr(applicant, c.key) for c in sa_inspect(applicant).mapper.column_attrs}
    data['id'] = str(data['id'])
    data['user_id'] = str(data['user_id'])

    # Attach sub-category breakdown if available
    if latest_history and latest_history.breakdown_json:
        data['crs_breakdown'] = latest_history.breakdown_json

    # Attach relationships
    data['language_tests'] = [
        {c.key: getattr(lt, c.key) for c in sa_inspect(lt).mapper.column_attrs}
        for lt in (applicant.language_tests or [])
    ]
    data['work_experiences'] = [
        {c.key: getattr(w, c.key) for c in sa_inspect(w).mapper.column_attrs}
        for w in (applicant.work_experiences or [])
    ]
    data['education'] = (
        {c.key: getattr(applicant.education, c.key) for c in sa_inspect(applicant.education).mapper.column_attrs}
        if applicant.education else None
    )
    data['job_offer'] = (
        {c.key: getattr(applicant.job_offer, c.key) for c in sa_inspect(applicant.job_offer).mapper.column_attrs}
        if applicant.job_offer else None
    )

    # Serialize dates/uuids
    import uuid as _uuid
    from datetime import date as _date, datetime as _datetime
    def serialize(v):
        if isinstance(v, (_uuid.UUID,)): return str(v)
        if isinstance(v, (_datetime, _date)): return v.isoformat()
        return v

    def deep_serialize(obj):
        if isinstance(obj, dict):
            return {k: deep_serialize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [deep_serialize(i) for i in obj]
        return serialize(obj)

    return deep_serialize(data)


# ─────────────────────────────────────────────
# Language Tests
# ─────────────────────────────────────────────

@app.post(f"{v1}/profile/language-tests", tags=["Profile"])
async def add_language_test(
    request: LanguageTestRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)

    from datetime import date as ddate
    test_date = ddate.fromisoformat(request.test_date)

    # Auto-convert to CLB
    clb = _convert_to_clb(request.test_type, request.reading, request.writing,
                           request.speaking, request.listening)

    lang_test = LanguageTestDB(
        id=uuid4(),
        applicant_id=applicant.id,
        test_type=request.test_type.lower(),
        role=request.role,
        language=request.language,
        reading=request.reading,
        writing=request.writing,
        speaking=request.speaking,
        listening=request.listening,
        test_date=test_date,
        registration_number=request.registration_number,
        clb_speaking=clb.speaking,
        clb_listening=clb.listening,
        clb_reading=clb.reading,
        clb_writing=clb.writing,
    )
    db.add(lang_test)
    await db.commit()
    await db.refresh(lang_test)
    logger.info(f"LANGUAGE_TEST added: id={lang_test.id}  type={request.test_type}  CLB R={clb.reading} W={clb.writing} L={clb.listening} S={clb.speaking}  user_id={current_user.id}")
    return {"id": str(lang_test.id), "clb": {"speaking": clb.speaking, "listening": clb.listening,
                                               "reading": clb.reading, "writing": clb.writing}}


# ─────────────────────────────────────────────
# Work Experience
# ─────────────────────────────────────────────

@app.post(f"{v1}/profile/work-experience", tags=["Profile"])
async def add_work_experience(
    request: WorkExperienceRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    from datetime import date as ddate

    work = WorkExperienceDB(
        id=uuid4(),
        applicant_id=applicant.id,
        noc_code=request.noc_code,
        noc_title=request.noc_title,
        teer_level=request.teer_level,
        experience_type=request.experience_type,
        employer_name=request.employer_name,
        job_title=request.job_title,
        start_date=ddate.fromisoformat(request.start_date),
        end_date=ddate.fromisoformat(request.end_date) if request.end_date else None,
        hours_per_week=request.hours_per_week,
        is_current=request.is_current,
    )
    db.add(work)
    await db.commit()
    await db.refresh(work)
    logger.info(f"WORK_EXP added: id={work.id}  noc={request.noc_code}  type={request.experience_type}  user_id={current_user.id}")
    return {"id": str(work.id), "message": "Work experience added"}


@app.delete(f"{v1}/profile/language-tests/{{test_id}}", tags=["Profile"])
async def delete_language_test(
    test_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(LanguageTestDB).where(
            LanguageTestDB.id == test_id,
            LanguageTestDB.applicant_id == applicant.id
        )
    )
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Language test not found")
    await db.delete(test)
    logger.info(f"LANGUAGE_TEST deleted: id={test_id}  user_id={current_user.id}")
    return {"message": "Language test deleted"}


@app.put(f"{v1}/profile/language-tests/{{test_id}}", tags=["Profile"])
async def update_language_test(
    test_id: UUID,
    request: LanguageTestRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(LanguageTestDB).where(
            LanguageTestDB.id == test_id,
            LanguageTestDB.applicant_id == applicant.id
        )
    )
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Language test not found")

    from datetime import date as ddate
    clb = _convert_to_clb(request.test_type, request.reading, request.writing,
                           request.speaking, request.listening)

    test.test_type         = request.test_type
    test.role              = request.role
    test.language          = request.language
    test.reading           = request.reading
    test.writing           = request.writing
    test.speaking          = request.speaking
    test.listening         = request.listening
    test.test_date         = ddate.fromisoformat(request.test_date)
    test.registration_number = request.registration_number
    test.clb_speaking      = clb.speaking
    test.clb_listening     = clb.listening
    test.clb_reading       = clb.reading
    test.clb_writing       = clb.writing

    await db.commit()
    await db.refresh(test)
    logger.info(f"LANGUAGE_TEST updated: id={test_id}  type={request.test_type}  CLB R={clb.reading} W={clb.writing} L={clb.listening} S={clb.speaking}  user_id={current_user.id}")
    return {"id": str(test.id), "clb": {"speaking": clb.speaking, "listening": clb.listening,
                                         "reading": clb.reading, "writing": clb.writing}}


# ─────────────────────────────────────────────
# Spouse Language Test
# ─────────────────────────────────────────────

class SpouseLanguageTestRequest(BaseModel):
    test_type: str      # ielts | celpip | tef | tcf
    reading:   float
    writing:   float
    speaking:  float
    listening: float
    test_date: str

@app.post(f"{v1}/profile/spouse-language-test", tags=["Profile"])
async def save_spouse_language_test(
    request: SpouseLanguageTestRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)

    from datetime import date as ddate
    test_date = ddate.fromisoformat(request.test_date)

    clb = _convert_to_clb(request.test_type, request.reading, request.writing,
                           request.speaking, request.listening)

    # Upsert — delete existing then insert
    existing = await db.execute(
        select(SpouseLanguageTestDB).where(SpouseLanguageTestDB.applicant_id == applicant.id)
    )
    existing_test = existing.scalar_one_or_none()
    if existing_test:
        await db.delete(existing_test)
        await db.flush()

    spouse_test = SpouseLanguageTestDB(
        id=uuid4(),
        applicant_id=applicant.id,
        test_type=request.test_type.lower(),
        reading=request.reading,
        writing=request.writing,
        speaking=request.speaking,
        listening=request.listening,
        clb_speaking=clb.speaking,
        clb_listening=clb.listening,
        clb_reading=clb.reading,
        clb_writing=clb.writing,
        test_date=test_date,
    )
    db.add(spouse_test)
    await db.commit()
    await db.refresh(spouse_test)
    logger.info(f"SPOUSE_LANGUAGE_TEST saved: applicant_id={applicant.id}  CLB R={clb.reading} W={clb.writing} L={clb.listening} S={clb.speaking}")
    return {
        "id": str(spouse_test.id),
        "clb": {"speaking": clb.speaking, "listening": clb.listening,
                "reading": clb.reading, "writing": clb.writing}
    }

@app.get(f"{v1}/profile/spouse-language-test", tags=["Profile"])
async def get_spouse_language_test(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(SpouseLanguageTestDB).where(SpouseLanguageTestDB.applicant_id == applicant.id)
    )
    test = result.scalar_one_or_none()
    if not test:
        return None
    return {
        "id": str(test.id),
        "test_type": test.test_type,
        "reading": test.reading,
        "writing": test.writing,
        "speaking": test.speaking,
        "listening": test.listening,
        "test_date": test.test_date.isoformat(),
        "clb": {"speaking": test.clb_speaking, "listening": test.clb_listening,
                "reading": test.clb_reading, "writing": test.clb_writing},
    }

@app.delete(f"{v1}/profile/spouse-language-test", tags=["Profile"])
async def delete_spouse_language_test(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(SpouseLanguageTestDB).where(SpouseLanguageTestDB.applicant_id == applicant.id)
    )
    test = result.scalar_one_or_none()
    if test:
        await db.delete(test)
        await db.commit()
    return {"message": "Spouse language test deleted"}


@app.delete(f"{v1}/profile/work-experience/{{work_id}}", tags=["Profile"])
async def delete_work_experience(
    work_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(WorkExperienceDB).where(
            WorkExperienceDB.id == work_id,
            WorkExperienceDB.applicant_id == applicant.id
        )
    )
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work experience not found")
    await db.delete(work)
    logger.info(f"WORK_EXP deleted: id={work_id}  user_id={current_user.id}")
    return {"message": "Work experience deleted"}


@app.put(f"{v1}/profile/work-experience/{{work_id}}", tags=["Profile"])
async def update_work_experience(
    work_id: UUID,
    request: WorkExperienceRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(WorkExperienceDB).where(
            WorkExperienceDB.id == work_id,
            WorkExperienceDB.applicant_id == applicant.id
        )
    )
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work experience not found")

    from datetime import date as ddate
    work.noc_code        = request.noc_code
    work.noc_title       = request.noc_title
    work.teer_level      = request.teer_level
    work.experience_type = request.experience_type
    work.employer_name   = request.employer_name
    work.job_title       = request.job_title
    work.start_date      = ddate.fromisoformat(request.start_date)
    work.end_date        = ddate.fromisoformat(request.end_date) if request.end_date else None
    work.hours_per_week  = request.hours_per_week
    work.is_current      = request.is_current

    await db.commit()
    await db.refresh(work)
    logger.info(f"WORK_EXP updated: id={work_id}  noc={request.noc_code}  user_id={current_user.id}")
    return {"id": str(work.id), "message": "Work experience updated"}


@app.post(f"{v1}/profile/education", tags=["Profile"])
async def set_education(
    request: EducationRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    from datetime import date as ddate

    # Upsert — replace existing education if present
    result = await db.execute(
        select(EducationDB).where(EducationDB.applicant_id == applicant.id)
    )
    edu = result.scalar_one_or_none()

    completion = ddate.fromisoformat(request.completion_date) if request.completion_date else None

    if edu:
        edu.level = request.level
        edu.field_of_study = request.field_of_study
        edu.institution_name = request.institution_name
        edu.country = request.country
        edu.is_canadian = request.is_canadian
        edu.is_three_year_or_more = request.is_three_year_or_more
        edu.completion_date = completion
        edu.eca_organization = request.eca_organization
        edu.eca_reference_number = request.eca_reference_number
    else:
        edu = EducationDB(
            id=uuid4(),
            applicant_id=applicant.id,
            level=request.level,
            field_of_study=request.field_of_study,
            institution_name=request.institution_name,
            country=request.country,
            is_canadian=request.is_canadian,
            is_three_year_or_more=request.is_three_year_or_more,
            completion_date=completion,
            eca_organization=request.eca_organization,
            eca_reference_number=request.eca_reference_number,
        )
        db.add(edu)
    await db.commit()
    await db.refresh(edu)
    logger.info(f"EDUCATION saved: id={edu.id}  level={request.level}  canadian={request.is_canadian}  user_id={current_user.id}")
    return {"id": str(edu.id), "message": "Education saved"}


@app.post(f"{v1}/profile/job-offer", tags=["Profile"])
async def set_job_offer(
    request: JobOfferRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)

    # Upsert — replace existing job offer if present
    result = await db.execute(
        select(JobOfferDB).where(JobOfferDB.applicant_id == applicant.id)
    )
    offer = result.scalar_one_or_none()

    if offer:
        offer.employer_name = request.employer_name
        offer.noc_code = request.noc_code
        offer.teer_level = request.teer_level
        offer.is_lmia_exempt = request.is_lmia_exempt
        offer.lmia_number = request.lmia_number
        offer.annual_salary = request.annual_salary
    else:
        offer = JobOfferDB(
            id=uuid4(),
            applicant_id=applicant.id,
            employer_name=request.employer_name,
            noc_code=request.noc_code,
            teer_level=request.teer_level,
            is_lmia_exempt=request.is_lmia_exempt,
            lmia_number=request.lmia_number,
            annual_salary=request.annual_salary,
        )
        db.add(offer)
    await db.commit()
    await db.refresh(offer)
    logger.info(f"JOB_OFFER saved: id={offer.id}  noc={request.noc_code}  teer={request.teer_level}  user_id={current_user.id}")
    return {"id": str(offer.id), "message": "Job offer saved"}


# ─────────────────────────────────────────────
# CRS Calculator
# ─────────────────────────────────────────────

@app.post(f"{v1}/crs/calculate", tags=["CRS"])
async def calculate_crs(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant_db = await _get_applicant_full(current_user.id, db)
    applicant = _db_to_domain(applicant_db)

    logger.info(f"CRS calculating for user_id={current_user.id}")
    score, breakdown = crs_calculator.calculate(applicant)
    eligibility = crs_calculator.check_eligibility(applicant)

    # Persist CRS history
    history = CrsScoreHistoryDB(
        id=uuid4(),
        applicant_id=applicant_db.id,
        total_score=score.total,
        core_human_capital=score.core_human_capital,
        spouse_factors=score.spouse_factors,
        skill_transferability=score.skill_transferability,
        additional_points=score.additional_points,
        breakdown_json=vars(breakdown),
    )
    db.add(history)

    # Update applicant CRS
    applicant_db.crs_score_json = score.breakdown()
    applicant_db.eligible_programs = [p.value for p in eligibility["eligible_programs"]]

    await db.commit()
    eligible_programs = [p.value for p in eligibility["eligible_programs"]]
    logger.info(f"CRS calculated: total={score.total}  core={score.core_human_capital}  transferability={score.skill_transferability}  additional={score.additional_points}  programs={eligible_programs}  user_id={current_user.id}")
    return {
        "score": score.breakdown(),
        "breakdown": vars(breakdown),
        "eligibility": {
            "eligible_programs": [p.value for p in eligibility["eligible_programs"]],
            "reasons": {k.value: v for k, v in eligibility["reasons"].items()}
        }
    }


@app.get(f"{v1}/crs/history", tags=["CRS"])
async def get_crs_history(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(CrsScoreHistoryDB)
        .where(CrsScoreHistoryDB.applicant_id == applicant.id)
        .order_by(CrsScoreHistoryDB.recorded_at.desc())
        .limit(50)
    )
    return result.scalars().all()


# ─────────────────────────────────────────────
# Document Upload + AI Processing
# ─────────────────────────────────────────────

@app.post(f"{v1}/documents/upload", tags=["Documents"])
async def upload_document(
    document_type: str = Form(...),
    person_label: str = Form(default="applicant"),   # applicant | spouse | child_1 | child_2 | child_3
    person_note: str = Form(default=""),             # e.g. "John Smith", "Eldest child"
    file: UploadFile = File(...),
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)

    # Validate file type
    allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/tiff"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PDF, JPEG, PNG, TIFF files are accepted")

    file_bytes = await file.read()

    # Upload to Blob Storage (falls back to local disk if Azure not configured)
    try:
        blob_url = await blob_storage.upload(
            container=settings.AZURE_STORAGE_CONTAINER,
            blob_name=f"{applicant.id}/{document_type}/{person_label}/{uuid4()}/{_safe_blob_name(file.filename)}",
            data=file_bytes,
            content_type=file.content_type
        )
    except Exception as e:
        logger.error(f"Blob storage upload failed for user_id={current_user.id}  file={file.filename}  type={document_type}: {e}")
        raise HTTPException(status_code=500, detail=f"File storage error: {e}")

    # Create document record
    doc = ApplicationDocumentDB(
        id=uuid4(),
        applicant_id=applicant.id,
        document_type=document_type,
        person_label=person_label,
        person_note=person_note,
        file_name=file.filename,
        blob_url=blob_url,
        file_size_bytes=len(file_bytes),
        mime_type=file.content_type,
        status="ai_processing",
    )
    db.add(doc)
    await db.flush()
    await db.commit()   # ← commit BEFORE firing Celery so the worker sees the record

    # Trigger AI analysis asynchronously via Celery (non-blocking)
    celery_ok = False
    try:
        from workers.tasks import analyze_document_task
        # Small countdown gives Azure a moment to propagate the blob
        analyze_document_task.apply_async(
            args=[str(doc.id), document_type, blob_url, file.content_type],
            countdown=5  # wait 5s before worker picks it up
        )
        celery_ok = True
    except Exception as e:
        logger.warning(f"Celery unavailable — running basic sync validation for doc_id={doc.id}: {e}")

    # If Celery unavailable, run lightweight sync validation so status doesn't get stuck
    if not celery_ok:
        issues = []
        from datetime import date as _date
        today = _date.today()

        # Check expiry for passport
        if document_type == "passport":
            issues.append({"severity": "info", "message": "Passport uploaded — please verify expiry date manually."})

        # Check expiry for IELTS (valid 2 years)
        if document_type == "language_test_result":
            issues.append({"severity": "info", "message": "Language test uploaded — ensure test date is within 2 years of your Express Entry profile submission."})

        doc.status = "ai_reviewed"
        doc.ai_review_notes = "Basic validation complete. Full AI analysis unavailable (Celery/Azure not configured)."
        doc.ai_issues = issues
        doc.ai_confidence = 0.5

    logger.info(f"DOCUMENT uploaded: doc_id={doc.id}  type={document_type}  person={person_label}  file={file.filename}  size={len(file_bytes)}B  user_id={current_user.id}")
    return {
        "document_id": str(doc.id),
        "status": "ai_processing",
        "message": "Document uploaded. AI analysis started in background."
    }


@app.get(f"{v1}/documents", tags=["Documents"])
async def get_documents(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(ApplicationDocumentDB)
        .where(ApplicationDocumentDB.applicant_id == applicant.id)
        .order_by(ApplicationDocumentDB.uploaded_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id":               str(d.id),
            "document_type":    d.document_type,
            "person_label":     d.person_label,
            "person_note":      d.person_note,
            "file_name":        d.file_name,
            "file_size_bytes":  d.file_size_bytes,
            "mime_type":        d.mime_type,
            "status":           d.status,
            "uploaded_at":      d.uploaded_at.isoformat() if d.uploaded_at else None,
            "ai_confidence":    d.ai_confidence,
            "ai_review_notes":  d.ai_review_notes,
            "ai_issues":        d.ai_issues or [],
            "ai_extracted_fields": d.ai_extracted_fields,
            "has_issues":       bool(d.ai_issues),
            "issue_count":      len(d.ai_issues) if d.ai_issues else 0,
        }
        for d in docs
    ]


@app.get(f"{v1}/documents/{{document_id}}/review", tags=["Documents"])
async def get_ai_document_review(
    document_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    doc = await db.get(ApplicationDocumentDB, document_id)
    # FIX: Ownership check — prevent documents leaking between users
    if not doc or doc.applicant_id != applicant.id:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "status": doc.status,
        "file_name": doc.file_name,
        "document_type": doc.document_type,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
        "file_size_bytes": doc.file_size_bytes,
        "ai_extracted_fields": doc.ai_extracted_fields,
        "ai_confidence": doc.ai_confidence,
        "ai_review_notes": doc.ai_review_notes,
        "ai_issues": doc.ai_issues,
    }


@app.get(f"{v1}/documents/{{document_id}}/preview", tags=["Documents"])
async def get_document_preview(
    document_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return raw document bytes for client-side preview (images + PDFs)."""
    from fastapi.responses import Response
    applicant = await _get_applicant(current_user.id, db)
    doc = await db.get(ApplicationDocumentDB, document_id)
    if not doc or doc.applicant_id != applicant.id:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.blob_url:
        raise HTTPException(status_code=404, detail="No file stored for this document")
    try:
        file_bytes = await blob_storage.download(doc.blob_url)
        return Response(
            content=file_bytes,
            media_type=doc.mime_type or "application/octet-stream",
            headers={"Cache-Control": "private, max-age=3600"}
        )
    except Exception as e:
        logger.error(f"Document preview error doc_id={document_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not load document preview")


@app.post(f"{v1}/documents/{{document_id}}/re-review", tags=["Documents"])
async def re_review_document(
    document_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Re-trigger AI analysis on a document — use after updating profile to clear stale issues."""
    from sqlalchemy.orm.attributes import flag_modified

    applicant = await _get_applicant(current_user.id, db)
    doc = await db.get(ApplicationDocumentDB, document_id)
    if not doc or str(doc.applicant_id) != str(applicant.id):
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.blob_url:
        raise HTTPException(status_code=400, detail="No file stored for this document")

    try:
        # Reset status — flag_modified needed for SQLAlchemy to detect JSON field changes
        doc.status = "ai_processing"
        doc.ai_review_notes = ""          # NOT NULL column — use empty string not None
        doc.ai_issues = []
        doc.ai_extracted_fields = None
        doc.ai_confidence = None
        flag_modified(doc, "ai_issues")
        flag_modified(doc, "ai_extracted_fields")
        await db.commit()
    except Exception as e:
        logger.error(f"re-review DB reset failed doc_id={document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    # Re-dispatch Celery task
    try:
        from workers.tasks import analyze_document_task
        analyze_document_task.apply_async(
            args=[str(doc.id), doc.document_type, doc.blob_url, doc.mime_type],
            countdown=2
        )
        logger.info(f"re-review triggered: doc_id={doc.id}  type={doc.document_type}  user={current_user.id}")
    except Exception as e:
        logger.warning(f"Celery unavailable for re-review doc_id={doc.id}: {e}")
        raise HTTPException(status_code=503, detail="AI worker unavailable — try again later")

    return {"status": "ai_processing", "message": "Re-analysis started. Results will appear in ~30 seconds."}


@app.delete(f"{v1}/documents/{{document_id}}", tags=["Documents"])
async def delete_document(
    document_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    doc = await db.get(ApplicationDocumentDB, document_id)
    if not doc or doc.applicant_id != applicant.id:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    logger.info(f"DOCUMENT deleted: doc_id={document_id}  user_id={current_user.id}")
    return {"message": "Document deleted"}


# ─────────────────────────────────────────────
# Draw Tracker
# ─────────────────────────────────────────────

@app.get(f"{v1}/draws", tags=["Draws"])
async def get_draws(
    limit: int = Query(default=50, le=200),
    draw_type: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db)
):
    query = select(DrawDB).order_by(DrawDB.draw_date.desc()).limit(limit)
    if draw_type and draw_type != "all":
        query = query.where(DrawDB.draw_type == draw_type)
    result = await db.execute(query)
    return result.scalars().all()


@app.get(f"{v1}/draws/types", tags=["Draws"])
async def get_draw_types(db: AsyncSession = Depends(get_db)):
    """Return all unique draw types with stats for each."""
    result = await db.execute(select(DrawDB).order_by(DrawDB.draw_date.desc()).limit(200))
    draws = result.scalars().all()

    from collections import defaultdict
    by_type = defaultdict(list)
    for d in draws:
        by_type[d.draw_type].append(d)

    # Human-readable labels
    TYPE_LABELS = {
        "FSW":        {"label": "Federal Skilled Worker",    "icon": "🌐", "color": "blue"},
        "CEC":        {"label": "Canadian Experience Class", "icon": "🍁", "color": "maple"},
        "FST":        {"label": "Federal Skilled Trades",    "icon": "🔧", "color": "amber"},
        "PNP":        {"label": "Provincial Nominee",        "icon": "🏛️",  "color": "purple"},
        "FRENCH":     {"label": "French Language",           "icon": "🇫🇷", "color": "green"},
        "STEM":       {"label": "STEM Occupations",          "icon": "🔬", "color": "cyan"},
        "HEALTHCARE": {"label": "Healthcare",                "icon": "🏥", "color": "rose"},
        "TRADE":      {"label": "Trades Occupations",        "icon": "🔨", "color": "orange"},
        "TRANSPORT":  {"label": "Transport Occupations",     "icon": "🚛", "color": "yellow"},
        "AGRICULTURE":{"label": "Agriculture",               "icon": "🌾", "color": "lime"},
        "GENERAL":    {"label": "General Round",             "icon": "✨", "color": "slate"},
    }

    summary = []
    for draw_type, type_draws in sorted(by_type.items(), key=lambda x: x[1][0].draw_date, reverse=True):
        crs_scores = [d.minimum_crs for d in type_draws if d.minimum_crs]
        invites = [d.invitations_issued for d in type_draws if d.invitations_issued]
        meta = TYPE_LABELS.get(draw_type.upper(), {"label": draw_type, "icon": "📋", "color": "slate"})
        summary.append({
            "draw_type": draw_type,
            "label": meta["label"],
            "icon": meta["icon"],
            "color": meta["color"],
            "total_draws": len(type_draws),
            "latest_date": type_draws[0].draw_date.isoformat() if type_draws else None,
            "latest_crs": type_draws[0].minimum_crs if type_draws else None,
            "avg_crs": round(sum(crs_scores) / len(crs_scores), 1) if crs_scores else None,
            "lowest_crs": min(crs_scores) if crs_scores else None,
            "avg_invitations": round(sum(invites) / len(invites)) if invites else None,
            "recent_trend": "rising" if len(crs_scores) >= 2 and crs_scores[0] > crs_scores[1] else
                            "falling" if len(crs_scores) >= 2 and crs_scores[0] < crs_scores[1] else "stable",
        })
    return summary


@app.get(f"{v1}/draws/eligibility", tags=["Draws"])
async def get_draw_eligibility(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return which draw types the user is eligible for and how close they are to each."""
    try:
        applicant = await _get_applicant(current_user.id, db)
        crs_score = applicant.crs_score_json.get("total", 0) if applicant.crs_score_json else 0
        eligible_programs = applicant.eligible_programs or []

        # Fetch latest draw per type
        result = await db.execute(select(DrawDB).order_by(DrawDB.draw_date.desc()).limit(200))
        all_draws = result.scalars().all()

        from collections import defaultdict
        latest_by_type = {}
        for d in all_draws:
            if d.draw_type not in latest_by_type:
                latest_by_type[d.draw_type] = d

        eligibility = []
        for draw_type, latest in latest_by_type.items():
            gap = latest.minimum_crs - crs_score if latest.minimum_crs else None
            # Determine program eligibility
            is_eligible_program = (
                (draw_type.upper() == "FSW" and "FSW" in eligible_programs) or
                (draw_type.upper() == "CEC" and "CEC" in eligible_programs) or
                (draw_type.upper() == "FST" and "FST" in eligible_programs) or
                draw_type.upper() in ("FRENCH", "PNP", "GENERAL", "STEM", "HEALTHCARE", "TRADE", "TRANSPORT", "AGRICULTURE")
            )
            eligibility.append({
                "draw_type": draw_type,
                "latest_crs": latest.minimum_crs,
                "your_crs": crs_score,
                "gap": gap,
                "status": "eligible" if gap is not None and gap <= 0 else
                          "close" if gap is not None and gap <= 50 else "not_yet",
                "program_eligible": is_eligible_program,
                "latest_date": latest.draw_date.isoformat(),
            })

        eligibility.sort(key=lambda x: (x["gap"] or 999))
        return {"crs_score": crs_score, "eligible_programs": eligible_programs, "draw_types": eligibility}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draw eligibility error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{v1}/draws/stats", tags=["Draws"])
async def get_draw_statistics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DrawDB).order_by(DrawDB.draw_date.desc()).limit(50)
    )
    draws = result.scalars().all()

    if not draws:
        return {}

    crs_scores = [d.minimum_crs for d in draws]
    return {
        "total_draws": len(draws),
        "latest_draw_crs": draws[0].minimum_crs if draws else 0,
        "average_crs_last_10": sum(crs_scores[:10]) / min(10, len(crs_scores)),
        "lowest_crs_ever": min(crs_scores),
        "highest_crs_ever": max(crs_scores),
        "total_invitations_last_10": sum(d.invitations_issued for d in draws[:10]),
        "draw_frequency_days": "14",
    }



# ─────────────────────────────────────────────
# Application Case (Post-ITA)
# ─────────────────────────────────────────────

@app.post(f"{v1}/cases/ita-received", tags=["Cases"])
async def record_ita_received(
    draw_id: Optional[UUID] = None,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)

    case = ApplicationCaseDB(
        id=uuid4(),
        applicant_id=applicant.id,
        draw_id=draw_id,
        status="ita_received",
        ita_received_date=datetime.utcnow(),
    )
    db.add(case)
    await db.flush()

    # Generate AI checklist — fail gracefully if AI not configured
    sort_order = 0
    try:
        applicant_domain = _db_to_domain(applicant)
        checklist_sections = await checklist_generator.generate_checklist(applicant_domain)
        for section in checklist_sections:
            for item in section.get("items", []):
                checklist_item = ChecklistItemDB(
                    id=uuid4(),
                    case_id=case.id,
                    section=section.get("section", ""),
                    title=item.get("title", ""),
                    description=item.get("description", ""),
                    document_type=item.get("document_type"),
                    is_required=item.get("is_required", True),
                    tips=item.get("tips", ""),
                    common_mistakes=item.get("common_mistakes", []),
                    sort_order=sort_order,
                    due_date=case.ita_received_date.date() + __import__("datetime").timedelta(days=55),
                )
                db.add(checklist_item)
                sort_order += 1
    except Exception as e:
        logger.warning(f"AI checklist generation failed (checklist will be empty): {e}")
        # Add a basic fallback checklist item so the UI isn't completely empty
        fallback_items = [
            ("Identity Documents", "Valid Passport", "passport"),
            ("Language Tests", "Language Test Results (IELTS/CELPIP)", "language_test_result"),
            ("Education", "Education Credentials + ECA", "education_credential"),
            ("Work History", "Employment Reference Letters", "employment_letter"),
            ("Police Certificates", "Police Certificate from each country", "police_certificate"),
            ("Medical", "Medical Exam by IRCC Physician", "medical_exam"),
        ]
        for section, title, doc_type in fallback_items:
            checklist_item = ChecklistItemDB(
                id=uuid4(),
                case_id=case.id,
                section=section,
                title=title,
                document_type=doc_type,
                is_required=True,
                sort_order=sort_order,
                due_date=case.ita_received_date.date() + __import__("datetime").timedelta(days=55),
            )
            db.add(checklist_item)
            sort_order += 1

    # Schedule deadline reminders via Celery (non-blocking — may fail if Celery not running)
    try:
        from workers.tasks import schedule_ita_reminders
        schedule_ita_reminders.delay(str(current_user.id), str(case.id))
    except Exception as e:
        logger.warning(f"Celery unavailable — ITA reminders not scheduled for case_id={case.id}: {e}")

    logger.info(f"ITA recorded: case_id={case.id}  checklist_items={sort_order}  user_id={current_user.id}")
    return {
        "case_id": str(case.id),
        "ita_deadline": (datetime.utcnow() + __import__("datetime").timedelta(days=60)).isoformat(),
        "checklist_items_created": sort_order,
        "message": "ITA recorded. Personalized checklist generated. Reminders scheduled."
    }


@app.get(f"{v1}/cases/active", tags=["Cases"])
async def get_active_case(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    result = await db.execute(
        select(ApplicationCaseDB)
        .options(
            selectinload(ApplicationCaseDB.checklist_items),
            selectinload(ApplicationCaseDB.timeline)
        )
        .where(ApplicationCaseDB.applicant_id == applicant.id)
        .order_by(ApplicationCaseDB.created_at.desc())
        .limit(1)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="No active case found")

    deadline = None
    if case.ita_received_date:
        deadline = case.ita_received_date + timedelta(days=60)

    return {
        "case": case,
        "ita_deadline": deadline.isoformat() if deadline else None,
        "days_remaining": (deadline - datetime.utcnow()).days if deadline else None,
        "checklist_progress": {
            "total": len(case.checklist_items),
            "completed": sum(1 for i in case.checklist_items if i.is_completed),
            "required": sum(1 for i in case.checklist_items if i.is_required and not i.is_not_applicable),
        }
    }


@app.patch(f"{v1}/cases/checklist/{{item_id}}", tags=["Cases"])
async def update_checklist_item(
    item_id: UUID,
    is_completed: bool,
    notes: str = "",
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    item = await db.get(ChecklistItemDB, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.is_completed = is_completed
    if notes:
        item.notes = notes
    if is_completed:
        item.completed_at = datetime.utcnow()
    return {"message": "Updated"}


@app.patch(f"{v1}/cases/{{case_id}}/status", tags=["Cases"])
async def update_case_status(
    case_id: UUID,
    status: str,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    applicant = await _get_applicant(current_user.id, db)
    case = await db.get(ApplicationCaseDB, case_id)
    if not case or case.applicant_id != applicant.id:
        raise HTTPException(status_code=404, detail="Case not found")
    valid_statuses = ["in_pool", "ita_received", "application_submitted", "approved", "refused", "withdrawn"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    logger.info(f"CASE status updated: case_id={case_id}  status={status}  user_id={current_user.id}")
    case.status = status
    return {"message": "Case status updated", "status": status}


# ─────────────────────────────────────────────
# AI Routes
# ─────────────────────────────────────────────

@app.post(f"{v1}/ai/noc-finder", tags=["AI"])
async def find_noc_codes(
    request: NocFinderRequest,
    current_user: UserDB = Depends(get_current_user)
):
    try:
        logger.info(f"NOC_FINDER: job_title={request.job_title!r}  country={request.country}  user_id={current_user.id}")
        suggestions = await noc_finder.find_noc_codes(
            request.job_title, request.job_duties, request.country
        )
        logger.info(f"NOC_FINDER: returned {len(suggestions)} suggestions  user_id={current_user.id}")
        return {"suggestions": suggestions}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {e}")
    except Exception as e:
        logger.error(f"NOC finder error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.get(f"{v1}/ai/crs-improvements", tags=["AI"])
async def get_crs_improvements(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant_db = await _get_applicant_full(current_user.id, db)
        applicant = _db_to_domain(applicant_db)
        current_score = applicant_db.crs_score_json.get("total", 0) if applicant_db.crs_score_json else 0
        suggestions = await crs_predictor.get_improvement_suggestions(applicant, current_score)
        return {"suggestions": suggestions}
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {e}")
    except Exception as e:
        logger.error(f"CRS improvements error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.get(f"{v1}/ai/draw-prediction", tags=["AI"])
async def get_draw_prediction(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant_db = await _get_applicant(current_user.id, db)
        current_score = applicant_db.crs_score_json.get("total", 0) if applicant_db.crs_score_json else 0
        programs = applicant_db.eligible_programs or []

        draws_result = await db.execute(
            select(DrawDB).order_by(DrawDB.draw_date.desc()).limit(20)
        )
        draws = draws_result.scalars().all()
        draws_data = [
            {"number": d.draw_number, "date": d.draw_date.date().isoformat(),
             "min_crs": d.minimum_crs, "type": d.draw_type, "invitations": d.invitations_issued}
            for d in draws
        ]

        prediction = await crs_predictor.predict_invitation(
            current_score, draws_data, ", ".join(programs)
        )
        return prediction
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {e}")
    except Exception as e:
        logger.error(f"Draw prediction error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.get(f"{v1}/ai/chat", tags=["AI"])
async def chat_stream(
    message: str = Query(...),
    session_id: str = Query(...),
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> StreamingResponse:
    """Streaming AI chat endpoint"""
    applicant_db = await _get_applicant_full(current_user.id, db)
    applicant = _db_to_domain(applicant_db)

    # Load chat history for session
    history_result = await db.execute(
        select(AiChatMessageDB)
        .where(AiChatMessageDB.applicant_id == applicant_db.id)
        .where(AiChatMessageDB.session_id == session_id)
        .order_by(AiChatMessageDB.created_at.asc())
        .limit(20)
    )
    history = [{"role": m.role, "content": m.content} for m in history_result.scalars().all()]

    # Save user message
    user_msg = AiChatMessageDB(
        id=uuid4(),
        applicant_id=applicant_db.id,
        session_id=session_id,
        role="user",
        content=message,
    )
    db.add(user_msg)
    await db.commit()

    async def generate():
        full_response = ""
        try:
            async for chunk in ai_assistant.stream_answer(message, applicant, history):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except RuntimeError as e:
            yield f"data: {json.dumps({'error': f'AI service unavailable: {e}'})}\n\n"
        except Exception as e:
            import traceback; logger.error(f"Chat stream error: {type(e).__name__}: {e}\n{traceback.format_exc()}")
            yield f"data: {json.dumps({'error': 'AI service temporarily unavailable'})}\n\n"
        finally:
            if full_response:
                # Save assistant response
                async with AsyncSessionLocal() as save_db:
                    assistant_msg = AiChatMessageDB(
                        id=uuid4(),
                        applicant_id=applicant_db.id,
                        session_id=session_id,
                        role="assistant",
                        content=full_response,
                    )
                    save_db.add(assistant_msg)
                    await save_db.commit()

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ─────────────────────────────────────────────
# Notifications
# ─────────────────────────────────────────────

@app.get(f"{v1}/notifications", tags=["Notifications"])
async def get_notifications(
    unread_only: bool = False,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(NotificationDB).where(NotificationDB.user_id == current_user.id)
    if unread_only:
        query = query.where(NotificationDB.is_read == False)
    query = query.order_by(NotificationDB.created_at.desc()).limit(50)
    result = await db.execute(query)
    return result.scalars().all()


@app.patch(f"{v1}/notifications/{{notification_id}}/read", tags=["Notifications"])
async def mark_notification_read(
    notification_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    notif = await db.get(NotificationDB, notification_id)
    if notif and notif.user_id == current_user.id:
        notif.is_read = True
        notif.read_at = datetime.utcnow()
    return {"message": "Marked as read"}


@app.post(f"{v1}/notifications/mark-all-read", tags=["Notifications"])
async def mark_all_notifications_read(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(NotificationDB).where(
            NotificationDB.user_id == current_user.id,
            NotificationDB.is_read == False
        )
    )
    notifications = result.scalars().all()
    now = datetime.utcnow()
    for n in notifications:
        n.is_read = True
        n.read_at = now
    logger.info(f"NOTIFICATIONS mark-all-read: count={len(notifications)}  user_id={current_user.id}")
    return {"message": f"Marked {len(notifications)} notifications as read"}


# ─────────────────────────────────────────────
# WebSocket — Real-time Draw Alerts
# ─────────────────────────────────────────────

@app.websocket("/ws/draws/{user_id}")
async def draw_websocket(websocket: WebSocket, user_id: str):
    """
    Real-time draw notifications.
    Client connects after login and receives push when new draw is found.
    """
    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id)


# ─────────────────────────────────────────────
# IRCC Profile Ready Export (for Browser Extension)
# ─────────────────────────────────────────────

@app.get(f"{v1}/profile/ircc-ready", tags=["Profile"])
async def get_ircc_ready_profile(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all applicant data mapped to IRCC field names.
    Consumed by the browser extension to auto-fill the IRCC portal.
    Returns a structured response even when profile is incomplete —
    never raises 404, so the extension can show a helpful message.
    """
    # Load applicant with all relationships
    result = await db.execute(
        select(ApplicantDB)
        .options(
            selectinload(ApplicantDB.language_tests),
            selectinload(ApplicantDB.work_experiences),
            selectinload(ApplicantDB.education),
            selectinload(ApplicantDB.job_offer),
            selectinload(ApplicantDB.spouse_language_test),
        )
        .where(ApplicantDB.user_id == current_user.id)
    )
    applicant = result.scalar_one_or_none()

    # No Express Entry profile yet — return structured error the extension can display
    if not applicant:
        return {
            "profile_complete": False,
            "missing": "no_profile",
            "message": "No Express Entry profile found. Go to My Profile in the app and complete your profile first.",
            "personal": None, "language": None, "education": None,
            "work_history": [], "adaptability": None, "spouse": None, "crs_score": None,
        }

    dob = applicant.date_of_birth
    lang_tests   = applicant.language_tests or []
    work_exps    = applicant.work_experiences or []
    primary_lang = next((t for t in lang_tests if t.role == "first"), lang_tests[0] if lang_tests else None)

    # Work out what's missing so the extension can warn the user
    missing = []
    if not dob:                missing.append("date_of_birth")
    if not primary_lang:       missing.append("language_test")
    if not applicant.education: missing.append("education")
    if not work_exps:          missing.append("work_experience")

    # Personal section
    full_name   = applicant.full_name or ""
    name_parts  = full_name.split(" ")
    family_name = name_parts[-1]  if len(name_parts) > 1 else full_name
    given_name  = " ".join(name_parts[:-1]) if len(name_parts) > 1 else ""

    personal = {
        "family_name":            family_name,
        "given_name":             given_name,
        "dob_year":               str(dob.year)             if dob else "",
        "dob_month":              str(dob.month).zfill(2)   if dob else "",
        "dob_day":                str(dob.day).zfill(2)     if dob else "",
        "country_of_birth":       applicant.nationality              or "",
        "city_of_birth":          applicant.city_of_birth            or "",
        "country_of_citizenship": applicant.nationality              or "",
        "country_of_residence":   applicant.country_of_residence     or applicant.nationality or "",
        "marital_status":         applicant.marital_status           or "single",
        "province_of_destination": applicant.province_of_destination or "",
    }

    # Language section
    language = {
        "first_language_test":     primary_lang.test_type              if primary_lang else "",
        "listening_score":         str(primary_lang.listening)         if primary_lang else "",
        "reading_score":           str(primary_lang.reading)           if primary_lang else "",
        "writing_score":           str(primary_lang.writing)           if primary_lang else "",
        "speaking_score":          str(primary_lang.speaking)          if primary_lang else "",
        "test_date":               primary_lang.test_date.isoformat()  if primary_lang and primary_lang.test_date else "",
        "registration_number":     primary_lang.registration_number    if primary_lang else "",
        "certificate_number":      primary_lang.registration_number    if primary_lang else "",
        "test_result_filing_date": primary_lang.test_date.isoformat()  if primary_lang and primary_lang.test_date else "",
        "clb_listening":           str(primary_lang.clb_listening)     if primary_lang else "",
        "clb_reading":             str(primary_lang.clb_reading)       if primary_lang else "",
        "clb_writing":             str(primary_lang.clb_writing)       if primary_lang else "",
        "clb_speaking":            str(primary_lang.clb_speaking)      if primary_lang else "",
    }

    # Education section
    edu = applicant.education
    study_end_year  = str(edu.completion_date.year)             if edu and edu.completion_date else ""
    study_end_month = str(edu.completion_date.month).zfill(2)   if edu and edu.completion_date else ""
    from datetime import date as _dc
    eca_within_5 = "No"
    if edu and edu.eca_organization:
        if edu.eca_completion_date:
            eca_within_5 = "Yes" if (_dc.today() - edu.eca_completion_date).days <= 1825 else "No"
        else:
            eca_within_5 = "Yes"  # assume recent if org is set but no date

    education = {
        "highest_level":       edu.level                   if edu else "",
        "level_of_education":  edu.level                   if edu else "",
        "country_studied":     edu.country                 if edu else "",
        "city_of_study":       "",
        "field_of_study":      edu.field_of_study          if edu else "",
        "institution":         edu.institution_name        if edu else "",
        "is_canadian":         str(edu.is_canadian)        if edu else "False",
        "study_to_year":       study_end_year,
        "study_to_month":      study_end_month,
        # Compute study_from by subtracting typical degree duration from completion date
        "study_from_year":     str(edu.completion_date.year - (
                                   4 if edu.level in ("bachelors","bachelor","bachelors_or_higher") else
                                   3 if edu.level in ("masters","master","phd","doctorate") else
                                   2 if "two" in (edu.level or "").lower() or edu.is_three_year_or_more else 1
                               )) if edu and edu.completion_date else "",
        "study_from_month":    str(edu.completion_date.month).zfill(2) if edu and edu.completion_date else "",
        # full_academic_years from degree type
        "full_academic_years": (
            "4" if edu and edu.level in ("bachelors","bachelor","bachelors_or_higher") else
            "2" if edu and edu.level in ("masters","master") else
            "3" if edu and edu.is_three_year_or_more else
            "2"
        ) if edu else "2",
        "complete_years":      (
            "4" if edu and edu.level in ("bachelors","bachelor","bachelors_or_higher") else
            "2" if edu and edu.level in ("masters","master") else
            "2"
        ) if edu else "2",
        "duration_years":      (
            "4" if edu and edu.level in ("bachelors","bachelor","bachelors_or_higher") else
            "2" if edu and edu.level in ("masters","master") else
            "2"
        ) if edu else "2",
        "full_time_part_time": "Full-time",
        "enrollment_status":   "Full-time",
        "academic_standing":   "Successfully completed",
        "eca_organization":    edu.eca_organization        if edu else "",
        "eca_reference":       edu.eca_reference_number    if edu else "",
        "eca_within_5_years":  eca_within_5,
    }

    # Primary occupation NOC
    primary_noc = work_exps[0].noc_code if work_exps else (applicant.job_offer.noc_code if applicant.job_offer else "")

    # Work history
    work_history = [
        {
            "employer":       w.employer_name,
            "job_title":      w.job_title,
            "noc_code":       w.noc_code,
            "country":        "Canada" if w.experience_type == "canadian" else "Other",
            "start_year":     str(w.start_date.year)              if w.start_date else "",
            "start_month":    str(w.start_date.month).zfill(2)    if w.start_date else "",
            "end_year":       str(w.end_date.year)                if w.end_date else "Present",
            "end_month":      str(w.end_date.month).zfill(2)      if w.end_date else "",
            "hours_per_week": str(int(w.hours_per_week or 40)),
            "is_current":     str(w.is_current),
        }
        for w in work_exps
    ]

    # Adaptability
    adaptability = {
        "has_sibling":   str(applicant.has_sibling_in_canada),
        "has_job_offer": str(bool(applicant.job_offer)),
        "has_pnp":       str(applicant.has_provincial_nomination),
    }

    # CRS score
    crs_score = applicant.crs_score_json.get("total") if applicant.crs_score_json else None

    # Spouse
    spouse = None
    if applicant.has_spouse and applicant.spouse_name:
        parts = applicant.spouse_name.split(" ")
        spouse = {
            "family_name":     parts[-1] if len(parts) > 1 else applicant.spouse_name,
            "given_name":      " ".join(parts[:-1]) if len(parts) > 1 else "",
            "education_level": applicant.spouse_education_level or "",
            "dob":             applicant.spouse_dob.isoformat() if applicant.spouse_dob else "",
            "dob_year":        str(applicant.spouse_dob.year)              if applicant.spouse_dob else "",
            "dob_month":       str(applicant.spouse_dob.month).zfill(2)    if applicant.spouse_dob else "",
            "dob_day":         str(applicant.spouse_dob.day).zfill(2)      if applicant.spouse_dob else "",
            "nationality":     applicant.spouse_nationality or "",
            "gender":          applicant.gender or "",  # shared gender field — update if separate spouse_gender added
        }

    # Family members count (applicant + spouse if any)
    family_members_count = 1 + (1 if applicant.has_spouse else 0)

    # Get user email for contact details section
    user_result = await db.execute(select(UserDB).where(UserDB.id == current_user.id))
    user = user_result.scalar_one_or_none()

    return {
        "profile_complete":     len(missing) == 0,
        "missing":              missing,
        "message":              f"Profile loaded. Missing: {', '.join(missing)}" if missing else "Profile complete.",
        "email":                user.email if user else "",
        "personal":             personal,
        "language":             language,
        "education":            education,
        "work_history":         work_history,
        "adaptability":         adaptability,
        "spouse":               spouse,
        "crs_score":            crs_score,
        "family_members_count": family_members_count,
        "has_applied_before":   False,
        "passport":             {
            "document_number":   applicant.passport_number or "",
            "country_of_issue":  applicant.passport_country_of_issue or applicant.nationality or "",
            "issue_date":        applicant.passport_issue_date.isoformat() if applicant.passport_issue_date else "",
            "expiry_date":       applicant.passport_expiry_date.isoformat() if applicant.passport_expiry_date else "",
            "issue_year":        str(applicant.passport_issue_date.year) if applicant.passport_issue_date else "",
            "issue_month":       str(applicant.passport_issue_date.month).zfill(2) if applicant.passport_issue_date else "",
            "issue_day":         str(applicant.passport_issue_date.day).zfill(2) if applicant.passport_issue_date else "",
            "expiry_year":       str(applicant.passport_expiry_date.year) if applicant.passport_expiry_date else "",
            "expiry_month":      str(applicant.passport_expiry_date.month).zfill(2) if applicant.passport_expiry_date else "",
            "expiry_day":        str(applicant.passport_expiry_date.day).zfill(2) if applicant.passport_expiry_date else "",
        },
        "primary_noc":          primary_noc,
        "verification":         applicant.profile_verification or {},
    }


# ─────────────────────────────────────────────
# Profile Sync — Verification State
# ─────────────────────────────────────────────

@app.get(f"{v1}/profile/sync-status", tags=["Profile"])
async def get_sync_status(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the full profile verification state.
    Shows which fields are verified/conflict/unverified/missing.
    """
    applicant = await _get_applicant(current_user.id, db)
    verification = applicant.profile_verification or {}

    # Separate applicant fields from spouse fields
    applicant_v = {k: v for k, v in verification.items() if not k.startswith("spouse_")}
    spouse_v    = {k: v for k, v in verification.items() if k.startswith("spouse_")}

    conflicts   = {k: v for k, v in applicant_v.items() if v.get("status") == "conflict" and not v.get("acknowledged")}
    verified    = {k: v for k, v in applicant_v.items() if v.get("status") == "verified"}
    unverified  = {k: v for k, v in applicant_v.items() if v.get("status") == "unverified"}
    missing     = {k: v for k, v in applicant_v.items() if v.get("status") == "missing"}

    spouse_conflicts  = {k: v for k, v in spouse_v.items() if v.get("status") == "conflict" and not v.get("acknowledged")}
    spouse_verified   = {k: v for k, v in spouse_v.items() if v.get("status") == "verified"}

    return {
        "has_conflicts":          len(conflicts) > 0,
        "conflict_count":         len(conflicts),
        "verified_count":         len(verified),
        "unverified_count":       len(unverified),
        "missing_count":          len(missing),
        "conflicts":              conflicts,
        "verified":               verified,
        "unverified":             unverified,
        "missing":                missing,
        "spouse_has_conflicts":   len(spouse_conflicts) > 0,
        "spouse_conflict_count":  len(spouse_conflicts),
        "spouse_conflicts":       spouse_conflicts,
        "spouse_verified":        spouse_verified,
        "all":                    verification,
    }


class SyncActionRequest(BaseModel):
    field_key: str
    action: str   # "accept_document" | "keep_profile" | "acknowledge"


@app.post(f"{v1}/profile/sync-action", tags=["Profile"])
async def sync_action(
    request: SyncActionRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Resolve a field conflict:
    - accept_document: update profile field to match document value
    - keep_profile:    mark conflict as acknowledged (user says profile is correct)
    - acknowledge:     dismiss without changing either value
    """
    from sqlalchemy.orm.attributes import flag_modified
    from datetime import date as _date

    # Load with relationships eager to avoid MissingGreenlet on lazy access
    applicant_db_full = await _get_applicant_full(current_user.id, db)
    verification = dict(applicant_db_full.profile_verification or {})
    field = verification.get(request.field_key)

    if not field:
        raise HTTPException(status_code=404, detail=f"Field '{request.field_key}' not in verification state")

    doc_value = field.get("doc_value", "")

    if request.action == "accept_document":
        # Update the actual profile field to match document
        field_map = {
            "passport_number":    ("passport_number",    "str"),
            "passport_expiry":    ("passport_expiry_date", "date"),
            "lang_listening":     ("_lang_listening",    "lang"),
            "lang_reading":       ("_lang_reading",      "lang"),
            "lang_writing":       ("_lang_writing",      "lang"),
            "lang_speaking":      ("_lang_speaking",     "lang"),
            "lang_test_date":     ("_lang_test_date",    "lang_date"),
        }
        mapped = field_map.get(request.field_key)

        # ── Spouse language score fields ──────────────────────────
        if request.field_key.startswith("spouse_lang_"):
            skill = request.field_key.replace("spouse_lang_", "")
            spouse_test = applicant_db_full.spouse_language_test
            if skill == "test_date":
                if spouse_test and doc_value:
                    try:
                        from datetime import date as _date2
                        spouse_test.test_date = _date2.fromisoformat(doc_value)
                        logger.info(f"sync_action: spouse test_date updated to {doc_value}")
                    except Exception as e:
                        logger.warning(f"sync_action: could not update spouse test_date: {e}")
            elif spouse_test and skill in ("listening", "reading", "writing", "speaking"):
                try:
                    setattr(spouse_test, skill, float(doc_value))
                    # Recalculate spouse CLB
                    from core.application.services.crs_calculator import CrsCalculatorService
                    from core.domain.models import LanguageTest as LT, LanguageTestType
                    tmp = LT()
                    tmp.test_type = LanguageTestType(spouse_test.test_type.lower())
                    tmp.reading   = spouse_test.reading
                    tmp.writing   = spouse_test.writing
                    tmp.speaking  = spouse_test.speaking
                    tmp.listening = spouse_test.listening
                    clb = CrsCalculatorService().convert_to_clb(tmp)
                    spouse_test.clb_reading   = clb.reading
                    spouse_test.clb_writing   = clb.writing
                    spouse_test.clb_speaking  = clb.speaking
                    spouse_test.clb_listening = clb.listening
                    logger.info(f"sync_action: spouse {skill}={doc_value}  CLB recalculated")
                except Exception as e:
                    logger.warning(f"sync_action: could not update spouse {skill}: {e}")
            else:
                logger.warning(f"sync_action: no spouse language test found for skill '{skill}'")

        elif mapped:
            attr, typ = mapped
            try:
                if typ == "str":
                    setattr(applicant, attr, doc_value)
                elif typ == "date" and doc_value:
                    setattr(applicant, attr, _date.fromisoformat(doc_value))
                elif typ == "lang":
                    # Use eagerly-loaded applicant to avoid lazy relationship issues
                    skill = request.field_key.replace("lang_", "")
                    lang_tests = applicant_db_full.language_tests or []
                    primary = next((t for t in lang_tests if t.role == "first"), lang_tests[0] if lang_tests else None)
                    if primary:
                        setattr(primary, skill, float(doc_value))
                        # Recalculate CLB after score change
                        from core.application.services.crs_calculator import CrsCalculatorService
                        from core.domain.models import LanguageTest as LT, LanguageTestType
                        tmp = LT()
                        tmp.test_type = LanguageTestType(primary.test_type.lower())
                        tmp.reading = primary.reading; tmp.writing = primary.writing
                        tmp.speaking = primary.speaking; tmp.listening = primary.listening
                        clb = CrsCalculatorService().convert_to_clb(tmp)
                        primary.clb_reading = clb.reading; primary.clb_writing = clb.writing
                        primary.clb_speaking = clb.speaking; primary.clb_listening = clb.listening
                        logger.info(f"sync_action: updated {skill}={doc_value} CLB L={clb.listening} R={clb.reading} W={clb.writing} S={clb.speaking}")
                elif typ == "lang_date" and doc_value:
                    lang_tests = applicant_db_full.language_tests or []
                    primary = next((t for t in lang_tests if t.role == "first"), lang_tests[0] if lang_tests else None)
                    if primary:
                        primary.test_date = _date.fromisoformat(doc_value)
                        logger.info(f"sync_action: updated test_date={doc_value}")
            except Exception as e:
                logger.warning(f"sync_action: could not apply field {request.field_key}: {e}")

        field["status"] = "verified"
        field["profile_value"] = doc_value
        field["acknowledged"] = True
        field["resolution"] = "accepted_document"
        logger.info(f"sync_action: accepted document value for {request.field_key}={doc_value}  user={current_user.id}")

    elif request.action in ("keep_profile", "acknowledge"):
        field["acknowledged"] = True
        field["resolution"] = request.action
        logger.info(f"sync_action: {request.action} for {request.field_key}  user={current_user.id}")

    verification[request.field_key] = field
    applicant_db_full.profile_verification = verification
    flag_modified(applicant_db_full, "profile_verification")
    await db.commit()

    return {"ok": True, "field": request.field_key, "action": request.action, "new_status": field["status"]}


# ─────────────────────────────────────────────
# IRCC Verified Data — Pre-fill Review
# ─────────────────────────────────────────────

@app.get(f"{v1}/profile/ircc-verified", tags=["Profile"])
async def get_ircc_verified_profile(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns reconciled profile data tiered by verification status.
    Each field has a status: 'verified' | 'unverified' | 'conflict' | 'missing'
    
    - verified:   profile and document agree → safe to autofill
    - unverified: profile entry but no document uploaded → fill with caution
    - conflict:   profile and document disagree → block autofill, user must resolve
    - missing:    document uploaded but no matching profile entry → must add to profile
    """
    from sqlalchemy.orm.attributes import flag_modified

    applicant_db = await _get_applicant_full(current_user.id, db)
    if not applicant_db:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Load all reviewed documents
    docs_result = await db.execute(
        select(ApplicationDocumentDB)
        .where(
            ApplicationDocumentDB.applicant_id == applicant_db.id,
            ApplicationDocumentDB.status == "ai_reviewed"
        )
    )
    docs = docs_result.scalars().all()

    # Index documents by type
    def get_doc(doc_type):
        return next((d for d in docs if d.document_type == doc_type), None)

    def extracted(doc, key):
        """Get extracted field value from AI review, ignore internal keys"""
        if not doc or not doc.ai_extracted_fields:
            return None
        v = doc.ai_extracted_fields.get(key)
        return str(v).strip() if v else None

    def field(status, profile_val, doc_val=None, message=None):
        return {
            "status": status,        # verified | unverified | conflict | missing
            "value": profile_val,    # value to fill (always profile or resolved value)
            "profile_value": profile_val,
            "doc_value": doc_val,
            "message": message,
        }

    fields = {}

    # ── PASSPORT ─────────────────────────────────────────────────
    passport_doc = get_doc("passport")
    p_num    = applicant_db.passport_number or ""
    p_coi    = applicant_db.passport_country_of_issue or ""
    p_issue  = applicant_db.passport_issue_date.isoformat() if applicant_db.passport_issue_date else ""
    p_expiry = applicant_db.passport_expiry_date.isoformat() if applicant_db.passport_expiry_date else ""

    d_num    = extracted(passport_doc, "document_number")
    d_expiry = extracted(passport_doc, "date_of_expiry")

    if passport_doc:
        if d_num and p_num and d_num.replace(" ", "").upper() != p_num.replace(" ", "").upper():
            fields["passport_number"] = field("conflict", p_num, d_num,
                f"Profile: '{p_num}' vs Document: '{d_num}' — update profile to match passport")
        elif d_num:
            fields["passport_number"] = field("verified", d_num or p_num, d_num)
        else:
            fields["passport_number"] = field("unverified", p_num, None, "No passport uploaded")
        
        if d_expiry:
            fields["passport_expiry"] = field("verified", d_expiry, d_expiry)
        else:
            fields["passport_expiry"] = field("unverified", p_expiry, None)
    else:
        fields["passport_number"] = field("unverified" if p_num else "missing", p_num, None,
            "Upload passport to verify" if p_num else "Add passport number to profile and upload passport")
        fields["passport_expiry"] = field("unverified" if p_expiry else "missing", p_expiry)

    # ── LANGUAGE TEST ─────────────────────────────────────────────
    lang_tests = applicant_db.language_tests or []
    primary_lt = next((t for t in lang_tests if t.role == "first"), lang_tests[0] if lang_tests else None)
    lang_doc   = get_doc("language_test_result")

    for skill in ["listening", "reading", "writing", "speaking"]:
        prof_val = str(getattr(primary_lt, skill, "") or "") if primary_lt else ""
        doc_val  = extracted(lang_doc, skill)

        if not primary_lt:
            fields[f"lang_{skill}"] = field("missing", "", None, "Add language test to profile")
        elif lang_doc and doc_val:
            try:
                diff = abs(float(doc_val) - float(prof_val))
                if diff >= 0.5:
                    fields[f"lang_{skill}"] = field(
                        "conflict", prof_val, doc_val,
                        f"Profile: {prof_val} vs TRF: {doc_val} — TRF is the authoritative value"
                    )
                else:
                    fields[f"lang_{skill}"] = field("verified", doc_val, doc_val)
            except (ValueError, TypeError):
                fields[f"lang_{skill}"] = field("unverified", prof_val, doc_val)
        elif lang_doc:
            fields[f"lang_{skill}"] = field("unverified", prof_val, None,
                "AI could not extract score from document — verify manually")
        else:
            fields[f"lang_{skill}"] = field("unverified", prof_val, None, "No language test uploaded")

    # Language test date
    prof_test_date = primary_lt.test_date.isoformat() if primary_lt and primary_lt.test_date else ""
    doc_test_date  = extracted(lang_doc, "test_date")
    if lang_doc and doc_test_date and prof_test_date and doc_test_date != prof_test_date:
        fields["lang_test_date"] = field("conflict", prof_test_date, doc_test_date,
            f"Profile: {prof_test_date} vs Document: {doc_test_date}")
    elif doc_test_date:
        fields["lang_test_date"] = field("verified", doc_test_date, doc_test_date)
    else:
        fields["lang_test_date"] = field("unverified", prof_test_date)

    # Certificate number
    cert_num = primary_lt.registration_number if primary_lt else ""
    doc_cert = extracted(lang_doc, "registration_number")
    fields["lang_certificate"] = field(
        "verified" if (doc_cert or cert_num) else "missing",
        doc_cert or cert_num, doc_cert
    )

    # ── WORK EXPERIENCE ───────────────────────────────────────────
    work_exps   = applicant_db.work_experiences or []
    emp_docs    = [d for d in docs if d.document_type == "employment_letter"]
    
    fields["work_experience"] = {
        "status": "ok",
        "profile_count": len(work_exps),
        "document_count": len(emp_docs),
        "entries": [],
        "conflicts": [],
        "missing_docs": [],
        "undeclared_jobs": [],
    }

    # Check each profile work entry has a supporting document
    # Track which docs are already matched so we don't double-count
    matched_doc_ids = set()

    for w in work_exps:
        matching_doc = None
        prof_name = (w.employer_name or "").lower().strip()

        for d in emp_docs:
            if str(d.id) in matched_doc_ids:
                continue
            # Try multiple extracted field names AI might use
            doc_emp = (
                extracted(d, "employer_name") or
                extracted(d, "company_name") or
                extracted(d, "organization") or
                extracted(d, "employer") or
                ""
            ).lower().strip()

            if not doc_emp:
                # No employer extracted — match by doc count fallback
                # (if counts match we assume docs cover all jobs)
                continue

            # Match strategies: exact, substring, first significant word
            def significant_words(s):
                stop = {"the", "of", "and", "&", "ltd", "limited", "pvt", "inc",
                        "llc", "corp", "corporation", "technologies", "technology",
                        "solutions", "services", "consulting", "group", "co"}
                return [w for w in s.split() if len(w) > 2 and w not in stop]

            prof_words = significant_words(prof_name)
            doc_words  = significant_words(doc_emp)

            match = (
                prof_name in doc_emp or
                doc_emp in prof_name or
                (prof_words and doc_words and prof_words[0] == doc_words[0]) or
                any(pw in doc_words for pw in prof_words if len(pw) > 3) or
                any(dw in prof_words for dw in doc_words if len(dw) > 3)
            )

            if match:
                matching_doc = d
                matched_doc_ids.add(str(d.id))
                break

        # Fallback: if doc count == work count and all unmatched, assign sequentially
        if not matching_doc and len(emp_docs) == len(work_exps):
            unmatched_docs = [d for d in emp_docs if str(d.id) not in matched_doc_ids]
            if unmatched_docs:
                matching_doc = unmatched_docs[0]
                matched_doc_ids.add(str(matching_doc.id))

        entry = {
            "employer": w.employer_name,
            "noc_code": w.noc_code,
            "start_date": w.start_date.isoformat() if w.start_date else "",
            "end_date": w.end_date.isoformat() if w.end_date else "",
            "is_current": w.is_current,
            "has_document": matching_doc is not None,
            "status": "verified" if matching_doc else "unverified",
        }
        fields["work_experience"]["entries"].append(entry)
        if not matching_doc:
            fields["work_experience"]["missing_docs"].append(w.employer_name)

    # Check if there are more employment documents than profile entries
    if len(emp_docs) > len(work_exps):
        extra = len(emp_docs) - len(work_exps)
        fields["work_experience"]["undeclared_jobs"] = [
            f"You have {len(emp_docs)} employment documents but only {len(work_exps)} work entries. "
            f"Add the missing {extra} job(s) to your profile before filling IRCC."
        ]
        fields["work_experience"]["status"] = "conflict"
    elif len(work_exps) > 0 and len(emp_docs) == 0:
        fields["work_experience"]["status"] = "unverified"
    elif len(emp_docs) == len(work_exps) and len(work_exps) > 0:
        # Same count — documents cover all jobs (even if names didn't exactly match)
        fields["work_experience"]["status"] = "verified"
        fields["work_experience"]["missing_docs"] = []  # clear false positives
        for e in fields["work_experience"]["entries"]:
            e["has_document"] = True
            e["status"] = "verified"
    elif all(e["has_document"] for e in fields["work_experience"]["entries"]):
        fields["work_experience"]["status"] = "verified"
    else:
        fields["work_experience"]["status"] = "partial"

    # ── EDUCATION ─────────────────────────────────────────────────
    edu = applicant_db.education
    fields["education"] = field(
        "verified" if (edu and get_doc("education_credential")) else
        "unverified" if edu else "missing",
        edu.level if edu else "",
        None,
        None if get_doc("education_credential") else "Upload education credential to verify"
    )

    # ── PERSONAL ─────────────────────────────────────────────────
    fields["city_of_birth"] = field(
        "verified" if applicant_db.city_of_birth else "missing",
        applicant_db.city_of_birth or "",
        None,
        None if applicant_db.city_of_birth else "Add city of birth in Profile → Personal"
    )

    # ── SUMMARY COUNTS ────────────────────────────────────────────
    flat_fields = {k: v for k, v in fields.items() if k != "work_experience" and isinstance(v, dict) and "status" in v}
    summary = {
        "verified":   sum(1 for f in flat_fields.values() if f["status"] == "verified"),
        "unverified": sum(1 for f in flat_fields.values() if f["status"] == "unverified"),
        "conflict":   sum(1 for f in flat_fields.values() if f["status"] == "conflict"),
        "missing":    sum(1 for f in flat_fields.values() if f["status"] == "missing"),
    }
    if fields["work_experience"]["status"] == "conflict":
        summary["conflict"] += 1
    elif fields["work_experience"]["status"] == "unverified":
        summary["unverified"] += 1

    safe_to_fill = summary["conflict"] == 0

    return {
        "safe_to_fill": safe_to_fill,
        "summary": summary,
        "fields": fields,
        "message": (
            "Ready to fill — all fields verified or unverified." if safe_to_fill
            else f"{summary['conflict']} conflict(s) must be resolved before filling IRCC."
        ),
        "conflicts": [
            {"field": k, "message": v.get("message", ""), "profile_value": v.get("profile_value"), "doc_value": v.get("doc_value")}
            for k, v in flat_fields.items() if v["status"] == "conflict"
        ] + (
            [{"field": "work_experience", "message": msg}
             for msg in fields["work_experience"].get("undeclared_jobs", [])]
        ),
    }


# ─────────────────────────────────────────────
# Form 1 Application Workflow
# ─────────────────────────────────────────────

# Required documents for Form 1 (Express Entry Profile)
FORM1_REQUIRED_DOCS = [
    {"type": "passport",             "label": "Passport",                     "description": "All pages of current valid passport", "for_whom": "applicant"},
    {"type": "language_test_result", "label": "Language Test Result",         "description": "IELTS TRF or CELPIP/TEF official score report", "for_whom": "applicant"},
    {"type": "education_credential", "label": "Education Certificate",        "description": "Degree/diploma certificate for highest credential", "for_whom": "applicant"},
    {"type": "eca_report",           "label": "ECA Report",                   "description": "Educational Credential Assessment from WES, ICAS, etc.", "for_whom": "applicant"},
    {"type": "employment_letter",    "label": "Employment Reference Letter",  "description": "On employer letterhead with all IRCC-required fields", "for_whom": "applicant"},
    {"type": "photo",                "label": "Passport Photo",               "description": "45mm x 35mm, white background, taken within last 6 months", "for_whom": "applicant"},
]

@app.get(f"{v1}/application/form1/readiness", tags=["Application Workflow"])
async def get_form1_readiness(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns readiness status for Form 1 (Express Entry Profile).
    Checks:
      1. Profile completeness (all required fields filled)
      2. Document presence (each required doc uploaded)
      3. AI review status for uploaded docs
    """
    applicant = await _get_applicant_full(current_user.id, db)

    # ── 1. Profile field checks ──────────────────────────────────
    profile_checks = []

    def pcheck(field_label, value, fix_hint):
        ok = bool(value and str(value).strip() not in ('', 'None', 'null'))
        profile_checks.append({"field": field_label, "ok": ok, "fix": fix_hint if not ok else None})
        return ok

    pcheck("Full name",          applicant.full_name,      "Add your full name in Profile → Personal")
    pcheck("Date of birth",      applicant.date_of_birth,  "Add date of birth in Profile → Personal")
    pcheck("Nationality",        applicant.nationality,    "Add country of citizenship in Profile → Personal")
    pcheck("Marital status",     applicant.marital_status, "Add marital status in Profile → Personal")

    primary_lang = next((t for t in applicant.language_tests if t.role == "first"), None)
    lang_ok = primary_lang is not None
    profile_checks.append({
        "field": "Language test scores",
        "ok": lang_ok,
        "fix": "Add IELTS/CELPIP scores in Profile → Language" if not lang_ok else None
    })
    if primary_lang:
        import datetime as _dt
        test_age_days = (_dt.date.today() - primary_lang.test_date).days if primary_lang.test_date else 9999
        lang_expired = test_age_days > 730
        profile_checks.append({
            "field": "Language test not expired (2-year limit)",
            "ok": not lang_expired,
            "fix": f"Your test from {primary_lang.test_date} expired. Retake IELTS/CELPIP." if lang_expired else None
        })
        clb_min = min(filter(None, [primary_lang.clb_listening, primary_lang.clb_reading,
                                     primary_lang.clb_writing, primary_lang.clb_speaking]))
        clb_ok = clb_min >= 7
        profile_checks.append({
            "field": f"Minimum CLB 7 in all skills (lowest: CLB {clb_min})",
            "ok": clb_ok,
            "fix": f"CLB {clb_min} is below the FSW minimum of CLB 7. Improve language scores." if not clb_ok else None
        })

    edu_ok = applicant.education is not None
    profile_checks.append({
        "field": "Education on file",
        "ok": edu_ok,
        "fix": "Add your highest credential in Profile → Education" if not edu_ok else None
    })

    has_work = len(applicant.work_experiences) > 0
    profile_checks.append({
        "field": "Work experience on file",
        "ok": has_work,
        "fix": "Add at least one job in Profile → Work" if not has_work else None
    })

    has_noc = all(bool(w.noc_code) for w in applicant.work_experiences) if has_work else False
    profile_checks.append({
        "field": "NOC codes for all jobs",
        "ok": has_noc,
        "fix": "Add NOC code for each job (use NOC Finder in Tools)" if not has_noc else None
    })

    # ── 2. Document presence check ───────────────────────────────
    result = await db.execute(
        select(ApplicationDocumentDB).where(
            ApplicationDocumentDB.applicant_id == applicant.id
        )
    )
    uploaded_docs = result.scalars().all()
    uploaded_types = {d.document_type for d in uploaded_docs if d.person_label == "applicant"}

    # Skip ECA if credential is Canadian
    is_canadian_edu = applicant.education and getattr(applicant.education, 'is_canadian', False)
    required_docs = [d for d in FORM1_REQUIRED_DOCS
                     if not (d["type"] == "eca_report" and is_canadian_edu)]

    doc_status = []
    for req in required_docs:
        uploaded = req["type"] in uploaded_types
        matching_docs = [d for d in uploaded_docs
                         if d.document_type == req["type"] and d.person_label == "applicant"]
        ai_issues = []
        for d in matching_docs:
            if d.ai_issues:
                ai_issues.extend(d.ai_issues)

        doc_status.append({
            "type":          req["type"],
            "label":         req["label"],
            "description":   req["description"],
            "uploaded":      uploaded,
            "doc_ids":       [str(d.id) for d in matching_docs],
            "ai_status":     matching_docs[0].status if matching_docs else None,
            "ai_issues":     ai_issues,
            "has_errors":    len(ai_issues) > 0,
        })

    # ── 3. Summary ───────────────────────────────────────────────
    profile_complete  = all(c["ok"] for c in profile_checks)
    all_docs_uploaded = all(d["uploaded"] for d in doc_status)
    docs_with_errors  = [d for d in doc_status if d["has_errors"]]
    missing_docs      = [d for d in doc_status if not d["uploaded"]]

    ready_to_download = profile_complete and all_docs_uploaded and len(docs_with_errors) == 0

    return {
        "ready_to_download":   ready_to_download,
        "profile_complete":    profile_complete,
        "all_docs_uploaded":   all_docs_uploaded,
        "profile_checks":      profile_checks,
        "doc_status":          doc_status,
        "missing_docs":        missing_docs,
        "docs_with_errors":    docs_with_errors,
        "summary": {
            "profile_issues":   sum(1 for c in profile_checks if not c["ok"]),
            "missing_docs":     len(missing_docs),
            "doc_errors":       len(docs_with_errors),
        }
    }


@app.post(f"{v1}/application/form1/validate-document", tags=["Application Workflow"])
async def validate_document_against_profile(
    document_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    AI deep-check: reads document content and cross-validates against profile data.
    E.g. name on passport must match profile name, IELTS scores must match language test scores.
    Returns field-by-field comparison with pass/fail/warn per field.
    """
    applicant = await _get_applicant_full(current_user.id, db)
    doc = await db.get(ApplicationDocumentDB, document_id)
    if not doc or doc.applicant_id != applicant.id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get file bytes for AI analysis
    blob_service = BlobStorageService()
    try:
        file_bytes = await blob_service.download(doc.blob_path)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not retrieve document file")

    # Build profile context for cross-check
    primary_lang = next((t for t in applicant.language_tests if t.role == "first"), None)
    profile_context = {
        "full_name":        applicant.full_name,
        "date_of_birth":    str(applicant.date_of_birth) if applicant.date_of_birth else None,
        "nationality":      applicant.nationality,
        "language_test":    primary_lang.test_type if primary_lang else None,
        "ielts_listening":  str(primary_lang.listening) if primary_lang else None,
        "ielts_reading":    str(primary_lang.reading) if primary_lang else None,
        "ielts_writing":    str(primary_lang.writing) if primary_lang else None,
        "ielts_speaking":   str(primary_lang.speaking) if primary_lang else None,
        "education_level":  applicant.education.level if applicant.education else None,
        "institution":      applicant.education.institution_name if applicant.education else None,
        "noc_code":         applicant.work_experiences[0].noc_code if applicant.work_experiences else None,
        "employer":         applicant.work_experiences[0].employer_name if applicant.work_experiences else None,
    }

    import base64 as _b64
    base64_doc = _b64.b64encode(file_bytes).decode("utf-8")

    from infrastructure.ai.ai_services import DocumentReviewService
    import json as _json

    client = DocumentReviewService()._get_client()

    cross_check_prompt = f"""You are validating a {doc.document_type} document for a Canadian Express Entry application.

APPLICANT PROFILE DATA:
{_json.dumps(profile_context, indent=2)}

DOCUMENT TYPE: {doc.document_type}

Cross-check the document against the profile data above. For each relevant field, check if the document matches the profile.

Return JSON with exactly this structure:
{{
  "cross_checks": [
    {{
      "field": "field name (e.g. Full Name, Date of Birth, Test Scores)",
      "profile_value": "what the profile says",
      "document_value": "what the document shows (or null if not visible)",
      "status": "pass | fail | warn | not_applicable",
      "note": "explanation if fail or warn"
    }}
  ],
  "overall_valid": true/false,
  "critical_mismatches": ["list of fields where document contradicts profile — these will cause IRCC rejection"],
  "warnings": ["non-critical issues worth noting"],
  "summary": "brief overall assessment"
}}

Be thorough: names must match exactly as in passport. Scores must match exactly. Dates must match."""

    try:
        response = await client.chat.completions.create(
            model=get_settings().AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are an IRCC document compliance expert. Cross-validate immigration documents against applicant profile data and return structured JSON only."},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": cross_check_prompt},
                        {"type": "image_url", "image_url": {
                            "url": f"data:{doc.mime_type or 'image/jpeg'};base64,{base64_doc}",
                            "detail": "high"
                        }}
                    ]
                }
            ],
            max_tokens=1500,
            response_format={"type": "json_object"}
        )
        result = _json.loads(response.choices[0].message.content)

        # Persist the deep-check result back to the doc
        if result.get("critical_mismatches"):
            existing = doc.ai_issues or []
            doc.ai_issues = list(set(existing + result["critical_mismatches"]))
            await db.commit()

        return result
    except Exception as e:
        logger.error(f"Deep validate error: {e}")
        raise HTTPException(status_code=500, detail=f"AI validation failed: {str(e)}")


# ─────────────────────────────────────────────
# Form 2 eAPR Application Workflow (Post-ITA)
# ─────────────────────────────────────────────

# Required UPLOADABLE documents for Form 2 (eAPR) — principal applicant
FORM2_REQUIRED_DOCS_APPLICANT = [
    {"type": "passport",             "label": "Passport",                    "description": "All pages including blank pages",                  "critical": True},
    {"type": "language_test_result", "label": "Language Test Result",        "description": "IELTS TRF / CELPIP Score Report (within 2 years)", "critical": True},
    {"type": "education_credential", "label": "Education Certificate",       "description": "Degree/diploma + official transcripts",             "critical": True},
    {"type": "eca_report",           "label": "ECA Report",                  "description": "WES or other recognised ECA (foreign credentials)", "critical": True},
    {"type": "employment_letter",    "label": "Employment Reference Letter", "description": "On letterhead — duties, salary, hours, dates",      "critical": True},
    {"type": "police_certificate",   "label": "Police Certificate",          "description": "From every country lived in 6+ months since age 18","critical": True},
    {"type": "medical_exam",         "label": "Medical Exam",                "description": "By IRCC-designated physician (IMM 1017E/5986)",     "critical": True},
    {"type": "photo",                "label": "Passport Photo",              "description": "50mm × 70mm, white background, within 6 months",    "critical": True},
    {"type": "proof_of_funds",       "label": "Proof of Funds",              "description": "6 months of bank statements + any FD certificates", "critical": False},
    {"type": "birth_certificate",    "label": "Birth Certificate",           "description": "Required if name changed or for dependants",        "critical": False},
]

FORM2_REQUIRED_DOCS_SPOUSE = [
    {"type": "passport",           "label": "Spouse Passport",         "description": "All pages of spouse's current passport",          "critical": True},
    {"type": "photo",              "label": "Spouse Photo",            "description": "Same spec as principal applicant",                "critical": True},
    {"type": "medical_exam",       "label": "Spouse Medical Exam",     "description": "By IRCC-designated physician",                    "critical": True},
    {"type": "marriage_certificate","label": "Marriage / Partnership Certificate","description": "Official marriage cert or proof of common-law", "critical": True},
    {"type": "birth_certificate",  "label": "Spouse Birth Certificate","description": "Required for eAPR",                              "critical": False},
]

FORM2_REQUIRED_DOCS_CHILD = [
    {"type": "passport",        "label": "Child Passport",      "description": "Full copy of child's current passport",    "critical": True},
    {"type": "photo",           "label": "Child Photo",         "description": "Same spec as principal applicant",          "critical": True},
    {"type": "medical_exam",    "label": "Child Medical Exam",  "description": "By IRCC-designated physician",              "critical": True},
    {"type": "birth_certificate","label": "Child Birth Certificate","description": "Certified copy of birth certificate",   "critical": True},
]

# Non-uploadable items — captured as confirmations / text data
FORM2_NONFILE_ITEMS = [
    {"id": "travel_history",   "label": "10-Year Travel History",       "description": "Every country visited for 6+ months — gap-free, no exceptions",      "type": "text",     "placeholder": "e.g. India Jan 2015–Aug 2022, Canada Sep 2022–Present"},
    {"id": "family_members",   "label": "Family Members Declaration",   "description": "All family members including those NOT accompanying you",              "type": "text",     "placeholder": "e.g. Father: Rajesh Ahuja, DOB 1960-04-12, India. Not accompanying."},
    {"id": "background_decl",  "label": "Background Declaration",       "description": "Confirm: no criminal history, no previous removal, no refusals",      "type": "checkbox", "placeholder": ""},
    {"id": "address_history",  "label": "5-Year Address History",       "description": "Every address in the past 5 years — gap-free with from/to dates",     "type": "text",     "placeholder": "e.g. 123 Main St, Delhi, India Sep 2020–Aug 2022 / 45 Queen St, Toronto ON Sep 2022–Present"},
    {"id": "funds_confirmed",  "label": "Proof of Funds Confirmed",     "description": "Confirm you meet the settlement funds requirement (e.g. CAD $13,757 for single)", "type": "checkbox", "placeholder": ""},
]


@app.get(f"{v1}/application/form2/readiness", tags=["Application Workflow"])
async def get_form2_readiness(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns eAPR readiness status after ITA.
    Checks profile, uploadable documents per family member, and non-file items.
    """
    applicant = await _get_applicant_full(current_user.id, db)

    # ── 1. Profile checks (more thorough than Form 1) ────────────
    profile_checks = []

    def pcheck(label, value, fix):
        ok = bool(value and str(value).strip() not in ('', 'None', 'null'))
        profile_checks.append({"field": label, "ok": ok, "fix": fix if not ok else None})
        return ok

    pcheck("Full name",           applicant.full_name,      "Add full name in Profile → Personal")
    pcheck("Date of birth",       applicant.date_of_birth,  "Add date of birth in Profile → Personal")
    pcheck("Nationality",         applicant.nationality,    "Add nationality in Profile → Personal")
    pcheck("Marital status",      applicant.marital_status, "Add marital status in Profile → Personal")

    primary_lang = next((t for t in applicant.language_tests if t.role == "first"), None)
    lang_ok = primary_lang is not None
    profile_checks.append({"field": "Language test on file", "ok": lang_ok,
                            "fix": "Add IELTS/CELPIP scores in Profile → Language" if not lang_ok else None})

    if primary_lang:
        import datetime as _dt
        age_days = (_dt.date.today() - primary_lang.test_date).days if primary_lang.test_date else 9999
        expired = age_days > 730
        profile_checks.append({"field": "Language test not expired",
                                "ok": not expired,
                                "fix": f"Test from {primary_lang.test_date} is expired. Retake." if expired else None})
        clb_vals = [v for v in [primary_lang.clb_listening, primary_lang.clb_reading,
                                  primary_lang.clb_writing, primary_lang.clb_speaking] if v]
        if clb_vals:
            clb_min = min(clb_vals)
            profile_checks.append({"field": f"CLB ≥ 7 all skills (min: CLB {clb_min})",
                                    "ok": clb_min >= 7,
                                    "fix": f"CLB {clb_min} below minimum. Improve scores." if clb_min < 7 else None})

    pcheck("Education on file", applicant.education, "Add education in Profile → Education")
    has_work = len(applicant.work_experiences) > 0
    profile_checks.append({"field": "Work experience on file", "ok": has_work,
                            "fix": "Add jobs in Profile → Work" if not has_work else None})
    if has_work:
        noc_ok = all(bool(w.noc_code) for w in applicant.work_experiences)
        profile_checks.append({"field": "NOC codes on all jobs", "ok": noc_ok,
                                "fix": "Add NOC code to each job (use NOC Finder)" if not noc_ok else None})

    has_spouse = getattr(applicant, 'has_spouse', False) or applicant.marital_status in ('married', 'common-law')
    if has_spouse:
        pcheck("Spouse name",          applicant.spouse_name,        "Add spouse name in Profile → Personal")
        pcheck("Spouse date of birth", applicant.spouse_dob,         "Add spouse DOB in Profile → Personal")
        pcheck("Spouse nationality",   applicant.spouse_nationality,  "Add spouse nationality in Profile → Personal")

    # ── 2. Document presence checks per person ───────────────────
    result = await db.execute(
        select(ApplicationDocumentDB).where(ApplicationDocumentDB.applicant_id == applicant.id)
    )
    all_docs = result.scalars().all()
    is_canadian_edu = applicant.education and getattr(applicant.education, 'is_canadian', False)

    def build_doc_status(required_list, person_label, skip_eca=False):
        status = []
        for req in required_list:
            if req["type"] == "eca_report" and skip_eca:
                continue
            matching = [d for d in all_docs
                        if d.document_type == req["type"] and d.person_label == person_label]
            ai_issues = []
            for d in matching:
                if d.ai_issues:
                    ai_issues.extend(d.ai_issues)
            status.append({
                "type":        req["type"],
                "label":       req["label"],
                "description": req["description"],
                "critical":    req.get("critical", True),
                "person":      person_label,
                "uploaded":    len(matching) > 0,
                "doc_ids":     [str(d.id) for d in matching],
                "ai_status":   matching[0].status if matching else None,
                "ai_issues":   ai_issues,
                "has_errors":  len(ai_issues) > 0,
            })
        return status

    doc_groups = [
        {
            "person":       "applicant",
            "label":        "Principal Applicant",
            "docs":         build_doc_status(FORM2_REQUIRED_DOCS_APPLICANT, "applicant", skip_eca=is_canadian_edu),
        }
    ]

    if has_spouse:
        doc_groups.append({
            "person": "spouse",
            "label":  "Spouse / Partner",
            "docs":   build_doc_status(FORM2_REQUIRED_DOCS_SPOUSE, "spouse"),
        })

    # Children from uploaded docs (dynamic — child_1 / child_2 / child_3)
    child_persons = {d.person_label for d in all_docs if d.person_label.startswith("child_")}
    for cp in sorted(child_persons):
        doc_groups.append({
            "person": cp,
            "label":  cp.replace("_", " ").title(),
            "docs":   build_doc_status(FORM2_REQUIRED_DOCS_CHILD, cp),
        })

    # ── 3. Summary ───────────────────────────────────────────────
    all_file_docs   = [d for g in doc_groups for d in g["docs"]]
    missing_docs    = [d for d in all_file_docs if not d["uploaded"] and d["critical"]]
    docs_with_errors= [d for d in all_file_docs if d["has_errors"]]
    profile_issues  = sum(1 for c in profile_checks if not c["ok"])

    ready = profile_issues == 0 and len(missing_docs) == 0 and len(docs_with_errors) == 0

    return {
        "ready_to_download": ready,
        "profile_complete":  profile_issues == 0,
        "has_spouse":        has_spouse,
        "profile_checks":    profile_checks,
        "doc_groups":        doc_groups,
        "nonfile_items":     FORM2_NONFILE_ITEMS,
        "missing_docs":      missing_docs,
        "docs_with_errors":  docs_with_errors,
        "summary": {
            "profile_issues":  profile_issues,
            "missing_docs":    len(missing_docs),
            "doc_errors":      len(docs_with_errors),
            "total_docs":      len(all_file_docs),
            "uploaded_docs":   sum(1 for d in all_file_docs if d["uploaded"]),
        }
    }


@app.post(f"{v1}/application/form2/validate-document", tags=["Application Workflow"])
async def validate_document_form2(
    document_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI deep-check for eAPR — same cross-validation logic but with expanded profile context."""
    applicant = await _get_applicant_full(current_user.id, db)
    doc = await db.get(ApplicationDocumentDB, document_id)
    if not doc or doc.applicant_id != applicant.id:
        raise HTTPException(status_code=404, detail="Document not found")

    blob_service = BlobStorageService()
    try:
        file_bytes = await blob_service.download(doc.blob_path)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not retrieve document file")

    primary_lang = next((t for t in applicant.language_tests if t.role == "first"), None)
    has_spouse   = getattr(applicant, 'has_spouse', False)

    profile_ctx = {
        "full_name":        applicant.full_name,
        "date_of_birth":    str(applicant.date_of_birth) if applicant.date_of_birth else None,
        "nationality":      applicant.nationality,
        "marital_status":   applicant.marital_status,
        "person_this_doc_belongs_to": doc.person_label,
        "spouse_name":      applicant.spouse_name if has_spouse else None,
        "spouse_dob":       str(applicant.spouse_dob) if has_spouse and applicant.spouse_dob else None,
        "language_test":    primary_lang.test_type if primary_lang else None,
        "test_scores": {
            "listening": str(primary_lang.listening) if primary_lang else None,
            "reading":   str(primary_lang.reading)   if primary_lang else None,
            "writing":   str(primary_lang.writing)   if primary_lang else None,
            "speaking":  str(primary_lang.speaking)  if primary_lang else None,
        } if primary_lang else None,
        "education_level":  applicant.education.level if applicant.education else None,
        "institution":      applicant.education.institution_name if applicant.education else None,
        "employer":         applicant.work_experiences[0].employer_name if applicant.work_experiences else None,
        "noc_code":         applicant.work_experiences[0].noc_code if applicant.work_experiences else None,
    }

    import base64 as _b64, json as _json
    base64_doc = _b64.b64encode(file_bytes).decode("utf-8")

    from infrastructure.ai.ai_services import DocumentReviewService
    client = DocumentReviewService()._get_client()

    prompt = f"""You are validating a '{doc.document_type}' document (belonging to: {doc.person_label}) for a Canadian eAPR (post-ITA full application).

PROFILE DATA:
{_json.dumps(profile_ctx, indent=2)}

DOCUMENT TYPE: {doc.document_type}
BELONGS TO: {doc.person_label}

Cross-check this document against the profile. eAPR documents have stricter requirements:
- Names must match passport character by character (including middle names)
- For employment letters: must show employer address, supervisor, salary, duties, exact dates, and 30+ hrs/week
- For police certificates: must be issued within the last 6 months for most countries
- For medical exams: must be done by IRCC-designated physician only
- For proof of funds: must show sufficient balance (CAD $13,757 single, more for family)
- Language test must be within 2 years

Return JSON:
{{
  "cross_checks": [
    {{
      "field": "field name",
      "profile_value": "what profile says",
      "document_value": "what document shows or null",
      "status": "pass | fail | warn | not_applicable",
      "note": "explanation"
    }}
  ],
  "overall_valid": true/false,
  "critical_mismatches": ["fields that will cause eAPR rejection"],
  "warnings": ["non-critical notes"],
  "eapr_specific_issues": ["issues specific to eAPR requirements beyond Express Entry profile"],
  "summary": "brief assessment"
}}"""

    try:
        response = await client.chat.completions.create(
            model=get_settings().AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a senior IRCC officer reviewing eAPR documents. Cross-validate against profile data and return JSON only."},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{doc.mime_type or 'image/jpeg'};base64,{base64_doc}",
                        "detail": "high"
                    }}
                ]}
            ],
            max_tokens=1500,
            response_format={"type": "json_object"}
        )
        result = _json.loads(response.choices[0].message.content)
        if result.get("critical_mismatches"):
            existing = doc.ai_issues or []
            doc.ai_issues = list(set(existing + result["critical_mismatches"]))
            await db.commit()
        return result
    except Exception as e:
        logger.error(f"eAPR deep validate error: {e}")
        raise HTTPException(status_code=500, detail=f"AI validation failed: {str(e)}")


@app.get(f"{v1}/profile/ircc-pdf/form1", tags=["IRCC PDF"])
async def download_ircc_form1(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate and download the Express Entry Profile pre-filled PDF (Form 1)."""
    from fastapi.responses import Response
    from api.ircc_pdf_generator import build_form1

    applicant = await _get_applicant_full(current_user.id, db)
    dob = applicant.date_of_birth
    lang_tests = applicant.language_tests
    primary_lang = next((t for t in lang_tests if t.role == "first"), None)

    profile = {
        "personal": {
            "family_name": applicant.full_name.split(" ")[-1] if " " in applicant.full_name else applicant.full_name,
            "given_name": " ".join(applicant.full_name.split(" ")[:-1]) if " " in applicant.full_name else "",
            "dob_year": str(dob.year) if dob else "",
            "dob_month": str(dob.month).zfill(2) if dob else "",
            "dob_day": str(dob.day).zfill(2) if dob else "",
            "country_of_birth": applicant.nationality or "",
            "country_of_citizenship": applicant.nationality or "",
            "marital_status": applicant.marital_status or "",
        },
        "language": {
            "first_language_test": primary_lang.test_type if primary_lang else "",
            "listening_score": str(primary_lang.listening) if primary_lang else "",
            "reading_score": str(primary_lang.reading) if primary_lang else "",
            "writing_score": str(primary_lang.writing) if primary_lang else "",
            "speaking_score": str(primary_lang.speaking) if primary_lang else "",
            "test_date": primary_lang.test_date.isoformat() if primary_lang else "",
            "registration_number": primary_lang.registration_number if primary_lang else "",
            "clb_listening": str(primary_lang.clb_listening) if primary_lang else "",
            "clb_reading": str(primary_lang.clb_reading) if primary_lang else "",
            "clb_writing": str(primary_lang.clb_writing) if primary_lang else "",
            "clb_speaking": str(primary_lang.clb_speaking) if primary_lang else "",
        },
        "education": {
            "highest_level": applicant.education.level if applicant.education else "",
            "country_studied": applicant.education.country if applicant.education else "",
            "field_of_study": applicant.education.field_of_study if applicant.education else "",
            "institution": applicant.education.institution_name if applicant.education else "",
            "is_canadian": str(applicant.education.is_canadian) if applicant.education else "",
            "eca_organization": getattr(applicant.education, 'eca_organization', '') if applicant.education else "",
            "eca_reference": getattr(applicant.education, 'eca_reference_number', '') if applicant.education else "",
        },
        "work_history": [
            {
                "employer": w.employer_name,
                "job_title": w.job_title,
                "noc_code": w.noc_code or "",
                "country": "Canada" if getattr(w, 'experience_type', '') == "canadian" else "Other",
                "start_year": str(w.start_date.year),
                "start_month": str(w.start_date.month).zfill(2),
                "end_year": str(w.end_date.year) if w.end_date else "Present",
                "end_month": str(w.end_date.month).zfill(2) if w.end_date else "",
                "hours_per_week": str(w.hours_per_week or ""),
                "is_current": str(w.is_current),
            }
            for w in applicant.work_experiences
        ],
        "adaptability": {
            "has_sibling": str(getattr(applicant, 'has_sibling_in_canada', False)),
            "has_job_offer": str(bool(applicant.job_offer)),
            "has_pnp": str(getattr(applicant, 'has_provincial_nomination', False)),
        },
        "crs": {
            "total": applicant.crs_score_json.get("total") if applicant.crs_score_json else None,
        }
    }

    pdf_bytes = build_form1(profile)
    name = applicant.full_name.replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="IRCC_Form1_Express_Entry_{name}.pdf"'}
    )


@app.get(f"{v1}/profile/ircc-pdf/form2", tags=["IRCC PDF"])
async def download_ircc_form2(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate and download the eAPR pre-filled reference PDF (Form 2)."""
    from fastapi.responses import Response
    from api.ircc_pdf_generator import build_form2

    applicant = await _get_applicant_full(current_user.id, db)
    dob = applicant.date_of_birth
    lang_tests = applicant.language_tests
    primary_lang = next((t for t in lang_tests if t.role == "first"), None)

    profile = {
        "personal": {
            "family_name": applicant.full_name.split(" ")[-1] if " " in applicant.full_name else applicant.full_name,
            "given_name": " ".join(applicant.full_name.split(" ")[:-1]) if " " in applicant.full_name else "",
            "dob_year": str(dob.year) if dob else "",
            "dob_month": str(dob.month).zfill(2) if dob else "",
            "dob_day": str(dob.day).zfill(2) if dob else "",
            "country_of_birth": applicant.nationality or "",
            "country_of_citizenship": applicant.nationality or "",
            "marital_status": applicant.marital_status or "",
        },
        "language": {
            "first_language_test": primary_lang.test_type if primary_lang else "",
            "listening_score": str(primary_lang.listening) if primary_lang else "",
            "reading_score": str(primary_lang.reading) if primary_lang else "",
            "writing_score": str(primary_lang.writing) if primary_lang else "",
            "speaking_score": str(primary_lang.speaking) if primary_lang else "",
            "test_date": primary_lang.test_date.isoformat() if primary_lang else "",
            "registration_number": primary_lang.registration_number if primary_lang else "",
            "clb_listening": str(primary_lang.clb_listening) if primary_lang else "",
            "clb_reading": str(primary_lang.clb_reading) if primary_lang else "",
            "clb_writing": str(primary_lang.clb_writing) if primary_lang else "",
            "clb_speaking": str(primary_lang.clb_speaking) if primary_lang else "",
        },
        "education": {
            "highest_level": applicant.education.level if applicant.education else "",
            "country_studied": applicant.education.country if applicant.education else "",
            "field_of_study": applicant.education.field_of_study if applicant.education else "",
            "institution": applicant.education.institution_name if applicant.education else "",
            "is_canadian": str(applicant.education.is_canadian) if applicant.education else "",
            "eca_organization": getattr(applicant.education, 'eca_organization', '') if applicant.education else "",
            "eca_reference": getattr(applicant.education, 'eca_reference_number', '') if applicant.education else "",
        },
        "work_history": [
            {
                "employer": w.employer_name,
                "job_title": w.job_title,
                "noc_code": w.noc_code or "",
                "country": "Canada" if getattr(w, 'experience_type', '') == "canadian" else "Other",
                "start_year": str(w.start_date.year),
                "start_month": str(w.start_date.month).zfill(2),
                "end_year": str(w.end_date.year) if w.end_date else "Present",
                "end_month": str(w.end_date.month).zfill(2) if w.end_date else "",
                "hours_per_week": str(w.hours_per_week or ""),
                "is_current": str(w.is_current),
            }
            for w in applicant.work_experiences
        ],
        "adaptability": {
            "has_sibling": str(getattr(applicant, 'has_sibling_in_canada', False)),
            "has_job_offer": str(bool(applicant.job_offer)),
            "has_pnp": str(getattr(applicant, 'has_provincial_nomination', False)),
        },
    }

    pdf_bytes = build_form2(profile)
    name = applicant.full_name.replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="IRCC_Form2_eAPR_{name}.pdf"'}
    )


# ═══════════════════════════════════════════════════════════════════════
# Student Visa Module
# ═══════════════════════════════════════════════════════════════════════

# Lazy-init service instances
_student_eligibility_svc = None
_student_sop_svc         = None
_student_financial_svc   = None
_student_risk_svc        = None

def _get_student_eligibility(): global _student_eligibility_svc; _student_eligibility_svc = _student_eligibility_svc or StudentEligibilityService(); return _student_eligibility_svc
def _get_student_sop():         global _student_sop_svc;         _student_sop_svc         = _student_sop_svc         or StudentSOPService();          return _student_sop_svc
def _get_student_financial():   global _student_financial_svc;   _student_financial_svc   = _student_financial_svc   or StudentFinancialLetterService(); return _student_financial_svc
def _get_student_risk():        global _student_risk_svc;         _student_risk_svc         = _student_risk_svc         or StudentVisaRiskService();       return _student_risk_svc


from infrastructure.persistence.database import StudentProfileDB, StudentDocumentDB


# ── Student Profile CRUD ────────────────────────────────────────

@app.get(f"{v1}/student/profile", tags=["Student Visa"])
async def get_student_profile(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        return None
    return profile


@app.post(f"{v1}/student/profile", tags=["Student Visa"])
async def upsert_student_profile(
    data: dict,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()

    # Parse DOB string → date
    if data.get("dob") and isinstance(data["dob"], str):
        from datetime import date as _date
        try:
            data["dob"] = _date.fromisoformat(data["dob"])
        except ValueError:
            data.pop("dob", None)

    if profile is None:
        profile = StudentProfileDB(user_id=current_user.id, **{
            k: v for k, v in data.items()
            if hasattr(StudentProfileDB, k) and k not in ("id", "user_id", "created_at", "updated_at", "user", "eligibility_result", "eligibility_generated_at")
        })
        db.add(profile)
    else:
        for k, v in data.items():
            if hasattr(profile, k) and k not in ("id", "user_id", "created_at", "user"):
                setattr(profile, k, v)

    await db.commit()
    await db.refresh(profile)
    logger.info(f"StudentProfile upserted: user_id={current_user.id}")
    return profile


# ── Eligibility Assessment ──────────────────────────────────────

@app.post(f"{v1}/student/eligibility", tags=["Student Visa"])
async def check_student_eligibility(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Run full AI eligibility assessment against student profile."""
    result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found. Complete onboarding first.")

    # Serialize profile to dict for AI
    profile_dict = {
        "nationality":              profile.nationality,
        "current_country":          profile.current_country,
        "current_education_level":  profile.current_education_level,
        "gpa":                      profile.gpa,
        "gpa_scale":                profile.gpa_scale,
        "field_of_study":           profile.field_of_study,
        "institution_name":         profile.institution_name,
        "graduation_year":          profile.graduation_year,
        "has_gaps":                 profile.has_gaps,
        "gap_explanation":          profile.gap_explanation,
        "language_test":            profile.language_test,
        "ielts_overall":            profile.ielts_overall,
        "ielts_listening":          profile.ielts_listening,
        "ielts_reading":            profile.ielts_reading,
        "ielts_writing":            profile.ielts_writing,
        "ielts_speaking":           profile.ielts_speaking,
        "pte_overall":              profile.pte_overall,
        "toefl_total":              profile.toefl_total,
        "target_level":             profile.target_level,
        "target_field":             profile.target_field,
        "target_countries":         profile.target_countries or [],
        "preferred_intake":         profile.preferred_intake,
        "target_university":        profile.target_university,
        "annual_budget_usd":        profile.annual_budget_usd,
        "has_sponsor":              profile.has_sponsor,
        "sponsor_relationship":     profile.sponsor_relationship,
        "sponsor_annual_income_usd":profile.sponsor_annual_income_usd,
        "has_savings":              profile.has_savings,
        "savings_usd":              profile.savings_usd,
        "work_experience_years":    profile.work_experience_years,
        "work_field":               profile.work_field,
        "has_refusal":              profile.has_refusal,
        "refusal_countries":        profile.refusal_countries or [],
    }

    assessment = await _get_student_eligibility().assess(profile_dict)

    # Cache result on profile
    from datetime import datetime as _dt
    profile.eligibility_result       = assessment
    profile.eligibility_generated_at = _dt.utcnow()
    await db.commit()

    return assessment


# ── AI Document Generation ──────────────────────────────────────

class SopRequest(BaseModel):
    country:      str
    university:   str
    program:      str
    word_count:   int = 800
    custom_notes: str = ""

@app.post(f"{v1}/student/ai/sop", tags=["Student Visa"])
async def generate_sop(
    req: SopRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Complete your student profile first")

    profile_dict = {
        "full_name":               profile.nationality,  # nationality used as context
        "nationality":             profile.nationality,
        "current_education_level": profile.current_education_level,
        "field_of_study":          profile.field_of_study,
        "institution_name":        profile.institution_name,
        "graduation_year":         profile.graduation_year,
        "gpa":                     profile.gpa,
        "gpa_scale":               profile.gpa_scale,
        "has_gaps":                profile.has_gaps,
        "gap_explanation":         profile.gap_explanation,
        "work_experience_years":   profile.work_experience_years,
        "work_field":              profile.work_field,
        "language_test":           profile.language_test,
        "ielts_overall":           profile.ielts_overall,
        "target_level":            profile.target_level,
        "target_field":            profile.target_field,
        "annual_budget_usd":       profile.annual_budget_usd,
        "has_refusal":             profile.has_refusal,
    }

    sop_result = await _get_student_sop().generate(
        profile=profile_dict,
        country=req.country,
        university=req.university,
        program=req.program,
        word_count=req.word_count,
        custom_notes=req.custom_notes
    )

    # Save to DB
    doc = StudentDocumentDB(
        user_id=current_user.id,
        doc_type="sop",
        country=req.country,
        university=req.university,
        program=req.program,
        content=sop_result.get("sop_text", ""),
        word_count=sop_result.get("word_count"),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {**sop_result, "doc_id": str(doc.id)}


class FinancialLetterRequest(BaseModel):
    country:     str
    letter_type: str = "sponsorship"   # sponsorship | personal_statement | bank_explanation

@app.post(f"{v1}/student/ai/financial-letter", tags=["Student Visa"])
async def generate_financial_letter(
    req: FinancialLetterRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Complete your student profile first")

    profile_dict = {
        "nationality":              profile.nationality,
        "target_field":             profile.target_field,
        "target_level":             profile.target_level,
        "target_university":        profile.target_university,
        "has_sponsor":              profile.has_sponsor,
        "sponsor_relationship":     profile.sponsor_relationship,
        "sponsor_annual_income_usd":profile.sponsor_annual_income_usd,
        "savings_usd":              profile.savings_usd,
        "annual_budget_usd":        profile.annual_budget_usd,
    }

    letter_result = await _get_student_financial().generate(
        profile=profile_dict,
        country=req.country,
        letter_type=req.letter_type
    )

    doc = StudentDocumentDB(
        user_id=current_user.id,
        doc_type="financial_letter",
        country=req.country,
        university=profile.target_university or "",
        program=profile.target_field or "",
        content=letter_result.get("letter_text", ""),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {**letter_result, "doc_id": str(doc.id)}


class VisaRiskRequest(BaseModel):
    country: str

@app.post(f"{v1}/student/ai/visa-risk", tags=["Student Visa"])
async def analyze_visa_risk(
    req: VisaRiskRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Complete your student profile first")

    profile_dict = {
        "nationality":              profile.nationality,
        "current_country":          profile.current_country,
        "current_education_level":  profile.current_education_level,
        "gpa":                      profile.gpa,
        "field_of_study":           profile.field_of_study,
        "language_test":            profile.language_test,
        "ielts_overall":            profile.ielts_overall,
        "ielts_writing":            profile.ielts_writing,
        "ielts_speaking":           profile.ielts_speaking,
        "target_level":             profile.target_level,
        "target_field":             profile.target_field,
        "target_university":        profile.target_university,
        "annual_budget_usd":        profile.annual_budget_usd,
        "has_sponsor":              profile.has_sponsor,
        "sponsor_annual_income_usd":profile.sponsor_annual_income_usd,
        "savings_usd":              profile.savings_usd,
        "work_experience_years":    profile.work_experience_years,
        "has_refusal":              profile.has_refusal,
        "refusal_countries":        profile.refusal_countries or [],
        "has_gaps":                 profile.has_gaps,
        "gap_explanation":          profile.gap_explanation,
    }

    return await _get_student_risk().analyze(profile_dict, req.country)


# ── Saved Documents ─────────────────────────────────────────────

@app.get(f"{v1}/student/documents", tags=["Student Visa"])
async def get_student_documents(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentDocumentDB)
        .where(StudentDocumentDB.user_id == current_user.id)
        .order_by(StudentDocumentDB.created_at.desc())
    )
    return result.scalars().all()


@app.delete(f"{v1}/student/documents/{{doc_id}}", tags=["Student Visa"])
async def delete_student_document(
    doc_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    doc = await db.get(StudentDocumentDB, doc_id)
    if not doc or doc.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()
    return {"message": "Deleted"}


# ═══════════════════════════════════════════════════════════════════════
# Phase 3 — Application Tracker
# ═══════════════════════════════════════════════════════════════════════

from infrastructure.persistence.database import StudentApplicationDB, ScholarshipDB
import datetime as _dt

# Default document checklist per country
def _default_checklist(country: str, status: str = "researching") -> list:
    base = [
        {"id": "passport",     "label": "Valid Passport",             "done": False, "category": "identity"},
        {"id": "photo",        "label": "Passport Photos",            "done": False, "category": "identity"},
        {"id": "language",     "label": "Language Test Result",       "done": False, "category": "academic"},
        {"id": "transcripts",  "label": "Academic Transcripts",       "done": False, "category": "academic"},
        {"id": "degree",       "label": "Degree Certificate",         "done": False, "category": "academic"},
        {"id": "sop",          "label": "Statement of Purpose",       "done": False, "category": "academic"},
        {"id": "lor1",         "label": "Letter of Recommendation 1", "done": False, "category": "academic"},
        {"id": "lor2",         "label": "Letter of Recommendation 2", "done": False, "category": "academic"},
        {"id": "cv",           "label": "CV / Resume",                "done": False, "category": "academic"},
        {"id": "bank_stmt",    "label": "Bank Statements (6 months)", "done": False, "category": "financial"},
        {"id": "sponsor_ltr",  "label": "Financial Sponsorship Letter","done": False, "category": "financial"},
    ]
    country_extras = {
        "canada":    [
            {"id": "offer_letter",  "label": "Offer Letter from DLI",          "done": False, "category": "visa"},
            {"id": "gc_key",        "label": "GCKey account created",           "done": False, "category": "visa"},
            {"id": "biometrics",    "label": "Biometrics (if required)",        "done": False, "category": "visa"},
            {"id": "medical",       "label": "Medical Exam (if required)",      "done": False, "category": "visa"},
        ],
        "uk":        [
            {"id": "cas",           "label": "CAS Number from university",      "done": False, "category": "visa"},
            {"id": "tb_test",       "label": "TB Test Result (if applicable)",  "done": False, "category": "visa"},
            {"id": "uk_vi_acct",    "label": "UKVI online account created",     "done": False, "category": "visa"},
        ],
        "australia": [
            {"id": "coe",           "label": "Confirmation of Enrolment (CoE)", "done": False, "category": "visa"},
            {"id": "oshc",          "label": "OSHC Health Insurance",           "done": False, "category": "visa"},
            {"id": "gte",           "label": "GTE Statement written",           "done": False, "category": "visa"},
            {"id": "immi_acct",     "label": "ImmiAccount created",             "done": False, "category": "visa"},
        ],
        "usa":       [
            {"id": "i20",           "label": "Form I-20 from university",       "done": False, "category": "visa"},
            {"id": "sevis_fee",     "label": "SEVIS fee paid",                  "done": False, "category": "visa"},
            {"id": "ds160",         "label": "DS-160 form completed",           "done": False, "category": "visa"},
            {"id": "interview_prep","label": "Interview preparation done",      "done": False, "category": "visa"},
        ],
        "germany":   [
            {"id": "blocked_acct",  "label": "Blocked account (Sperrkonto) opened", "done": False, "category": "financial"},
            {"id": "german_cert",   "label": "German language cert (if needed)", "done": False, "category": "academic"},
            {"id": "mvv",           "label": "Visa appointment booked",         "done": False, "category": "visa"},
            {"id": "health_ins",    "label": "Health insurance arranged",       "done": False, "category": "visa"},
        ],
    }
    return base + country_extras.get(country.lower(), [])


class CreateApplicationRequest(BaseModel):
    university_name:      str
    program_name:         str
    country:              str
    city:                 str = ""
    intake:               str = ""
    duration_years:       float | None = None
    tuition_usd:          int | None   = None
    ranking:              int | None   = None
    website_url:          str | None   = None
    notes:                str | None   = None
    application_deadline: str | None   = None  # ISO date string


class UpdateApplicationRequest(BaseModel):
    status:               str | None   = None
    notes:                str | None   = None
    offer_letter_received: bool | None = None
    offer_conditions:     str | None   = None
    scholarship_amount_usd: int | None = None
    is_favourite:         bool | None  = None
    applied_date:         str | None   = None
    offer_date:           str | None   = None
    visa_applied_date:    str | None   = None
    visa_decision_date:   str | None   = None
    tuition_deposit_due:  str | None   = None
    application_deadline: str | None   = None
    doc_checklist:        list | None  = None
    tuition_usd:          int | None   = None
    ranking:              int | None   = None


def _parse_date(s: str | None) -> _dt.date | None:
    if not s: return None
    try: return _dt.date.fromisoformat(s)
    except: return None


@app.get(f"{v1}/student/applications", tags=["Student Tracker"])
async def list_applications(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentApplicationDB)
        .where(StudentApplicationDB.user_id == current_user.id)
        .order_by(StudentApplicationDB.created_at.desc())
    )
    apps = result.scalars().all()

    # Attach deadline urgency flags
    today = _dt.date.today()
    out = []
    for a in apps:
        days_to_deadline = None
        if a.application_deadline:
            days_to_deadline = (a.application_deadline - today).days
        out.append({
            "id":                    str(a.id),
            "university_name":       a.university_name,
            "program_name":          a.program_name,
            "country":               a.country,
            "city":                  a.city,
            "intake":                a.intake,
            "duration_years":        a.duration_years,
            "tuition_usd":           a.tuition_usd,
            "ranking":               a.ranking,
            "website_url":           a.website_url,
            "notes":                 a.notes,
            "is_favourite":          a.is_favourite,
            "status":                a.status,
            "application_deadline":  str(a.application_deadline) if a.application_deadline else None,
            "applied_date":          str(a.applied_date)         if a.applied_date         else None,
            "offer_date":            str(a.offer_date)           if a.offer_date           else None,
            "visa_applied_date":     str(a.visa_applied_date)    if a.visa_applied_date    else None,
            "visa_decision_date":    str(a.visa_decision_date)   if a.visa_decision_date   else None,
            "tuition_deposit_due":   str(a.tuition_deposit_due)  if a.tuition_deposit_due  else None,
            "offer_letter_received": a.offer_letter_received,
            "offer_conditions":      a.offer_conditions,
            "scholarship_amount_usd":a.scholarship_amount_usd,
            "doc_checklist":         a.doc_checklist or [],
            "created_at":            str(a.created_at),
            "updated_at":            str(a.updated_at),
            # computed
            "days_to_deadline":      days_to_deadline,
            "docs_done":             sum(1 for d in (a.doc_checklist or []) if d.get("done")),
            "docs_total":            len(a.doc_checklist or []),
        })
    return out


@app.post(f"{v1}/student/applications", tags=["Student Tracker"])
async def create_application(
    req: CreateApplicationRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    checklist = _default_checklist(req.country)
    app_record = StudentApplicationDB(
        user_id          = current_user.id,
        university_name  = req.university_name,
        program_name     = req.program_name,
        country          = req.country,
        city             = req.city,
        intake           = req.intake,
        duration_years   = req.duration_years,
        tuition_usd      = req.tuition_usd,
        ranking          = req.ranking,
        website_url      = req.website_url,
        notes            = req.notes,
        application_deadline = _parse_date(req.application_deadline),
        doc_checklist    = checklist,
        status           = "researching",
    )
    db.add(app_record)
    await db.commit()
    await db.refresh(app_record)
    logger.info(f"StudentApplication created: {req.university_name} | {req.country} | user={current_user.id}")
    return {"id": str(app_record.id), "message": "Application added"}


@app.put(f"{v1}/student/applications/{{app_id}}", tags=["Student Tracker"])
async def update_application(
    app_id: UUID,
    req: UpdateApplicationRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    record = await db.get(StudentApplicationDB, app_id)
    if not record or record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Application not found")

    date_fields = ("applied_date", "offer_date", "visa_applied_date",
                   "visa_decision_date", "tuition_deposit_due", "application_deadline")

    for field, val in req.model_dump(exclude_unset=True).items():
        if val is None:
            continue
        if field in date_fields:
            setattr(record, field, _parse_date(val))
        else:
            setattr(record, field, val)

    await db.commit()
    await db.refresh(record)
    return {"message": "Updated", "status": record.status}


@app.delete(f"{v1}/student/applications/{{app_id}}", tags=["Student Tracker"])
async def delete_application(
    app_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    record = await db.get(StudentApplicationDB, app_id)
    if not record or record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    await db.delete(record)
    await db.commit()
    return {"message": "Deleted"}


# ── Deadline summary (for dashboard widget) ─────────────────────

@app.get(f"{v1}/student/deadlines", tags=["Student Tracker"])
async def get_upcoming_deadlines(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns all upcoming deadlines across all applications, sorted by urgency."""
    result = await db.execute(
        select(StudentApplicationDB).where(StudentApplicationDB.user_id == current_user.id)
    )
    apps = result.scalars().all()
    today = _dt.date.today()
    deadlines = []

    for a in apps:
        date_fields = [
            ("Application Deadline", a.application_deadline),
            ("Tuition Deposit Due",  a.tuition_deposit_due),
            ("Visa Decision",        a.visa_decision_date),
        ]
        for label, d in date_fields:
            if d and d >= today:
                days = (d - today).days
                deadlines.append({
                    "university":    a.university_name,
                    "program":       a.program_name,
                    "country":       a.country,
                    "label":         label,
                    "date":          str(d),
                    "days_away":     days,
                    "urgent":        days <= 7,
                    "warning":       days <= 21,
                    "app_id":        str(a.id),
                })

    deadlines.sort(key=lambda x: x["days_away"])
    return deadlines[:20]


# ═══════════════════════════════════════════════════════════════════════
# Phase 4 — Financial Tools
# ═══════════════════════════════════════════════════════════════════════

# Country cost-of-living data (annual USD, rough averages for student budgeting)
COUNTRY_COST_DATA = {
    "canada": {
        "flag": "🍁",
        "cities": {
            "toronto":   {"rent": 14400, "food": 5400, "transport": 1200, "misc": 2400},
            "vancouver": {"rent": 15600, "food": 5400, "transport": 1200, "misc": 2400},
            "montreal":  {"rent": 10200, "food": 4800, "transport": 1080, "misc": 2400},
            "calgary":   {"rent": 12000, "food": 5400, "transport": 1200, "misc": 2400},
            "ottawa":    {"rent": 12600, "food": 5400, "transport": 1200, "misc": 2400},
            "other":     {"rent": 10200, "food": 4800, "transport": 1080, "misc": 2400},
        },
        "health_ins_annual": 700,
        "visa_fee": 150,
        "biometrics": 85,
        "currency": "CAD",
        "usd_rate": 0.74,
        "min_funds_required_usd": 10000,  # Living expenses proof
        "proof_of_funds_note": "You need to show tuition + CAD $10,000 for living expenses for the first year.",
    },
    "uk": {
        "flag": "🇬🇧",
        "cities": {
            "london":     {"rent": 16800, "food": 5400, "transport": 1680, "misc": 3000},
            "manchester": {"rent": 10800, "food": 4800, "transport": 1200, "misc": 2400},
            "birmingham": {"rent": 10200, "food": 4800, "transport": 1200, "misc": 2400},
            "edinburgh":  {"rent": 12000, "food": 4800, "transport": 1200, "misc": 2400},
            "other":      {"rent":  9600, "food": 4800, "transport": 1080, "misc": 2400},
        },
        "health_ins_annual": 776,  # IHS surcharge / year
        "visa_fee": 490,
        "biometrics": 0,
        "currency": "GBP",
        "usd_rate": 1.27,
        "min_funds_required_usd": 14700,  # London: £1,334 × 9 months
        "proof_of_funds_note": "Must show 28 consecutive days of bank statements covering tuition + £1,334/month (London) or £1,023/month (elsewhere).",
    },
    "australia": {
        "flag": "🇦🇺",
        "cities": {
            "sydney":    {"rent": 16800, "food": 6000, "transport": 1560, "misc": 2400},
            "melbourne": {"rent": 14400, "food": 5400, "transport": 1440, "misc": 2400},
            "brisbane":  {"rent": 12000, "food": 5400, "transport": 1440, "misc": 2400},
            "perth":     {"rent": 12000, "food": 5400, "transport": 1440, "misc": 2400},
            "adelaide":  {"rent": 10800, "food": 5400, "transport": 1200, "misc": 2400},
            "other":     {"rent": 10200, "food": 4800, "transport": 1200, "misc": 2400},
        },
        "health_ins_annual": 622,  # OSHC approx
        "visa_fee": 710,
        "biometrics": 0,
        "currency": "AUD",
        "usd_rate": 0.65,
        "min_funds_required_usd": 21000,  # AUD $29,710 living cost requirement
        "proof_of_funds_note": "Must prove AUD $29,710/year for living expenses + full tuition for 1st year.",
    },
    "usa": {
        "flag": "🇺🇸",
        "cities": {
            "new_york":    {"rent": 24000, "food": 7200, "transport": 1440, "misc": 3600},
            "los_angeles": {"rent": 20400, "food": 6000, "transport": 1800, "misc": 3000},
            "boston":      {"rent": 22800, "food": 6000, "transport": 1200, "misc": 3000},
            "chicago":     {"rent": 16800, "food": 5400, "transport": 1200, "misc": 2400},
            "other":       {"rent": 13200, "food": 4800, "transport": 1200, "misc": 2400},
        },
        "health_ins_annual": 2400,
        "visa_fee": 185,
        "biometrics": 0,  # included
        "currency": "USD",
        "usd_rate": 1.0,
        "min_funds_required_usd": 0,  # No fixed govt req — must match I-20
        "proof_of_funds_note": "Must show full 1-year costs as stated on Form I-20: tuition + room + board + personal expenses.",
    },
    "germany": {
        "flag": "🇩🇪",
        "cities": {
            "berlin":    {"rent": 9600, "food": 4200, "transport": 1080, "misc": 1800},
            "munich":    {"rent": 12000, "food": 4800, "transport": 1200, "misc": 2400},
            "hamburg":   {"rent": 10800, "food": 4200, "transport": 1200, "misc": 1800},
            "frankfurt": {"rent": 11400, "food": 4200, "transport": 1200, "misc": 2400},
            "other":     {"rent":  8400, "food": 3600, "transport":  960, "misc": 1800},
        },
        "health_ins_annual": 1200,  # public health insurance
        "visa_fee": 75,
        "biometrics": 0,
        "currency": "EUR",
        "usd_rate": 1.09,
        "min_funds_required_usd": 13500,  # €11,208 blocked account (2024)
        "proof_of_funds_note": "Must open a blocked account (Sperrkonto) with €11,208 (approx $12,200) before visa appointment.",
    },
}

# Curated scholarship data
SCHOLARSHIPS_SEED = [
    # Canada
    {"name": "Vanier Canada Graduate Scholarship", "provider": "Government of Canada", "country": "canada",
     "level": "phd", "amount_usd": 50000, "is_full": False, "deadline_note": "Annually in October",
     "eligibility": "PhD students demonstrating academic excellence, research potential, and leadership. Open to all nationalities.",
     "url": "https://vanier.gc.ca", "fields": ["any"], "nationalities": ["any"], "min_gpa": 3.7},
    {"name": "Ontario Trillium Scholarship", "provider": "Government of Ontario", "country": "canada",
     "level": "phd", "amount_usd": 40000, "is_full": False, "deadline_note": "Via university — check annually",
     "eligibility": "International PhD students at Ontario universities. Exceptional academic record required.",
     "url": "https://www.ontario.ca/page/ontario-trillium-scholarship", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    {"name": "University of Toronto International Scholarship", "provider": "University of Toronto", "country": "canada",
     "level": "bachelors", "amount_usd": 12000, "is_full": False, "deadline_note": "Annually in January",
     "eligibility": "Top international undergrad applicants. Automatically considered on application.",
     "url": "https://future.utoronto.ca", "fields": ["any"], "nationalities": ["any"], "min_gpa": 3.8},
    # UK
    {"name": "Chevening Scholarship", "provider": "UK Government (FCDO)", "country": "uk",
     "level": "masters", "amount_usd": 45000, "is_full": True, "deadline_note": "Annually in November",
     "eligibility": "Future leaders from 160+ countries. Minimum 2 years work experience. Masters only.",
     "url": "https://www.chevening.org", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    {"name": "Commonwealth Scholarship", "provider": "Commonwealth Scholarship Commission", "country": "uk",
     "level": "masters", "amount_usd": 40000, "is_full": True, "deadline_note": "Annually in December",
     "eligibility": "Citizens of low and middle income Commonwealth countries. Government nominated.",
     "url": "https://cscuk.fcdo.gov.uk", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    {"name": "Rhodes Scholarship", "provider": "Rhodes Trust", "country": "uk",
     "level": "masters", "amount_usd": 60000, "is_full": True, "deadline_note": "Annually in August–October",
     "eligibility": "Academic excellence, leadership, character. Oxford University only.",
     "url": "https://www.rhodeshouse.ox.ac.uk", "fields": ["any"], "nationalities": ["any"], "min_gpa": 3.9},
    # Australia
    {"name": "Australia Awards Scholarship", "provider": "Australian Government (DFAT)", "country": "australia",
     "level": "masters", "amount_usd": 50000, "is_full": True, "deadline_note": "Varies by country — typically April–June",
     "eligibility": "Citizens of participating developing countries. Government/development sector focus.",
     "url": "https://www.australiaawards.gov.au", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    {"name": "Endeavour Leadership Programme", "provider": "Australian Government", "country": "australia",
     "level": "any", "amount_usd": 30000, "is_full": False, "deadline_note": "Check current status — programme paused",
     "eligibility": "High-achieving students and professionals. Research and vocational education tracks.",
     "url": "https://internationaleducation.gov.au", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    # USA
    {"name": "Fulbright Foreign Student Program", "provider": "US Government (ECA)", "country": "usa",
     "level": "masters", "amount_usd": 35000, "is_full": True, "deadline_note": "Varies by home country — typically Feb–Oct",
     "eligibility": "Graduate-level study or research. Citizens of eligible countries. Apply through home country Fulbright commission.",
     "url": "https://foreign.fulbrightonline.org", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    {"name": "Hubert H. Humphrey Fellowship", "provider": "US Government (ECA)", "country": "usa",
     "level": "any", "amount_usd": 30000, "is_full": True, "deadline_note": "Via local US Embassy — typically Feb–April",
     "eligibility": "Mid-career professionals from developing countries. Not a degree programme — 10 months.",
     "url": "https://www.humphreyfellowship.org", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    # Germany
    {"name": "DAAD Scholarship", "provider": "DAAD (German Academic Exchange)", "country": "germany",
     "level": "masters", "amount_usd": 14400, "is_full": False, "deadline_note": "Annually in October–November",
     "eligibility": "Outstanding foreign students and researchers. Various programmes by field and nationality.",
     "url": "https://www.daad.de/en/study-and-research-in-germany/scholarships", "fields": ["any"], "nationalities": ["any"], "min_gpa": 3.5},
    {"name": "Heinrich Böll Foundation Scholarship", "provider": "Heinrich Böll Foundation", "country": "germany",
     "level": "any", "amount_usd": 13200, "is_full": False, "deadline_note": "Twice yearly — March and September",
     "eligibility": "Committed to green politics, human rights, ecology. Open to international students in Germany.",
     "url": "https://www.boell.de/en/scholarships", "fields": ["any"], "nationalities": ["any"], "min_gpa": None},
    {"name": "Konrad-Adenauer-Stiftung Scholarship", "provider": "KAS Foundation", "country": "germany",
     "level": "any", "amount_usd": 13200, "is_full": False, "deadline_note": "Annually in January and July",
     "eligibility": "Above-average academic performance and civic/political engagement.",
     "url": "https://www.kas.de/en/web/begabtenfoerderung-und-kultur/scholarships", "fields": ["any"], "nationalities": ["any"], "min_gpa": 3.5},
]


@app.get(f"{v1}/student/financial/calculator", tags=["Student Financial"])
async def calculate_proof_of_funds(
    country:    str,
    city:       str = "other",
    tuition_usd: int = 0,
    duration_years: float = 1.0,
    current_user: UserDB = Depends(get_current_user)
):
    """
    Returns a detailed proof-of-funds breakdown for the chosen country and city.
    Calculates what the visa officer needs to see on the bank statement.
    """
    cd = COUNTRY_COST_DATA.get(country.lower())
    if not cd:
        raise HTTPException(status_code=400, detail=f"Country '{country}' not supported. Use: canada, uk, australia, usa, germany")

    city_data = cd["cities"].get(city.lower(), cd["cities"]["other"])

    annual_living = (
        city_data["rent"] + city_data["food"] +
        city_data["transport"] + city_data["misc"] +
        cd["health_ins_annual"]
    )

    total_living    = annual_living * duration_years
    total_tuition   = tuition_usd   * duration_years
    visa_and_admin  = cd["visa_fee"] + cd.get("biometrics", 0)

    # What to show the embassy (typically 1st year)
    first_year_show = tuition_usd + annual_living
    total_program   = total_tuition + total_living + visa_and_admin

    return {
        "country":          country,
        "flag":             cd["flag"],
        "city":             city,
        "currency":         cd["currency"],
        "usd_rate":         cd["usd_rate"],
        "tuition_usd_annual":  tuition_usd,
        "breakdown_annual": {
            "tuition":         tuition_usd,
            "rent":            city_data["rent"],
            "food":            city_data["food"],
            "transport":       city_data["transport"],
            "health_insurance":cd["health_ins_annual"],
            "miscellaneous":   city_data["misc"],
            "total_living":    annual_living,
            "total_annual":    tuition_usd + annual_living,
        },
        "visa_costs": {
            "visa_fee":    cd["visa_fee"],
            "biometrics":  cd.get("biometrics", 0),
            "total_admin": visa_and_admin,
        },
        "program_totals": {
            "duration_years":       duration_years,
            "total_tuition":        total_tuition,
            "total_living":         total_living,
            "total_program_cost":   total_program,
        },
        "visa_requirement": {
            "must_show_usd":        first_year_show,
            "minimum_required_usd": cd["min_funds_required_usd"],
            "note":                 cd["proof_of_funds_note"],
            "comfortable_buffer":   int(first_year_show * 1.2),  # 20% buffer recommended
        },
        "savings_needed_by_country": {
            c: COUNTRY_COST_DATA[c]["min_funds_required_usd"]
            for c in COUNTRY_COST_DATA
        },
    }


@app.get(f"{v1}/student/scholarships", tags=["Student Financial"])
async def find_scholarships(
    country:    str | None  = None,
    level:      str | None  = None,
    max_amount: int | None  = None,
    full_only:  bool        = False,
    current_user: UserDB    = Depends(get_current_user),
    db: AsyncSession        = Depends(get_db)
):
    """
    Returns curated scholarships filtered by country, level, and amount.
    Also matches against the user's student profile (GPA, IELTS, nationality).
    """
    # Fetch student profile for personalised matching
    sp_result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = sp_result.scalar_one_or_none()

    user_nationality = (profile.nationality or "").lower() if profile else ""
    user_gpa         = profile.gpa            if profile else None
    user_gpa_scale   = profile.gpa_scale or 4.0 if profile else 4.0
    user_ielts       = profile.ielts_overall   if profile else None
    user_level       = (profile.target_level or "").lower() if profile else ""

    scholarships = list(SCHOLARSHIPS_SEED)

    # Try DB first (seeded scholarships)
    db_result = await db.execute(
        select(ScholarshipDB).where(ScholarshipDB.active == True)
    )
    db_scholarships = db_result.scalars().all()
    if db_scholarships:
        scholarships = [
            {
                "name": s.name, "provider": s.provider, "country": s.country,
                "level": s.level, "amount_usd": s.amount_usd, "is_full": s.is_full,
                "deadline_note": s.deadline_note, "eligibility": s.eligibility,
                "url": s.url, "fields": s.fields, "nationalities": s.nationalities,
                "min_gpa": s.min_gpa, "min_ielts": s.min_ielts,
            }
            for s in db_scholarships
        ]

    # Apply filters
    filtered = []
    for s in scholarships:
        if country   and s["country"].lower() != country.lower():  continue
        if level     and s["level"]   not in (level.lower(), "any"): continue
        if full_only and not s["is_full"]:                           continue
        if max_amount and s.get("amount_usd") and s["amount_usd"] > max_amount: continue
        filtered.append(s)

    # Personalised match scoring
    def match_score(s) -> int:
        score = 50
        # Country matches user targets
        if profile and s["country"] in (profile.target_countries or []):
            score += 20
        # Level match
        if user_level and (s["level"] == user_level or s["level"] == "any"):
            score += 15
        # Nationality eligible
        nats = s.get("nationalities") or ["any"]
        if "any" in nats or user_nationality in nats:
            score += 10
        else:
            score -= 20
        # GPA check
        min_gpa = s.get("min_gpa")
        if min_gpa and user_gpa:
            gpa_norm = (user_gpa / user_gpa_scale) * 4.0
            if gpa_norm >= min_gpa: score += 5
            else: score -= 15
        # Full scholarship bonus
        if s["is_full"]: score += 5
        return max(0, min(100, score))

    for s in filtered:
        s["match_score"] = match_score(s)
        s["eligible"]    = s["match_score"] >= 40

    filtered.sort(key=lambda x: (-x["match_score"], -(x.get("amount_usd") or 0)))

    return {
        "total":          len(filtered),
        "scholarships":   filtered,
        "profile_used":   profile is not None,
        "filters_applied": {
            "country": country, "level": level,
            "full_only": full_only, "max_amount": max_amount,
        },
    }


# ═══════════════════════════════════════════════════════════════════════
# Phase 5 — Post-Acceptance + PR Pathway Tracker
# ═══════════════════════════════════════════════════════════════════════

# ── PGWP Eligibility Rules ───────────────────────────────────────────
# Source: IRCC PGWP rules as of 2024/2025
PGWP_RULES = {
    # program_duration_months → pgwp_duration_months (0 = not eligible)
    "duration_table": [
        {"min": 0,   "max": 7,   "pgwp": 0,    "note": "Programs under 8 months are not eligible for PGWP."},
        {"min": 8,   "max": 11,  "pgwp": 0,    "note": "Programs of 8–11 months may qualify only if part of a 2+ year program."},
        {"min": 12,  "max": 23,  "pgwp": 12,   "note": "Programs of 1–2 years → PGWP valid for the same length as the program (up to 3 years)."},
        {"min": 24,  "max": 999, "pgwp": 36,   "note": "Programs of 2+ years → PGWP valid for 3 years (maximum)."},
    ],
    "eligible_institutions": "Must be a Designated Learning Institution (DLI) in Canada that is PGWP-eligible. Not all DLIs qualify — check IRCC's PGWP-eligible school list.",
    "distance_learning_cap": 0.5,  # max 50% of credits online
    "language_requirement": "CLB 7 in all four abilities (IELTS 6.0 each) required since November 2024.",
    "field_of_study_requirement": "Since November 2024, certain PGWP applicants must study in an eligible field (STEM, healthcare, trade, agriculture, education — not general arts/humanities). Check IRCC for the current list.",
}

# CRS points lookup tables for projection
CRS_AGE_POINTS = {
    # (age): points_no_spouse
    17: 0, 18: 99, 19: 105, 20: 110, 21: 114, 22: 119, 23: 123,
    24: 128, 25: 132, 26: 136, 27: 140, 28: 144, 29: 147, 30: 150,
    31: 148, 32: 145, 33: 142, 34: 139, 35: 136, 36: 130, 37: 124,
    38: 118, 39: 112, 40: 106, 41: 100, 42: 94, 43: 88, 44: 82,
    45: 76, 46: 70, 47: 64,
}

CRS_EDUCATION_POINTS = {
    # level: (no_spouse, with_spouse)
    "high_school":     (28,  28),
    "one_year_diploma":(84,  84),
    "two_year_diploma":(91,  91),
    "bachelors":       (120, 112),
    "two_or_more_degrees": (128, 119),
    "masters":         (135, 126),
    "phd":             (150, 140),
}

CRS_CANADIAN_WORK = {
    # years: (no_spouse, with_spouse)
    0: (0, 0), 1: (40, 35), 2: (53, 46), 3: (64, 56), 4: (72, 63), 5: (80, 70),
}

CRS_LANGUAGE_POINTS = {
    # clb: points_first_language (no spouse)
    4: 6, 5: 6, 6: 8, 7: 16, 8: 22, 9: 29, 10: 32,
}

PGWP_CRS_BONUS_POINTS = 15   # Canadian education bonus (≥2yr degree from Canadian institution)
JOB_OFFER_CRS_BONUS = {
    "teer0_senior": 200,
    "teer0_other":  50,
    "teer1_2_3":    50,
}


def _estimate_clb(ielts: float | None) -> int:
    """Rough IELTS overall → CLB mapping for projection purposes."""
    if not ielts: return 7
    if ielts >= 8.0: return 10
    if ielts >= 7.5: return 9
    if ielts >= 6.5: return 8
    if ielts >= 6.0: return 7
    if ielts >= 5.5: return 6
    return 5


def _crs_age_pts(age: int) -> int:
    if age < 18: return 0
    if age > 47: return 0
    return CRS_AGE_POINTS.get(age, 0)


def _crs_edu_pts(level: str, with_spouse: bool = False) -> int:
    row = CRS_EDUCATION_POINTS.get(level, (0, 0))
    return row[1] if with_spouse else row[0]


def _crs_lang_pts(clb: int, with_spouse: bool = False) -> int:
    capped = min(clb, 10)
    base = CRS_LANGUAGE_POINTS.get(capped, 32)
    # 4 skills × base points each (simplified — real calc varies per skill)
    return base * 4


def _crs_cdn_work_pts(years: float, with_spouse: bool = False) -> int:
    capped = min(int(years), 5)
    row = CRS_CANADIAN_WORK.get(capped, (0, 0))
    return row[1] if with_spouse else row[0]


def _pgwp_months(program_months: int) -> tuple[int, str]:
    for row in PGWP_RULES["duration_table"]:
        if row["min"] <= program_months <= row["max"]:
            return row["pgwp"], row["note"]
    return 0, "Unknown program duration."


def _study_to_edu_level(target_level: str) -> str:
    mapping = {
        "bachelors": "bachelors",
        "masters":   "masters",
        "phd":       "phd",
        "diploma":   "two_year_diploma",
        "language_course": "high_school",
    }
    return mapping.get(target_level, "bachelors")


@app.get(f"{v1}/student/pr-pathway", tags=["Student PR Pathway"])
async def get_pr_pathway(
    country: str = "canada",
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Full Student → PR pathway analysis for Canada.
    Returns PGWP eligibility, CRS projection at each stage, Express Entry
    timeline, and a milestone roadmap.
    """
    # ── Load student profile ────────────────────────────────────
    sp_result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = sp_result.scalar_one_or_none()

    # ── Load accepted application (offer_accepted or visa_approved) ──
    app_result = await db.execute(
        select(StudentApplicationDB)
        .where(
            StudentApplicationDB.user_id == current_user.id,
            StudentApplicationDB.country == "canada",
            StudentApplicationDB.status.in_(["offer_accepted", "visa_approved"]),
        )
        .order_by(StudentApplicationDB.updated_at.desc())
    )
    accepted_app = app_result.scalars().first()

    # ── Load existing Express Entry applicant profile (if any) ──
    ee_result = await db.execute(
        select(ApplicantDB)
        .options(
            selectinload(ApplicantDB.language_tests),
            selectinload(ApplicantDB.work_experiences),
            selectinload(ApplicantDB.education),
        )
        .where(ApplicantDB.user_id == current_user.id)
    )
    ee_profile = ee_result.scalar_one_or_none()

    today = _dt.date.today()

    # ── Resolve key inputs ──────────────────────────────────────
    dob = profile.dob if profile else None
    current_age = None
    if dob:
        current_age = (today - dob).days // 365

    target_level    = (profile.target_level or "masters") if profile else "masters"
    ielts_overall   = (profile.ielts_overall or 6.5)      if profile else 6.5
    work_exp_years  = (profile.work_experience_years or 0) if profile else 0
    field_of_study  = (profile.target_field or "")         if profile else ""

    # Duration from accepted application or defaults
    program_duration_years  = accepted_app.duration_years  if accepted_app else (
        2.0 if target_level in ("masters","bachelors") else 1.0
    )
    program_duration_months = int((program_duration_years or 2.0) * 12)
    tuition_usd_annual      = accepted_app.tuition_usd     if accepted_app else None

    # ── PGWP Eligibility ────────────────────────────────────────
    pgwp_months, pgwp_note = _pgwp_months(program_duration_months)
    pgwp_eligible = pgwp_months > 0

    clb_current = _estimate_clb(ielts_overall)

    # Language requirement check (CLB 7 = IELTS 6.0 each since Nov 2024)
    lang_ok = ielts_overall is not None and ielts_overall >= 6.0

    # Field of study eligibility (simplified heuristic)
    STEM_FIELDS = ["engineering", "computer", "software", "data", "science", "math",
                   "nursing", "health", "medicine", "electrical", "mechanical",
                   "civil", "agriculture", "education", "trade", "construction"]
    field_lower = field_of_study.lower()
    field_eligible = any(f in field_lower for f in STEM_FIELDS) or not field_of_study

    pgwp_issues = []
    if not pgwp_eligible:
        pgwp_issues.append("Program too short — need at least 8 months (ideally 2+ years for 3-year PGWP).")
    if not lang_ok:
        pgwp_issues.append(f"IELTS {ielts_overall or 'unknown'} — need 6.0+ in all bands (CLB 7) since Nov 2024.")
    if not field_eligible:
        pgwp_issues.append(f"Field of study '{field_of_study}' may not qualify under the 2024 field-of-study requirement. Verify with IRCC.")

    # ── CRS Projection Timeline ─────────────────────────────────
    # We project CRS at 4 milestones:
    # 1. Right now (baseline from EE profile or student profile estimate)
    # 2. After graduation (Canadian education bonus)
    # 3. After 1 year Canadian work experience (PGWP year 1)
    # 4. After 2 years Canadian work experience (strong scenario)

    # Determine edu level after Canadian study
    cdn_edu_level = _study_to_edu_level(target_level)
    age_at_graduation = (current_age + int(program_duration_years)) if current_age else 28
    age_at_1yr_work   = age_at_graduation + 1
    age_at_2yr_work   = age_at_graduation + 2

    clb_post_study = max(clb_current, 8)  # Most students improve to CLB 8+ during/after studies

    def project_crs(age: int, edu_level: str, cdn_work_yrs: float,
                    clb: int, cdn_edu_bonus: bool, job_offer: bool = False) -> dict:
        age_pts     = _crs_age_pts(min(age, 47))
        edu_pts     = _crs_edu_pts(edu_level)
        lang_pts    = _crs_lang_pts(clb)
        cdn_work_pts= _crs_cdn_work_pts(cdn_work_yrs)
        cdn_edu_pts = PGWP_CRS_BONUS_POINTS if cdn_edu_bonus else 0
        job_pts     = JOB_OFFER_CRS_BONUS["teer1_2_3"] if job_offer else 0
        total = age_pts + edu_pts + lang_pts + cdn_work_pts + cdn_edu_pts + job_pts
        return {
            "total":            total,
            "age":              age_pts,
            "education":        edu_pts,
            "language":         lang_pts,
            "canadian_work":    cdn_work_pts,
            "canadian_edu":     cdn_edu_pts,
            "job_offer_bonus":  job_pts,
        }

    # Existing EE score (if profile exists)
    existing_crs = None
    if ee_profile and ee_profile.crs_score_json:
        existing_crs = ee_profile.crs_score_json.get("total")

    # Baseline estimate (no Canadian study yet)
    pre_study_edu = _study_to_edu_level(profile.current_education_level if profile else "bachelors")
    baseline = project_crs(
        age=current_age or 26,
        edu_level=pre_study_edu,
        cdn_work_yrs=0,
        clb=clb_current,
        cdn_edu_bonus=False,
    )

    # After graduation
    post_grad = project_crs(
        age=age_at_graduation,
        edu_level=cdn_edu_level,
        cdn_work_yrs=0,
        clb=clb_post_study,
        cdn_edu_bonus=True,
    )

    # After 1yr Canadian work
    post_1yr = project_crs(
        age=age_at_1yr_work,
        edu_level=cdn_edu_level,
        cdn_work_yrs=1,
        clb=clb_post_study,
        cdn_edu_bonus=True,
    )

    # After 2yr Canadian work (+ job offer scenario)
    post_2yr = project_crs(
        age=age_at_2yr_work,
        edu_level=cdn_edu_level,
        cdn_work_yrs=2,
        clb=clb_post_study,
        cdn_edu_bonus=True,
    )
    post_2yr_with_offer = project_crs(
        age=age_at_2yr_work,
        edu_level=cdn_edu_level,
        cdn_work_yrs=2,
        clb=clb_post_study,
        cdn_edu_bonus=True,
        job_offer=True,
    )

    # Get recent CRS draw cutoffs for context
    draws_result = await db.execute(
        select(DrawDB)
        .order_by(DrawDB.draw_date.desc())
        .limit(20)
    )
    recent_draws = draws_result.scalars().all()
    recent_cutoffs = [d.minimum_crs for d in recent_draws if d.minimum_crs]
    avg_cutoff = round(sum(recent_cutoffs) / len(recent_cutoffs)) if recent_cutoffs else 491
    latest_cutoff = recent_cutoffs[0] if recent_cutoffs else 491

    # ── Timeline milestones ─────────────────────────────────────
    start_year = today.year
    grad_year  = start_year + int(program_duration_years)

    milestones = [
        {
            "id":       "arrival",
            "label":    "Arrive in Canada",
            "year":     start_year,
            "category": "study",
            "detail":   "Begin studies at your DLI. Ensure your study permit is valid for the full duration + 90 days.",
            "action":   "Enroll and attend in-person classes (≤50% online to keep PGWP eligibility).",
            "crs":      baseline["total"],
            "crs_label":"Baseline CRS (estimated)",
        },
        {
            "id":       "sin_work",
            "label":    "Apply for SIN & Part-Time Work",
            "year":     start_year,
            "category": "study",
            "detail":   "International students can work up to 24 hrs/week off-campus during academic sessions.",
            "action":   "Apply for your SIN at a Service Canada centre with your study permit.",
            "crs":      None,
            "crs_label": None,
        },
        {
            "id":       "graduation",
            "label":    "Graduate",
            "year":     grad_year,
            "category": "pgwp",
            "detail":   f"Complete your {target_level} program. Your transcript and degree are required for the PGWP application.",
            "action":   "Apply for PGWP within 180 days of receiving your final marks or completion letter.",
            "crs":      post_grad["total"],
            "crs_label": f"CRS after Canadian {target_level} (+{post_grad['total'] - baseline['total']} pts)",
        },
        {
            "id":       "pgwp",
            "label":    f"Receive PGWP ({pgwp_months} months)",
            "year":     grad_year,
            "category": "pgwp",
            "detail":   f"Post-Graduation Work Permit valid for {pgwp_months} months. Lets you work full-time for any employer.",
            "action":   "Apply online via IRCC. Include: passport, study permit, transcripts, completion letter.",
            "crs":      None,
            "crs_label": None,
        },
        {
            "id":       "express_entry",
            "label":    "Create Express Entry Profile",
            "year":     grad_year,
            "category": "express_entry",
            "detail":   "Enter the Express Entry pool. Canadian education + language score will significantly boost your CRS.",
            "action":   "Create profile on IRCC. Select Federal Skilled Worker (FSW) or Canadian Experience Class (CEC) — CEC requires 1yr Canadian work.",
            "crs":      post_grad["total"],
            "crs_label": f"CRS at pool entry (~{post_grad['total']} pts)",
        },
        {
            "id":       "work_1yr",
            "label":    "1 Year Canadian Work Experience",
            "year":     grad_year + 1,
            "category": "express_entry",
            "detail":   "Completing 1 year of TEER 0/1/2/3 work makes you eligible for Canadian Experience Class (CEC).",
            "action":   "Ensure your NOC code is TEER 0/1/2/3. Keep pay stubs and reference letters.",
            "crs":      post_1yr["total"],
            "crs_label": f"CRS after 1yr work (+{post_1yr['total'] - post_grad['total']} pts)",
        },
        {
            "id":       "ita",
            "label":    "Receive Invitation to Apply (ITA)",
            "year":     grad_year + 1,
            "category": "express_entry",
            "detail":   f"Recent draw cutoffs: avg {avg_cutoff}, latest {latest_cutoff}. Your projected CRS of {post_1yr['total']} {'✓ above' if post_1yr['total'] >= avg_cutoff else '⚠ below'} the average cutoff.",
            "action":   "Maintain your profile — update job changes, language retests. Consider PNP streams for extra 600 pts.",
            "crs":      post_1yr["total"],
            "crs_label": "Target score for ITA",
        },
        {
            "id":       "pr_application",
            "label":    "Submit PR Application",
            "year":     grad_year + 2,
            "category": "pr",
            "detail":   "After ITA, you have 60 days to submit a complete eAPR. Processing time is typically 6–12 months.",
            "action":   "Use the eAPR checklist in the Documents section of this app.",
            "crs":      None,
            "crs_label": None,
        },
        {
            "id":       "pr_approved",
            "label":    "Permanent Residence Approved 🎉",
            "year":     grad_year + 2,
            "category": "pr",
            "detail":   "You will receive a COPR (Confirmation of Permanent Residence) and PR card.",
            "action":   "Land before the COPR expiry date. Complete IRCC's e-APR landing process.",
            "crs":      None,
            "crs_label": None,
        },
    ]

    # ── PNP recommendations ────────────────────────────────────
    pnp_streams = []
    if field_lower and any(f in field_lower for f in ["tech", "software", "computer", "data", "engineer"]):
        pnp_streams.append({
            "province": "British Columbia",
            "stream":   "BC PNP Tech",
            "detail":   "Fast-track for tech workers. Job offer required. Adds 600 CRS points.",
            "url":      "https://www.welcomebc.ca/Immigrate-to-B-C/BC-PNP-Tech",
        })
        pnp_streams.append({
            "province": "Ontario",
            "stream":   "OINP Tech Draw",
            "detail":   "Ontario regularly runs tech-specific Express Entry draws.",
            "url":      "https://www.ontario.ca/page/ontarios-express-entry-system",
        })
    if field_lower and any(f in field_lower for f in ["health", "nurs", "medic", "care"]):
        pnp_streams.append({
            "province": "Multiple provinces",
            "stream":   "Healthcare Worker Draws",
            "detail":   "Alberta, Manitoba, Nova Scotia, PEI all run healthcare-targeted draws.",
            "url":      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees.html",
        })
    pnp_streams.append({
        "province": "Any province",
        "stream":   "Provincial Nominee Program (general)",
        "detail":   "Graduating from a Canadian school makes you eligible for most PNP streams. A PNP nomination adds 600 CRS points — effectively guarantees an ITA.",
        "url":      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees.html",
    })

    # ── CRS gap analysis ───────────────────────────────────────
    gap_to_avg    = avg_cutoff - post_1yr["total"]
    gap_to_latest = latest_cutoff - post_1yr["total"]

    crs_recommendation = []
    if gap_to_avg > 50:
        crs_recommendation.append({"action": "PNP nomination", "pts": 600, "note": "Single most powerful boost — apply to your target province's stream once you have a job offer."})
    if clb_post_study < 10:
        lang_gap_pts = _crs_lang_pts(10) - _crs_lang_pts(clb_post_study)
        crs_recommendation.append({"action": "Improve IELTS to 8.0+ (CLB 10)", "pts": lang_gap_pts, "note": "Language is the easiest controllable factor."})
    if target_level == "masters":
        crs_recommendation.append({"action": "Canadian master's degree", "pts": post_grad["total"] - baseline["total"], "note": "Already in your plan — this is your biggest single boost."})
    if work_exp_years < 1:
        crs_recommendation.append({"action": "1 year Canadian work (CEC eligibility)", "pts": post_1yr["total"] - post_grad["total"], "note": "Unlocks Canadian Experience Class — highest ITA rate."})

    return {
        "profile_found":  profile is not None,
        "accepted_app":   {
            "university":  accepted_app.university_name  if accepted_app else None,
            "program":     accepted_app.program_name     if accepted_app else None,
            "intake":      accepted_app.intake           if accepted_app else None,
            "duration_yr": program_duration_years,
        },
        "pgwp": {
            "eligible":          pgwp_eligible,
            "duration_months":   pgwp_months,
            "issues":            pgwp_issues,
            "lang_ok":           lang_ok,
            "field_ok":          field_eligible,
            "rules_note":        PGWP_RULES["eligible_institutions"],
            "field_of_study_note": PGWP_RULES["field_of_study_requirement"],
        },
        "crs_projection": {
            "existing_crs":     existing_crs,
            "baseline":         baseline,
            "post_graduation":  post_grad,
            "after_1yr_work":   post_1yr,
            "after_2yr_work":   post_2yr,
            "after_2yr_with_job_offer": post_2yr_with_offer,
            "recent_avg_cutoff":avg_cutoff,
            "latest_cutoff":    latest_cutoff,
            "gap_to_avg":       gap_to_avg,
            "likely_competitive": post_1yr["total"] >= avg_cutoff,
        },
        "milestones":      milestones,
        "pnp_streams":     pnp_streams,
        "crs_tips":        crs_recommendation,
        "timeline_years":  {
            "study_start":     start_year,
            "graduation":      grad_year,
            "pgwp_start":      grad_year,
            "pgwp_end":        grad_year + (pgwp_months // 12),
            "cec_eligible":    grad_year + 1,
            "pr_estimate":     grad_year + 2,
            "citizenship_eligible": grad_year + 5,
        },
    }


@app.post(f"{v1}/student/pr-pathway/checkin", tags=["Student PR Pathway"])
async def update_milestone_checkin(
    body: dict,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Save user's self-reported milestone completions.
    Stored in the student profile's eligibility_result JSON blob under 'milestone_checkins'.
    """
    sp_result = await db.execute(
        select(StudentProfileDB).where(StudentProfileDB.user_id == current_user.id)
    )
    profile = sp_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Merge into existing result blob
    existing = profile.eligibility_result or {}
    existing["milestone_checkins"] = body.get("checkins", {})
    profile.eligibility_result = existing
    await db.commit()
    return {"message": "Saved", "checkins": existing["milestone_checkins"]}


# ─────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ─────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────

async def _get_applicant(user_id: UUID, db: AsyncSession) -> ApplicantDB:
    result = await db.execute(select(ApplicantDB).where(ApplicantDB.user_id == user_id))
    applicant = result.scalar_one_or_none()
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant profile not found. Please create your profile first.")
    return applicant


async def _get_applicant_full(user_id: UUID, db: AsyncSession) -> ApplicantDB:
    result = await db.execute(
        select(ApplicantDB)
        .options(
            selectinload(ApplicantDB.language_tests),
            selectinload(ApplicantDB.work_experiences),
            selectinload(ApplicantDB.education),
            selectinload(ApplicantDB.job_offer),
            selectinload(ApplicantDB.spouse_language_test),
        )
        .where(ApplicantDB.user_id == user_id)
    )
    applicant = result.scalar_one_or_none()
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant profile not found")
    return applicant


def _convert_to_clb(test_type: str, reading: float, writing: float, speaking: float, listening: float) -> ClbScores:
    calculator = CrsCalculatorService()
    from core.domain.models import LanguageTest as LT
    test = LT()
    test.test_type = LanguageTestType(test_type.lower())
    test.reading = reading
    test.writing = writing
    test.speaking = speaking
    test.listening = listening
    return calculator.convert_to_clb(test)


def _db_to_domain(db_applicant: ApplicantDB):
    """Convert DB model to domain model for business logic"""
    from core.domain.models import (
        Applicant, LanguageTest, WorkExperience, Education,
        SpouseProfile, ClbScores, LanguageTestType, LanguageRole,
        ExperienceType, TeerLevel, EducationLevel, MaritalStatus, CrsScore
    )
    from datetime import date as ddate

    applicant = Applicant()
    applicant.id = db_applicant.id
    applicant.full_name = db_applicant.full_name
    applicant.date_of_birth = db_applicant.date_of_birth
    applicant.nationality = db_applicant.nationality
    applicant.has_spouse = db_applicant.has_spouse
    applicant.has_provincial_nomination = db_applicant.has_provincial_nomination
    applicant.has_sibling_in_canada = db_applicant.has_sibling_in_canada
    applicant.has_certificate_of_qualification = db_applicant.has_certificate_of_qualification

    if db_applicant.crs_score_json:
        s = db_applicant.crs_score_json
        applicant.current_crs_score = CrsScore(
            core_human_capital=s.get("core_human_capital", 0),
            spouse_factors=s.get("spouse_factors", 0),
            skill_transferability=s.get("skill_transferability", 0),
            additional_points=s.get("additional_points", 0)
        )

    # Language tests
    for lt in (db_applicant.language_tests or []):
        test = LanguageTest()
        test.test_type = LanguageTestType(lt.test_type.lower() if lt.test_type else 'ielts')
        test.role = LanguageRole(lt.role.lower() if lt.role else 'first')
        test.language = lt.language
        test.reading = lt.reading
        test.writing = lt.writing
        test.speaking = lt.speaking
        test.listening = lt.listening
        test.test_date = lt.test_date
        if lt.clb_speaking is not None:
            test.clb_equivalent = ClbScores(
                speaking=lt.clb_speaking,
                listening=lt.clb_listening,
                reading=lt.clb_reading,
                writing=lt.clb_writing
            )
        applicant.language_tests.append(test)

    # Work experiences
    for we in (db_applicant.work_experiences or []):
        exp = WorkExperience()
        exp.noc_code = we.noc_code
        exp.teer_level = TeerLevel(we.teer_level)
        exp.experience_type = ExperienceType(we.experience_type)
        exp.start_date = we.start_date
        exp.end_date = we.end_date
        exp.hours_per_week = we.hours_per_week
        exp.is_current = we.is_current
        applicant.work_experiences.append(exp)

    # Education
    if db_applicant.education:
        edu = Education()
        edu.level = EducationLevel(db_applicant.education.level)
        edu.country = db_applicant.education.country
        edu.is_canadian = db_applicant.education.is_canadian
        edu.is_three_year_or_more = db_applicant.education.is_three_year_or_more
        applicant.education = edu

    # Spouse
    if db_applicant.has_spouse and db_applicant.spouse_education_level:
        spouse = SpouseProfile()
        spouse.education_level = EducationLevel(db_applicant.spouse_education_level)
        spouse.canadian_work_years = db_applicant.spouse_canadian_work_years or 0

        # Spouse language test from dedicated table
        if db_applicant.spouse_language_test:
            slt = db_applicant.spouse_language_test
            spouse_lang = LanguageTest()
            spouse_lang.test_type = LanguageTestType(slt.test_type.lower() if slt.test_type else 'ielts')
            spouse_lang.reading   = slt.reading
            spouse_lang.writing   = slt.writing
            spouse_lang.speaking  = slt.speaking
            spouse_lang.listening = slt.listening
            spouse_lang.clb_equivalent = ClbScores(
                speaking=slt.clb_speaking,
                listening=slt.clb_listening,
                reading=slt.clb_reading,
                writing=slt.clb_writing,
            )
            spouse.language_test = spouse_lang

        applicant.spouse_profile = spouse

    return applicant


# Import for the generator
from infrastructure.persistence.database import AsyncSessionLocal

if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)


# ─────────────────────────────────────────────
# IELTS Preparation Routes
# ─────────────────────────────────────────────

class IeltsAnswersRequest(BaseModel):
    questions: list
    answers: dict

class IeltsPracticeRequest(BaseModel):
    skill: str
    level: str

class IeltsGradeRequest(BaseModel):
    questions: list
    answers: dict
    skill: str
    level: str

class IeltsMockRequest(BaseModel):
    skill: str
    level: str

class IeltsMockGradeRequest(BaseModel):
    questions: list
    answers: dict
    skill: str
    level: str
    time_taken_seconds: int = 0


@app.post(f"{v1}/ielts/mock/generate", tags=["IELTS"])
async def generate_mock_test(
    request: IeltsMockRequest,
    current_user: UserDB = Depends(get_current_user)
):
    """Generate a full mock test (15 questions, timed) for a specific skill."""
    try:
        result = await ielts_service.generate_mock_test(request.skill, request.level)
        return result
    except Exception as e:
        logger.error(f"IELTS mock generate error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.post(f"{v1}/ielts/mock/grade", tags=["IELTS"])
async def grade_mock_test(
    request: IeltsMockGradeRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Grade a mock test and return full IELTS-style report."""
    try:
        result = await ielts_service.grade_mock_test(
            request.questions, request.answers, request.skill, request.level
        )
        applicant = await _get_applicant(current_user.id, db)
        record = IeltsProgressDB(
            id=uuid4(),
            applicant_id=applicant.id,
            session_type="mock",
            skill=request.skill,
            level=request.level,
            band_score=result.get("band_score"),
            questions_json={"questions": request.questions},
            answers_json=request.answers,
            feedback_json=result,
        )
        db.add(record)
        await db.commit()
        logger.info(f"IELTS mock graded: applicant={applicant.id}  skill={request.skill}  band={result.get('band_score')}  score={result.get('score')}/{result.get('total')}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"IELTS mock grade error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")



@app.get(f"{v1}/ielts/diagnostic", tags=["IELTS"])
async def get_diagnostic(current_user: UserDB = Depends(get_current_user)):
    """Generate a 10-question diagnostic test covering all 4 IELTS skills."""
    try:
        result = await ielts_service.generate_diagnostic()
        return result
    except Exception as e:
        logger.error(f"IELTS diagnostic error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.post(f"{v1}/ielts/assess-level", tags=["IELTS"])
async def assess_level(
    request: IeltsAnswersRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Grade diagnostic and return level, band estimate, and 4-week study plan."""
    try:
        result = await ielts_service.assess_level(request.questions, request.answers)

        applicant = await _get_applicant(current_user.id, db)
        record = IeltsProgressDB(
            id=uuid4(),
            applicant_id=applicant.id,
            session_type="diagnostic",
            skill="all",
            level=result.get("overall_level", "intermediate"),
            band_score=result.get("estimated_band"),
            questions_json={"questions": request.questions},
            answers_json=request.answers,
            feedback_json=result,
        )
        db.add(record)
        await db.commit()
        logger.info(f"IELTS diagnostic saved: applicant={applicant.id}  level={result.get('overall_level')}  band={result.get('estimated_band')}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"IELTS assess-level error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.post(f"{v1}/ielts/practice", tags=["IELTS"])
async def get_practice(
    request: IeltsPracticeRequest,
    current_user: UserDB = Depends(get_current_user)
):
    """Generate 8 practice questions for a specific skill and level."""
    try:
        result = await ielts_service.generate_practice(request.skill, request.level)
        return result
    except Exception as e:
        logger.error(f"IELTS practice error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.post(f"{v1}/ielts/grade", tags=["IELTS"])
async def grade_practice(
    request: IeltsGradeRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Grade a practice session and return detailed per-question feedback."""
    try:
        result = await ielts_service.grade_practice(
            request.questions, request.answers, request.skill, request.level
        )

        applicant = await _get_applicant(current_user.id, db)
        record = IeltsProgressDB(
            id=uuid4(),
            applicant_id=applicant.id,
            session_type="practice",
            skill=request.skill,
            level=request.level,
            band_score=result.get("band_estimate"),
            questions_json={"questions": request.questions},
            answers_json=request.answers,
            feedback_json=result,
        )
        db.add(record)
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"IELTS grade error: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable")


@app.get(f"{v1}/ielts/progress", tags=["IELTS"])
async def get_ielts_progress(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's IELTS progress history."""
    try:
        applicant = await _get_applicant(current_user.id, db)
        result = await db.execute(
            select(IeltsProgressDB)
            .where(IeltsProgressDB.applicant_id == applicant.id)
            .order_by(IeltsProgressDB.created_at.desc())
            .limit(50)
        )
        records = result.scalars().all()
        return [{
            "id": str(r.id),
            "session_type": r.session_type,
            "skill": r.skill,
            "level": r.level,
            "band_score": r.band_score,
            "score": r.feedback_json.get("score") if r.feedback_json else None,
            "total": r.feedback_json.get("total") if r.feedback_json else None,
            "created_at": r.created_at.isoformat(),
        } for r in records]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"IELTS progress error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{v1}/ielts/progress/{{session_id}}", tags=["IELTS"])
async def get_ielts_session_detail(
    session_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get full detail for a specific IELTS session including all Q&A."""
    try:
        applicant = await _get_applicant(current_user.id, db)
        result = await db.execute(
            select(IeltsProgressDB)
            .where(
                IeltsProgressDB.id == session_id,
                IeltsProgressDB.applicant_id == applicant.id
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(status_code=404, detail="Session not found")

        questions = (record.questions_json or {}).get("questions", [])
        answers = record.answers_json or {}
        feedback = record.feedback_json or {}

        # Build per-question result with user answer + correct answer
        question_results = []
        for q in questions:
            qid = str(q.get("id", ""))
            user_answer = answers.get(qid, "")
            correct = q.get("correct_answer", "")
            question_results.append({
                "id": q.get("id"),
                "skill": q.get("skill", record.skill),
                "type": q.get("type", "mcq"),
                "passage": q.get("passage", ""),
                "sentence": q.get("sentence", ""),
                "instruction": q.get("instruction", ""),
                "question": q.get("question", ""),
                "options": q.get("options", []),
                "correct_answer": correct,
                "user_answer": user_answer,
                "is_correct": user_answer == correct,
                "explanation": q.get("explanation", ""),
                "tip": q.get("tip", ""),
            })

        return {
            "id": str(record.id),
            "session_type": record.session_type,
            "skill": record.skill,
            "level": record.level,
            "band_score": record.band_score,
            "created_at": record.created_at.isoformat(),
            "score": feedback.get("score"),
            "total": feedback.get("total"),
            "percentage": feedback.get("percentage"),
            "overall_feedback": feedback.get("overall_feedback") or feedback.get("overall_feedback", ""),
            "strengths": feedback.get("strengths", []),
            "weaknesses": feedback.get("weaknesses", []),
            "improvement_tips": feedback.get("improvement_tips", []),
            "motivational_message": feedback.get("motivational_message", ""),
            "skill_scores": feedback.get("skill_scores", {}),
            "study_plan": feedback.get("study_plan"),
            "questions": question_results,
            "vocabulary": record.vocabulary_json or [],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"IELTS session detail error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from datetime import date as _date  # noqa — used in tool endpoints

# ═══════════════════════════════════════════════════════════════
# Tools — Score Simulator
# ═══════════════════════════════════════════════════════════════

class SimulatorRequest(BaseModel):
    changes: dict  # e.g. {"ielts_band": 8.0, "canadian_work_years": 2}

@app.post(f"{v1}/tools/simulator", tags=["Tools"])
async def run_score_simulator(
    request: SimulatorRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        tests = applicant.language_tests or []
        primary = next((t for t in tests if t.role == "first"), None)
        avg_clb = int((primary.clb_reading + primary.clb_writing + primary.clb_listening + primary.clb_speaking) / 4) if primary and primary.clb_reading else 7

        works = applicant.work_experiences or []
        cdn_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "canadian"
        )
        foreign_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "foreign"
        )

        from datetime import date as _d
        age = (_d.today() - applicant.date_of_birth).days // 365 if applicant.date_of_birth else None

        spouse_test = applicant.spouse_language_test
        spouse_clb = int((spouse_test.clb_reading + spouse_test.clb_writing +
                          spouse_test.clb_speaking + spouse_test.clb_listening) / 4) \
                     if spouse_test else None

        base_profile = {
            "crs_score":           applicant.crs_score_json.get("total", 0) if applicant.crs_score_json else 0,
            "education_level":     applicant.education.level if applicant.education else "bachelors",
            "canadian_work_years": round(cdn_work, 1),
            "foreign_work_years":  round(foreign_work, 1),
            "language_clb":        avg_clb,
            "ielts_reading":       float(primary.reading)   if primary else None,
            "ielts_writing":       float(primary.writing)   if primary else None,
            "ielts_speaking":      float(primary.speaking)  if primary else None,
            "ielts_listening":     float(primary.listening) if primary else None,
            "ielts_band":          round((primary.reading + primary.writing + primary.speaking + primary.listening) / 4, 1) if primary else None,
            "has_spouse":          applicant.has_spouse,
            "spouse_clb":          spouse_clb,
            "has_job_offer":       applicant.job_offer is not None,
            "noc_code":            works[0].noc_code if works else None,
            "teer_level":          works[0].teer_level if works else None,
            "nationality":         applicant.nationality,
            "age":                 age,
        }

        if request.changes:
            result = score_simulator.simulate(base_profile, request.changes)
        else:
            result = score_simulator.get_all_scenarios(base_profile)

        result["base_profile"] = base_profile
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Score simulator error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{v1}/tools/simulator/scenarios", tags=["Tools"])
async def get_all_simulator_scenarios(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return all possible improvement scenarios for the current user."""
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        works = applicant.work_experiences or []
        cdn_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "canadian"
        )

        tests = applicant.language_tests or []
        primary = next((t for t in tests if t.role == "first"), None)

        base_profile = {
            "crs_score": applicant.crs_score_json.get("total", 0) if applicant.crs_score_json else 0,
            "education_level": applicant.education.level if applicant.education else "bachelors",
            "canadian_work_years": round(cdn_work, 1),
            "ielts_band": round((primary.reading + primary.writing + primary.speaking + primary.listening) / 4, 1) if primary else None,
            "has_spouse": applicant.has_spouse,
            "has_job_offer": bool(applicant.job_offer),
        }
        return score_simulator.get_all_scenarios(base_profile)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simulator scenarios error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Tools — PNP Matcher
# ═══════════════════════════════════════════════════════════════

class PNPRequest(BaseModel):
    province_preference: Optional[str] = "Any"

@app.post(f"{v1}/tools/pnp-matcher", tags=["Tools"])
async def match_pnp_streams(
    request: PNPRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        works = applicant.work_experiences or []
        cdn_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "canadian"
        )
        foreign_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "foreign"
        )

        tests = applicant.language_tests or []
        primary = next((t for t in tests if t.role == "first"), None)
        avg_clb = int((primary.clb_reading + primary.clb_writing + primary.clb_listening + primary.clb_speaking) / 4) if primary and primary.clb_reading else 7

        profile = {
            "noc_code": works[0].noc_code if works else "unknown",
            "teer_level": works[0].teer_level if works else "unknown",
            "education_level": applicant.education.level if applicant.education else "unknown",
            "canadian_work_years": cdn_work,
            "foreign_work_years": foreign_work,
            "language_clb": avg_clb,
            "crs_score": applicant.crs_score_json.get("total", 0) if applicant.crs_score_json else 0,
            "province_preference": request.province_preference or "Any",
            "has_job_offer": bool(applicant.job_offer),
            "nationality": applicant.nationality,
        }

        result = await pnp_matcher.match_streams(profile)

        # Hard filter — if a specific province was selected, enforce it
        pref = (request.province_preference or "Any").strip()
        if pref and pref.lower() != "any":
            pref_lower = pref.lower()
            result["top_matches"] = [
                m for m in result.get("top_matches", [])
                if pref_lower in m.get("province", "").lower()
                or pref_lower in m.get("province_code", "").lower()
            ]

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PNP matcher error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Tools — Draw Frequency Predictor
# ═══════════════════════════════════════════════════════════════

@app.get(f"{v1}/tools/draw-predictor", tags=["Tools"])
async def predict_draw_frequency(
    draw_type: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(DrawDB).order_by(DrawDB.draw_date.desc()).limit(100))
        draws = result.scalars().all()
        draw_dicts = [
            {
                "draw_date": d.draw_date,
                "minimum_crs": d.minimum_crs,
                "draw_type": d.draw_type,
                "invitations_issued": d.invitations_issued,
            }
            for d in draws
        ]

        if draw_type:
            prediction = draw_predictor.predict(draw_dicts, draw_type)
        else:
            # Predict for each type + overall
            from collections import defaultdict
            by_type = defaultdict(list)
            for d in draw_dicts:
                by_type[d["draw_type"]].append(d)

            predictions = {"overall": draw_predictor.predict(draw_dicts)}
            for dtype, dlist in by_type.items():
                if len(dlist) >= 3:
                    predictions[dtype] = draw_predictor.predict(dlist, dtype)
            return predictions

        return prediction
    except Exception as e:
        logger.error(f"Draw predictor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Tools — Study Plan Generator
# ═══════════════════════════════════════════════════════════════

class StudyPlanRequest(BaseModel):
    target_crs: int
    timeline_months: int = 6

@app.post(f"{v1}/tools/study-plan", tags=["Tools"])
async def generate_study_plan(
    request: StudyPlanRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        works = applicant.work_experiences or []
        cdn_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "canadian"
        )

        tests = applicant.language_tests or []
        primary = next((t for t in tests if t.role == "first"), None)
        ielts_scores = {
            "listening": primary.listening,
            "reading": primary.reading,
            "writing": primary.writing,
            "speaking": primary.speaking
        } if primary else {}
        avg_clb = int((primary.clb_reading + primary.clb_writing + primary.clb_listening + primary.clb_speaking) / 4) if primary and primary.clb_reading else 7

        from datetime import date
        dob = applicant.date_of_birth
        age = (date.today() - dob).days // 365 if dob else None

        profile = {
            "crs_score": applicant.crs_score_json.get("total", 0) if applicant.crs_score_json else 0,
            "education_level": applicant.education.level if applicant.education else "unknown",
            "canadian_work_years": cdn_work,
            "foreign_work_years": sum(((w.end_date or _date.today()) - w.start_date).days / 365 for w in works if w.experience_type == "foreign"),
            "ielts_scores": ielts_scores,
            "language_clb": avg_clb,
            "has_spouse": applicant.has_spouse,
            "spouse_clb": None,
            "noc_code": works[0].noc_code if works else "unknown",
            "eligible_programs": applicant.eligible_programs or [],
            "age": age,
        }

        result = await study_plan_service.generate_plan(profile, request.target_crs, request.timeline_months)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Study plan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Tools — AI Letter Writer
# ═══════════════════════════════════════════════════════════════

class LetterRequest(BaseModel):
    letter_type: str  # employment_gap | address_history | name_change | criminal_record | relationship_proof | funds_source
    context: dict     # type-specific fields

@app.post(f"{v1}/tools/letter-writer", tags=["Tools"])
async def generate_letter(
    request: LetterRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        applicant_info = {
            "full_name": applicant.full_name,
            "date_of_birth": applicant.date_of_birth.isoformat() if applicant.date_of_birth else "",
            "nationality": applicant.nationality,
        }
        result = await letter_writer.generate_letter(request.letter_type, applicant_info, request.context)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Letter writer error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get(f"{v1}/tools/letter-writer/types", tags=["Tools"])
async def get_letter_types():
    return [
        {"key": "employment_gap",  "label": "Employment Gap",           "icon": "💼", "description": "Explain gaps in your work history"},
        {"key": "address_history", "label": "Address / Travel History", "icon": "✈️", "description": "Explain extensive travel or address gaps"},
        {"key": "name_change",     "label": "Name Discrepancy",         "icon": "📝", "description": "Explain name changes across documents"},
        {"key": "criminal_record", "label": "Criminal Record",          "icon": "⚖️", "description": "Explain arrests, charges, or convictions"},
        {"key": "relationship_proof", "label": "Relationship Proof",    "icon": "💑", "description": "Prove genuine spousal/common-law relationship"},
        {"key": "funds_source",    "label": "Source of Funds",          "icon": "💰", "description": "Explain origin of settlement funds"},
    ]


# ═══════════════════════════════════════════════════════════════
# Tools — Peer Comparison
# ═══════════════════════════════════════════════════════════════

@app.get(f"{v1}/tools/peer-comparison", tags=["Tools"])
async def get_peer_comparison(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        works = applicant.work_experiences or []
        cdn_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if w.experience_type == "canadian"
        )

        tests = applicant.language_tests or []
        primary = next((t for t in tests if t.role == "first"), None)
        avg_clb = int((primary.clb_reading + primary.clb_writing + primary.clb_listening + primary.clb_speaking) / 4) if primary and primary.clb_reading else 7

        from datetime import date
        dob = applicant.date_of_birth
        age = (date.today() - dob).days // 365 if dob else None

        profile = {
            "crs_score": applicant.crs_score_json.get("total", 0) if applicant.crs_score_json else 0,
            "nationality": applicant.nationality,
            "noc_code": works[0].noc_code if works else "unknown",
            "teer_level": works[0].teer_level if works else "unknown",
            "education_level": applicant.education.level if applicant.education else "unknown",
            "canadian_work_years": cdn_work,
            "language_clb": avg_clb,
            "has_spouse": applicant.has_spouse,
            "age": age,
        }

        # Try local comparison first — get all other applicants' CRS
        all_result = await db.execute(
            select(ApplicantDB.crs_score_json, ApplicantDB.work_experiences)
            .where(ApplicantDB.id != applicant.id)
            .limit(500)
        )
        all_rows = all_result.all()
        all_profiles = [
            {"crs_score": row[0].get("total", 0) if row[0] else 0}
            for row in all_rows
        ]

        local = peer_comparison.compare_local(profile, all_profiles)
        ai_result = await peer_comparison.get_ai_benchmarks(profile)

        return {
            "profile_snapshot": profile,
            "local_comparison": local,
            "ai_benchmarks": ai_result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Peer comparison error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Eligibility Check
# ═══════════════════════════════════════════════════════════════

@app.get(f"{v1}/eligibility/check", tags=["Eligibility"])
async def check_eligibility(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Full eligibility check for FSW, CEC, FST with gap analysis."""
    try:
        applicant_db = await _get_applicant_full(current_user.id, db)
        # Convert DB model to domain so language tests have clb_equivalent properly set
        applicant_domain_full = _db_to_domain(applicant_db)
        tests  = applicant_domain_full.language_tests or []
        works  = applicant_domain_full.work_experiences or []
        primary = next((t for t in tests if t.role.value == "first"), None)

        def _work_type(w, t):
            et = w.experience_type
            val = et.value if hasattr(et, 'value') else str(et)
            return val == t

        cdn_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if _work_type(w, "canadian")
        )
        foreign_work = sum(
            ((w.end_date or _date.today()) - w.start_date).days / 365
            for w in works if _work_type(w, "foreign")
        )
        total_work = cdn_work + foreign_work

        from datetime import date as _d
        a = applicant_domain_full
        age = (_d.today() - a.date_of_birth).days // 365 if a.date_of_birth else 30

        teer = works[0].teer_level.value if works and hasattr(works[0].teer_level, 'value') else (works[0].teer_level if works else "")

        # Pass per-skill CLB so language points are calculated correctly per IRCC table
        clb = primary.clb_equivalent if primary else None
        second = next((t for t in tests if t.role.value == "second"), None)
        second_clb = second.clb_equivalent if second else None

        edu_level = a.education.level.value if a.education and hasattr(a.education.level, 'value') else (a.education.level if a.education else "")

        profile = {
            "age": age,
            "education_level": edu_level,
            "canadian_work_years": round(cdn_work, 1),
            "foreign_work_years": round(foreign_work, 1),
            "total_work_years": round(total_work, 1),
            # Per-skill CLB for accurate language scoring
            "clb_listening":  getattr(clb, "listening", 0) or 0,
            "clb_reading":    getattr(clb, "reading", 0) or 0,
            "clb_writing":    getattr(clb, "writing", 0) or 0,
            "clb_speaking":   getattr(clb, "speaking", 0) or 0,
            # Second language (max 4 pts if all skills >= CLB 5)
            "clb2_listening": getattr(second_clb, "listening", 0) or 0,
            "clb2_reading":   getattr(second_clb, "reading", 0) or 0,
            "clb2_writing":   getattr(second_clb, "writing", 0) or 0,
            "clb2_speaking":  getattr(second_clb, "speaking", 0) or 0,
            # Keep min clb for language minimum check
            "language_clb": min(
                getattr(clb,"listening",0), getattr(clb,"reading",0),
                getattr(clb,"writing",0), getattr(clb,"speaking",0)
            ) if clb else 0,
            "teer_level": teer,
            "has_job_offer": a.job_offer is not None,
            "has_certificate_of_qualification": a.has_certificate_of_qualification,
            "has_sibling_in_canada": a.has_sibling_in_canada,
            "is_canadian_education": a.education.is_canadian if a.education else False,
            "nationality": a.nationality,
        }

        # Step 1: deterministic checks
        det_result = eligibility_checker.check_deterministic(profile)

        # Step 2: AI roadmap
        try:
            roadmap = await eligibility_checker.get_ai_roadmap(profile, det_result)
        except Exception as e:
            logger.warning(f"Eligibility AI roadmap failed: {e}")
            roadmap = {"overall_assessment": "Complete your profile to get a full AI assessment.", "actions": [], "alternative_programs": []}

        return {**det_result, "roadmap": roadmap, "profile_snapshot": profile}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Eligibility check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Transcript Generator
# ═══════════════════════════════════════════════════════════════

class TranscriptRequest(BaseModel):
    extra_context: str = ""

@app.post(f"{v1}/documents/generate-transcript", tags=["Documents"])
async def generate_transcript(
    request: TranscriptRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate an academic transcript from the applicant's education profile."""
    try:
        applicant = await _get_applicant_full(current_user.id, db)
        if not applicant.education:
            raise HTTPException(status_code=400, detail="No education record found. Please complete your education profile first.")

        edu = applicant.education
        profile = {
            "full_name": applicant.full_name,
            "date_of_birth": applicant.date_of_birth.isoformat() if applicant.date_of_birth else None,
            "nationality": applicant.nationality,
        }
        education = {
            "level": edu.level,
            "field_of_study": edu.field_of_study,
            "institution_name": edu.institution_name,
            "country": edu.country,
            "is_canadian": edu.is_canadian,
            "is_three_year_or_more": edu.is_three_year_or_more,
            "completion_date": edu.completion_date.isoformat() if edu.completion_date else None,
        }

        result = await transcript_generator.generate(profile, education, request.extra_context)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcript generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# Work Experience Letter Generator
# ═══════════════════════════════════════════════════════════════

class WorkLetterRequest(BaseModel):
    work_experience_id: str
    extra_context: str = ""

@app.post(f"{v1}/documents/generate-work-letter", tags=["Documents"])
async def generate_work_experience_letter(
    request: WorkLetterRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate a formal work experience reference letter for IRCC submission."""
    try:
        applicant = await _get_applicant_full(current_user.id, db)

        from uuid import UUID as _UUID
        work_id = _UUID(request.work_experience_id)
        work_exp = next(
            (w for w in (applicant.work_experiences or []) if w.id == work_id),
            None
        )
        if not work_exp:
            raise HTTPException(status_code=404, detail="Work experience not found")

        profile = {
            "full_name": applicant.full_name,
            "date_of_birth": applicant.date_of_birth.isoformat() if applicant.date_of_birth else None,
            "nationality": applicant.nationality,
        }
        work = {
            "employer_name": work_exp.employer_name,
            "job_title": work_exp.job_title,
            "noc_code": work_exp.noc_code,
            "noc_title": work_exp.noc_title,
            "teer_level": work_exp.teer_level,
            "experience_type": work_exp.experience_type,
            "start_date": work_exp.start_date.isoformat() if work_exp.start_date else None,
            "end_date": work_exp.end_date.isoformat() if work_exp.end_date else None,
            "hours_per_week": work_exp.hours_per_week,
            "is_current": work_exp.is_current,
        }

        result = await work_letter_service.generate(profile, work, request.extra_context)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Work letter generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
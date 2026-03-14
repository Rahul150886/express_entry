"""
AI Services — Express Entry PR
Covers: Document Intelligence, GPT-4o Document Review,
        NOC Finder, CRS Predictor, RAG Immigration Chatbot
"""

from __future__ import annotations

import base64
import json
import asyncio
import time
from pathlib import Path
from typing import AsyncGenerator, Optional
from uuid import UUID

from openai import AsyncAzureOpenAI

from core.domain.models import (
    Applicant, ApplicationDocument, AiExtractionResult,
    DocumentType, ClbScores, LanguageTestType
)
from loguru import logger
from infrastructure.config import get_settings

settings = get_settings()


# ─────────────────────────────────────────────
# System Prompts
# ─────────────────────────────────────────────

IMMIGRATION_ASSISTANT_SYSTEM = """You are an Express Entry immigration assistant for Canada.

Your role:
- Provide accurate information based on IRCC guidelines
- Help applicants understand the process step by step
- Give specific, actionable guidance based on the applicant's profile
- NEVER provide legal immigration advice — always recommend consulting an RCIC for complex situations
- Be empathetic — this is a stressful, life-changing process for applicants

Important rules:
- If asked for legal advice, clarify you provide information only
- Always cite specific IRCC policies when possible
- Be honest about uncertainty — say "I'm not certain, please verify with IRCC"
- Keep responses concise and clear

Current applicant context will be provided in the system message."""

DOCUMENT_REVIEWER_SYSTEM = """You are an Express Entry document review specialist.
Review documents ONLY for issues that are clearly and directly observable.
NEVER fabricate or assume issues that are not visibly present.
Only apply checks relevant to the specific document type being reviewed.
A bilingual document (original + English/French in one file) is valid — do NOT flag it as untranslated.
Be conservative: passing a good document is better than generating false issues.
Return ONLY valid JSON. No markdown, no preamble."""

NOC_FINDER_SYSTEM = """You are a Canadian NOC 2021 classification expert.
Match job descriptions to the most appropriate NOC codes.
Focus on TEER 0, 1, 2, 3 categories for Express Entry eligibility.
Return ONLY valid JSON. No markdown, no preamble."""

CRS_ADVISOR_SYSTEM = """You are a CRS score optimization expert for Canada's Express Entry.
Analyze applicant profiles and provide specific, prioritized improvement strategies.
Base recommendations on actual IRCC point tables.
Return ONLY valid JSON. No markdown, no preamble."""

DRAW_PREDICTION_SYSTEM = """You are an Express Entry draw analysis expert.
Analyze historical draw data to provide probability estimates.
Be honest about uncertainty — draw patterns can change with policy.
Return ONLY valid JSON. No markdown, no preamble."""

CHECKLIST_GENERATOR_SYSTEM = """You are an Express Entry application checklist generator.
Generate personalized document checklists based on applicant profiles.
Reference official IRCC document requirements.
Return ONLY valid JSON. No markdown, no preamble."""


# ─────────────────────────────────────────────
# 1. Azure Document Intelligence Service
# ─────────────────────────────────────────────

class DocumentIntelligenceService:
    """
    Uses Azure AI Document Intelligence to auto-extract fields
    from uploaded immigration documents.
    """

    # prebuilt-idDocument: available on all tiers (Free + Standard)
    # prebuilt-read: available on all tiers — extracts raw text, good for IELTS/letters
    # prebuilt-document: Standard (S0) tier ONLY — extracts key-value pairs + tables
    # We use prebuilt-read for non-passport docs to ensure Free tier compatibility.
    MODEL_MAP = {
        DocumentType.PASSPORT: "prebuilt-idDocument",
        DocumentType.LANGUAGE_TEST_RESULT: "prebuilt-read",
        DocumentType.EDUCATION_CREDENTIAL: "prebuilt-read",
        DocumentType.EMPLOYMENT_LETTER: "prebuilt-read",
        DocumentType.ECA_REPORT: "prebuilt-read",
        DocumentType.POLICE_CERTIFICATE: "prebuilt-read",
    }

    def __init__(self):
        self._client = None  # Lazy init

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_DOC_INTELLIGENCE_ENDPOINT or not settings.AZURE_DOC_INTELLIGENCE_KEY:
                logger.error("DocumentIntelligenceService: AZURE_DOC_INTELLIGENCE_ENDPOINT/KEY not set")
                raise RuntimeError("Azure Document Intelligence not configured")
            logger.info("DocumentIntelligenceService: connecting to Azure AI Document Intelligence")
            from azure.ai.documentintelligence import DocumentIntelligenceClient as _DI
            from azure.core.credentials import AzureKeyCredential as _AKC
            self._client = _DI(
                endpoint=settings.AZURE_DOC_INTELLIGENCE_ENDPOINT,
                credential=_AKC(settings.AZURE_DOC_INTELLIGENCE_KEY)
            )
        return self._client

    async def analyze_document(
        self,
        document_type: DocumentType,
        file_bytes: bytes,
        mime_type: str = "application/pdf"
    ) -> AiExtractionResult:
        model_id = self.MODEL_MAP.get(document_type, "prebuilt-read")
        logger.info(f"DocIntelligence.analyze_document: type={document_type.value}  model={model_id}  size={len(file_bytes)}B  mime={mime_type}")
        t0 = time.perf_counter()

        # Run in thread pool (SDK is sync)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._analyze_sync(model_id, file_bytes, mime_type)
        )

        extraction = self._extract_by_type(document_type, result)
        logger.info(f"DocIntelligence.analyze_document: done in {(time.perf_counter()-t0)*1000:.0f}ms  confidence={extraction.confidence:.2f}  fields={list(extraction.extracted_fields.keys())}")
        return extraction

    def _analyze_sync(self, model_id: str, file_bytes: bytes, mime_type: str):
        import base64
        client = self._get_client()

        # SDK v1.0 (azsdk-python-ai-documentintelligence/1.0.0):
        # - Pass bytes_source as base64-encoded string inside body=
        # - Do NOT pass content_type separately — it conflicts with bytes_source mode
        # - The SDK sets content-type to application/pdf automatically from the body
        from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
        poller = client.begin_analyze_document(
            model_id,
            body=AnalyzeDocumentRequest(
                bytes_source=base64.b64encode(file_bytes).decode("utf-8")
            )
            # No content_type here — conflicts with bytes_source in v1.0
        )
        return poller.result()

    def _extract_by_type(self, doc_type: DocumentType, result) -> AiExtractionResult:
        extractors = {
            DocumentType.PASSPORT: self._extract_passport,
            DocumentType.LANGUAGE_TEST_RESULT: self._extract_language_test,
            DocumentType.EMPLOYMENT_LETTER: self._extract_employment_letter,
            DocumentType.EDUCATION_CREDENTIAL: self._extract_education,
        }
        extractor = extractors.get(doc_type, self._extract_generic)
        return extractor(result)

    def _extract_passport(self, result) -> AiExtractionResult:
        if not result.documents:
            return AiExtractionResult(DocumentType.PASSPORT, {}, 0.0, ["No data extracted"])
        doc = result.documents[0]
        fields = doc.fields or {}
        return AiExtractionResult(
            document_type=DocumentType.PASSPORT,
            extracted_fields={
                "last_name": self._get_field(fields, "LastName"),
                "first_name": self._get_field(fields, "FirstName"),
                "document_number": self._get_field(fields, "DocumentNumber"),
                "date_of_birth": self._get_field(fields, "DateOfBirth"),
                "date_of_expiry": self._get_field(fields, "DateOfExpiration"),
                "nationality": self._get_field(fields, "CountryRegion"),
                "sex": self._get_field(fields, "Sex"),
            },
            confidence=doc.confidence or 0.0,
            raw_text=result.content or ""
        )

    def _extract_language_test(self, result) -> AiExtractionResult:
        import re as _re

        # prebuilt-read returns raw text, not key-value pairs.
        # Parse IELTS TRF / CELPIP score report using regex patterns.
        raw = result.content or ""

        def find(patterns, text=raw):
            for p in patterns:
                m = _re.search(p, text, _re.IGNORECASE)
                if m:
                    return m.group(1).strip()
            return ""

        # Detect test type
        test_type = ""
        if _re.search(r"\bIELTS\b", raw, _re.IGNORECASE):
            test_type = "IELTS"
        elif _re.search(r"\bCELPIP\b", raw, _re.IGNORECASE):
            test_type = "CELPIP"
        elif _re.search(r"\bTEF\b", raw, _re.IGNORECASE):
            test_type = "TEF"
        elif _re.search(r"\bTCF\b", raw, _re.IGNORECASE):
            test_type = "TCF"

        # Candidate name — appears after "Name:" or "Candidate Name:" or "Test Taker:"
        candidate_name = find([
            r"(?:Candidate\s+Name|Name of\s+Candidate|Test\s+Taker)[:\s]+([A-Z][A-Za-z\s\-']+?)(?:\n|Date|DOB|$)",
            r"^([A-Z][A-Z\s\-']{5,40})$",  # All-caps name line
        ])

        # Test date
        test_date = find([
            r"(?:Test\s+Date|Date\s+of\s+Test|Examination\s+Date)[:\s]+(\d{1,2}[\s\-/\.][A-Za-z]+[\s\-/\.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})",
            r"(?:Test\s+Date|Date)[:\s]+(\d{1,2}\s+\w+\s+\d{4})",
        ])

        # Band scores — IELTS uses 0.0-9.0 scale
        # Pattern: "Listening 7.5" or "L 8.0" or score in a table
        listening = find([
            r"Listening[:\s]+(\d+\.?\d*)",
            r"L\s*[:\|]\s*(\d+\.?\d*)",
        ])
        reading = find([
            r"Reading[:\s]+(\d+\.?\d*)",
            r"R\s*[:\|]\s*(\d+\.?\d*)",
        ])
        writing = find([
            r"Writing[:\s]+(\d+\.?\d*)",
            r"W\s*[:\|]\s*(\d+\.?\d*)",
        ])
        speaking = find([
            r"Speaking[:\s]+(\d+\.?\d*)",
            r"S\s*[:\|]\s*(\d+\.?\d*)",
        ])
        overall = find([
            r"Overall\s+(?:Band\s+)?Score[:\s]+(\d+\.?\d*)",
            r"Overall[:\s]+(\d+\.?\d*)",
            r"Band\s+Score[:\s]+(\d+\.?\d*)",
        ])

        # Registration / TRF number
        reg_number = find([
            r"(?:Test\s+Report\s+Form\s+No\.?|TRF\s+No\.?|Reference\s+No\.?|Candidate\s+No\.?)[:\s]+([A-Z0-9\-]+)",
            r"([A-Z]{2}\d{6,12}[A-Z0-9]*)",  # IELTS TRF format like IN004L0001XXX
        ])

        # Fall back to kvp if available (prebuilt-document tier)
        kvp = {}
        if result.key_value_pairs:
            for pair in result.key_value_pairs:
                if pair.key and pair.value:
                    kvp[pair.key.content.lower().strip()] = pair.value.content.strip()
            if not test_type:   test_type       = kvp.get("test type", "")
            if not candidate_name: candidate_name = kvp.get("candidate name", kvp.get("name", ""))
            if not test_date:   test_date       = kvp.get("test date", kvp.get("date of test", ""))
            if not listening:   listening       = kvp.get("listening", "")
            if not reading:     reading         = kvp.get("reading", "")
            if not writing:     writing         = kvp.get("writing", "")
            if not speaking:    speaking        = kvp.get("speaking", "")
            if not overall:     overall         = kvp.get("overall band score", kvp.get("overall", ""))
            if not reg_number:  reg_number      = kvp.get("test report form no.", kvp.get("reference number", ""))

        logger.info(
            f"_extract_language_test: type={test_type!r} name={candidate_name!r} "
            f"date={test_date!r} L={listening} R={reading} W={writing} S={speaking} overall={overall}"
        )

        return AiExtractionResult(
            document_type=DocumentType.LANGUAGE_TEST_RESULT,
            extracted_fields={
                k: v for k, v in {
                    "test_type": test_type,
                    "candidate_name": candidate_name,
                    "test_date": test_date,
                    "listening": listening,
                    "reading": reading,
                    "writing": writing,
                    "speaking": speaking,
                    "overall_band": overall,
                    "registration_number": reg_number,
                }.items() if v  # only include non-empty values
            },
            confidence=0.75,
            raw_text=result.content or ""
        )

    def _extract_employment_letter(self, result) -> AiExtractionResult:
        import re as _re
        raw = result.content or ""

        def find(patterns, text=raw):
            for p in patterns:
                m = _re.search(p, text, _re.IGNORECASE)
                if m:
                    return m.group(1).strip()
            return ""

        employee_name = find([
            r"(?:Employee|Name of Employee|This is to certify that|certify that\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*)([A-Z][A-Za-z\s\-']+?)(?:\s+(?:has been|is employed|works|working))",
            r"(?:Dear\s+(?:Sir|Madam|To Whom)|Employee Name|Name)[:\s]+([A-Z][A-Za-z\s\-']{3,40}?)(?:\n|has|is)",
        ])
        employer_name = find([
            r"(?:Company|Employer|Organization|Firm)[:\s]+([A-Za-z0-9\s\&\.\,\-]+?)(?:\n|Ltd|Inc|Pvt|LLC|$)",
            r"^([A-Z][A-Za-z0-9\s\&\.\,]{5,50}(?:Ltd|Inc|Pvt|LLC|LLP|Corp)\.?)",
        ])
        job_title = find([
            r"(?:Designation|Position|Job Title|Title|Role|post of)[:\s]+([A-Za-z\s\-\/]+?)(?:\n|since|from|\.)",
            r"(?:working as|employed as|position of)\s+(?:a\s+|an\s+)?([A-Za-z\s\-\/]+?)(?:\n|\.|,|since)",
        ])
        start_date = find([
            r"(?:since|from|joining date|date of joining|start date|commencement)[:\s]+(\d{1,2}[\s\-/\.][A-Za-z]+[\s\-/\.]\d{2,4}|\d{4}-\d{2}-\d{2}|\w+\s+\d{4})",
            r"(?:employed|working)\s+(?:with us\s+)?(?:since|from)\s+(\w+[\s,]+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        ])
        salary = find([
            r"(?:salary|CTC|compensation|remuneration|package)[:\s]+(?:INR|Rs\.?|CAD|\$|₹)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:per annum|per month|p\.a\.|p\.m\.|annually|monthly))?)",
            r"(?:INR|Rs\.?|CAD|\$|₹)\s*([\d,]+(?:\.\d+)?)\s*(?:per annum|per month|p\.a\.|p\.m\.)",
        ])
        hours = find([
            r"(\d+)\s*(?:hours?)\s*(?:per week|a week|weekly|\/week)",
            r"(?:work(?:ing)?\s+hours?|hours?\s+per\s+week)[:\s]+(\d+)",
        ])

        # KVP fallback
        kvp = {}
        if result.key_value_pairs:
            for pair in result.key_value_pairs:
                if pair.key and pair.value:
                    kvp[pair.key.content.lower().strip()] = pair.value.content.strip()
            if not employee_name: employee_name = kvp.get("employee name", kvp.get("name", ""))
            if not employer_name: employer_name = kvp.get("employer", kvp.get("company", ""))
            if not job_title:     job_title     = kvp.get("position", kvp.get("job title", ""))
            if not start_date:    start_date    = kvp.get("start date", kvp.get("date of employment", ""))
            if not salary:        salary        = kvp.get("annual salary", kvp.get("salary", ""))
            if not hours:         hours         = kvp.get("hours per week", kvp.get("weekly hours", ""))

        logger.info(f"_extract_employment_letter: employee={employee_name!r} employer={employer_name!r} title={job_title!r} start={start_date!r}")

        return AiExtractionResult(
            document_type=DocumentType.EMPLOYMENT_LETTER,
            extracted_fields={
                k: v for k, v in {
                    "employee_name": employee_name,
                    "employer_name": employer_name,
                    "job_title": job_title,
                    "start_date": start_date,
                    "salary": salary,
                    "hours_per_week": hours,
                }.items() if v
            },
            confidence=0.70,
            raw_text=result.content or ""
        )

    def _extract_education(self, result) -> AiExtractionResult:
        return AiExtractionResult(
            document_type=DocumentType.EDUCATION_CREDENTIAL,
            extracted_fields={
                "degree_name": "",
                "institution_name": "",
                "graduation_date": "",
                "field_of_study": "",
                "raw_content": result.content or "",
            },
            confidence=0.6,
            raw_text=result.content or ""
        )

    def _extract_generic(self, result) -> AiExtractionResult:
        kvp = {}
        if result.key_value_pairs:
            for pair in result.key_value_pairs:
                if pair.key and pair.value:
                    kvp[pair.key.content] = pair.value.content
        return AiExtractionResult(
            document_type=DocumentType.EMPLOYMENT_LETTER,
            extracted_fields=kvp,
            confidence=0.5,
            raw_text=result.content or ""
        )

    @staticmethod
    def _get_field(fields: dict, key: str) -> str:
        field = fields.get(key)
        if field and hasattr(field, "content"):
            return field.content or ""
        return ""


# ─────────────────────────────────────────────
# 2. GPT-4o Document Review Service
# ─────────────────────────────────────────────

def _normalise_value(val: str) -> str:
    """
    Normalise a field value for fuzzy mismatch comparison.
    Returns a canonical form so equivalent values compare equal.
    """
    if not val:
        return ""
    v = str(val).strip()

    # ── Date normalisation ────────────────────────────────────────
    # "1986-08-15" = "15/08/1986" = "Aug 15, 1986" = "15 August 1986"
    # Skip short numerics like "7.5" or "40" — dateutil parses these as dates incorrectly
    import re as _re
    # Looks like a date if: has word-month (Aug, January etc.)
    # OR has separator (/ or -) between digits with enough total length to be a date (>=6 chars)
    # Dot separator only counts if the value is long enough (7.5 is NOT a date, 15.08.1986 IS)
    v_len = len(v.replace(" ", ""))
    looks_like_date = (
        any(m in v.lower() for m in ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]) or
        (bool(_re.search(r"\d[/-]\d", v)) and v_len >= 6) or
        (bool(_re.search(r"\d\.\d", v)) and v_len >= 8)
    )
    if looks_like_date:
        try:
            from dateutil import parser as dp
            parsed = dp.parse(v, dayfirst=True)
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            pass

    v_lower = v.lower()

    # ── Nationality ↔ country name ────────────────────────────────
    # Passports say "Indian", profiles store "India" — same thing
    NATIONALITY_MAP = {
        "indian": "india", "pakistani": "pakistan", "bangladeshi": "bangladesh",
        "chinese": "china", "american": "united states", "british": "united kingdom",
        "canadian": "canada", "australian": "australia", "filipino": "philippines",
        "nepali": "nepal", "sri lankan": "sri lanka", "nigerian": "nigeria",
        "ghanaian": "ghana", "iranian": "iran", "brazilian": "brazil",
        "mexican": "mexico", "french": "france", "german": "germany",
        "spanish": "spain", "italian": "italy", "dutch": "netherlands",
        "emirati": "united arab emirates", "saudi": "saudi arabia",
        "kenyan": "kenya", "ethiopian": "ethiopia", "ugandan": "uganda",
        "zimbabwean": "zimbabwe", "south african": "south africa",
        "japanese": "japan", "korean": "south korea", "thai": "thailand",
        "vietnamese": "vietnam", "indonesian": "indonesia", "malaysian": "malaysia",
        "singaporean": "singapore", "turkish": "turkey", "egyptian": "egypt",
        "moroccan": "morocco", "algerian": "algeria", "tunisian": "tunisia",
        "peruvian": "peru", "colombian": "colombia", "argentinian": "argentina",
        "chilean": "chile", "venezuelan": "venezuela",
    }
    if v_lower in NATIONALITY_MAP:
        return NATIONALITY_MAP[v_lower]

    # ── Name normalisation ────────────────────────────────────────
    # Remove extra spaces, lowercase, strip punctuation
    import re
    cleaned = re.sub(r"[^a-z0-9 ]", "", v_lower)
    # Sort name tokens so "ARORA RAHUL" == "RAHUL ARORA" (passport MRZ order)
    tokens = sorted(cleaned.split())
    return " ".join(tokens)


def _filter_mismatches(mismatches: list) -> list:
    """
    Remove false positives from GPT's profile_mismatches list.
    Keeps only mismatches where the values are genuinely different
    after normalisation.
    """
    filtered = []
    for m in (mismatches or []):
        pv = _normalise_value(m.get("profile_value", ""))
        dv = _normalise_value(m.get("document_value", ""))
        if pv and dv and pv == dv:
            logger.info(
                f"_filter_mismatches: dropping false positive — "
                f"field='{m.get('field')}' "
                f"profile='{m.get('profile_value')}' "
                f"doc='{m.get('document_value')}' "
                f"(both normalise to '{pv}')"
            )
            continue
        filtered.append(m)
    return filtered


def _build_profile_context(document_type, applicant) -> str:
    """Build per-document-type profile context for cross-checking."""
    lines = []
    dt = document_type.value

    lines.append(f"Full Name: {applicant.full_name}")
    dob = applicant.date_of_birth
    if dob:
        lines.append(f"Date of Birth: {dob.strftime('%Y-%m-%d') if hasattr(dob, 'strftime') else dob}")
    lines.append(f"Nationality: {applicant.nationality or 'Not specified'}")

    if dt == "passport":
        lines.append(f"Country of Citizenship: {applicant.nationality or 'Not specified'}")
        lines.append(f"Country of Residence: {applicant.country_of_residence or 'Not specified'}")
        lines.append("Cross-check: Name, date of birth, and nationality must match exactly.")

    elif dt == "language_test_result":
        primary = next((t for t in (applicant.language_tests or []) if t.role.value == "first"), None)
        if primary:
            lines.append(f"Test Type on profile: {primary.test_type.value.upper()}")
            lines.append(f"Listening: {primary.listening}  Reading: {primary.reading}  Writing: {primary.writing}  Speaking: {primary.speaking}")
            lines.append(f"Test date on profile: {primary.test_date}")
            clb = primary.clb_equivalent
            if clb:
                lines.append(f"CLB on profile: L={getattr(clb,'listening','?')} R={getattr(clb,'reading','?')} W={getattr(clb,'writing','?')} S={getattr(clb,'speaking','?')}")
            lines.append("Cross-check: Test type, all 4 band scores, and test date must match exactly.")
        else:
            lines.append("No language test recorded in profile yet.")

    elif dt == "education_credential":
        edu = applicant.education
        if edu:
            lines.append(f"Education level: {edu.level.value if hasattr(edu.level,'value') else edu.level}")
            lines.append(f"Institution: {edu.institution_name or 'Not specified'}")
            lines.append(f"Field of study: {edu.field_of_study or 'Not specified'}")
            lines.append(f"Country of study: {edu.country or 'Not specified'}")
            lines.append(f"Canadian credential: {'Yes' if edu.is_canadian else 'No'}")
            lines.append("Cross-check: Name on degree must match profile name exactly.")
        else:
            lines.append("No education recorded in profile yet.")

    elif dt == "eca_report":
        edu = applicant.education
        if edu:
            lines.append(f"Education level: {edu.level.value if hasattr(edu.level,'value') else edu.level}")
            lines.append(f"ECA organization: {edu.eca_organization or 'Not specified'}")
            lines.append("Cross-check: Name on ECA must match. Canadian equivalency must match education level.")

    elif dt == "employment_letter":
        jobs = applicant.work_experiences or []
        for i, job in enumerate(jobs[:3]):
            lines.append(f"Job {i+1}: {job.job_title} at {job.employer_name}")
            lines.append(f"  Start: {job.start_date}  End: {job.end_date or 'Present'}  Hours/week: {job.hours_per_week}  NOC: {job.noc_code}")
        if not jobs:
            lines.append("No work experience in profile yet.")
        lines.append("Cross-check: Employer name, job title, dates, and hours/week must match profile.")

    elif dt == "police_certificate":
        lines.append(f"Countries: {applicant.nationality}, {applicant.country_of_residence or 'same'}")
        lines.append("Cross-check: Name must match passport.")

    else:
        lines.append("Cross-check: Name must match passport.")

    return "\n".join(lines)


class DocumentReviewService:
    """
    Uses GPT-4o Vision to review documents for IRCC compliance issues.
    """

    def __init__(self):
        self._client = None  # Lazy init

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def review_document(
        self,
        document_type: DocumentType,
        file_bytes: bytes,
        mime_type: str,
        applicant: Applicant,
        extracted_fields: dict = None,
    ) -> dict:
        """Returns: {is_valid, issues, recommendations, confidence, must_fix}"""
        logger.info(f"DocumentReview.review_document: type={document_type.value}  size={len(file_bytes)}B  applicant={applicant.full_name!r}")
        t0 = time.perf_counter()
        base64_doc = base64.b64encode(file_bytes).decode("utf-8")
        extracted_fields = extracted_fields or {}

        # ── Hard rule checks from extracted fields ──────────────────────────
        # These run regardless of vision capability — DocIntelligence already
        # extracted this data with high confidence, so we trust it directly.
        hard_issues = []
        hard_must_fix = []
        from datetime import date as _date

        if document_type.value == "passport":
            expiry_str = extracted_fields.get("date_of_expiry") or extracted_fields.get("expiry_date")
            if expiry_str:
                try:
                    # Handle common date formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
                    from dateutil import parser as dateparser
                    expiry = dateparser.parse(str(expiry_str)).date()
                    today = _date.today()
                    days_left = (expiry - today).days
                    if days_left < 0:
                        hard_must_fix.append(f"Passport expired on {expiry.strftime('%B %d, %Y')} — must renew before applying")
                    elif days_left < 180:
                        hard_issues.append(f"Passport expiring soon ({expiry.strftime('%B %d, %Y')}, {days_left} days remaining) — IRCC recommends 6+ months validity")
                    logger.info(f"review_document: passport expiry check — {expiry} ({days_left} days)")
                except Exception as e:
                    logger.warning(f"review_document: could not parse expiry date '{expiry_str}': {e}")

        if document_type.value == "language_test_result":
            from dateutil import parser as dateparser

            # ── Hard check 1: Test expiry ─────────────────────────────────
            test_date_str = extracted_fields.get("test_date") or extracted_fields.get("date_of_test")
            doc_test_date = None
            if test_date_str:
                try:
                    doc_test_date = dateparser.parse(str(test_date_str)).date()
                    today = _date.today()
                    days_old = (today - doc_test_date).days
                    if days_old > 730:
                        hard_must_fix.append(
                            f"Language test expired — taken {doc_test_date.strftime('%B %d, %Y')} "
                            f"({days_old} days ago). Express Entry requires results within 2 years."
                        )
                    elif days_old > 640:
                        hard_issues.append(
                            f"Language test expiring soon ({doc_test_date.strftime('%B %d, %Y')}) "
                            f"— expires in {730 - days_old} days."
                        )
                    logger.info(f"review_document: language test date — {doc_test_date} ({days_old} days old)")
                except Exception as e:
                    logger.warning(f"review_document: could not parse test date '{test_date_str}': {e}")

            # ── Hard check 2: Score mismatch vs profile ───────────────────
            primary_test = next(
                (t for t in (applicant.language_tests or []) if t.role.value == "first"),
                None
            )
            if primary_test:
                for skill in ("listening", "reading", "writing", "speaking"):
                    doc_score_str = extracted_fields.get(skill, "")
                    profile_score = getattr(primary_test, skill, None)
                    if doc_score_str and profile_score is not None:
                        try:
                            doc_score = float(doc_score_str)
                            prof_score = float(profile_score)
                            diff = abs(doc_score - prof_score)
                            if diff >= 0.5:
                                severity = "CRITICAL" if diff >= 1.0 else "WARNING"
                                hard_must_fix.append(
                                    f"{severity}: {skill.capitalize()} score mismatch — "
                                    f"document shows {doc_score}, profile says {prof_score}. "
                                    f"IRCC verifies scores against your official test results."
                                ) if diff >= 1.0 else hard_issues.append(
                                    f"{skill.capitalize()} score difference — "
                                    f"document: {doc_score}, profile: {prof_score}. "
                                    f"Update your profile to match the document."
                                )
                                logger.info(f"review_document: score mismatch {skill} doc={doc_score} profile={prof_score} diff={diff}")
                        except (ValueError, TypeError) as e:
                            logger.warning(f"review_document: could not compare {skill} scores: {e}")

            # ── Hard check 3: Test date mismatch vs profile ───────────────
            if doc_test_date and primary_test and primary_test.test_date:
                try:
                    profile_date_str = str(primary_test.test_date)
                    profile_date = dateparser.parse(profile_date_str).date()
                    if doc_test_date != profile_date:
                        hard_issues.append(
                            f"Test date mismatch — document shows {doc_test_date.strftime('%B %d, %Y')}, "
                            f"profile says {profile_date.strftime('%B %d, %Y')}. "
                            f"Update your profile to match the actual test date."
                        )
                        logger.info(f"review_document: test date mismatch doc={doc_test_date} profile={profile_date}")
                except Exception as e:
                    logger.warning(f"review_document: could not compare test dates: {e}")

        # If we already have critical hard issues, include them in the prompt context
        hard_context = ""
        if hard_issues or hard_must_fix:
            hard_context = f"""
CONFIRMED DATA FROM DOCUMENT INTELLIGENCE (high confidence — do not contradict these):
{chr(10).join(f"- {issue}" for issue in hard_must_fix + hard_issues)}
These are confirmed facts. Include them in your response.
"""

        # Per-document-type checklists — only check what is relevant for each doc type.
        # CRITICAL: Do NOT apply employment letter checks to a passport or photo.
        DOC_CHECKLISTS = {
            "passport": [
                "Passport is expired or expiring within 6 months",
                "Passport number is not clearly visible",
                "Photo page is missing or unclear",
                "Date of birth is not readable",
                "Passport does not appear to be a genuine government-issued travel document",
            ],
            "language_test_result": [
                "Test is older than 2 years (expired for Express Entry)",
                "Scores are missing or illegible",
                "Candidate name is missing",
                "Test registration/TRF number is not visible",
                "Test type is not IELTS, CELPIP, TEF, or TCF",
            ],
            "education_credential": [
                "Name on degree does not match passport name",
                "Degree is not clearly issued by an accredited institution",
                "The document appears to be a transcript rather than a degree certificate",
                "Completion/convocation date is missing",
                "If in a language other than English or French: no certified translation is attached",
            ],
            "eca_report": [
                "ECA is older than 5 years",
                "Issuing organization is not IRCC-designated (WES, ICAS, etc.)",
                "Applicant name does not match passport",
                "Canadian equivalency level is not stated",
            ],
            "employment_letter": [
                "Letter is not on company letterhead",
                "Company stamp or authorized signature is missing",
                "Job title is not stated",
                "Start date of employment is missing",
                "Salary or hourly rate is not mentioned",
                "Hours worked per week are not stated",
                "Job duties/responsibilities are not described",
                "Letter is not addressed to IRCC or immigration purposes",
            ],
            "police_certificate": [
                "Certificate is older than 1 year",
                "Issuing authority name is not visible",
                "Applicant name does not match passport",
                "Certificate is not in English or French and no translation is attached",
            ],
            "medical_exam": [
                "Exam is older than 1 year",
                "IRCC-designated physician name or stamp is missing",
                "Applicant name does not match passport",
            ],
            "birth_certificate": [
                "Document is not an official government-issued certificate",
                "Name does not match passport",
                "If not in English or French: no certified translation",
            ],
            "marriage_certificate": [
                "Document is not an official government-issued certificate",
                "Names do not match passports",
                "If not in English or French: no certified translation",
            ],
            "photo": [
                "Photo does not show a clear, full frontal face",
                "Photo background is not plain white or light-coloured",
                "Photo appears to be a digital screenshot rather than a proper photo",
                "Image quality is too low to verify identity",
            ],
        }

        checklist = DOC_CHECKLISTS.get(document_type.value, [
            "Document is expired",
            "Name does not match passport",
            "Document quality is too poor to read",
            "Required official signatures or stamps are missing",
        ])

        checklist_text = "\n".join(f"- {item}" for item in checklist)

        # ── Build per-document profile context for cross-checking ──────────
        profile_context = _build_profile_context(document_type, applicant)

        prompt = f"""You are reviewing a {document_type.value.replace("_", " ").title()} document for a Canadian Express Entry application.

APPLICANT PROFILE DATA (cross-check the document against these values):
{profile_context}

IMPORTANT RULES:
1. ONLY check things relevant to THIS document type ({document_type.value.replace("_", " ").title()}).
2. Only report an issue if you can clearly observe it in the document. Do NOT assume issues that are not visible.
3. PASSPORTS: IRCC accepts passports in any language — NEVER flag language. MRZ lines are always Latin script.
4. A bilingual document (original + English/French in same file) is fully acceptable — do NOT flag as untranslated.
5. If you cannot clearly see the document, say so — do NOT fabricate issues.
6. When in doubt, do NOT raise an issue. False positives are worse than missed issues.

PART 1 — DOCUMENT QUALITY CHECKS:
Check ONLY these items for a {document_type.value.replace("_", " ").title()}:
{checklist_text}

PART 2 — PROFILE CROSS-CHECK:
Compare the document content against the APPLICANT PROFILE DATA above.
Report a mismatch ONLY if the values are genuinely different after normalisation.

EQUIVALENCE RULES — these are NOT mismatches:
- Dates: "1986-08-15" = "15/08/1986" = "Aug 15, 1986" = "15 August 1986" — all the same date
- Nationality vs country: "India" = "Indian", "Pakistan" = "Pakistani", "Philippines" = "Filipino" — same country
- Name case: "RAHUL ARORA" = "Rahul Arora" — same name
- Name order: "ARORA RAHUL" = "Rahul Arora" — passports show surname first in MRZ, given name second
- Minor spacing or punctuation differences in names

Only report a mismatch if after applying these rules the values are clearly different.
Common real mismatches to check:
- First name or surname genuinely different (e.g. "Rahul" vs "Rohit")
- Date of birth clearly different after date normalisation
- IELTS scores on document differ from profile scores (e.g. document says 7.0, profile says 7.5)
- Employer name on letter differs from profile

Return JSON with exactly this structure:
{{
  "is_valid": true/false,
  "confidence": 0.0-1.0,
  "issues": ["document quality issues clearly observed"],
  "must_fix": ["critical issues that will cause IRCC rejection"],
  "recommendations": ["helpful suggestions"],
  "summary": "brief honest assessment",
  "profile_mismatches": [
    {{
      "field": "field name (e.g. Full Name, Date of Birth, IELTS Listening Score)",
      "profile_value": "what the profile says",
      "document_value": "what the document shows",
      "severity": "critical | warning",
      "note": "explanation"
    }}
  ]
}}

Only include profile_mismatches where you can clearly see both values differ. Empty array if everything matches.
Be conservative: passing a good document is better than generating false issues.{hard_context}"""

        # Send document to gpt-4o vision for actual visual inspection.
        # GPT-4o vision accepts image/jpeg, image/png, image/gif, image/webp.
        # PDFs must be converted to JPEG first (first page only).
        effective_mime = mime_type or "image/jpeg"
        image_bytes = file_bytes
        can_use_vision = True

        # GPT-4o vision only accepts: image/jpeg, image/png, image/gif, image/webp
        # PDFs must be converted first. If conversion fails, fall back to text-only.
        is_pdf = effective_mime == "application/pdf" or file_bytes[:4] == b"%PDF"
        is_image = effective_mime in ("image/jpeg", "image/png", "image/gif", "image/webp",
                                      "image/jpg", "image/tiff")

        if is_pdf:
            converted = False
            # Try pdf2image (needs poppler)
            try:
                import io
                from pdf2image import convert_from_bytes
                pages = convert_from_bytes(file_bytes, dpi=200, first_page=1, last_page=1)
                buf = io.BytesIO()
                pages[0].save(buf, format="JPEG", quality=90)
                image_bytes = buf.getvalue()
                effective_mime = "image/jpeg"
                converted = True
                logger.info("review_document: PDF → JPEG via pdf2image")
            except Exception as e1:
                logger.warning(f"review_document: pdf2image failed ({e1})")

            # Try PyMuPDF as fallback
            if not converted:
                try:
                    import fitz, io
                    pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                    pix = pdf_doc[0].get_pixmap(matrix=fitz.Matrix(2, 2))
                    image_bytes = pix.tobytes("jpeg")
                    effective_mime = "image/jpeg"
                    converted = True
                    pdf_doc.close()
                    logger.info("review_document: PDF → JPEG via PyMuPDF")
                except Exception as e2:
                    logger.warning(f"review_document: PyMuPDF failed ({e2})")

            if not converted:
                # No PDF converter available — use text-only mode
                can_use_vision = False
                logger.warning("review_document: no PDF converter available — falling back to text-only review")

        elif not is_image:
            # Unknown format — skip vision
            can_use_vision = False
            logger.warning(f"review_document: unsupported mime {effective_mime} — text-only review")

        # Build message content — with or without image
        if can_use_vision:
            vision_base64 = base64.b64encode(image_bytes).decode("utf-8")
            user_content = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {
                    "url": f"data:{effective_mime};base64,{vision_base64}",
                    "detail": "high"
                }}
            ]
        else:
            # Text-only: tell the model it cannot see the document
            user_content = prompt + "\n\nNOTE: The document image could not be loaded for visual inspection. Review based on document type rules only. Be conservative — do not flag issues you cannot verify."

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": DOCUMENT_REVIEWER_SYSTEM},
                {"role": "user", "content": user_content}
            ],
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

        try:
            result = json.loads(response.choices[0].message.content)

            # ── Merge hard rule issues (expiry, language test date) ──────────
            if hard_must_fix:
                result["must_fix"] = list(set((result.get("must_fix") or []) + hard_must_fix))
                result["is_valid"] = False
            if hard_issues:
                result["issues"] = list(set((result.get("issues") or []) + hard_issues))

            # ── Ensure profile_mismatches key exists ─────────────────────────
            if "profile_mismatches" not in result:
                result["profile_mismatches"] = []

            # ── Filter false mismatches caused by format/wording differences ─
            result["profile_mismatches"] = _filter_mismatches(result["profile_mismatches"])

            # ── Critical mismatches → mark invalid + add to must_fix ─────────
            critical = [m for m in result["profile_mismatches"] if m.get("severity") == "critical"]
            if critical:
                result["is_valid"] = False
                for m in critical:
                    issue = f"Profile mismatch — {m['field']}: profile has '{m['profile_value']}', document shows '{m['document_value']}'"
                    if issue not in (result.get("must_fix") or []):
                        result.setdefault("must_fix", []).append(issue)

            logger.info(
                f"DocumentReview.review_document: done in {(time.perf_counter()-t0)*1000:.0f}ms  "
                f"valid={result.get('is_valid')}  issues={len(result.get('issues',[]))}  "
                f"must_fix={len(result.get('must_fix',[]))}  "
                f"mismatches={len(result.get('profile_mismatches',[]))}  "
                f"hard={len(hard_must_fix)+len(hard_issues)}"
            )
            return result

        except json.JSONDecodeError as e:
            logger.error(f"DocumentReview.review_document: JSON parse failed after {(time.perf_counter()-t0)*1000:.0f}ms: {e}  raw={response.choices[0].message.content[:200]!r}")
            return {
                "is_valid": None,
                "confidence": 0.0,
                "issues": ["Could not analyze document"],
                "must_fix": [],
                "recommendations": ["Please ensure document is clear and readable"],
                "summary": "Analysis failed",
                "profile_mismatches": []
            }


# ─────────────────────────────────────────────
# 3. NOC Code Finder Service
# ─────────────────────────────────────────────

class NocFinderService:
    """
    Uses GPT-4o to match job descriptions to NOC 2021 codes.
    """


    def __init__(self):
        self._client = None  # Lazy init

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                logger.error(f"{self.__class__.__name__}: AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not set")
                raise RuntimeError("Azure OpenAI not configured — set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env")
            logger.info(f"{self.__class__.__name__}: connecting to Azure OpenAI  endpoint={settings.AZURE_OPENAI_ENDPOINT[:40]}  deployment={settings.AZURE_OPENAI_DEPLOYMENT}")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def find_noc_codes(
        self,
        job_title: str,
        job_duties: str,
        country: str = "International"
    ) -> list[dict]:
        logger.info(f"NocFinder.find_noc_codes: title={job_title!r}  country={country}  duties_len={len(job_duties)}")
        t0 = time.perf_counter()
        prompt = f"""Match this job to Canadian NOC 2021 codes:

Job Title: {job_title}
Country: {country}
Job Duties:
{job_duties}

Return top 3 NOC matches. Prioritize TEER 0, 1, 2 for Express Entry eligibility.

Return JSON array:
[
  {{
    "noc_code": "12345",
    "noc_title": "Official NOC title",
    "teer_level": 1,
    "match_confidence": 0.95,
    "explanation": "Why this NOC fits",
    "eligible_for_express_entry": true,
    "eligible_program": "FSW/CEC/FST or N/A",
    "key_duties_matched": ["duty1", "duty2"],
    "typical_clb_required": 7
  }}
]"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": NOC_FINDER_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1500,
            response_format={"type": "json_object"}
        )

        try:
            content = response.choices[0].message.content
            parsed = json.loads(content)
            # Handle both array response and object with array
            result = parsed if isinstance(parsed, list) else parsed.get("matches", parsed.get("noc_codes", []))
            logger.info(f"NocFinder.find_noc_codes: done in {(time.perf_counter()-t0)*1000:.0f}ms  matches={len(result)}")
            return result
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"NocFinder.find_noc_codes: parse error after {(time.perf_counter()-t0)*1000:.0f}ms: {e}  raw={response.choices[0].message.content[:200]!r}")
            return []


# ─────────────────────────────────────────────
# 4. CRS Improvement & Prediction Service
# ─────────────────────────────────────────────

class CrsPredictionService:
    """
    Uses GPT-4o + historical draw data to predict ITA probability
    and suggest CRS improvement strategies.
    """


    def __init__(self):
        self._client = None  # Lazy init

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                logger.error(f"{self.__class__.__name__}: AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not set")
                raise RuntimeError("Azure OpenAI not configured — set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env")
            logger.info(f"{self.__class__.__name__}: connecting to Azure OpenAI  endpoint={settings.AZURE_OPENAI_ENDPOINT[:40]}  deployment={settings.AZURE_OPENAI_DEPLOYMENT}")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def get_improvement_suggestions(
        self,
        applicant: Applicant,
        current_score: int
    ) -> list[dict]:
        logger.info(f"CrsPredictor.get_improvement_suggestions: score={current_score}  applicant={applicant.full_name!r}")
        t0 = time.perf_counter()
        score = applicant.current_crs_score
        clb = applicant.primary_language_test.clb_equivalent if applicant.primary_language_test else None

        profile_summary = f"""
Current CRS Score: {current_score}
Age: {applicant.age}
Education: {applicant.education.level.value if applicant.education else 'Unknown'}
Education Country: {'Canada' if applicant.education and applicant.education.is_canadian else 'Abroad'}
Primary Language CLB: Listening={clb.listening if clb else 0}, Reading={clb.reading if clb else 0}, Writing={clb.writing if clb else 0}, Speaking={clb.speaking if clb else 0}
Secondary Language (French): {'Already tested' if applicant.secondary_language_test else 'Not yet tested — MAJOR opportunity'}
Canadian Work Experience: {applicant.canadian_work_years:.1f} years
Foreign Work Experience: {applicant.foreign_work_years:.1f} years
Has Spouse: {applicant.has_spouse}
Spouse Contributing: {bool(applicant.spouse_profile)}
Provincial Nomination: {applicant.has_provincial_nomination}
Job Offer: {bool(applicant.job_offer)}
Sibling in Canada: {applicant.has_sibling_in_canada}
Certificate of Qualification: {applicant.has_certificate_of_qualification}
"""

        prompt = f"""Analyze this Express Entry applicant profile and suggest the best CRS improvement strategies:

{profile_summary}

IMPORTANT RULES:
1. If Secondary Language (French) is "Not yet tested", ALWAYS include taking the TEF Canada or TCF Canada French test as one of the top suggestions. Even basic French (CLB 5-6) adds 16-24 points, and CLB 7+ adds up to 50 points under skill transferability.
2. Consider ALL possible point sources: language improvement, Canadian work experience, education (ECA), provincial nomination, job offer, spouse optimization, sibling in Canada, French language.
3. Rank by realistic points gain vs effort for THIS specific profile.
4. Provide exactly 10 strategies covering all realistic options.

Return a JSON object with a "suggestions" key containing an array:
{{
  "suggestions": [
    {{
      "strategy": "Clear action title",
      "description": "Detailed explanation of why this helps and how to do it",
      "estimated_points_gain": 15,
      "effort_level": "low/medium/high",
      "time_required": "e.g. 3-6 months",
      "feasibility": "high/medium/low",
      "priority": 1,
      "specific_actions": ["action1", "action2"],
      "caveats": "Any important notes or conditions"
    }}
  ]
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": CRS_ADVISOR_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,
            response_format={"type": "json_object"}
        )

        try:
            content = response.choices[0].message.content
            parsed = json.loads(content)
            result = parsed if isinstance(parsed, list) else parsed.get("strategies", parsed.get("suggestions", []))
            logger.info(f"CrsPredictor.get_improvement_suggestions: done in {(time.perf_counter()-t0)*1000:.0f}ms  suggestions={len(result)}")
            return result
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"CrsPredictor.get_improvement_suggestions: parse error after {(time.perf_counter()-t0)*1000:.0f}ms: {e}")
            return []

    async def predict_invitation(
        self,
        current_crs: int,
        recent_draws: list[dict],
        applicant_program: str
    ) -> dict:
        logger.info(f"CrsPredictor.predict_invitation: crs={current_crs}  programs={applicant_program!r}  draws={len(recent_draws)}")
        t0 = time.perf_counter()
        draw_summary = "\n".join([
            f"Draw #{d['number']} ({d['date']}): Min CRS={d['min_crs']}, "
            f"Type={d['type']}, Invitations={d['invitations']}"
            for d in recent_draws[-20:]
        ])

        prompt = f"""Predict Express Entry ITA probability:

Applicant CRS Score: {current_crs}
Applicant Programs: {applicant_program}

Recent 20 Draws:
{draw_summary}

Return JSON:
{{
  "invitation_probability_6_months": 0.65,
  "invitation_probability_12_months": 0.85,
  "likely_draw_type": "No occupation restriction / STEM / etc.",
  "score_needed_for_high_probability": 480,
  "points_to_gain": 30,
  "trend_analysis": "Brief analysis of recent draw trends",
  "risk_factors": ["factors that might affect chances"],
  "recommendation": "What the applicant should do"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": DRAW_PREDICTION_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

        try:
            result = json.loads(response.choices[0].message.content)
            logger.info(f"CrsPredictor.predict_invitation: done in {(time.perf_counter()-t0)*1000:.0f}ms  prob_6mo={result.get('invitation_probability_6_months')}  prob_12mo={result.get('invitation_probability_12_months')}")
            return result
        except json.JSONDecodeError as e:
            logger.error(f"CrsPredictor.predict_invitation: JSON parse failed after {(time.perf_counter()-t0)*1000:.0f}ms: {e}")
            return {"error": "Prediction unavailable"}


# ─────────────────────────────────────────────
# 5. Personalized Checklist Generator
# ─────────────────────────────────────────────

class ChecklistGeneratorService:
    """
    Uses GPT-4o to generate a personalized ITA document checklist.
    """


    def __init__(self):
        self._client = None  # Lazy init

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                logger.error(f"{self.__class__.__name__}: AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not set")
                raise RuntimeError("Azure OpenAI not configured — set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env")
            logger.info(f"{self.__class__.__name__}: connecting to Azure OpenAI  endpoint={settings.AZURE_OPENAI_ENDPOINT[:40]}  deployment={settings.AZURE_OPENAI_DEPLOYMENT}")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate_checklist(self, applicant: Applicant) -> list[dict]:
        logger.info(f"ChecklistGenerator.generate_checklist: applicant={applicant.full_name!r}  programs={[p.value for p in applicant.eligible_programs]}")
        t0 = time.perf_counter()
        profile = f"""
Applicant: {applicant.full_name}
Nationality: {applicant.nationality}
Programs: {[p.value for p in applicant.eligible_programs]}
Has Spouse: {applicant.has_spouse}
Has Children: False
Work Experience Countries: {list(set(exp.experience_type.value for exp in applicant.work_experiences))}
Education Country: {applicant.education.country if applicant.education else 'Unknown'}
Has Job Offer: {bool(applicant.job_offer)}
Has Provincial Nomination: {applicant.has_provincial_nomination}
"""

        prompt = f"""Generate a complete ITA document checklist for this Express Entry applicant.
Include all required and optional documents based on their specific profile.

{profile}

Return JSON array of checklist sections:
[
  {{
    "section": "Identity Documents",
    "items": [
      {{
        "title": "Valid Passport",
        "description": "All pages of current valid passport. Must be valid for at least 6 months.",
        "document_type": "passport",
        "is_required": true,
        "tips": "Upload all bio data pages and any pages with stamps or visas",
        "ircc_reference": "Schedule 1, Question 2",
        "common_mistakes": ["Only uploading bio page", "Passport expiring soon"]
      }}
    ]
  }}
]"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": CHECKLIST_GENERATOR_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            max_tokens=3000,
            response_format={"type": "json_object"}
        )

        try:
            content = response.choices[0].message.content
            parsed = json.loads(content)
            result = parsed if isinstance(parsed, list) else parsed.get("sections", parsed.get("checklist", []))
            total_items = sum(len(s.get("items", [])) for s in result)
            logger.info(f"ChecklistGenerator.generate_checklist: done in {(time.perf_counter()-t0)*1000:.0f}ms  sections={len(result)}  total_items={total_items}")
            return result
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"ChecklistGenerator.generate_checklist: parse error after {(time.perf_counter()-t0)*1000:.0f}ms: {e}  raw={response.choices[0].message.content[:200]!r}")
            return []


# ─────────────────────────────────────────────
# 6. RAG Immigration Chatbot
# ─────────────────────────────────────────────

class VectorKnowledgeBase:
    """
    ChromaDB-backed vector store for IRCC documentation (RAG).
    Uses lazy initialization so a slow ChromaDB startup does not crash the API.
    """

    def __init__(self):
        self._client = None
        self._collection = None
        self._encoder = None
        self._chroma_host = settings.CHROMA_HOST
        self._chroma_port = settings.CHROMA_PORT

    @property
    def encoder(self):
        if self._encoder is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._encoder = SentenceTransformer("all-MiniLM-L6-v2")
            except Exception as e:
                raise RuntimeError(f"sentence-transformers not available: {e}")
        return self._encoder

    def _get_collection(self):
        """Connect to ChromaDB on first use. Fails fast if unavailable."""
        if self._collection is not None:
            return self._collection

        import chromadb
        try:
            self._client = chromadb.HttpClient(
                host=self._chroma_host,
                port=self._chroma_port,
                settings=chromadb.config.Settings(anonymized_telemetry=False)
            )
            # Quick heartbeat to check if it's actually reachable
            self._client.heartbeat()
            self._collection = self._client.get_or_create_collection(
                name="ircc_knowledge_base",
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"ChromaDB connected at {self._chroma_host}:{self._chroma_port}")
            return self._collection
        except Exception as e:
            logger.warning(f"ChromaDB unavailable at {self._chroma_host}:{self._chroma_port} — RAG disabled: {type(e).__name__}")
            raise RuntimeError(f"ChromaDB unavailable — {e}")

    def add_document(self, doc_id: str, content: str, metadata: dict):
        embedding = self.encoder.encode(content).tolist()
        self._get_collection().add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        try:
            collection = self._get_collection()
        except RuntimeError as e:
            logger.warning(f"ChromaDB search skipped (RAG unavailable): {e}")
            return []

        try:
            # Use ChromaDB's built-in embedding if sentence-transformers not available
            results = collection.query(
                query_texts=[query],
                n_results=min(top_k, collection.count() or 1)
            )
            if not results["documents"] or not results["documents"][0]:
                return []
            output = []
            for i, doc in enumerate(results["documents"][0]):
                output.append({
                    "content": doc,
                    "metadata": results["metadatas"][0][i],
                    "distance": results["distances"][0][i]
                })
            return output
        except Exception as e:
            logger.warning(f"ChromaDB query failed: {e}")
            return []

    async def seed_ircc_content(self):
        """Seed with core IRCC Express Entry content"""
        ircc_docs = [
            {
                "id": "ee_overview",
                "content": """Express Entry is Canada's immigration system for skilled workers.
                It manages applications for three federal immigration programs:
                Federal Skilled Worker (FSW), Federal Skilled Trades (FST), and Canadian Experience Class (CEC).
                Candidates create an online profile and are ranked using the Comprehensive Ranking System (CRS).
                The highest-ranking candidates are invited to apply for permanent residence in draws held regularly.""",
                "metadata": {"source": "IRCC", "topic": "overview", "url": "https://canada.ca/express-entry"}
            },
            {
                "id": "crs_overview",
                "content": """The Comprehensive Ranking System (CRS) awards points based on:
                Core human capital factors (up to 500 points without spouse, 460 with spouse):
                - Age (max 110 points)
                - Education (max 150 points)  
                - First official language (max 136 points)
                - Second official language (max 24 points)
                - Canadian work experience (max 80 points)
                Spouse/common-law partner factors (up to 40 points)
                Skill transferability factors (up to 100 points)
                Additional points: Provincial nomination (600), Job offer (50 or 200), 
                Canadian education (15 or 30), Sibling in Canada (15), French language (25 or 50)""",
                "metadata": {"source": "IRCC", "topic": "crs", "url": "https://canada.ca/crs"}
            },
            {
                "id": "ita_process",
                "content": """After receiving an Invitation to Apply (ITA):
                You have 60 days to submit a complete application.
                Required documents include: Valid passport, language test results (within 2 years),
                Educational credential assessment (ECA) for foreign education,
                Police certificates from each country you lived in for 6+ months after age 18,
                Medical exam by a designated physician, Reference letters from employers,
                Photos meeting IRCC specifications, Proof of funds (unless you have a valid job offer or 
                are currently authorized to work in Canada)""",
                "metadata": {"source": "IRCC", "topic": "ita", "url": "https://canada.ca/ita"}
            },
            {
                "id": "proof_of_funds",
                "content": """Proof of funds requirements for Express Entry (FSW/FST only, not CEC):
                Single applicant: $13,757 CAD
                Family of 2: $17,127
                Family of 3: $21,055
                Family of 4: $25,564
                Family of 5: $28,994
                Family of 6: $32,700
                Family of 7+: $36,407
                Funds must be unencumbered (not borrowed), available and transferable.
                Acceptable documents: Bank statements, investment accounts, fixed deposits.""",
                "metadata": {"source": "IRCC", "topic": "funds", "url": "https://canada.ca/funds"}
            },
            {
                "id": "language_requirements",
                "content": """Language requirements for Express Entry:
                FSW: Minimum CLB 7 in all abilities (speaking, listening, reading, writing)
                CEC: CLB 7 for NOC TEER 0 or 1 jobs, CLB 5 for TEER 2 or 3 jobs
                FST: CLB 5 for speaking and listening, CLB 4 for reading and writing
                Accepted tests: IELTS General Training, CELPIP General (English)
                TEF Canada, TCF Canada (French)
                Tests must be taken within 2 years of your Express Entry application.""",
                "metadata": {"source": "IRCC", "topic": "language", "url": "https://canada.ca/language"}
            }
        ]

        for doc in ircc_docs:
            self.add_document(doc["id"], doc["content"], doc["metadata"])


class ImmigrationAssistantService:
    """
    RAG-powered immigration chatbot with applicant context awareness.
    Streams responses for real-time UI updates.
    """


    def __init__(self):
        self._client = None  # Lazy init
        self.knowledge_base = VectorKnowledgeBase()

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                logger.error(f"{self.__class__.__name__}: AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT not set")
                raise RuntimeError("Azure OpenAI not configured — set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env")
            logger.info(f"{self.__class__.__name__}: connecting to Azure OpenAI  endpoint={settings.AZURE_OPENAI_ENDPOINT[:40]}  deployment={settings.AZURE_OPENAI_DEPLOYMENT}")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def stream_answer(
        self,
        question: str,
        applicant: Applicant,
        chat_history: list[dict]
    ) -> AsyncGenerator[str, None]:
        """Yields response chunks for streaming to the client."""
        logger.info(f"ImmigrationAssistant.stream_answer: question={question[:80]!r}  history_len={len(chat_history)}  applicant={applicant.full_name!r}")
        t0 = time.perf_counter()

        # 1. Retrieve relevant IRCC content (RAG) — skip if ChromaDB unavailable
        logger.debug(f"ImmigrationAssistant: searching knowledge base for: {question[:60]!r}")
        try:
            import asyncio
            relevant_docs = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, lambda: self.knowledge_base.search(question, top_k=4)),
                timeout=3.0
            )
        except Exception as e:
            logger.warning(f"ImmigrationAssistant: RAG skipped ({type(e).__name__}) — answering without context")
            relevant_docs = []
        logger.debug(f"ImmigrationAssistant: RAG returned {len(relevant_docs)} docs")
        context = "\n\n---\n".join(d["content"] for d in relevant_docs)

        # 2. Build rich applicant context
        score = applicant.current_crs_score

        # Language scores
        lang_ctx = "None on file"
        if applicant.language_tests:
            primary = next((t for t in applicant.language_tests if t.role.value == "first"), applicant.language_tests[0])
            clb = primary.clb_equivalent
            clb_str = f"(CLB L:{clb.listening} R:{clb.reading} W:{clb.writing} S:{clb.speaking})" if clb else ""
            lang_ctx = (
                f"{primary.test_type.value.upper()} — "
                f"L:{primary.listening} R:{primary.reading} W:{primary.writing} S:{primary.speaking} "
                f"{clb_str}"
            )

        # Work experience
        work_ctx = "None on file"
        if applicant.work_experiences:
            lines = []
            for w in applicant.work_experiences:
                from datetime import date as _d
                end = w.end_date.isoformat() if w.end_date else "Present"
                lines.append(f"  • {w.job_title} @ {w.employer_name} [{w.noc_code} TEER {w.teer_level}] "
                             f"{w.start_date.isoformat()}–{end} ({w.experience_type}, {w.hours_per_week}h/wk)")
            work_ctx = "\n".join(lines)

        # Education
        edu_ctx = "Not provided"
        if applicant.education:
            edu = applicant.education
            edu_ctx = (f"{edu.level.value}, {edu.field_of_study or 'field unknown'}, "
                      f"{edu.institution_name or 'institution unknown'}, {edu.country or 'country unknown'}"
                      f"{', Canadian' if edu.is_canadian else ''}"
                      f"{', ECA: ' + edu.eca_organization if edu.eca_organization else ''}")

        # Job offer
        job_ctx = "No job offer"
        if applicant.job_offer:
            jo = applicant.job_offer
            job_ctx = f"{jo.employer_name}, NOC {jo.noc_code} TEER {jo.teer_level}, ${jo.annual_salary:,.0f}/yr"

        # CRS breakdown
        crs_ctx = "Not calculated"
        if score:
            crs_ctx = (f"Total: {score.total} "
                      f"(Core: {score.core_human_capital}, "
                      f"Spouse: {score.spouse_factors}, "
                      f"Transferability: {score.skill_transferability}, "
                      f"Additional: {score.additional_points})")

        applicant_context = f"""
=== APPLICANT PROFILE (use this to give specific, personalized answers) ===
Name: {applicant.full_name}
Age: {applicant.age}
Nationality: {applicant.nationality}
Marital Status: {applicant.marital_status}
Country of Residence: {applicant.country_of_residence or 'Not specified'}

CRS Score: {crs_ctx}
Eligible Programs: {[p.value for p in applicant.eligible_programs] or ['Not yet calculated']}

Language Test: {lang_ctx}

Education: {edu_ctx}

Work Experience:
{work_ctx}

Job Offer: {job_ctx}
Provincial Nomination: {'Yes' if applicant.has_provincial_nomination else 'No'}
Sibling in Canada: {'Yes' if applicant.has_sibling_in_canada else 'No'}
Canadian Work Experience: {applicant.canadian_work_years:.1f} years
Current Stage: {applicant.active_case.status.value if applicant.active_case else 'In pool / not yet applied'}
=== END PROFILE ===

IMPORTANT: Always refer to the applicant's actual scores, NOC codes, education level, and CRS score above when answering.
Never give generic answers — tailor every response to THIS applicant's specific situation."""

        system_prompt = f"""{IMMIGRATION_ASSISTANT_SYSTEM}

{applicant_context}

Relevant IRCC Information:
{context}"""

        # 3. Build messages
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history (last 10 messages)
        for msg in chat_history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": question})

        # 4. Stream response
        logger.info(f"ImmigrationAssistant: starting stream  messages={len(messages)}")
        stream = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=messages,
            max_tokens=1000,
            stream=True,
            temperature=0.7,
            timeout=30
        )

        char_count = 0
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                char_count += len(chunk.choices[0].delta.content)
                yield chunk.choices[0].delta.content
        logger.info(f"ImmigrationAssistant.stream_answer: done in {(time.perf_counter()-t0)*1000:.0f}ms  chars={char_count}")


# ─────────────────────────────────────────────────────────
# IELTS Preparation Service
# ─────────────────────────────────────────────────────────

IELTS_SYSTEM = """You are an expert IELTS examiner and English language teacher with 15+ years of experience.
You help candidates prepare for IELTS General Training to improve their CLB scores for Canadian immigration.
You are encouraging, precise, and give actionable feedback.
Always return valid JSON only — no markdown, no extra text."""


class IeltsService:
    """AI-powered IELTS preparation: diagnostic tests, practice questions, grading, vocabulary."""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate_diagnostic(self) -> dict:
        """Generate a 10-question diagnostic test covering all 4 skills."""
        logger.info("IeltsService.generate_diagnostic: generating diagnostic test")
        t0 = time.perf_counter()

        prompt = """Generate exactly 10 IELTS diagnostic questions. Follow these STRICT rules for each skill:

READING (questions 1, 2, 3): MUST include "passage" field (3-5 sentence paragraph about Canadian life/immigration). Ask a comprehension question about it. type="mcq".

WRITING (questions 4, 5): MUST include "sentence" field with a ___ blank to fill (e.g. "You must submit ___ documents within 60 days."). Test grammar, articles, prepositions, word form. type="gap_fill", also include "instruction": "Choose the correct word to fill in the blank."

LISTENING (questions 6, 7, 8): MUST include "passage" field that is a realistic dialogue or announcement (e.g. a conversation between an immigration officer and applicant, or a phone message about a job). Ask a detail or inference question about it. type="mcq".

VOCABULARY (questions 9, 10): Test word meaning, synonyms, or usage. type="mcq". No passage needed.

ALL questions require: id, skill, type, options (exactly 4 as ["A) text","B) text","C) text","D) text"]), correct_answer (one letter only: "A", "B", "C", or "D"), explanation.

Return JSON with this exact structure:
{
  "questions": [
    {
      "id": 1,
      "skill": "reading",
      "type": "mcq",
      "passage": "Canada uses a points-based system called Express Entry. Candidates are ranked by the Comprehensive Ranking System which considers age, education, language ability, and work experience. Those with the highest scores receive Invitations to Apply for permanent residence.",
      "question": "What does the Comprehensive Ranking System consider?",
      "options": ["A) Age and language only", "B) Age, education, language, and work experience", "C) Financial status and job offer", "D) Education and work experience only"],
      "correct_answer": "B",
      "explanation": "The passage explicitly mentions age, education, language ability, and work experience as the four factors."
    },
    {
      "id": 4,
      "skill": "writing",
      "type": "gap_fill",
      "instruction": "Choose the correct word to fill in the blank.",
      "sentence": "Applicants must provide ___ proof of their language test results.",
      "options": ["A) official", "B) officially", "C) officiate", "D) officious"],
      "correct_answer": "A",
      "explanation": "An adjective is needed to modify the noun 'proof'. 'Official' is the correct adjective form."
    },
    {
      "id": 6,
      "skill": "listening",
      "type": "mcq",
      "passage": "Officer: Good morning, how can I help you today? Applicant: I am here to submit the documents for my permanent residence application. Officer: Do you have your application number ready? Applicant: Yes, it starts with E-0. Officer: Great, please take a seat and we will call you shortly.",
      "question": "Why has the applicant come to the office?",
      "options": ["A) To apply for a work permit", "B) To submit permanent residence documents", "C) To get an application number", "D) To book an appointment"],
      "correct_answer": "B",
      "explanation": "The applicant says 'I am here to submit the documents for my permanent residence application.'"
    }
  ]
}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": prompt}],
            max_tokens=3000,
            response_format={"type": "json_object"},
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"IeltsService.generate_diagnostic: done in {(time.perf_counter()-t0)*1000:.0f}ms  questions={len(result.get('questions', []))}")
        return result

    async def assess_level(self, questions: list, answers: dict) -> dict:
        """Grade diagnostic answers and determine level + personalized study plan."""
        logger.info(f"IeltsService.assess_level: grading {len(answers)} answers")
        t0 = time.perf_counter()

        qa_summary = []
        for q in questions:
            user_ans = answers.get(str(q["id"]), "")
            qa_summary.append({
                "id": q["id"],
                "skill": q["skill"],
                "type": q.get("type"),
                "question": q.get("question") or q.get("sentence", ""),
                "correct_answer": q.get("correct_answer"),
                "user_answer": user_ans,
                "correct": user_ans == q.get("correct_answer")
            })

        prompt = f"""Grade this IELTS diagnostic test and provide a detailed assessment.

Questions and Answers:
{json.dumps(qa_summary, indent=2)}

Based on the results, determine:
1. Overall level: beginner (band 4-5), intermediate (band 5.5-6.5), advanced (band 7+)
2. Per-skill breakdown
3. Personalized 4-week study plan
4. Immediate focus areas

Return JSON:
{{
  "score": 7,
  "total": 10,
  "percentage": 70,
  "overall_level": "intermediate",
  "estimated_band": 6.0,
  "clb_equivalent": 8,
  "crs_impact": "Improving from CLB 8 to CLB 9 in all abilities adds approximately 31 CRS points",
  "skill_scores": {{
    "reading": {{"score": 2, "total": 3, "level": "intermediate", "feedback": "Good comprehension but struggles with inference questions"}},
    "writing": {{"score": 1, "total": 2, "level": "beginner", "feedback": "Grammar gaps in complex sentences"}},
    "listening": {{"score": 3, "total": 3, "level": "advanced", "feedback": "Excellent listening comprehension"}},
    "vocabulary": {{"score": 1, "total": 2, "level": "intermediate", "feedback": "Good basic vocabulary, needs academic/formal words"}}
  }},
  "strengths": ["Listening comprehension", "Reading speed"],
  "weaknesses": ["Grammar accuracy", "Academic vocabulary", "Formal writing style"],
  "study_plan": {{
    "week_1": {{
      "focus": "Grammar Foundations",
      "daily_tasks": ["30 min grammar drills", "10 new vocabulary words", "1 reading passage"],
      "resources": ["Focus on article usage (a/an/the)", "Practice complex sentence structures"]
    }},
    "week_2": {{"focus": "Vocabulary Building", "daily_tasks": ["Word families practice", "Gap-fill exercises", "Collocations"], "resources": ["Academic word list", "IELTS vocabulary lists"]}},
    "week_3": {{"focus": "Reading & Writing", "daily_tasks": ["Timed reading passages", "Short writing tasks", "Paraphrasing practice"], "resources": ["IELTS General Reading passages", "Letter/essay templates"]}},
    "week_4": {{"focus": "Mock Test & Review", "daily_tasks": ["Full timed practice", "Review mistakes", "Final vocabulary review"], "resources": ["IELTS General Training practice tests"]}}
  }},
  "recommended_next": "writing"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": prompt}],
            max_tokens=2000,
            response_format={"type": "json_object"},
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"IeltsService.assess_level: done in {(time.perf_counter()-t0)*1000:.0f}ms  level={result.get('overall_level')}  band={result.get('estimated_band')}")
        return result

    async def generate_practice(self, skill: str, level: str, question_type: str = "mixed") -> dict:
        """Generate 8 practice questions for a specific skill and level."""
        logger.info(f"IeltsService.generate_practice: skill={skill}  level={level}  type={question_type}")
        t0 = time.perf_counter()

        level_instructions = {
            "beginner": "Use simple sentences, common words, everyday topics. Band 4-5 difficulty.",
            "intermediate": "Use moderate complexity, mix of simple and complex sentences. Band 5.5-6.5 difficulty.",
            "advanced": "Use complex structures, academic vocabulary, nuanced meaning. Band 7+ difficulty.",
        }

        skill_specific_rules = {
            "reading": """All 8 questions MUST follow this format:
- Each question has a "passage" field: a 3-6 sentence paragraph about Canadian life, workplace, or immigration.
- Ask a comprehension or inference question about the passage.
- Use type="mcq"
- Example passage: "The Canadian government recently updated its Express Entry system to prioritize candidates with French language skills. This change was part of an effort to support francophone communities outside Quebec. Applicants who demonstrate proficiency in French can now earn additional CRS points."
- Example question: "What was the main reason for the Express Entry update?"
""",
            "writing": """All 8 questions MUST be grammar and sentence correction exercises. Mix these two types equally:
TYPE 1 - gap_fill: include "sentence" field with a ___ blank. Example: "She has been working ___ the company since 2019." with options testing prepositions/grammar.
TYPE 2 - correction mcq: include "sentence" field showing a FULL sentence with an underlined or bracketed error, ask which option correctly replaces the error. Example sentence: "He don't have the required documents." — which option is grammatically correct?
ALWAYS include the "sentence" field. NEVER leave it empty. Test: articles (a/an/the), prepositions (in/on/at/for/since), verb tense, subject-verb agreement, word form (noun/verb/adjective/adverb).
""",
            "listening": """All 8 questions MUST have a "passage" field containing a realistic spoken dialogue or announcement. Write full realistic conversations.
Example passage types:
- Job interview dialogue (3-5 exchanges between interviewer and candidate)
- Phone message about a rental apartment or job opportunity  
- Conversation at a government office about immigration documents
- Workplace announcement about policy changes
- Radio news snippet about Canadian immigration
Each passage should be 4-8 lines long with realistic names and details. Then ask a detail, main idea, or inference question about it.
""",
            "vocabulary": """All 8 questions test English vocabulary. Mix these types:
- Word meaning: "What does 'eligible' mean?"
- Synonym: "Which word is closest in meaning to 'substantial'?"
- Collocation: "Which verb collocates with 'application'? ___ an application"
- Formal vs informal: "Which is more formal: 'get' or 'obtain'?"
- Word family: "Which form is correct: 'eligible', 'eligibly', 'eligibility', 'eligibleness'?"
Focus on words commonly used in Canadian immigration, workplace, and formal correspondence contexts.
"""
        }

        prompt = f"""Generate exactly 8 IELTS {skill.upper()} practice questions for a {level} level student.

Level guideline: {level_instructions.get(level, "")}

STRICT RULES FOR {skill.upper()} QUESTIONS:
{skill_specific_rules.get(skill, "")}

Return JSON with this exact structure — every field is required:
{{
  "skill": "{skill}",
  "level": "{level}",
  "questions": [
    {{
      "id": 1,
      "skill": "{skill}",
      "type": "mcq",
      "passage": "REQUIRED for reading and listening — write the full passage or dialogue here. For writing and vocabulary leave as empty string.",
      "sentence": "REQUIRED for writing gap_fill/correction — write the full sentence with ___ blank or the sentence to correct. For reading/listening/vocabulary leave as empty string.",
      "instruction": "Clear instruction e.g. Choose the correct word to fill in the blank / What does the passage suggest about...",
      "question": "The specific question being asked",
      "options": ["A) First option text", "B) Second option text", "C) Third option text", "D) Fourth option text"],
      "correct_answer": "A",
      "explanation": "Detailed explanation of why A is correct and why the other options are wrong",
      "tip": "IELTS exam tip relevant to this question type"
    }}
  ],
  "vocabulary_spotlight": [
    {{"word": "substantial", "meaning": "Large in size or amount", "example": "The applicant provided substantial evidence of work experience", "synonyms": ["significant", "considerable", "sizeable"]}},
    {{"word": "eligible", "meaning": "Satisfying the conditions required to do or receive something", "example": "You are eligible to apply once you have one year of Canadian work experience", "synonyms": ["qualified", "entitled", "suitable"]}}
  ]
}}

IMPORTANT: For {skill} questions, always populate the correct required fields. Do not leave passage or sentence empty when they are needed for the question to make sense."""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": prompt}],
            max_tokens=3000,
            response_format={"type": "json_object"},
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"IeltsService.generate_practice: done in {(time.perf_counter()-t0)*1000:.0f}ms  questions={len(result.get('questions', []))}")
        return result

    async def grade_practice(self, questions: list, answers: dict, skill: str, level: str) -> dict:
        """Grade practice session and return detailed feedback."""
        logger.info(f"IeltsService.grade_practice: skill={skill}  level={level}  answers={len(answers)}")
        t0 = time.perf_counter()

        graded = []
        correct = 0
        for q in questions:
            user_ans = answers.get(str(q["id"]), "")
            is_correct = user_ans == q.get("correct_answer")
            if is_correct:
                correct += 1
            graded.append({
                "id": q["id"],
                "question": q.get("question") or q.get("sentence", ""),
                "correct_answer": q.get("correct_answer"),
                "user_answer": user_ans,
                "correct": is_correct,
                "explanation": q.get("explanation", "")
            })

        score_pct = (correct / len(questions) * 100) if questions else 0

        prompt = f"""Grade this IELTS {skill} practice session and give detailed feedback.

Level: {level}
Score: {correct}/{len(questions)} ({score_pct:.0f}%)
Results: {json.dumps(graded, indent=2)}

Return JSON:
{{
  "score": {correct},
  "total": {len(questions)},
  "percentage": {score_pct:.0f},
  "band_estimate": 6.5,
  "performance": "good",
  "overall_feedback": "Overall feedback paragraph...",
  "question_feedback": [
    {{"id": 1, "correct": true, "feedback": "Well done! You correctly identified..."}},
    {{"id": 2, "correct": false, "feedback": "The correct answer is B because... You chose C which is incorrect because..."}}
  ],
  "patterns": ["You struggle with prepositions", "Strong on vocabulary inference"],
  "improvement_tips": [
    "Practice 10 new collocations daily",
    "Read Canadian news articles for 15 minutes each day"
  ],
  "next_level_ready": false,
  "motivational_message": "You're making great progress! Focus on..."
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": prompt}],
            max_tokens=2000,
            response_format={"type": "json_object"},
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"IeltsService.grade_practice: done in {(time.perf_counter()-t0)*1000:.0f}ms  score={correct}/{len(questions)}")
        return result

    async def generate_mock_test(self, skill: str, level: str) -> dict:
        """Generate a full IELTS mock test — 40 questions, 60 min, 4 sections with per-section time limits."""
        logger.info(f"IeltsService.generate_mock_test: skill={skill}  level={level}")
        t0 = time.perf_counter()

        # Real IELTS structure: 40 questions, 60 minutes, 4 sections
        MOCK_CONFIG = {
            "reading": {
                "total_questions": 40,
                "total_minutes": 60,
                "instructions": "Read each passage carefully. Answer all questions based ONLY on the information in the passage. Do not use outside knowledge.",
                "sections": [
                    {"id": "S1", "label": "Section 1", "minutes": 13, "questions": 10,
                     "rules": "Simple passage (200-250 words) — everyday Canadian topic (job ad, apartment notice, community announcement, store flyer). Questions 1-10. Mix of MCQ and True/False/Not Given (use MCQ for all). Questions test explicit facts."},
                    {"id": "S2", "label": "Section 2", "minutes": 15, "questions": 10,
                     "rules": "Workplace passage (250-300 words) — e.g. employee handbook, workplace policy, company newsletter, IRCC guide excerpt. Questions 11-20. Mix explicit and implicit comprehension."},
                    {"id": "S3", "label": "Section 3", "minutes": 17, "questions": 10,
                     "rules": "Longer analytical passage (300-350 words) — Canadian immigration policy, settlement services, government program. Questions 21-30. Inference and main idea questions included."},
                    {"id": "S4", "label": "Section 4", "minutes": 15, "questions": 10,
                     "rules": "Academic-style passage (300-380 words) — complex topic: Canadian history, economic immigration trends, multicultural policy. Questions 31-40. Harder vocabulary and inference required."},
                ]
            },
            "writing": {
                "total_questions": 40,
                "total_minutes": 60,
                "instructions": "Choose the best option to complete or correct each sentence. Focus on grammatical accuracy.",
                "sections": [
                    {"id": "S1", "label": "Section 1: Articles & Prepositions", "minutes": 12, "questions": 10,
                     "rules": "Questions 1-10. All gap_fill. Test: articles (a/an/the/zero), prepositions (in/on/at/for/since/by/with/of). Sentence field required with ___ blank."},
                    {"id": "S2", "label": "Section 2: Verb Tense & Form", "minutes": 15, "questions": 10,
                     "rules": "Questions 11-20. Mix: 5 gap_fill (verb tense: simple past, present perfect, conditional), 5 error correction (verb agreement/tense error in [brackets]). Sentence field required."},
                    {"id": "S3", "label": "Section 3: Word Form & Vocabulary", "minutes": 15, "questions": 10,
                     "rules": "Questions 21-30. Mix: 5 gap_fill (noun/verb/adjective/adverb word form), 5 MCQ (choose formal register word for a given context). Sentence field required for gap_fill."},
                    {"id": "S4", "label": "Section 4: Sentence Structure", "minutes": 18, "questions": 10,
                     "rules": "Questions 31-40. Mix: 5 sentence transformation (choose the option that means the same as original — same meaning, different structure), 5 error correction (complex grammar errors). Sentence field showing original required."},
                ]
            },
            "listening": {
                "total_questions": 40,
                "total_minutes": 60,
                "instructions": "Read each transcript carefully as if you heard it spoken aloud. Answer based ONLY on what is said in the transcript.",
                "sections": [
                    {"id": "S1", "label": "Section 1", "minutes": 13, "questions": 10,
                     "rules": "Questions 1-10. Two short conversations (5 questions each). Everyday social contexts: booking appointment, asking directions, calling a service. 10-14 lines each. Include speaker labels (Person A:, Person B:). Questions test explicit facts and details."},
                    {"id": "S2", "label": "Section 2", "minutes": 15, "questions": 10,
                     "rules": "Questions 11-20. One monologue or announcement (20-25 lines). E.g. recorded voicemail about a job, radio announcement about immigration changes, automated phone service, orientation talk. Test sequence, facts, purpose."},
                    {"id": "S3", "label": "Section 3", "minutes": 17, "questions": 10,
                     "rules": "Questions 21-30. One workplace or educational conversation (3 speakers, 25-30 lines). E.g. team meeting, job interview panel, college orientation. Test opinions, agreements, inference, speaker attitudes."},
                    {"id": "S4", "label": "Section 4", "minutes": 15, "questions": 10,
                     "rules": "Questions 31-40. One complex academic or formal monologue (25-30 lines). E.g. lecture on Canadian immigration history, formal presentation on settlement policy, documentary-style narration. Test inference, main ideas, implied meaning."},
                ]
            }
        }

        config = MOCK_CONFIG.get(skill, MOCK_CONFIG["reading"])
        level_instructions = {
            "beginner":     "Band 4-5 difficulty. Simple vocabulary, short sentences, clear explicit answers.",
            "intermediate": "Band 5.5-6.5 difficulty. Moderate complexity, some inference required.",
            "advanced":     "Band 7+ difficulty. Complex language, nuanced inference, academic vocabulary.",
        }

        # Generate sections in two API calls to avoid token limits (20 questions each)
        all_questions = []
        sections = config["sections"]
        q_offset = 0

        for sec in sections:
            sec_prompt = f"""Generate exactly {sec['questions']} IELTS {skill.upper()} questions for {sec['label']}.

SECTION RULES: {sec['rules']}
Level: {level_instructions.get(level, "")}
Use Canadian/immigration/workplace contexts. Question IDs start at {q_offset + 1}.

Return JSON:
{{
  "section_id": "{sec['id']}",
  "section_label": "{sec['label']}",
  "time_minutes": {sec['minutes']},
  "questions": [
    {{
      "id": {q_offset + 1},
      "skill": "{skill}",
      "section_id": "{sec['id']}",
      "section_label": "{sec['label']}",
      "type": "mcq",
      "passage_group": "{sec['label']}: [descriptive title]",
      "passage": "REQUIRED for reading/listening — full passage or transcript text here. For all questions in the same passage group, use the SAME passage text.",
      "sentence": "REQUIRED for writing — full sentence with ___ blank or [error in brackets]. Empty string for reading/listening.",
      "instruction": "Clear instruction for this question",
      "question": "The specific question",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "B",
      "explanation": "Detailed explanation referencing the passage or sentence",
      "tip": "IELTS exam tip for this question type"
    }}
  ]
}}

CRITICAL RULES:
- Generate EXACTLY {sec['questions']} questions, IDs from {q_offset + 1} to {q_offset + sec['questions']}
- Reading/listening: every question MUST have a non-empty "passage" field — questions sharing a passage use identical passage text
- Writing: every question MUST have a non-empty "sentence" field
- All options must be "A) text", "B) text", "C) text", "D) text"
- correct_answer is a single letter: A, B, C, or D"""

            resp = await self._get_client().chat.completions.create(
                model=settings.AZURE_OPENAI_DEPLOYMENT,
                messages=[{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": sec_prompt}],
                max_tokens=4000,
                response_format={"type": "json_object"},
                timeout=60
            )
            sec_result = json.loads(resp.choices[0].message.content)
            sec_questions = sec_result.get("questions", [])
            all_questions.extend(sec_questions)
            q_offset += sec['questions']
            logger.info(f"IeltsService.generate_mock_test: section={sec['id']} generated {len(sec_questions)} questions")

        result = {
            "skill": skill,
            "level": level,
            "total_questions": config["total_questions"],
            "total_minutes": config["total_minutes"],
            "instructions": config["instructions"],
            "sections": [{"id": s["id"], "label": s["label"], "minutes": s["minutes"], "questions": s["questions"],
                          "start_q": sum(ss["questions"] for ss in config["sections"][:i]) + 1,
                          "end_q":   sum(ss["questions"] for ss in config["sections"][:i+1])}
                         for i, s in enumerate(config["sections"])],
            "questions": all_questions,
        }
        logger.info(f"IeltsService.generate_mock_test: done in {(time.perf_counter()-t0)*1000:.0f}ms  total_questions={len(all_questions)}")
        return result

    async def grade_mock_test(self, questions: list, answers: dict, skill: str, level: str) -> dict:
        """Grade mock test and return full IELTS-style report."""
        logger.info(f"IeltsService.grade_mock_test: skill={skill}  level={level}  answers={len(answers)}")
        t0 = time.perf_counter()

        graded = []
        correct = 0
        skill_breakdown = {}

        for q in questions:
            qid = str(q.get("id", ""))
            user_ans = answers.get(qid, "")
            is_correct = user_ans == q.get("correct_answer")
            if is_correct:
                correct += 1
            q_skill = q.get("skill", skill)
            skill_breakdown.setdefault(q_skill, {"correct": 0, "total": 0})
            skill_breakdown[q_skill]["total"] += 1
            if is_correct:
                skill_breakdown[q_skill]["correct"] += 1
            graded.append({
                "id": q.get("id"),
                "skill": q_skill,
                "correct": is_correct,
                "user_answer": user_ans,
                "correct_answer": q.get("correct_answer"),
            })

        score_pct = (correct / len(questions) * 100) if questions else 0

        # Band estimation formula
        band = round(4.0 + (score_pct / 100) * 5.0, 1)
        band = min(9.0, max(4.0, band))

        prompt = f"""You are an IELTS examiner. Generate a professional IELTS {skill} mock test report.

Score: {correct}/{len(questions)} ({score_pct:.0f}%)
Estimated Band: {band}
Level: {level}
Results per question: {json.dumps(graded[:10], indent=2)}... (showing first 10)

Return JSON:
{{
  "score": {correct},
  "total": {len(questions)},
  "percentage": {score_pct:.0f},
  "band_score": {band},
  "grade": "Pass" if {score_pct} >= 60 else "Needs Improvement",
  "clb_equivalent": 8,
  "crs_impact": "Achieving CLB 9 in {skill} would add approximately X points to your CRS score",
  "performance_label": "Excellent / Good / Fair / Needs Work",
  "summary": "2-3 sentence professional summary of performance",
  "strengths": ["Specific strength observed", "Another strength"],
  "areas_for_improvement": ["Specific weakness", "Another area"],
  "detailed_feedback": {{
    "accuracy": "Feedback on answer accuracy",
    "patterns": "Common error patterns noticed",
    "time_management": "Tips for managing {skill} time in the real exam"
  }},
  "next_steps": [
    "Specific actionable step 1",
    "Specific actionable step 2",
    "Specific actionable step 3"
  ],
  "target_band": {min(band + 0.5, 9.0)},
  "weeks_to_target": 4
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": prompt}],
            max_tokens=2000,
            response_format={"type": "json_object"},
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        result["score"] = correct
        result["total"] = len(questions)
        result["percentage"] = round(score_pct)
        result["band_score"] = band
        result["skill_breakdown"] = skill_breakdown
        logger.info(f"IeltsService.grade_mock_test: done in {(time.perf_counter()-t0)*1000:.0f}ms  score={correct}/{len(questions)}  band={band}")
        return result


# ═══════════════════════════════════════════════════════════════
# Score Simulator Service
# ═══════════════════════════════════════════════════════════════
class ScoreSimulatorService:
    """
    Calculates CRS impact of hypothetical profile changes without
    modifying the real profile. Returns point deltas per change.
    """

    def simulate(self, base_profile: dict, changes: dict) -> dict:
        """
        base_profile: dict with current profile fields
        changes: dict of fields to hypothetically change
        Returns breakdown of point gains/losses per change.
        """
        import copy
        results = []
        base_crs = base_profile.get("crs_score", 0)

        # Language improvement simulation
        lang_points = {
            "clb_7": {"reading": 6, "writing": 6, "listening": 6, "speaking": 6},
            "clb_8": {"reading": 8, "writing": 8, "listening": 8, "speaking": 8},
            "clb_9": {"reading": 16, "writing": 16, "listening": 16, "speaking": 16},
            "clb_10": {"reading": 20, "writing": 20, "listening": 20, "speaking": 20},
        }

        # Education upgrade points (approximate CRS gains)
        edu_upgrades = {
            "secondary":               0,
            "one_year_post_secondary": 28,
            "two_year_post_secondary": 84,
            "bachelors":               112,
            "masters":                 135,
            "doctoral":                150,
        }

        current_edu = base_profile.get("education_level", "bachelors")
        current_edu_pts = edu_upgrades.get(current_edu, 112)

        for change_key, change_val in changes.items():
            delta = 0
            label = ""
            explanation = ""

            if change_key == "ielts_band" or change_key == "ielts_band_9":
                current_band = base_profile.get("ielts_band")
                if current_band is None:
                    # No test yet — show full gain from having this band
                    band_val = float(change_val)
                    delta = int(band_val * 16) if band_val >= 8 else int(band_val * 8)
                    label = f"Achieve IELTS avg {change_val} (no test yet)"
                    explanation = f"Adding IELTS with avg band {change_val} would add approximately {delta} CRS points."
                else:
                    band_diff = float(change_val) - float(current_band)
                    if band_diff <= 0:
                        continue
                    delta = int(band_diff * 16)
                    label = f"IELTS {current_band} → {change_val}"
                    explanation = f"Improving all 4 IELTS skills from {current_band} to {change_val} adds approximately {delta} CRS points."

            elif change_key == "canadian_work_years":
                current_yrs = base_profile.get("canadian_work_years", 0)
                new_yrs = float(change_val)
                # CRS points: 0yr=0, 1yr=40, 2yr=53, 3yr=64, 4yr=72, 5yr=80
                work_pts = {0: 0, 1: 40, 2: 53, 3: 64, 4: 72, 5: 80}
                current_pts = work_pts.get(min(int(current_yrs), 5), 0)
                new_pts = work_pts.get(min(int(new_yrs), 5), 80)
                delta = new_pts - current_pts
                label = f"Canadian work: {current_yrs}yr → {new_yrs}yr"
                explanation = f"Adding {new_yrs - current_yrs:.1f} year(s) of Canadian work experience adds {delta} CRS points."

            elif change_key == "education_level":
                new_edu_pts = edu_upgrades.get(change_val, 112)
                delta = new_edu_pts - current_edu_pts
                label = f"Education upgrade to {change_val.replace('_', ' ').title()}"
                explanation = f"Upgrading your education credential adds {delta} CRS points."

            elif change_key == "job_offer":
                if change_val == "noc_00":
                    delta = 200
                    label = "LMIA job offer (NOC 00)"
                    explanation = "A valid LMIA-exempt or LMIA job offer for a NOC 00 occupation adds 200 CRS points."
                elif change_val == "other":
                    delta = 50
                    label = "LMIA job offer (other NOC)"
                    explanation = "A valid LMIA-exempt or LMIA job offer adds 50 CRS points."

            elif change_key == "provincial_nomination":
                delta = 600
                label = "Provincial Nomination (PNP)"
                explanation = "A provincial nomination adds 600 CRS points — virtually guaranteeing an ITA in the next general draw."

            elif change_key == "french_clb7":
                has_english = base_profile.get("has_english_clb4", False)
                if has_english:
                    delta = 50
                    label = "French CLB 7 + English CLB 4"
                    explanation = "Meeting French CLB 7 with English CLB 4 adds 50 CRS points for bilingualism."
                else:
                    delta = 25
                    label = "French CLB 7"
                    explanation = "Meeting French CLB 7 adds 25 CRS points."

            elif change_key == "canadian_education":
                edu_level = change_val  # "one_or_two_year" | "degree_or_higher"
                if edu_level == "degree_or_higher":
                    delta = 30
                    label = "Canadian degree or higher"
                    explanation = "Completing a Canadian Bachelor's, Master's or PhD adds 30 CRS points."
                else:
                    delta = 15
                    label = "Canadian 1-2 year credential"
                    explanation = "Completing a 1 or 2-year Canadian post-secondary program adds 15 CRS points."

            elif change_key == "sibling_in_canada":
                delta = 15
                label = "Sibling who is Canadian PR/citizen"
                explanation = "Having a sibling (or your spouse's sibling) who is a Canadian citizen or PR adds 15 CRS points."

            elif change_key == "spouse_language":
                # Spouse CLB 5-9 adds 10-20 pts
                clb = int(change_val)
                current_spouse_clb = base_profile.get("spouse_clb") or 0
                if clb <= current_spouse_clb:
                    continue
                if clb >= 9:
                    new_pts = 20
                elif clb >= 7:
                    new_pts = 16
                elif clb >= 5:
                    new_pts = 10
                else:
                    new_pts = 0
                if current_spouse_clb >= 9:
                    cur_pts = 20
                elif current_spouse_clb >= 7:
                    cur_pts = 16
                elif current_spouse_clb >= 5:
                    cur_pts = 10
                else:
                    cur_pts = 0
                delta = new_pts - cur_pts
                label = f"Spouse language CLB {clb}"
                explanation = f"Spouse achieving CLB {clb} in all abilities adds {delta} CRS points."

            elif change_key == "age":
                # CRS age points (single): 18=99,19=105,20-29=110,30=105,31=99,32=94,33=88,34=83,35=77,36=72,37=66,38=61,39=55,40=50,41=39,42=28,43=17,44=6,45+=0
                age_pts = {18:99,19:105,20:110,21:110,22:110,23:110,24:110,25:110,26:110,27:110,28:110,29:110,30:105,31:99,32:94,33:88,34:83,35:77,36:72,37:66,38:61,39:55,40:50,41:39,42:28,43:17,44:6}
                current_age = base_profile.get("age") or 30
                new_age = int(change_val)
                cur_pts = age_pts.get(min(current_age, 44), 0)
                new_pts = age_pts.get(min(new_age, 44), 0)
                delta = new_pts - cur_pts
                label = f"Age {current_age} → {new_age}"
                explanation = f"Being age {new_age} instead of {current_age} would change your age points by {delta}. Age points are fixed — this shows the impact for planning purposes."

            elif change_key == "foreign_work_years":
                # Foreign work CRS points: 0=0, 1yr=13, 2-3yr=25, 3+=25 (with Canadian exp bonus differs)
                foreign_pts = {0: 0, 1: 13, 2: 25, 3: 25}
                current_foreign = int(base_profile.get("foreign_work_years", 0) or 0)
                new_foreign = int(change_val)
                if new_foreign <= current_foreign:
                    continue
                cur_pts = foreign_pts.get(min(current_foreign, 3), 0)
                new_pts = foreign_pts.get(min(new_foreign, 3), 25)
                delta = new_pts - cur_pts
                label = f"Foreign work: {current_foreign}yr → {new_foreign}yr"
                explanation = f"Adding {new_foreign - current_foreign} year(s) of foreign work experience adds {delta} CRS points."

            elif change_key == "education_upgrade":
                edu_pts = {
                    "secondary": 0,
                    "one_year_post_secondary": 28,
                    "two_year_post_secondary": 84,
                    "bachelors": 112,
                    "two_or_more_degrees": 119,
                    "masters": 135,
                    "doctoral": 150,
                }
                current_edu = base_profile.get("education_level", "bachelors")
                new_edu = change_val
                cur_pts = edu_pts.get(current_edu, 112)
                new_pts = edu_pts.get(new_edu, 112)
                delta = new_pts - cur_pts
                if delta <= 0:
                    continue
                label = f"Education → {new_edu.replace('_', ' ').title()}"
                explanation = f"Upgrading from {current_edu.replace('_', ' ')} to {new_edu.replace('_', ' ')} adds {delta} CRS points."

            if delta != 0:
                results.append({
                    "change_key": change_key,
                    "label": label,
                    "delta": delta,
                    "new_score": base_crs + delta,
                    "explanation": explanation,
                    "effort": "Low" if delta <= 15 else "Medium" if delta <= 50 else "High",
                    "timeframe": self._estimate_timeframe(change_key),
                })

        results.sort(key=lambda x: -x["delta"])
        total_delta = sum(r["delta"] for r in results)
        return {
            "base_crs": base_crs,
            "projected_crs": base_crs + total_delta,
            "total_gain": total_delta,
            "changes": results,
        }

    def _estimate_timeframe(self, change_key: str) -> str:
        timeframes = {
            "ielts_band":          "1-3 months",
            "ielts_band_9":        "3-6 months",
            "canadian_work_years": "1-5 years",
            "foreign_work_years":  "1-3 years",
            "education_level":     "1-4 years",
            "education_upgrade":   "1-4 years",
            "job_offer":           "Varies",
            "provincial_nomination": "3-18 months",
            "french_clb7":         "6-12 months",
            "canadian_education":  "1-4 years",
            "sibling_in_canada":   "N/A",
            "spouse_language":     "1-3 months",
            "age":                 "N/A (planning)",
        }
        return timeframes.get(change_key, "Varies")

    def get_all_scenarios(self, base_profile: dict) -> dict:
        """Return all possible improvement scenarios ranked by CRS gain."""
        current_band      = base_profile.get("ielts_band")
        current_cdn_work  = base_profile.get("canadian_work_years", 0) or 0
        current_for_work  = base_profile.get("foreign_work_years", 0) or 0
        current_edu       = base_profile.get("education_level", "bachelors")
        current_age       = base_profile.get("age") or 30

        edu_ladder = ["secondary","one_year_post_secondary","two_year_post_secondary",
                      "bachelors","two_or_more_degrees","masters","doctoral"]

        all_changes = {}

        # IELTS — only bands above current
        if current_band is None:
            all_changes["ielts_band"]   = 8.0
            all_changes["ielts_band_9"] = 9.0
        else:
            if current_band < 8.0:
                all_changes["ielts_band"]   = 8.0
            if current_band < 9.0:
                all_changes["ielts_band_9"] = 9.0

        # Canadian work — next milestone
        all_changes["canadian_work_years"] = min(current_cdn_work + 1, 5)

        # Foreign work — next milestone if under 3 years
        if current_for_work < 3:
            all_changes["foreign_work_years"] = min(current_for_work + 1, 3)

        # Education — next level up
        try:
            edu_idx = edu_ladder.index(current_edu)
            if edu_idx < len(edu_ladder) - 1:
                all_changes["education_upgrade"] = edu_ladder[edu_idx + 1]
            if edu_idx < len(edu_ladder) - 2:  # also show masters if not there yet
                all_changes["education_upgrade_masters"] = "masters"
        except ValueError:
            all_changes["education_upgrade"] = "masters"

        # Other
        all_changes["job_offer"]             = "other"
        all_changes["provincial_nomination"] = True
        all_changes["french_clb7"]           = True
        all_changes["canadian_education"]    = "one_or_two_year"

        # Spouse language — if married
        if base_profile.get("has_spouse"):
            spouse_clb = base_profile.get("spouse_clb") or 0
            if spouse_clb < 9:
                all_changes["spouse_language"] = 9

        # Age — show next younger bracket if under 30 (for planning awareness)
        if current_age > 25:
            all_changes["age"] = max(current_age - 5, 20)

        changes = {k: v for k, v in all_changes.items() if v is not None}
        return self.simulate(base_profile, changes)


# ═══════════════════════════════════════════════════════════════
# PNP Matcher Service
# ═══════════════════════════════════════════════════════════════
class PNPMatcherService:

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def match_streams(self, profile: dict) -> dict:
        t0 = time.perf_counter()
        prompt = f"""You are a Canadian immigration expert specializing in Provincial Nominee Programs (PNP).

Applicant Profile:
- NOC Code: {profile.get('noc_code', 'unknown')}
- TEER Level: {profile.get('teer_level', 'unknown')}
- Education: {profile.get('education_level', 'unknown')}
- Canadian Work Experience: {profile.get('canadian_work_years', 0)} years
- Foreign Work Experience: {profile.get('foreign_work_years', 0)} years
- Language CLB: {profile.get('language_clb', 7)}
- CRS Score: {profile.get('crs_score', 0)}
- Province Preference: {profile.get('province_preference', 'Any')}
- Has Job Offer: {profile.get('has_job_offer', False)}
- Nationality: {profile.get('nationality', 'unknown')}

{'IMPORTANT: The applicant has selected "' + profile.get('province_preference', 'Any') + '" as their province preference. Return ONLY streams from ' + profile.get('province_preference') + '. Do NOT include streams from any other province.' if profile.get('province_preference', 'Any') != 'Any' else 'The applicant has no province preference. Analyze streams across all Canadian provinces: Ontario (OINP), BC (BC PNP), Alberta (AINP), Saskatchewan (SINP), Manitoba (MPNP), Nova Scotia (NSNP), New Brunswick (NBPNP), Prince Edward Island (PEI PNP), Newfoundland (NLPNP).'}

Analyze which PNP streams this applicant is most likely eligible for.
Province mapping: Ontario=OINP, British Columbia=BC PNP, Alberta=AINP, Saskatchewan=SINP, Manitoba=MPNP, Nova Scotia=NSNP, New Brunswick=NBPNP, Prince Edward Island=PEI PNP, Newfoundland=NLPNP.

Return JSON:
{{
  "top_matches": [
    {{
      "province": "Province name",
      "province_code": "ON|BC|AB|SK|MB|NS|NB|PE|NL",
      "stream_name": "Exact stream name",
      "program_code": "e.g. OINP-HCP",
      "match_score": 85,
      "eligibility_status": "likely_eligible|possibly_eligible|missing_requirements",
      "crs_required": false,
      "min_clb": 7,
      "key_requirements_met": ["requirement 1", "requirement 2"],
      "missing_requirements": ["missing item if any"],
      "advantages": "Why this stream suits this applicant specifically",
      "processing_time": "6-12 months",
      "nomination_benefit": "Adds 600 CRS points",
      "application_link": "https://province.ca/pnp"
    }}
  ],
  "summary": "2-3 sentence summary of best PNP strategy for this applicant",
  "recommended_action": "Most important next step",
  "total_streams_analyzed": 45
}}

Return the top 6 best matching streams. Be realistic about eligibility."""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a Canadian immigration PNP expert. Always return valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2500,
            response_format={"type": "json_object"},
            timeout=45
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"PNPMatcherService.match_streams: done in {(time.perf_counter()-t0)*1000:.0f}ms  matches={len(result.get('top_matches', []))}")
        return result


# ═══════════════════════════════════════════════════════════════
# Draw Frequency Predictor Service
# ═══════════════════════════════════════════════════════════════
class DrawFrequencyPredictorService:

    def predict(self, draws: list, draw_type: str = None) -> dict:
        """
        Analyze historical draws to predict next draw date and CRS range.
        draws: list of DrawDB-like dicts with draw_date, minimum_crs, draw_type, invitations_issued
        """
        from datetime import date, timedelta
        import statistics

        # Filter by type if specified
        filtered = [d for d in draws if not draw_type or d.get("draw_type", "").upper() == draw_type.upper()]

        if len(filtered) < 2:
            return {"error": "Not enough draw history for this type", "draws_analyzed": len(filtered)}

        # Sort by date descending
        filtered.sort(key=lambda x: x["draw_date"], reverse=True)

        # Calculate intervals between draws
        dates = []
        for d in filtered:
            dd = d["draw_date"]
            if hasattr(dd, "date"):
                dd = dd.date()
            elif isinstance(dd, str):
                from datetime import datetime
                dd = datetime.fromisoformat(dd).date()
            dates.append(dd)

        intervals = [(dates[i] - dates[i+1]).days for i in range(len(dates)-1)]
        avg_interval = statistics.mean(intervals) if intervals else 14
        std_interval = statistics.stdev(intervals) if len(intervals) > 1 else 3

        # Predict next draw date
        last_draw_date = dates[0]
        predicted_next = last_draw_date + timedelta(days=int(avg_interval))
        earliest_next  = last_draw_date + timedelta(days=max(1, int(avg_interval - std_interval)))
        latest_next    = last_draw_date + timedelta(days=int(avg_interval + std_interval))

        # CRS trend analysis
        crs_scores = [d["minimum_crs"] for d in filtered[:10] if d.get("minimum_crs")]
        avg_crs = statistics.mean(crs_scores) if crs_scores else 0
        crs_trend = "rising" if len(crs_scores) >= 2 and crs_scores[0] > crs_scores[1] else \
                    "falling" if len(crs_scores) >= 2 and crs_scores[0] < crs_scores[1] else "stable"

        # Predicted CRS range (last 5 draws ± std dev)
        recent_crs = crs_scores[:5]
        if recent_crs:
            std_crs = statistics.stdev(recent_crs) if len(recent_crs) > 1 else 5
            predicted_crs_low  = int(min(recent_crs) - std_crs)
            predicted_crs_high = int(max(recent_crs) + std_crs)
            predicted_crs_mid  = int(statistics.mean(recent_crs))
        else:
            predicted_crs_low = predicted_crs_mid = predicted_crs_high = 0

        # Invitations trend
        invites = [d["invitations_issued"] for d in filtered[:10] if d.get("invitations_issued")]
        avg_invites = int(statistics.mean(invites)) if invites else 0

        # Confidence score (based on consistency of intervals)
        cv = (std_interval / avg_interval) if avg_interval > 0 else 1
        confidence = max(30, min(95, int(100 - (cv * 50))))

        today = date.today()
        days_until = (predicted_next - today).days

        return {
            "draw_type": draw_type or "all",
            "draws_analyzed": len(filtered),
            "last_draw_date": dates[0].isoformat(),
            "avg_interval_days": round(avg_interval, 1),
            "predicted_next_date": predicted_next.isoformat(),
            "predicted_window": {
                "earliest": earliest_next.isoformat(),
                "latest": latest_next.isoformat(),
            },
            "days_until_next": days_until,
            "predicted_crs_range": {
                "low": predicted_crs_low,
                "mid": predicted_crs_mid,
                "high": predicted_crs_high,
            },
            "crs_trend": crs_trend,
            "avg_invitations": avg_invites,
            "confidence_pct": confidence,
            "recent_crs_scores": crs_scores[:5],
        }


# ═══════════════════════════════════════════════════════════════
# Study Plan Generator Service
# ═══════════════════════════════════════════════════════════════
class StudyPlanService:

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate_plan(self, profile: dict, target_crs: int, timeline_months: int = 6) -> dict:
        t0 = time.perf_counter()

        current_crs = profile.get("crs_score", 0)
        gap = target_crs - current_crs

        prompt = f"""You are a Canadian immigration consultant creating a personalized CRS improvement plan.

Current Profile:
- CRS Score: {current_crs}
- Target CRS: {target_crs} (gap: {gap} points)
- Timeline: {timeline_months} months
- IELTS Scores: {profile.get('ielts_scores', 'unknown')}
- Education: {profile.get('education_level', 'unknown')}
- Canadian Work Experience: {profile.get('canadian_work_years', 0)} years
- Foreign Work Experience: {profile.get('foreign_work_years', 0)} years
- Has Spouse: {profile.get('has_spouse', False)}
- Spouse CLB: {profile.get('spouse_clb', 'N/A')}
- NOC Code: {profile.get('noc_code', 'unknown')}
- Province Preference: {profile.get('province_preference', 'Any')}
- Eligible Programs: {profile.get('eligible_programs', [])}

Create a detailed, actionable {timeline_months}-month study and improvement plan to gain {gap} CRS points.
Prioritize actions by ROI (most CRS points per effort).

Return JSON:
{{
  "current_crs": {current_crs},
  "target_crs": {target_crs},
  "gap": {gap},
  "timeline_months": {timeline_months},
  "feasibility": "highly_feasible|feasible|challenging|very_challenging",
  "feasibility_reason": "Why this is or isn't achievable in the timeline",
  "priority_actions": [
    {{
      "rank": 1,
      "action": "Action title",
      "category": "language|work|education|pnp|job_offer|other",
      "crs_gain": 30,
      "effort": "low|medium|high",
      "timeframe": "1-2 months",
      "cost_estimate": "$200-500 CAD",
      "specific_steps": ["Step 1", "Step 2", "Step 3"],
      "resources": ["Resource or link"],
      "why_this_first": "Why this is ranked #1"
    }}
  ],
  "monthly_milestones": [
    {{
      "month": 1,
      "focus": "Main focus area",
      "expected_crs_gain": 0,
      "tasks": ["Task 1", "Task 2"]
    }}
  ],
  "quick_wins": ["Things that can be done immediately with minimal effort"],
  "risks": ["Risk 1", "Risk 2"],
  "alternative_strategy": "If main plan doesn't work, what's the backup?",
  "motivational_message": "Personalized encouraging message"
}}

Include exactly {min(timeline_months, 6)} monthly milestones. Be specific and realistic."""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a Canadian immigration consultant. Return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=3000,
            response_format={"type": "json_object"},
            timeout=45
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"StudyPlanService.generate_plan: done in {(time.perf_counter()-t0)*1000:.0f}ms  gap={gap}  timeline={timeline_months}mo")
        return result


# ═══════════════════════════════════════════════════════════════
# AI Letter Writer Service
# ═══════════════════════════════════════════════════════════════
class LetterWriterService:

    LETTER_TYPES = {
        "employment_gap": "Letter of Explanation — Employment Gap",
        "address_history": "Letter of Explanation — Address/Travel History",
        "name_change": "Letter of Explanation — Name Change/Discrepancy",
        "criminal_record": "Letter of Explanation — Criminal Record/Arrest",
        "relationship_proof": "Relationship Proof Letter (Spouse/Common-Law)",
        "funds_source": "Letter of Explanation — Source of Funds",
    }

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate_letter(self, letter_type: str, applicant_info: dict, context: dict) -> dict:
        t0 = time.perf_counter()
        letter_title = self.LETTER_TYPES.get(letter_type, "Letter of Explanation")

        type_instructions = {
            "employment_gap": f"""
Gap period: {context.get('gap_start')} to {context.get('gap_end')}
Reason for gap: {context.get('reason')}
Activities during gap: {context.get('activities', 'Not specified')}
Supporting documents available: {context.get('supporting_docs', 'None mentioned')}""",

            "address_history": f"""
Countries lived in: {context.get('countries', 'Not specified')}
Travel history gaps: {context.get('gaps', 'None')}
Reason for extensive travel: {context.get('reason', 'Not specified')}""",

            "name_change": f"""
Previous name: {context.get('previous_name')}
Current name: {context.get('current_name')}
Reason for change: {context.get('reason')}
Documents with old name: {context.get('old_name_docs', 'Not specified')}""",

            "criminal_record": f"""
Nature of incident: {context.get('nature')}
Date of incident: {context.get('date')}
Outcome/Resolution: {context.get('outcome')}
Rehabilitation evidence: {context.get('rehabilitation', 'Not specified')}""",

            "relationship_proof": f"""
Relationship type: {context.get('relationship_type', 'Married')}
Duration of relationship: {context.get('duration')}
How you met: {context.get('how_met')}
Evidence of cohabitation: {context.get('cohabitation_evidence')}
Joint financial evidence: {context.get('financial_evidence')}""",

            "funds_source": f"""
Amount to declare: {context.get('amount')}
Source of funds: {context.get('source')}
How funds were accumulated: {context.get('how_accumulated')}
Supporting documents: {context.get('supporting_docs')}""",
        }

        context_text = type_instructions.get(letter_type, str(context))

        prompt = f"""You are a Canadian immigration lawyer writing an official {letter_title} for an Express Entry application.

Applicant Information:
- Full Name: {applicant_info.get('full_name', '[Applicant Name]')}
- Date of Birth: {applicant_info.get('date_of_birth', '[DOB]')}
- Nationality: {applicant_info.get('nationality', '[Nationality]')}
- Application Type: Express Entry / Permanent Residence

Specific Context:
{context_text}

Write a professional, formal letter that:
1. Follows IRCC letter of explanation best practices
2. Is clear, honest, and factual
3. Addresses the specific concern directly
4. Includes all relevant details
5. Ends with a declaration of truth
6. Uses formal Canadian English

Return JSON:
{{
  "letter_type": "{letter_type}",
  "letter_title": "{letter_title}",
  "letter_body": "Full letter text with proper formatting using \\n for line breaks",
  "word_count": 250,
  "key_points_covered": ["Point 1", "Point 2"],
  "documents_to_attach": ["Document 1", "Document 2"],
  "ircc_tips": ["Tip for submitting this letter", "Another tip"],
  "warnings": ["Any red flags or things to be careful about"]
}}

The letter should be 200-400 words, professional, and submission-ready."""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a Canadian immigration lawyer. Write formal, IRCC-ready letters. Return valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            response_format={"type": "json_object"},
            timeout=45
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"LetterWriterService.generate_letter: done in {(time.perf_counter()-t0)*1000:.0f}ms  type={letter_type}")
        return result


# ═══════════════════════════════════════════════════════════════
# Peer Comparison Service
# ═══════════════════════════════════════════════════════════════
class PeerComparisonService:
    """
    Compares applicant profile against aggregated anonymized data
    from other applicants in the same system.
    Falls back to AI-generated benchmarks if insufficient local data.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    def compare_local(self, profile: dict, all_profiles: list) -> dict | None:
        """Compare against actual users in the system if enough data exists."""
        if len(all_profiles) < 5:
            return None  # Not enough data, fall back to AI

        crs_scores = [p.get("crs_score", 0) for p in all_profiles if p.get("crs_score")]
        if not crs_scores:
            return None

        import statistics
        user_crs = profile.get("crs_score", 0)
        avg = statistics.mean(crs_scores)
        percentile = sum(1 for s in crs_scores if s < user_crs) / len(crs_scores) * 100

        # Similar profiles (same NOC TEER level)
        user_teer = profile.get("teer_level")
        similar = [p for p in all_profiles if p.get("teer_level") == user_teer and p.get("crs_score")]
        similar_avg = statistics.mean([p["crs_score"] for p in similar]) if similar else avg

        return {
            "total_users": len(all_profiles),
            "user_crs": user_crs,
            "system_avg_crs": round(avg, 1),
            "user_percentile": round(percentile, 1),
            "similar_users_count": len(similar),
            "similar_users_avg_crs": round(similar_avg, 1),
            "data_source": "platform_users",
        }

    async def get_ai_benchmarks(self, profile: dict) -> dict:
        t0 = time.perf_counter()
        prompt = f"""You are a Canadian immigration data analyst with access to IRCC Express Entry statistics.

Applicant Profile:
- Nationality: {profile.get('nationality', 'unknown')}
- NOC Code: {profile.get('noc_code', 'unknown')} (TEER {profile.get('teer_level', '?')})
- Education: {profile.get('education_level', 'unknown')}
- Canadian Work Experience: {profile.get('canadian_work_years', 0)} years
- Language CLB: {profile.get('language_clb', 7)}
- CRS Score: {profile.get('crs_score', 0)}
- Has Spouse: {profile.get('has_spouse', False)}
- Age: {profile.get('age', 'unknown')}

Based on real IRCC Express Entry data and typical applicant profiles, provide peer comparison benchmarks.

Return JSON:
{{
  "user_crs": {profile.get('crs_score', 0)},
  "percentile_estimate": 65,
  "percentile_label": "Top 35% of applicants",
  "typical_crs_for_profile": {{
    "low": 420,
    "average": 465,
    "high": 510,
    "description": "Typical CRS range for {profile.get('nationality', '')} applicants in {profile.get('noc_code', 'this NOC')}"
  }},
  "typical_wait_time": {{
    "months_p50": 8,
    "months_p75": 14,
    "months_p90": 24,
    "description": "Based on historical draw patterns for similar profiles"
  }},
  "similar_profile_insights": [
    {{
      "insight": "Insight about how similar applicants typically fare",
      "source": "IRCC data / Express Entry trends"
    }}
  ],
  "your_advantages": ["Advantage 1 vs typical applicant", "Advantage 2"],
  "your_disadvantages": ["Area where similar applicants typically score higher"],
  "benchmark_crs_to_beat": 490,
  "benchmark_description": "The CRS score that puts you in competitive range for the next 6 months of draws",
  "data_note": "These are AI-estimated benchmarks based on publicly available IRCC data"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are a Canadian immigration data analyst. Return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1500,
            response_format={"type": "json_object"},
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"PeerComparisonService.get_ai_benchmarks: done in {(time.perf_counter()-t0)*1000:.0f}ms")
        return result


# ═══════════════════════════════════════════════════════════════
# Eligibility Checker Service
# ═══════════════════════════════════════════════════════════════
class EligibilityCheckerService:
    """
    Deep eligibility analysis for all Express Entry streams (FSW, CEC, FST)
    plus PNP and Atlantic Immigration Program.
    Returns pass/fail per program with exact gap analysis and fix roadmap.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    def check_deterministic(self, profile: dict) -> dict:
        """Pure Python eligibility checks — FSW, CEC, FST using official IRCC rules."""
        results = {}

        cdn_work   = float(profile.get("canadian_work_years", 0) or 0)
        foreign_work = float(profile.get("foreign_work_years", 0) or 0)
        clb        = int(profile.get("language_clb", 0) or 0)
        education  = profile.get("education_level", "") or ""
        teer       = str(profile.get("teer_level", "") or "")
        has_job_offer = bool(profile.get("has_job_offer"))
        has_cert   = bool(profile.get("has_certificate_of_qualification"))
        age        = int(profile.get("age", 30) or 30)

        # ── FSW ────────────────────────────────────────────────
        # Official IRCC FSW 67-point selection grid
        # https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/federal-skilled-workers/six-selection-factors-federal-skilled-workers.html

        def _fsw_language_points(clb_score: int) -> int:
            """First language points (max 28). CLB 9+ = 6pts/ability, CLB 8 = 5, CLB 7 = 4"""
            if clb_score >= 9:   pts_per = 6
            elif clb_score >= 8: pts_per = 5
            elif clb_score >= 7: pts_per = 4
            else:                pts_per = 0
            return pts_per * 4  # 4 abilities

        def _fsw_education_points(edu: str) -> int:
            """Education points (max 25)"""
            return {
                "doctoral":                   25,
                "masters":                    23,
                "two_or_more_degrees":        22,
                "bachelors":                  21,
                "two_year_post_secondary":    19,
                "one_year_post_secondary":    15,
                "secondary":                  5,
                "less_than_secondary":        0,
                "":                           0,
            }.get(edu, 15)

        def _fsw_experience_points(yrs: float) -> int:
            """Foreign work experience points (max 15)"""
            if yrs >= 6:   return 15
            elif yrs >= 5: return 13
            elif yrs >= 4: return 11
            elif yrs >= 3: return 9
            elif yrs >= 2: return 7
            elif yrs >= 1: return 5
            return 0

        def _fsw_age_points(a: int) -> int:
            """Age points (max 12). Peak 18-35 = 12pts"""
            if 18 <= a <= 35: return 12
            elif a == 36:     return 11
            elif a == 37:     return 10
            elif a == 38:     return 9
            elif a == 39:     return 8
            elif a == 40:     return 7
            elif a == 41:     return 6
            elif a == 42:     return 5
            elif a == 43:     return 4
            elif a == 44:     return 3
            elif a == 45:     return 2
            elif a == 46:     return 1
            else:             return 0

        def _fsw_job_offer_points(has_offer: bool) -> int:
            """Arranged employment points (max 10)"""
            return 10 if has_offer else 0

        def _fsw_adaptability_points(cdn_work_yrs: float, has_offer: bool, edu: str) -> int:
            """Adaptability points (max 10) — Canadian work exp, job offer, education"""
            pts = 0
            if cdn_work_yrs >= 1:  pts += 5   # Canadian work experience
            if has_offer:          pts += 5   # Job offer
            # Canadian education (simplified — if is_canadian in profile)
            return min(pts, 10)

        # Calculate all 6 factors
        lang_pts   = _fsw_language_points(clb)
        edu_pts    = _fsw_education_points(education)
        exp_pts    = _fsw_experience_points(foreign_work)
        age_pts    = _fsw_age_points(age)
        job_pts    = _fsw_job_offer_points(has_job_offer)
        adapt_pts  = _fsw_adaptability_points(cdn_work, has_job_offer, education)
        total_fsw  = lang_pts + edu_pts + exp_pts + age_pts + job_pts + adapt_pts

        fsw_checks = []
        fsw_pass = True

        # 1. Foreign skilled work ≥ 1 year (minimum requirement)
        ok = foreign_work >= 1
        fsw_checks.append({"criterion": "1+ year foreign skilled work (TEER 0-3)", "met": ok,
            "your_value": f"{foreign_work:.1f} years", "required": "1 year minimum",
            "fix": None if ok else "Gain 1 year of skilled foreign work experience (TEER 0, 1, 2, or 3)"})
        if not ok: fsw_pass = False

        # 2. Language CLB ≥ 7 (minimum requirement)
        ok = clb >= 7
        fsw_checks.append({"criterion": "CLB 7+ in first official language (all 4 skills)", "met": ok,
            "your_value": f"CLB {clb}", "required": "CLB 7 minimum",
            "fix": None if ok else "Improve IELTS/CELPIP to achieve CLB 7 (IELTS: 6.0 each skill)"})
        if not ok: fsw_pass = False

        # 3. Education ≥ secondary (minimum requirement)
        edu_ok = education not in ("", "less_than_secondary")
        fsw_checks.append({"criterion": "Secondary school diploma or higher", "met": edu_ok,
            "your_value": education.replace("_", " ").title() if education else "Not set",
            "required": "Secondary diploma minimum",
            "fix": None if edu_ok else "Obtain at least a secondary school diploma"})
        if not edu_ok: fsw_pass = False

        # 4. FSW 67-point selection grid (THE KEY CHECK)
        pts_ok = total_fsw >= 67
        fsw_checks.append({
            "criterion": "FSW 67-point selection grid",
            "met": pts_ok,
            "your_value": f"{total_fsw}/100 points",
            "required": "67 points minimum",
            "breakdown": {
                "Language (max 28)":         f"{lang_pts} pts  (CLB {clb})",
                "Education (max 25)":        f"{edu_pts} pts  ({education.replace('_',' ').title() if education else 'Not set'})",
                "Work Experience (max 15)":  f"{exp_pts} pts  ({foreign_work:.1f} yrs foreign)",
                "Age (max 12)":              f"{age_pts} pts  (age {age})",
                "Job Offer (max 10)":        f"{job_pts} pts  ({'Yes' if has_job_offer else 'No'})",
                "Adaptability (max 10)":     f"{adapt_pts} pts  ({'CDN work' if cdn_work >= 1 else 'No CDN work'})",
                "TOTAL":                     f"{total_fsw}/100",
            },
            "fix": None if pts_ok else self._fsw_gap_advice(total_fsw, lang_pts, edu_pts, exp_pts, age_pts, job_pts, adapt_pts, clb, education, foreign_work, age)
        })
        if not pts_ok: fsw_pass = False

        results["FSW"] = {
            "eligible": fsw_pass,
            "checks": fsw_checks,
            "selection_points": total_fsw,
            "selection_points_needed": 67,
            "selection_points_gap": max(0, 67 - total_fsw),
            "description": "Federal Skilled Worker — for applicants with foreign skilled work experience",
            "max_pool": "No cap — ranked by CRS score"
        }

        # ── CEC ────────────────────────────────────────────────
        cec_checks = []
        cec_pass = True
        ok = cdn_work >= 1
        cec_checks.append({"criterion": "1+ year Canadian skilled work (TEER 0-3)", "met": ok,
            "your_value": f"{cdn_work:.1f} years", "required": "1 year minimum",
            "fix": None if ok else "Gain 1 year of Canadian work experience in a TEER 0-3 occupation"})
        if not ok: cec_pass = False

        # CLB requirement depends on TEER level
        clb_required = 7 if teer in ("0", "1") else 5
        ok = clb >= clb_required
        cec_checks.append({"criterion": f"CLB {clb_required}+ (CLB 7 for TEER 0/1, CLB 5 for TEER 2/3)", "met": ok,
            "your_value": f"CLB {clb}", "required": f"CLB {clb_required}",
            "fix": None if ok else f"Improve language scores to CLB {clb_required}"})
        if not ok: cec_pass = False

        results["CEC"] = {"eligible": cec_pass, "checks": cec_checks,
            "description": "Canadian Experience Class — for those who already worked in Canada",
            "max_pool": "No cap — ranked by CRS score"}

        # ── FST ────────────────────────────────────────────────
        fst_checks = []
        fst_pass = True
        ok = foreign_work >= 2
        fst_checks.append({"criterion": "2+ years skilled trade experience (TEER 2)", "met": ok,
            "your_value": f"{foreign_work:.1f} years", "required": "2 years",
            "fix": None if ok else "Gain 2 years of certified trade experience"})
        if not ok: fst_pass = False

        ok = has_cert or has_job_offer
        fst_checks.append({"criterion": "Canadian job offer OR certificate of qualification", "met": ok,
            "your_value": "Yes" if ok else "No", "required": "Job offer or cert required",
            "fix": None if ok else "Obtain a Canadian job offer in a skilled trade or a provincial certificate of qualification"})
        if not ok: fst_pass = False

        ok_speak = clb >= 5
        fst_checks.append({"criterion": "CLB 5+ speaking & listening", "met": ok_speak,
            "your_value": f"CLB {clb}", "required": "CLB 5",
            "fix": None if ok_speak else "Achieve CLB 5 in speaking and listening"})
        if not ok_speak: fst_pass = False

        ok_read = clb >= 4
        fst_checks.append({"criterion": "CLB 4+ reading & writing", "met": ok_read,
            "your_value": f"CLB {clb}", "required": "CLB 4",
            "fix": None if ok_read else "Achieve CLB 4 in reading and writing"})
        if not ok_read: fst_pass = False

        results["FST"] = {"eligible": fst_pass, "checks": fst_checks,
            "description": "Federal Skilled Trades — for certified tradespersons",
            "max_pool": "Separate FST draws"}

        # Summary
        eligible_programs = [k for k, v in results.items() if v["eligible"]]
        total_checks = sum(len(v["checks"]) for v in results.values())
        checks_passed = sum(c["met"] for v in results.values() for c in v["checks"])

        return {
            "programs": results,
            "eligible_for": eligible_programs,
            "summary": {
                "total_checks": total_checks,
                "passed": checks_passed,
                "failed": total_checks - checks_passed,
                "overall_status": "eligible" if eligible_programs else "not_yet_eligible",
            }
        }

    def _fsw_gap_advice(self, total, lang, edu, exp, age, job, adapt, clb, education, foreign_work, applicant_age) -> str:
        """Generate specific advice on how to close the FSW 67-point gap."""
        gap = 67 - total
        tips = []

        # Language — biggest ROI, max 28 pts
        lang_gap = 28 - lang
        if lang_gap > 0 and clb < 9:
            next_clb = min(clb + 1, 9)
            extra = (6 if next_clb >= 9 else 5 if next_clb >= 8 else 4) * 4 - lang
            tips.append(f"Improve language to CLB {next_clb} → +{extra} pts (language max is 28)")

        # Education — max 25 pts
        edu_gap = 25 - edu
        if edu_gap >= 4:
            tips.append(f"Upgrade education → up to +{edu_gap} more pts (e.g. Bachelor's = 21, Master's = 23)")

        # Work experience — max 15 pts
        exp_gap = 15 - exp
        if exp_gap > 0 and foreign_work < 6:
            tips.append(f"Gain more foreign work experience → up to +{exp_gap} more pts (6 yrs = max 15 pts)")

        # Job offer — 10 pts
        if job == 0:
            tips.append("Obtain a valid Canadian job offer → +10 pts")

        # Adaptability — max 10 pts
        adapt_gap = 10 - adapt
        if adapt_gap >= 5:
            tips.append(f"Canadian work experience adds +5 adaptability pts → up to +{adapt_gap} more pts")

        advice = f"You need {gap} more points to reach 67. "
        if tips:
            advice += "Best options: " + "; ".join(tips[:3]) + "."
        return advice

    async def get_ai_roadmap(self, profile: dict, deterministic_result: dict) -> dict:
        """AI generates a personalised roadmap to fix eligibility gaps."""
        t0 = time.perf_counter()
        ineligible = [k for k, v in deterministic_result["programs"].items() if not v["eligible"]]
        gaps = []
        for prog, data in deterministic_result["programs"].items():
            for c in data["checks"]:
                if not c["met"]:
                    gaps.append(f"{prog}: {c['criterion']} — you have {c['your_value']}, need {c['required']}")

        prompt = f"""Express Entry eligibility gap analysis for this applicant:

Profile:
- Age: {profile.get('age')}
- Education: {profile.get('education_level', '').replace('_', ' ')}
- Canadian work: {profile.get('canadian_work_years', 0)} years
- Foreign work: {profile.get('foreign_work_years', 0)} years
- Language CLB: {profile.get('language_clb', 0)}
- TEER level: {profile.get('teer_level', 'unknown')}
- Has job offer: {profile.get('has_job_offer', False)}
- Nationality: {profile.get('nationality', 'unknown')}

Currently NOT eligible for: {', '.join(ineligible) if ineligible else 'None — already eligible!'}

Specific gaps to fix:
{chr(10).join(f'- {g}' for g in gaps) if gaps else 'No gaps — all criteria met'}

Provide a prioritised action roadmap. Return ONLY valid JSON:
{{
  "overall_assessment": "2-3 sentence honest assessment",
  "fastest_path": "Which program they can reach eligibility for fastest and why",
  "actions": [
    {{
      "priority": 1,
      "action": "Specific action to take",
      "program_unlocked": "FSW|CEC|FST|All",
      "timeline": "e.g. 3-6 months",
      "difficulty": "Easy|Medium|Hard",
      "impact": "What this unlocks"
    }}
  ],
  "alternative_programs": [
    {{
      "name": "e.g. Rural and Northern Immigration Pilot",
      "why_consider": "Why this might suit them",
      "requirement": "Key requirement to check"
    }}
  ],
  "encouragement": "One motivating sentence"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.3,
            timeout=30
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"EligibilityCheckerService.get_ai_roadmap: done in {(time.perf_counter()-t0)*1000:.0f}ms")
        return result


# ═══════════════════════════════════════════════════════════════
# Academic Transcript Generator
# ═══════════════════════════════════════════════════════════════
class TranscriptGeneratorService:
    """
    Generates a formal academic transcript document from the applicant's
    education profile data. Returns structured transcript data for PDF rendering.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate(self, profile: dict, education: dict, extra_context: str = "") -> dict:
        """Generate a formal academic transcript."""
        t0 = time.perf_counter()

        edu_level_map = {
            "bachelors": "Bachelor of Technology", "masters": "Master of Science",
            "doctoral": "Doctor of Philosophy", "two_year_post_secondary": "Diploma",
            "one_year_post_secondary": "Certificate", "two_or_more_degrees": "Dual Degree",
            "secondary": "Secondary School Certificate"
        }
        degree_title = edu_level_map.get(education.get("level", ""), "Degree")

        prompt = f"""Generate a formal academic transcript for an Express Entry immigration application.

Student Details:
- Full Name: {profile.get('full_name', 'N/A')}
- Date of Birth: {profile.get('date_of_birth', 'N/A')}
- Nationality: {profile.get('nationality', 'N/A')}
- Institution: {education.get('institution_name', 'N/A')}
- Program/Field: {education.get('field_of_study', 'N/A')}
- Degree Level: {degree_title}
- Country: {education.get('country', 'N/A')}
- Completion Date: {education.get('completion_date', 'N/A')}
- Is Canadian Credential: {education.get('is_canadian', False)}
- Duration: {'3+ years' if education.get('is_three_year_or_more') else 'Less than 3 years'}
{f'- Additional context: {extra_context}' if extra_context else ''}

Generate a complete, professional academic transcript suitable for Canadian immigration (IRCC/ECA purposes).
Return ONLY valid JSON:
{{
  "transcript_number": "TR-XXXX-YYYY (generate realistic number)",
  "issue_date": "today's date formatted",
  "student": {{
    "name": "full name",
    "student_id": "generated realistic ID",
    "date_of_birth": "from profile",
    "program": "program name",
    "degree": "full degree title",
    "institution": "institution name",
    "country": "country",
    "enrollment_start": "realistic start date based on completion",
    "enrollment_end": "completion date",
    "status": "Graduated"
  }},
  "semesters": [
    {{
      "name": "Semester 1 (e.g. Fall 2019)",
      "courses": [
        {{
          "code": "course code",
          "title": "course title relevant to {education.get('field_of_study', 'the field')}",
          "credits": 3,
          "grade": "A/B+/A-/etc",
          "grade_points": 4.0
        }}
      ],
      "gpa": 3.8,
      "credits_earned": 18
    }}
  ],
  "summary": {{
    "total_credits": 120,
    "cumulative_gpa": 3.75,
    "class_standing": "First Class / Second Class Upper / etc",
    "honours": "With Distinction / cum laude / etc or null",
    "degree_awarded": "full degree title",
    "date_awarded": "completion date",
    "grading_scale": "4.0 scale (A=4.0, A-=3.7, B+=3.3, B=3.0, ...)"
  }},
  "registrar_note": "This transcript is an official record generated for immigration purposes.",
  "verification_code": "generate alphanumeric code"
}}

Generate 6-8 semesters with 5-6 courses each, appropriate to the field of study. Make grades realistic (mix of A and B grades)."""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4000,
            temperature=0.4,
            timeout=45
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        logger.info(f"TranscriptGeneratorService.generate: done in {(time.perf_counter()-t0)*1000:.0f}ms  semesters={len(result.get('semesters', []))}")
        return result


# ═══════════════════════════════════════════════════════════════
# Work Experience Letter Generator
# ═══════════════════════════════════════════════════════════════
class WorkExperienceLetterService:
    """
    Generates a formal employment reference / work experience letter
    from the applicant's work experience data, suitable for IRCC submission.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
                raise RuntimeError("Azure OpenAI not configured")
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate(self, profile: dict, work: dict, extra_context: str = "") -> dict:
        """Generate a formal work experience reference letter."""
        t0 = time.perf_counter()

        from datetime import date as _d
        start = work.get("start_date", "N/A")
        end   = work.get("end_date") or ("Present" if work.get("is_current") else "N/A")
        # Calculate duration
        try:
            from datetime import date
            s = date.fromisoformat(str(start))
            e = date.today() if work.get("is_current") else date.fromisoformat(str(end))
            months = (e.year - s.year) * 12 + (e.month - s.month)
            years = months // 12
            rem_months = months % 12
            duration_str = f"{years} year{'s' if years != 1 else ''}" + (f" {rem_months} month{'s' if rem_months != 1 else ''}" if rem_months else "")
        except:
            duration_str = "N/A"

        prompt = f"""Generate a formal employment reference letter for a Canadian Express Entry immigration application.

Employee Details:
- Employee Name: {profile.get('full_name', 'N/A')}
- Employer / Company: {work.get('employer_name', 'N/A')}
- Job Title: {work.get('job_title', 'N/A')}
- NOC Code: {work.get('noc_code', 'N/A')} (NOC Title: {work.get('noc_title', 'N/A')})
- TEER Level: {work.get('teer_level', 'N/A')}
- Employment Type: {work.get('experience_type', 'full-time').replace('_', ' ').title()}
- Start Date: {start}
- End Date: {end}
- Duration: {duration_str}
- Hours per Week: {work.get('hours_per_week', 40)}
- Currently Employed: {work.get('is_current', False)}
{f'- Additional context: {extra_context}' if extra_context else ''}

Generate a complete, IRCC-compliant employment reference letter. IRCC requires:
1. Company letterhead details (name, address, phone, email)
2. Employee's full name, job title, employment dates
3. Hours worked per week
4. Annual salary or hourly wage
5. Main duties and responsibilities (minimum 5 specific duties matching the NOC)
6. Supervisor name, title, and signature block
7. Company stamp/seal mention

Return ONLY valid JSON:
{{
  "letter_date": "today formatted as Month DD, YYYY",
  "company": {{
    "name": "{work.get('employer_name', 'Company Name')}",
    "address": "generate realistic address for a company in the relevant country",
    "city_province": "City, Province/State",
    "postal_code": "postal/zip code",
    "phone": "phone number",
    "email": "hr@company.com format",
    "website": "www.company.com format"
  }},
  "subject": "Re: Employment Verification — {profile.get('full_name', 'Employee Name')}",
  "salutation": "To Whom It May Concern,",
  "opening_paragraph": "formal opening confirming employment",
  "employment_details": {{
    "employee_name": "{profile.get('full_name')}",
    "job_title": "{work.get('job_title')}",
    "department": "relevant department name",
    "employment_type": "Full-Time Permanent / Contract / etc",
    "start_date": "{start}",
    "end_date": "{end}",
    "hours_per_week": {work.get('hours_per_week', 40)},
    "annual_salary": "generate realistic salary for this role and region",
    "currency": "CAD/USD/INR etc based on experience_type"
  }},
  "duties": [
    "Specific duty 1 matching NOC {work.get('noc_code', '')}",
    "Specific duty 2",
    "Specific duty 3",
    "Specific duty 4",
    "Specific duty 5",
    "Specific duty 6"
  ],
  "closing_paragraph": "closing confirming the letter is for immigration purposes",
  "supervisor": {{
    "name": "generate realistic supervisor name",
    "title": "HR Manager / Direct Manager title",
    "phone": "direct phone",
    "email": "supervisor email"
  }},
  "ircc_note": "This letter has been prepared in accordance with IRCC requirements for Express Entry applications.",
  "noc_confirmation": "The above position corresponds to NOC {work.get('noc_code', '')} ({work.get('noc_title', '')}) under Canada's National Occupational Classification system."
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
            temperature=0.3,
            timeout=40
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        logger.info(f"WorkExperienceLetterService.generate: done in {(time.perf_counter()-t0)*1000:.0f}ms")
        return result


# ─────────────────────────────────────────────────────────────────────────────
# Student Visa AI Services
# ─────────────────────────────────────────────────────────────────────────────

STUDENT_VISA_ELIGIBILITY_SYSTEM = """You are a senior international student visa consultant with expertise in
Canada, UK, Australia, USA, and Germany student visa requirements.

Assess eligibility honestly and precisely. Base your analysis on current visa rules:
- Canada Study Permit: IRCC requirements, DLI, genuine student, financial proof
- UK Student Visa: UKVI Tier 4 rules, CAS, financial maintenance
- Australia Student Visa 500: GTE requirement, OSHC, financial capacity
- USA F-1: SEVIS, I-20, intent to return home, financial proof
- Germany Student Visa: blocked account, admission letter, language requirements

Return ONLY valid JSON. No markdown, no preamble."""

STUDENT_SOP_SYSTEM = """You are an expert Statement of Purpose (SOP) writer for international student visa applications.
You have helped thousands of students get accepted to top universities and obtain visas.

Write compelling, authentic, specific SOPs that:
- Address the specific country's visa officer concerns (GTE for Australia, genuine student for Canada, etc.)
- Connect academic background → work experience → chosen program → future goals logically
- Show financial planning and intent to return home (or PR pathway where appropriate)
- Use specific details about the chosen university and program
- Are appropriately formal but not robotic

Return ONLY valid JSON. No markdown, no preamble."""

STUDENT_VISA_RISK_SYSTEM = """You are an immigration risk analyst specializing in student visa applications.
Identify specific risk factors that could lead to visa refusal and provide actionable mitigation strategies.
Base analysis on actual refusal patterns for each country's visa officers.
Return ONLY valid JSON. No markdown, no preamble."""


class StudentEligibilityService:
    """
    Assesses student visa eligibility for Canada, UK, Australia, USA, Germany.
    Returns per-country eligibility scores, risk levels, and recommendations.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    # Country-specific requirement thresholds (rule-based pre-check before AI)
    COUNTRY_RULES = {
        "canada": {
            "min_ielts": 6.0, "min_pte": 58, "min_toefl": 80,
            "min_funds_usd": 15000,   # tuition ~$20k + living ~$10k, rough minimum with sponsor
            "name": "Canada Study Permit",
            "flag": "🍁",
            "visa_type": "Study Permit",
            "processing_weeks": "8–12",
        },
        "uk": {
            "min_ielts": 5.5, "min_pte": 51, "min_toefl": 72,
            "min_funds_usd": 20000,
            "name": "United Kingdom",
            "flag": "🇬🇧",
            "visa_type": "UK Student Visa (Tier 4)",
            "processing_weeks": "3–5",
        },
        "australia": {
            "min_ielts": 5.5, "min_pte": 50, "min_toefl": 46,
            "min_funds_usd": 22000,
            "name": "Australia",
            "flag": "🇦🇺",
            "visa_type": "Student Visa (Subclass 500)",
            "processing_weeks": "4–6",
        },
        "usa": {
            "min_ielts": 6.0, "min_pte": 53, "min_toefl": 80,
            "min_funds_usd": 25000,
            "name": "United States",
            "flag": "🇺🇸",
            "visa_type": "F-1 Student Visa",
            "processing_weeks": "2–5",
        },
        "germany": {
            "min_ielts": 6.0, "min_pte": 59, "min_toefl": 80,
            "min_funds_usd": 14000,   # blocked account ~€11,208/yr
            "name": "Germany",
            "flag": "🇩🇪",
            "visa_type": "National Visa (Student) §16b AufenthG",
            "processing_weeks": "6–12",
        },
    }

    async def assess(self, profile: dict) -> dict:
        t0 = time.perf_counter()
        logger.info(f"StudentEligibility.assess: nationality={profile.get('nationality')}  target_countries={profile.get('target_countries')}")

        # Rule-based pre-scores per country
        pre_scores = self._rule_based_scores(profile)

        prompt = f"""Assess student visa eligibility for the following applicant profile.

APPLICANT PROFILE:
{json.dumps(profile, indent=2, default=str)}

RULE-BASED PRE-SCORES (your analysis should be consistent with these unless you have specific reason to differ):
{json.dumps(pre_scores, indent=2)}

For each country in target_countries (and any others you think are worth recommending), return a complete assessment.

Return JSON:
{{
  "countries": [
    {{
      "country": "canada",
      "flag": "🍁",
      "visa_type": "Study Permit",
      "eligibility_score": 0-100,
      "risk_level": "low | medium | high | very_high",
      "recommended": true/false,
      "strengths": ["list of profile strengths for this country"],
      "risk_factors": ["specific risk factors for this country's visa officer"],
      "requirements_met": [
        {{"requirement": "IELTS 6.0+", "status": "met | not_met | partial", "detail": "Your 6.5 exceeds the 6.0 minimum"}}
      ],
      "financial_assessment": {{
        "required_usd_per_year": 30000,
        "applicant_has_usd": 25000,
        "gap_usd": 5000,
        "status": "sufficient | borderline | insufficient",
        "notes": "explanation"
      }},
      "processing_time_weeks": "8-12",
      "key_documents": ["list of critical documents needed"],
      "action_items": ["specific things applicant must do or fix"],
      "pr_pathway": "brief note on post-study PR options in this country"
    }}
  ],
  "top_recommendation": "canada",
  "overall_profile_strength": 0-100,
  "profile_summary": "2-3 sentence honest assessment of the applicant's overall profile",
  "critical_gaps": ["things that need to be fixed before applying anywhere"],
  "express_entry_connection": "how studying in Canada connects to Express Entry PR pathway (only if relevant)"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": STUDENT_VISA_ELIGIBILITY_SYSTEM},
                {"role": "user",   "content": prompt}
            ],
            max_tokens=3000,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        logger.info(f"StudentEligibility.assess: done in {(time.perf_counter()-t0)*1000:.0f}ms  countries={len(result.get('countries', []))}")
        return result

    def _rule_based_scores(self, profile: dict) -> dict:
        """Fast deterministic pre-scoring before AI analysis."""
        scores = {}
        ielts = profile.get("ielts_overall") or 0
        pte   = profile.get("pte_overall") or 0
        toefl = profile.get("toefl_total") or 0
        budget = profile.get("annual_budget_usd") or 0
        savings = profile.get("savings_usd") or 0
        income  = profile.get("sponsor_annual_income_usd") or 0
        total_funds = budget + savings + income * 0.3  # conservative estimate

        has_refusal = profile.get("has_refusal", False)

        for country, rules in self.COUNTRY_RULES.items():
            score = 50  # baseline
            # Language
            if ielts >= rules["min_ielts"] + 0.5: score += 20
            elif ielts >= rules["min_ielts"]: score += 10
            elif pte >= rules["min_pte"] + 10: score += 15
            elif pte >= rules["min_pte"]: score += 8
            elif toefl >= rules["min_toefl"] + 10: score += 15
            elif toefl >= rules["min_toefl"]: score += 8
            else: score -= 15

            # Finances
            if total_funds >= rules["min_funds_usd"] * 1.5: score += 20
            elif total_funds >= rules["min_funds_usd"]: score += 10
            elif total_funds >= rules["min_funds_usd"] * 0.7: score -= 5
            else: score -= 20

            # Prior refusal
            if has_refusal:
                refusal_list = profile.get("refusal_countries", [])
                if country in refusal_list: score -= 30
                else: score -= 10

            scores[country] = max(0, min(100, score))

        return scores


class StudentSOPService:
    """
    Generates tailored Statement of Purpose for student visa applications.
    Adapts tone and content based on target country's visa officer expectations.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    # Country-specific SOP guidance
    COUNTRY_GUIDANCE = {
        "canada": "Focus on genuine student intent, financial capacity, ties to home country, and long-term career goals. Canada visa officers look for a clear study plan and reason for choosing Canada. Note: if pursuing Express Entry PR later, mention career goals that align with Canadian labour market needs — but don't make PR the primary motivation.",
        "uk":     "Emphasize academic excellence, specific reasons for choosing the UK institution, financial maintenance evidence. UKVI requires clear evidence of English proficiency and financial self-sufficiency. Highlight ties to home country.",
        "australia": "The GTE (Genuine Temporary Entrant) requirement is critical — strongly emphasize intention to return home after study OR strong career pathway. Explain how the degree is not available at home or is significantly better quality in Australia. Show financial capacity explicitly.",
        "usa":    "F-1 officers are skeptical of immigration intent. Strongly emphasize non-immigrant intent, ties to home country (property, family, job offer), and why returning home after graduation makes sense. Be very specific about the program and university.",
        "germany": "German visa officers value clarity of purpose and financial proof (blocked account). Explain why Germany specifically (research, language, cost, quality). If applying to English-taught program, explain why German isn't required. Show blocked account or proof of funds of at least €11,208/year.",
    }

    async def generate(
        self,
        profile: dict,
        country: str,
        university: str,
        program: str,
        word_count: int = 800,
        custom_notes: str = ""
    ) -> dict:
        t0 = time.perf_counter()
        logger.info(f"StudentSOP.generate: country={country}  program={program!r}  words={word_count}")

        guidance = self.COUNTRY_GUIDANCE.get(country.lower(), "Write a standard academic SOP.")

        prompt = f"""Generate a Statement of Purpose for a student visa application.

APPLICANT PROFILE:
{json.dumps(profile, indent=2, default=str)}

APPLICATION DETAILS:
- Target Country: {country.upper()}
- University: {university}
- Program: {program}
- Target Word Count: {word_count} words

COUNTRY-SPECIFIC GUIDANCE:
{guidance}

ADDITIONAL NOTES FROM APPLICANT:
{custom_notes if custom_notes else "None"}

Write a compelling, specific, authentic SOP. Do NOT use generic phrases like "I have always been passionate about..."
Use actual details from the profile. Make it sound like a real person wrote it.

Return JSON:
{{
  "sop_text": "the full SOP text (~{word_count} words)",
  "word_count": actual_word_count,
  "key_themes": ["main themes covered"],
  "strengths_highlighted": ["profile strengths used"],
  "country_specific_elements": ["elements added specifically for {country} visa officer"],
  "improvement_suggestions": ["optional — things applicant could strengthen with real info"],
  "visa_officer_notes": "brief note on what a {country} visa officer will likely focus on when reading this"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": STUDENT_SOP_SYSTEM},
                {"role": "user",   "content": prompt}
            ],
            max_tokens=2500,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        logger.info(f"StudentSOP.generate: done in {(time.perf_counter()-t0)*1000:.0f}ms  words={result.get('word_count')}")
        return result


class StudentFinancialLetterService:
    """Generates financial sponsorship/bank letters for student visa applications."""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def generate(self, profile: dict, country: str, letter_type: str = "sponsorship") -> dict:
        """
        letter_type: sponsorship | personal_statement | bank_explanation
        """
        t0 = time.perf_counter()
        logger.info(f"StudentFinancialLetter.generate: type={letter_type}  country={country}")

        country_reqs = {
            "canada":    "CAD equivalent of first year tuition + CAD $10,000 living expenses",
            "uk":        "Tuition fees + £1,334/month for London or £1,023/month elsewhere for 28 days",
            "australia": "AUD $29,710/year (or 75% of this if course < 1 year) + OSHC cost",
            "usa":       "Full first year: tuition + room + board + personal expenses as shown on I-20",
            "germany":   "€11,208 in blocked account (Sperrkonto) per year",
        }

        prompt = f"""Generate a {letter_type} letter for a student visa financial requirement.

APPLICANT PROFILE:
{json.dumps(profile, indent=2, default=str)}

TARGET COUNTRY: {country.upper()}
FINANCIAL REQUIREMENT: {country_reqs.get(country.lower(), "As per embassy requirements")}
LETTER TYPE: {letter_type}

For 'sponsorship': Write a formal letter from the sponsor (parent/relative) to the embassy.
  Include: sponsor's relationship, annual income, commitment to fund education, duration.
For 'personal_statement': Write the applicant's own financial statement showing funds.
For 'bank_explanation': Write a letter explaining the source of funds in bank account.

Return JSON:
{{
  "letter_text": "the full letter text",
  "letter_type": "{letter_type}",
  "country": "{country}",
  "amount_referenced": "the specific amount mentioned",
  "key_elements_included": ["list of elements covered"],
  "usage_notes": "how to use this letter — what supporting docs to attach"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": "You are an expert immigration document writer. Generate formal, professional financial letters for student visa applications. Return ONLY valid JSON."},
                {"role": "user",   "content": prompt}
            ],
            max_tokens=1500,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        logger.info(f"StudentFinancialLetter.generate: done in {(time.perf_counter()-t0)*1000:.0f}ms")
        return result


class StudentVisaRiskService:
    """
    Analyses student visa application risk and provides mitigation strategies.
    Works on profile data — no document upload needed.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.lstrip("* ").strip(),
                api_version=settings.AZURE_OPENAI_API_VERSION
            )
        return self._client

    async def analyze(self, profile: dict, country: str) -> dict:
        t0 = time.perf_counter()
        logger.info(f"StudentVisaRisk.analyze: country={country}  nationality={profile.get('nationality')}")

        prompt = f"""Analyze the visa application risk for this student profile applying to {country.upper()}.

PROFILE:
{json.dumps(profile, indent=2, default=str)}

Be specific and honest. Identify real risk factors based on:
- Nationality-specific refusal patterns for {country}
- Financial proof strength
- Academic profile vs program level
- Language score sufficiency
- Study gap explanations
- Prior refusals
- Age relative to program level
- Home ties (family, property, job offer after graduation)
- GTE concerns (Australia) or non-immigrant intent concerns (USA)

Return JSON:
{{
  "overall_risk": "low | medium | high | very_high",
  "risk_score": 0-100 (100 = highest risk),
  "risk_factors": [
    {{
      "category": "Financial | Language | Academic | Background | Intent | Documents",
      "severity": "critical | high | medium | low",
      "issue": "specific issue description",
      "impact": "how this affects visa decision",
      "mitigation": "specific actionable step to reduce this risk"
    }}
  ],
  "strengths": ["positive factors that reduce risk"],
  "approval_probability": "estimated % range e.g. 65-75%",
  "priority_actions": ["top 3 things to do NOW before applying"],
  "documents_to_strengthen": ["specific documents that need extra attention for {country}"],
  "red_flags_for_officer": ["things a {country} visa officer will flag immediately"],
  "honest_assessment": "2-3 sentence honest summary including whether they should apply now or wait"
}}"""

        response = await self._get_client().chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": STUDENT_VISA_RISK_SYSTEM},
                {"role": "user",   "content": prompt}
            ],
            max_tokens=2000,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        logger.info(f"StudentVisaRisk.analyze: done in {(time.perf_counter()-t0)*1000:.0f}ms  risk={result.get('overall_risk')}")
        return result
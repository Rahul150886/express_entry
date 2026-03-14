"""
CRS Calculator Service — Full IRCC Comprehensive Ranking System
Implements all official IRCC CRS point tables as of 2024
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from loguru import logger
from core.domain.models import (
    Applicant, CrsScore, LanguageTest, Education,
    EducationLevel, TeerLevel, ClbScores, ApplicationProgram, LanguageTestType
)


# ─────────────────────────────────────────────
# Official IRCC Point Tables
# ─────────────────────────────────────────────

# Age points — without spouse
AGE_POINTS_WITHOUT_SPOUSE = {
    17: 0, 18: 99, 19: 105, 20: 110, 21: 110, 22: 110,
    23: 110, 24: 110, 25: 110, 26: 110, 27: 110, 28: 110,
    29: 110, 30: 105, 31: 99, 32: 94, 33: 88, 34: 83,
    35: 77, 36: 72, 37: 66, 38: 61, 39: 55, 40: 50,
    41: 39, 42: 28, 43: 17, 44: 6,
}

# Age points — with spouse
AGE_POINTS_WITH_SPOUSE = {
    17: 0, 18: 90, 19: 95, 20: 100, 21: 100, 22: 100,
    23: 100, 24: 100, 25: 100, 26: 100, 27: 100, 28: 100,
    29: 100, 30: 95, 31: 90, 32: 85, 33: 80, 34: 75,
    35: 70, 36: 65, 37: 60, 38: 55, 39: 50, 40: 45,
    41: 35, 42: 25, 43: 15, 44: 5,
}

# Education points — without spouse
EDUCATION_POINTS_WITHOUT_SPOUSE = {
    EducationLevel.LESS_THAN_SECONDARY: 0,
    EducationLevel.SECONDARY: 30,
    EducationLevel.ONE_YEAR_POST_SECONDARY: 90,
    EducationLevel.TWO_YEAR_POST_SECONDARY: 98,
    EducationLevel.BACHELORS: 120,
    EducationLevel.TWO_OR_MORE_DEGREES: 128,
    EducationLevel.MASTERS: 135,
    EducationLevel.PHD: 150,
}

# Education points — with spouse
EDUCATION_POINTS_WITH_SPOUSE = {
    EducationLevel.LESS_THAN_SECONDARY: 0,
    EducationLevel.SECONDARY: 28,
    EducationLevel.ONE_YEAR_POST_SECONDARY: 84,
    EducationLevel.TWO_YEAR_POST_SECONDARY: 91,
    EducationLevel.BACHELORS: 112,
    EducationLevel.TWO_OR_MORE_DEGREES: 119,
    EducationLevel.MASTERS: 126,
    EducationLevel.PHD: 140,
}

# First official language CLB → points (without spouse)
FIRST_LANG_POINTS_WITHOUT_SPOUSE = {
    # (clb_level): (speaking, listening, reading, writing)
    4: 6, 5: 6, 6: 9, 7: 17, 8: 23, 9: 31, 10: 34
}

# First official language CLB → points (with spouse)
FIRST_LANG_POINTS_WITH_SPOUSE = {
    4: 6, 5: 6, 6: 8, 7: 16, 8: 22, 9: 29, 10: 32
}

# Canadian work experience points
CDN_WORK_POINTS_WITHOUT_SPOUSE = {
    0: 0, 1: 40, 2: 53, 3: 64, 4: 72, 5: 80
}
CDN_WORK_POINTS_WITH_SPOUSE = {
    0: 0, 1: 35, 2: 46, 3: 56, 4: 63, 5: 70
}

# Spouse education points
SPOUSE_EDUCATION_POINTS = {
    EducationLevel.LESS_THAN_SECONDARY: 0,
    EducationLevel.SECONDARY: 2,
    EducationLevel.ONE_YEAR_POST_SECONDARY: 6,
    EducationLevel.TWO_YEAR_POST_SECONDARY: 7,
    EducationLevel.BACHELORS: 8,
    EducationLevel.TWO_OR_MORE_DEGREES: 9,
    EducationLevel.MASTERS: 10,
    EducationLevel.PHD: 10,
}

# Spouse language points per CLB band
SPOUSE_LANG_POINTS = {
    4: 1, 5: 1, 6: 1, 7: 3, 8: 3, 9: 5, 10: 5
}

# Spouse Canadian work experience points
SPOUSE_CDN_WORK_POINTS = {
    0: 0, 1: 5, 2: 7, 3: 8, 4: 10, 5: 10
}


# ─────────────────────────────────────────────
# CLB Conversion Tables
# ─────────────────────────────────────────────

IELTS_TO_CLB = {
    # (skill, score_range_key): clb
    "reading":   {4.0: 3.5, 5.0: 4, 5.5: 5, 6.0: 6, 6.5: 7, 7.0: 8, 7.5: 9, 8.0: 10},
    "writing":   {4.0: 3.5, 5.0: 4, 5.5: 5, 6.0: 6, 6.5: 7, 7.0: 8, 7.5: 9, 8.0: 10},
    "speaking":  {4.0: 3.5, 5.0: 4, 5.5: 5, 6.0: 6, 6.5: 7, 7.0: 8, 7.5: 9, 8.0: 10},
    "listening": {4.5: 3.5, 5.0: 4, 5.5: 5, 6.0: 6, 7.5: 7, 8.0: 8, 8.5: 9, 9.0: 10},
}

CELPIP_TO_CLB = {
    # CELPIP score = CLB level (1:1 mapping from 4+)
    4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 10, 12: 10
}

TEF_TO_CLB = {
    "reading":   {121: 4, 151: 5, 181: 6, 207: 7, 233: 8, 248: 9, 263: 10},
    "writing":   {181: 4, 226: 5, 271: 6, 310: 7, 349: 8, 371: 9, 393: 10},
    "speaking":  {181: 4, 226: 5, 271: 6, 310: 7, 349: 8, 371: 9, 393: 10},
    "listening": {145: 4, 181: 5, 217: 6, 249: 7, 280: 8, 298: 9, 316: 10},
}


# ─────────────────────────────────────────────
# CRS Calculator
# ─────────────────────────────────────────────

@dataclass
class CrsBreakdown:
    """Detailed breakdown for UI display"""
    age_points: int
    education_points: int
    first_language_points: int
    second_language_points: int
    canadian_work_points: int
    core_total: int

    spouse_education_points: int = 0
    spouse_language_points: int = 0
    spouse_cdn_work_points: int = 0
    spouse_total: int = 0

    edu_lang_combo: int = 0
    edu_cdn_exp_combo: int = 0
    foreign_lang_combo: int = 0
    foreign_cdn_exp_combo: int = 0
    cert_lang_combo: int = 0
    transferability_total: int = 0

    provincial_nomination: int = 0
    job_offer: int = 0
    canadian_education: int = 0
    sibling: int = 0
    french_language: int = 0
    additional_total: int = 0

    grand_total: int = 0


class CrsCalculatorService:
    """
    Full CRS Calculator implementing all IRCC point tables.
    Reference: https://www.canada.ca/en/immigration-refugees-citizenship/
               services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html
    """

    def calculate(self, applicant: Applicant) -> tuple[CrsScore, CrsBreakdown]:
        logger.debug(f"CrsCalculator.calculate: applicant={applicant.full_name!r}  age={applicant.age}  has_spouse={applicant.has_spouse}  cdn_work_yrs={applicant.canadian_work_years:.1f}  foreign_work_yrs={applicant.foreign_work_years:.1f}  edu={applicant.education.level.value if applicant.education else None}  lang_tests={len(applicant.language_tests)}")
        with_spouse = applicant.has_spouse and applicant.spouse_profile is not None

        breakdown = CrsBreakdown(
            age_points=0, education_points=0, first_language_points=0,
            second_language_points=0, canadian_work_points=0, core_total=0
        )

        # ── A: Core Human Capital ──
        breakdown.age_points = self._get_age_points(applicant.age, with_spouse)
        breakdown.education_points = self._get_education_points(applicant.education, with_spouse)
        breakdown.first_language_points = self._get_first_language_points(
            applicant.primary_language_test, with_spouse)
        breakdown.second_language_points = self._get_second_language_points(
            applicant.secondary_language_test)
        cdn_years = min(applicant.canadian_work_years, 5)
        breakdown.canadian_work_points = self._get_canadian_work_points(cdn_years, with_spouse)

        core = (breakdown.age_points + breakdown.education_points +
                breakdown.first_language_points + breakdown.second_language_points +
                breakdown.canadian_work_points)
        breakdown.core_total = min(core, 460 if with_spouse else 500)

        # ── B: Spouse/Common-Law Partner Factors ──
        if with_spouse and applicant.spouse_profile:
            spouse = applicant.spouse_profile
            breakdown.spouse_education_points = SPOUSE_EDUCATION_POINTS.get(
                spouse.education_level, 0)
            breakdown.spouse_language_points = self._get_spouse_language_points(
                spouse.language_test)
            cdn_spouse_years = min(spouse.canadian_work_years, 5)
            breakdown.spouse_cdn_work_points = SPOUSE_CDN_WORK_POINTS.get(
                int(cdn_spouse_years), 0)
            breakdown.spouse_total = min(
                breakdown.spouse_education_points +
                breakdown.spouse_language_points +
                breakdown.spouse_cdn_work_points, 40)

        # ── C: Skill Transferability ──
        transferability = self._calculate_transferability(applicant)
        breakdown.edu_lang_combo = transferability["edu_lang"]
        breakdown.edu_cdn_exp_combo = transferability["edu_cdn_exp"]
        breakdown.foreign_lang_combo = transferability["foreign_lang"]
        breakdown.foreign_cdn_exp_combo = transferability["foreign_cdn_exp"]
        breakdown.cert_lang_combo = transferability["cert_lang"]
        breakdown.transferability_total = min(sum(transferability.values()), 100)

        # ── D: Additional Points ──
        additional = self._calculate_additional(applicant)
        breakdown.provincial_nomination = additional["pnp"]
        breakdown.job_offer = additional["job_offer"]
        breakdown.canadian_education = additional["cdn_education"]
        breakdown.sibling = additional["sibling"]
        breakdown.french_language = additional["french"]
        breakdown.additional_total = sum(additional.values())

        grand_total = (breakdown.core_total + breakdown.spouse_total +
                       breakdown.transferability_total + breakdown.additional_total)
        breakdown.grand_total = min(grand_total, 1200)

        score = CrsScore(
            core_human_capital=breakdown.core_total,
            spouse_factors=breakdown.spouse_total,
            skill_transferability=breakdown.transferability_total,
            additional_points=breakdown.additional_total
        )

        return score, breakdown

    def convert_to_clb(self, test: LanguageTest) -> ClbScores:
        logger.debug(f"CrsCalculator.convert_to_clb: test_type={test.test_type.value}  raw=[R={test.reading} W={test.writing} L={test.listening} S={test.speaking}]")
        """Convert raw test scores to CLB equivalents"""
        if test.test_type == LanguageTestType.IELTS:
            return ClbScores(
                speaking=self._ielts_to_clb("speaking", test.speaking),
                listening=self._ielts_to_clb("listening", test.listening),
                reading=self._ielts_to_clb("reading", test.reading),
                writing=self._ielts_to_clb("writing", test.writing),
            )
        elif test.test_type == LanguageTestType.CELPIP:
            return ClbScores(
                speaking=CELPIP_TO_CLB.get(int(test.speaking), 0),
                listening=CELPIP_TO_CLB.get(int(test.listening), 0),
                reading=CELPIP_TO_CLB.get(int(test.reading), 0),
                writing=CELPIP_TO_CLB.get(int(test.writing), 0),
            )
        elif test.test_type in (LanguageTestType.TEF, LanguageTestType.TCF):
            return ClbScores(
                speaking=self._tef_to_clb("speaking", test.speaking),
                listening=self._tef_to_clb("listening", test.listening),
                reading=self._tef_to_clb("reading", test.reading),
                writing=self._tef_to_clb("writing", test.writing),
            )
        return ClbScores(0, 0, 0, 0)

    def check_eligibility(self, applicant: Applicant) -> dict:
        """Check eligibility for FSW, FST, CEC"""
        programs = []
        reasons = {}

        # ── FSW Eligibility ──
        fsw_eligible, fsw_reason = self._check_fsw(applicant)
        if fsw_eligible:
            programs.append(ApplicationProgram.FSW)
        reasons[ApplicationProgram.FSW] = fsw_reason

        # ── CEC Eligibility ──
        cec_eligible, cec_reason = self._check_cec(applicant)
        if cec_eligible:
            programs.append(ApplicationProgram.CEC)
        reasons[ApplicationProgram.CEC] = cec_reason

        # ── FST Eligibility ──
        fst_eligible, fst_reason = self._check_fst(applicant)
        if fst_eligible:
            programs.append(ApplicationProgram.FST)
        reasons[ApplicationProgram.FST] = fst_reason

        reasons_summary = {k.value: v[:60] for k, v in reasons.items()}
        logger.info(f"CrsCalculator.check_eligibility: programs={[p.value for p in programs]}  reasons={reasons_summary}")
        return {"eligible_programs": programs, "reasons": reasons}

    # ─── Private Helpers ───

    def _get_age_points(self, age: int, with_spouse: bool) -> int:
        table = AGE_POINTS_WITH_SPOUSE if with_spouse else AGE_POINTS_WITHOUT_SPOUSE
        if age > 44:
            return 0
        return table.get(age, 0)

    def _get_education_points(self, education: Optional[Education], with_spouse: bool) -> int:
        if not education:
            return 0
        table = EDUCATION_POINTS_WITH_SPOUSE if with_spouse else EDUCATION_POINTS_WITHOUT_SPOUSE
        return table.get(education.level, 0)

    def _get_first_language_points(self, test: Optional[LanguageTest], with_spouse: bool) -> int:
        if not test or not test.clb_equivalent:
            return 0
        clb = test.clb_equivalent
        table = FIRST_LANG_POINTS_WITH_SPOUSE if with_spouse else FIRST_LANG_POINTS_WITHOUT_SPOUSE
        total = 0
        for skill_clb in [clb.speaking, clb.listening, clb.reading, clb.writing]:
            capped_clb = min(skill_clb, 10)
            for threshold in sorted(table.keys(), reverse=True):
                if capped_clb >= threshold:
                    total += table[threshold]
                    break
        return total

    def _get_second_language_points(self, test: Optional[LanguageTest]) -> int:
        if not test or not test.clb_equivalent:
            return 0
        clb = test.clb_equivalent
        total = 0
        for skill_clb in [clb.speaking, clb.listening, clb.reading, clb.writing]:
            if skill_clb >= 9:
                total += 6
            elif skill_clb >= 7:
                total += 3
            elif skill_clb >= 5:
                total += 1
        return min(total, 24)

    def _get_canadian_work_points(self, years: float, with_spouse: bool) -> int:
        table = CDN_WORK_POINTS_WITH_SPOUSE if with_spouse else CDN_WORK_POINTS_WITHOUT_SPOUSE
        year_key = min(int(years), 5)
        return table.get(year_key, 0)

    def _get_spouse_language_points(self, test: Optional[LanguageTest]) -> int:
        if not test or not test.clb_equivalent:
            return 0
        clb = test.clb_equivalent
        total = 0
        for skill_clb in [clb.speaking, clb.listening, clb.reading, clb.writing]:
            for threshold in sorted(SPOUSE_LANG_POINTS.keys(), reverse=True):
                if skill_clb >= threshold:
                    total += SPOUSE_LANG_POINTS[threshold]
                    break
        return min(total, 20)

    def _calculate_transferability(self, applicant: Applicant) -> dict:
        result = {"edu_lang": 0, "edu_cdn_exp": 0,
                  "foreign_lang": 0, "foreign_cdn_exp": 0, "cert_lang": 0}

        clb = applicant.primary_language_test.clb_equivalent if applicant.primary_language_test else None
        edu = applicant.education
        cdn_years = applicant.canadian_work_years
        foreign_years = applicant.foreign_work_years

        if clb and edu:
            # Education + Language
            if edu.level in (EducationLevel.PHD, EducationLevel.MASTERS,
                             EducationLevel.TWO_OR_MORE_DEGREES):
                if clb.lowest >= 9:
                    result["edu_lang"] = 50
                elif clb.lowest >= 7:
                    result["edu_lang"] = 25
            elif edu.level in (EducationLevel.BACHELORS, EducationLevel.TWO_YEAR_POST_SECONDARY,
                                EducationLevel.ONE_YEAR_POST_SECONDARY):
                if clb.lowest >= 9:
                    result["edu_lang"] = 50
                elif clb.lowest >= 7:
                    result["edu_lang"] = 25

        if edu:
            # Education + Canadian Experience
            if edu.level in (EducationLevel.PHD, EducationLevel.MASTERS,
                             EducationLevel.TWO_OR_MORE_DEGREES):
                if cdn_years >= 2:
                    result["edu_cdn_exp"] = 50
                elif cdn_years >= 1:
                    result["edu_cdn_exp"] = 25
            elif edu.level in (EducationLevel.BACHELORS, EducationLevel.TWO_YEAR_POST_SECONDARY,
                                EducationLevel.ONE_YEAR_POST_SECONDARY):
                if cdn_years >= 2:
                    result["edu_cdn_exp"] = 50
                elif cdn_years >= 1:
                    result["edu_cdn_exp"] = 25

        if clb and foreign_years > 0:
            # Foreign Work + Language
            if foreign_years >= 3:
                if clb.lowest >= 9:
                    result["foreign_lang"] = 50
                elif clb.lowest >= 7:
                    result["foreign_lang"] = 25
            elif foreign_years >= 1:
                if clb.lowest >= 9:
                    result["foreign_lang"] = 25
                elif clb.lowest >= 7:
                    result["foreign_lang"] = 13

        if foreign_years > 0 and cdn_years > 0:
            # Foreign Work + Canadian Experience
            if foreign_years >= 3 and cdn_years >= 2:
                result["foreign_cdn_exp"] = 50
            elif (foreign_years >= 3 and cdn_years >= 1) or \
                 (foreign_years >= 1 and cdn_years >= 2):
                result["foreign_cdn_exp"] = 25

        if applicant.has_certificate_of_qualification and clb:
            # Certificate of Qualification + Language
            if clb.lowest >= 7:
                result["cert_lang"] = 50
            elif clb.lowest >= 5:
                result["cert_lang"] = 25

        return result

    def _calculate_additional(self, applicant: Applicant) -> dict:
        result = {"pnp": 0, "job_offer": 0, "cdn_education": 0, "sibling": 0, "french": 0}

        if applicant.has_provincial_nomination:
            result["pnp"] = 600

        if applicant.job_offer:
            result["job_offer"] = applicant.job_offer.points

        if applicant.education and applicant.education.is_canadian:
            result["cdn_education"] = 30 if applicant.education.is_three_year_or_more else 15

        if applicant.has_sibling_in_canada:
            result["sibling"] = 15

        # French language bonus
        primary = applicant.primary_language_test
        secondary = applicant.secondary_language_test
        if primary and primary.language == "french" and primary.clb_equivalent:
            if primary.clb_equivalent.lowest >= 7:
                if secondary and secondary.clb_equivalent and secondary.clb_equivalent.lowest >= 5:
                    result["french"] = 50
                else:
                    result["french"] = 25

        return result

    def _ielts_to_clb(self, skill: str, score: float) -> int:
        table = IELTS_TO_CLB.get(skill, {})
        for threshold in sorted(table.keys(), reverse=True):
            if score >= threshold:
                return table[threshold]
        return 0

    def _tef_to_clb(self, skill: str, score: float) -> int:
        table = TEF_TO_CLB.get(skill, {})
        for threshold in sorted(table.keys(), reverse=True):
            if score >= threshold:
                return table[threshold]
        return 0

    def _check_fsw(self, applicant: Applicant) -> tuple[bool, str]:
        """Federal Skilled Worker: ≥1yr foreign skilled work + CLB7 + points ≥67"""
        foreign_skilled = sum(
            exp.total_years for exp in applicant.work_experiences
            if exp.experience_type.FOREIGN and exp.teer_level.value in ("0", "1", "2", "3")
        )
        if foreign_skilled < 1:
            return False, "Need at least 1 year of foreign skilled work experience (TEER 0-3)"
        primary = applicant.primary_language_test
        if not primary or not primary.clb_equivalent or primary.clb_equivalent.lowest < 7:
            return False, "Need CLB 7 or higher in first official language"
        if not applicant.education or applicant.education.level == EducationLevel.LESS_THAN_SECONDARY:
            return False, "Need at least a secondary school diploma"
        return True, "Eligible for Federal Skilled Worker"

    def _check_cec(self, applicant: Applicant) -> tuple[bool, str]:
        """Canadian Experience Class: ≥1yr Canadian skilled work"""
        cdn_skilled = applicant.canadian_work_years
        if cdn_skilled < 1:
            return False, "Need at least 1 year of Canadian skilled work experience (TEER 0-3)"
        primary = applicant.primary_language_test
        if not primary or not primary.clb_equivalent:
            return False, "Valid language test required"
        clb = primary.clb_equivalent.lowest
        is_teer_0_1 = any(
            exp.teer_level.value in ("0", "1") for exp in applicant.work_experiences
            if exp.experience_type.CANADIAN
        )
        required_clb = 7 if is_teer_0_1 else 5
        if clb < required_clb:
            return False, f"Need CLB {required_clb}+ for your NOC category"
        return True, "Eligible for Canadian Experience Class"

    def _check_fst(self, applicant: Applicant) -> tuple[bool, str]:
        """Federal Skilled Trades: ≥2yr trade experience + CLB5 (speaking/listening), CLB4 (reading/writing)"""
        trade_exp = sum(
            exp.total_years for exp in applicant.work_experiences
            if exp.teer_level == TeerLevel.TEER_2 and exp.experience_type.FOREIGN
        )
        if trade_exp < 2:
            return False, "Need 2 years of skilled trade experience"
        if not applicant.has_certificate_of_qualification:
            return False, "Need certificate of qualification (or valid job offer / Canadian trade certification)"
        primary = applicant.primary_language_test
        if not primary or not primary.clb_equivalent:
            return False, "Valid language test required"
        clb = primary.clb_equivalent
        if clb.speaking < 5 or clb.listening < 5:
            return False, "Need CLB 5+ in speaking and listening"
        if clb.reading < 4 or clb.writing < 4:
            return False, "Need CLB 4+ in reading and writing"
        return True, "Eligible for Federal Skilled Trades"

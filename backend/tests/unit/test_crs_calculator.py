"""
Unit Tests — CRS Calculator
Verifies all point calculations against official IRCC tables
"""

import pytest
from datetime import date
from core.application.services.crs_calculator import CrsCalculatorService
from core.domain.models import (
    Applicant, LanguageTest, WorkExperience, Education, SpouseProfile,
    LanguageTestType, LanguageRole, ExperienceType, TeerLevel,
    EducationLevel, ClbScores
)


@pytest.fixture
def calculator():
    return CrsCalculatorService()


@pytest.fixture
def strong_applicant():
    """A strong FSW applicant — should score ~470"""
    applicant = Applicant()
    applicant.date_of_birth = date(1991, 1, 1)  # age 33
    applicant.nationality = "India"
    applicant.has_spouse = False
    applicant.has_provincial_nomination = False
    applicant.has_sibling_in_canada = False

    # IELTS CLB 9 across the board
    lang_test = LanguageTest()
    lang_test.test_type = LanguageTestType.IELTS
    lang_test.role = LanguageRole.FIRST
    lang_test.language = "english"
    lang_test.test_date = date.today()
    lang_test.clb_equivalent = ClbScores(speaking=9, listening=9, reading=9, writing=9)
    applicant.language_tests.append(lang_test)

    # Master's degree from India (ECA'd)
    edu = Education()
    edu.level = EducationLevel.MASTERS
    edu.country = "India"
    edu.is_canadian = False
    edu.is_three_year_or_more = True
    applicant.education = edu

    # 3 years Canadian work experience
    work = WorkExperience()
    work.noc_code = "21311"
    work.teer_level = TeerLevel.TEER_1
    work.experience_type = ExperienceType.CANADIAN
    work.start_date = date(2021, 1, 1)
    work.end_date = date(2024, 1, 1)
    work.hours_per_week = 40
    applicant.work_experiences.append(work)

    # 3 years foreign work experience
    foreign_work = WorkExperience()
    foreign_work.noc_code = "21311"
    foreign_work.teer_level = TeerLevel.TEER_1
    foreign_work.experience_type = ExperienceType.FOREIGN
    foreign_work.start_date = date(2018, 1, 1)
    foreign_work.end_date = date(2021, 1, 1)
    foreign_work.hours_per_week = 40
    applicant.work_experiences.append(foreign_work)

    return applicant


def test_age_points_without_spouse(calculator):
    applicant = Applicant()
    applicant.date_of_birth = date(1994, 1, 1)  # age 30
    applicant.has_spouse = False
    applicant.language_tests = []
    applicant.work_experiences = []

    # Age 30 without spouse = 105 pts
    points = calculator._get_age_points(30, False)
    assert points == 105


def test_age_points_with_spouse(calculator):
    points = calculator._get_age_points(25, True)
    assert points == 100  # age 25 with spouse = 100


def test_age_over_44_is_zero(calculator):
    assert calculator._get_age_points(45, False) == 0
    assert calculator._get_age_points(60, True) == 0


def test_education_masters_without_spouse(calculator):
    edu = Education()
    edu.level = EducationLevel.MASTERS
    points = calculator._get_education_points(edu, False)
    assert points == 135


def test_education_phd_without_spouse(calculator):
    edu = Education()
    edu.level = EducationLevel.PHD
    points = calculator._get_education_points(edu, False)
    assert points == 150


def test_education_bachelors_with_spouse(calculator):
    edu = Education()
    edu.level = EducationLevel.BACHELORS
    points = calculator._get_education_points(edu, True)
    assert points == 112


def test_clb9_first_language_without_spouse(calculator):
    lang_test = LanguageTest()
    lang_test.clb_equivalent = ClbScores(speaking=9, listening=9, reading=9, writing=9)
    points = calculator._get_first_language_points(lang_test, False)
    # CLB 9 = 31 pts each skill, 4 skills = 124 pts
    assert points == 124


def test_no_language_test_returns_zero(calculator):
    points = calculator._get_first_language_points(None, False)
    assert points == 0


def test_canadian_work_3_years_without_spouse(calculator):
    points = calculator._get_canadian_work_points(3, False)
    assert points == 64


def test_canadian_work_5_years_capped(calculator):
    # 5+ years capped at 5
    points = calculator._get_canadian_work_points(5, False)
    assert points == 80


def test_strong_applicant_total_score(calculator, strong_applicant):
    score, breakdown = calculator.calculate(strong_applicant)
    # A masters + CLB9 + 3yr Canadian + 3yr foreign should be > 400
    assert score.total > 400
    assert score.total <= 1200  # never exceeds max


def test_provincial_nomination_adds_600(calculator, strong_applicant):
    strong_applicant.has_provincial_nomination = True
    score, breakdown = calculator.calculate(strong_applicant)
    assert breakdown.provincial_nomination == 600


def test_sibling_adds_15_points(calculator, strong_applicant):
    strong_applicant.has_sibling_in_canada = True
    score, breakdown = calculator.calculate(strong_applicant)
    assert breakdown.sibling == 15


def test_skill_transferability_capped_at_100(calculator, strong_applicant):
    score, breakdown = calculator.calculate(strong_applicant)
    assert breakdown.transferability_total <= 100


def test_ielts_to_clb_conversion(calculator):
    lang_test = LanguageTest()
    lang_test.test_type = LanguageTestType.IELTS
    lang_test.speaking = 7.5
    lang_test.listening = 8.5
    lang_test.reading = 7.0
    lang_test.writing = 7.0

    clb = calculator.convert_to_clb(lang_test)
    assert clb.speaking == 9    # 7.5 IELTS speaking = CLB 9
    assert clb.listening == 9   # 8.5 IELTS listening = CLB 9
    assert clb.reading == 8     # 7.0 IELTS reading = CLB 8
    assert clb.writing == 8     # 7.0 IELTS writing = CLB 8


def test_fsw_eligibility_with_valid_profile(calculator, strong_applicant):
    result = calculator.check_eligibility(strong_applicant)
    from core.domain.models import ApplicationProgram
    assert ApplicationProgram.FSW in result["eligible_programs"]


def test_cec_eligibility_with_canadian_experience(calculator, strong_applicant):
    result = calculator.check_eligibility(strong_applicant)
    from core.domain.models import ApplicationProgram
    assert ApplicationProgram.CEC in result["eligible_programs"]


def test_no_eligibility_without_language_test(calculator):
    applicant = Applicant()
    applicant.date_of_birth = date(1990, 1, 1)
    applicant.has_spouse = False

    work = WorkExperience()
    work.teer_level = TeerLevel.TEER_1
    work.experience_type = ExperienceType.FOREIGN
    work.start_date = date(2020, 1, 1)
    work.end_date = date(2023, 1, 1)
    work.hours_per_week = 40
    applicant.work_experiences.append(work)

    result = calculator.check_eligibility(applicant)
    assert len(result["eligible_programs"]) == 0


def test_with_spouse_reduces_core_cap(calculator, strong_applicant):
    score_no_spouse, _ = calculator.calculate(strong_applicant)

    strong_applicant.has_spouse = True
    strong_applicant.spouse_profile = SpouseProfile(
        education_level=EducationLevel.BACHELORS,
        canadian_work_years=0
    )
    score_with_spouse, _ = calculator.calculate(strong_applicant)

    # Core max with spouse = 460 vs 500 without, but spouse adds up to 40
    assert score_no_spouse.core_human_capital <= 500
    assert score_with_spouse.core_human_capital <= 460


def test_french_bonus_with_secondary_english(calculator):
    applicant = Applicant()
    applicant.date_of_birth = date(1990, 1, 1)
    applicant.has_spouse = False
    applicant.has_provincial_nomination = False
    applicant.has_sibling_in_canada = False
    applicant.work_experiences = []

    edu = Education()
    edu.level = EducationLevel.BACHELORS
    edu.is_canadian = False
    applicant.education = edu

    # French primary language CLB 9
    french_test = LanguageTest()
    french_test.test_type = LanguageTestType.TEF
    french_test.role = LanguageRole.FIRST
    french_test.language = "french"
    french_test.test_date = date.today()
    french_test.clb_equivalent = ClbScores(speaking=9, listening=9, reading=9, writing=9)
    applicant.language_tests.append(french_test)

    # English secondary CLB 5
    english_test = LanguageTest()
    english_test.test_type = LanguageTestType.IELTS
    english_test.role = LanguageRole.SECOND
    english_test.language = "english"
    english_test.test_date = date.today()
    english_test.clb_equivalent = ClbScores(speaking=5, listening=5, reading=5, writing=5)
    applicant.language_tests.append(english_test)

    score, breakdown = calculator.calculate(applicant)
    assert breakdown.french_language == 50  # Both languages = 50 pts

"""
test_document_review.py
Run from backend directory:
    PYTHONPATH=. python workers/test_document_review.py

Tests the _normalise_value and _filter_mismatches functions
covering every edge case so we never need to upload a document
to find out if the logic works.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the functions directly
from infrastructure.ai.ai_services import _normalise_value, _filter_mismatches

# ── Test runner ───────────────────────────────────────────────────
passed = 0
failed = 0

def check(label, got, expected):
    global passed, failed
    if got == expected:
        print(f"  ✅  {label}")
        passed += 1
    else:
        print(f"  ❌  {label}")
        print(f"       got:      {got!r}")
        print(f"       expected: {expected!r}")
        failed += 1

def section(title):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")

# ════════════════════════════════════════════════════════════════
# SECTION 1 — Date normalisation
# ════════════════════════════════════════════════════════════════
section("DATE NORMALISATION")

check("ISO date unchanged",                   _normalise_value("1986-08-15"),        "1986-08-15")
check("DD/MM/YYYY format",                    _normalise_value("15/08/1986"),        "1986-08-15")
check("MM/DD/YYYY format",                    _normalise_value("08/15/1986"),        "1986-08-15")
check("Long month name",                      _normalise_value("15 August 1986"),    "1986-08-15")
check("Short month name",                     _normalise_value("Aug 15, 1986"),      "1986-08-15")
check("All caps month",                       _normalise_value("15 AUG 1986"),       "1986-08-15")
check("Dot separator DD.MM.YYYY",             _normalise_value("15.08.1986"),        "1986-08-15")
check("No separator DDMMYYYY not date",       _normalise_value("15081986"),          "15081986")  # not parsed as date
check("Expiry date future",                   _normalise_value("2029-03-20"),        "2029-03-20")
check("Date with time stripped",              _normalise_value("1986-08-15T00:00"),  "1986-08-15")

# ════════════════════════════════════════════════════════════════
# SECTION 2 — Nationality vs country normalisation
# ════════════════════════════════════════════════════════════════
section("NATIONALITY ↔ COUNTRY NAME")

check("Indian → india",        _normalise_value("Indian"),       "india")
check("india unchanged",       _normalise_value("India"),        "india")
check("INDIAN uppercase",      _normalise_value("INDIAN"),       "india")
check("Pakistani → pakistan",  _normalise_value("Pakistani"),    "pakistan")
check("Chinese → china",       _normalise_value("Chinese"),      "china")
check("Filipino → philippines",_normalise_value("Filipino"),     "philippines")
check("British → united kingdom", _normalise_value("British"),   "united kingdom")
check("American → united states", _normalise_value("American"),  "united states")
check("Bangladeshi → bangladesh", _normalise_value("Bangladeshi"), "bangladesh")
check("Nepali → nepal",        _normalise_value("Nepali"),       "nepal")

# ════════════════════════════════════════════════════════════════
# SECTION 3 — Name normalisation
# ════════════════════════════════════════════════════════════════
section("NAME NORMALISATION")

check("Same name different case",
      _normalise_value("RAHUL ARORA"), _normalise_value("Rahul Arora"))

check("Passport MRZ order (surname first)",
      _normalise_value("ARORA RAHUL"), _normalise_value("Rahul Arora"))

check("Extra spaces",
      _normalise_value("Rahul  Arora"), _normalise_value("Rahul Arora"))

check("Three word name same order",
      _normalise_value("RAHUL DEV ARORA"), _normalise_value("Rahul Dev Arora"))

check("Three word name MRZ order",
      _normalise_value("ARORA RAHUL DEV"), _normalise_value("Rahul Dev Arora"))

# These SHOULD be different (genuine mismatches)
check("Different surname is NOT equal",
      _normalise_value("Rahul Dev") == _normalise_value("Rahul Arora"), False)

check("Different first name is NOT equal",
      _normalise_value("Rahul Arora") == _normalise_value("Rohit Arora"), False)

check("Completely different name is NOT equal",
      _normalise_value("John Smith") == _normalise_value("Rahul Arora"), False)

# ════════════════════════════════════════════════════════════════
# SECTION 4 — _filter_mismatches: should KEEP (real mismatches)
# ════════════════════════════════════════════════════════════════
section("FILTER — SHOULD KEEP (genuine mismatches)")

real_name_mismatch = [{
    "field": "Full Name",
    "profile_value": "Rahul Arora",
    "document_value": "Rahul Dev",
    "severity": "critical",
    "note": "Surname differs"
}]
result = _filter_mismatches(real_name_mismatch)
check("Rahul Arora vs Rahul Dev → kept",     len(result), 1)

real_dob_mismatch = [{
    "field": "Date of Birth",
    "profile_value": "1986-08-15",
    "document_value": "1990-03-22",
    "severity": "critical",
    "note": "DOB differs"
}]
result = _filter_mismatches(real_dob_mismatch)
check("Different DOB → kept",                len(result), 1)

real_score_mismatch = [{
    "field": "IELTS Listening Score",
    "profile_value": "7.5",
    "document_value": "7.0",
    "severity": "critical",
    "note": "Score differs"
}]
result = _filter_mismatches(real_score_mismatch)
check("IELTS 7.5 vs 7.0 → kept",            len(result), 1)

real_employer_mismatch = [{
    "field": "Employer Name",
    "profile_value": "Infosys",
    "document_value": "TCS",
    "severity": "warning",
    "note": "Employer differs"
}]
result = _filter_mismatches(real_employer_mismatch)
check("Infosys vs TCS → kept",              len(result), 1)

# ════════════════════════════════════════════════════════════════
# SECTION 5 — _filter_mismatches: should DROP (false positives)
# ════════════════════════════════════════════════════════════════
section("FILTER — SHOULD DROP (false positives)")

false_date_format = [{
    "field": "Date of Birth",
    "profile_value": "1986-08-15",
    "document_value": "15/08/1986",
    "severity": "warning",
    "note": "Different date format"
}]
result = _filter_mismatches(false_date_format)
check("Same date, different format → dropped",   len(result), 0)

false_date_long = [{
    "field": "Date of Birth",
    "profile_value": "1986-08-15",
    "document_value": "15 August 1986",
    "severity": "warning",
    "note": ""
}]
result = _filter_mismatches(false_date_long)
check("ISO vs long date format → dropped",       len(result), 0)

false_nationality = [{
    "field": "Nationality",
    "profile_value": "India",
    "document_value": "Indian",
    "severity": "warning",
    "note": ""
}]
result = _filter_mismatches(false_nationality)
check("India vs Indian → dropped",              len(result), 0)

false_name_case = [{
    "field": "Full Name",
    "profile_value": "Rahul Arora",
    "document_value": "RAHUL ARORA",
    "severity": "warning",
    "note": "Case difference"
}]
result = _filter_mismatches(false_name_case)
check("Rahul Arora vs RAHUL ARORA → dropped",   len(result), 0)

false_name_order = [{
    "field": "Full Name",
    "profile_value": "Rahul Arora",
    "document_value": "ARORA RAHUL",
    "severity": "warning",
    "note": "Passport MRZ order"
}]
result = _filter_mismatches(false_name_order)
check("Rahul Arora vs ARORA RAHUL → dropped",   len(result), 0)

false_pakistani = [{
    "field": "Nationality",
    "profile_value": "Pakistan",
    "document_value": "Pakistani",
    "severity": "warning",
    "note": ""
}]
result = _filter_mismatches(false_pakistani)
check("Pakistan vs Pakistani → dropped",        len(result), 0)

# ════════════════════════════════════════════════════════════════
# SECTION 6 — Mixed batch (some real, some false)
# ════════════════════════════════════════════════════════════════
section("MIXED BATCH")

mixed = [
    {"field": "Full Name",        "profile_value": "Rahul Arora",  "document_value": "ARORA RAHUL",   "severity": "warning", "note": ""},  # false → drop
    {"field": "Date of Birth",    "profile_value": "1986-08-15",   "document_value": "15/08/1986",    "severity": "warning", "note": ""},  # false → drop
    {"field": "Nationality",      "profile_value": "India",        "document_value": "Indian",        "severity": "warning", "note": ""},  # false → drop
    {"field": "Full Name",        "profile_value": "Rahul Arora",  "document_value": "Rahul Dev",     "severity": "critical","note": ""},  # REAL  → keep
    {"field": "Date of Birth",    "profile_value": "1986-08-15",   "document_value": "1990-03-22",    "severity": "critical","note": ""},  # REAL  → keep
    {"field": "Passport Number",  "profile_value": "A1234567",     "document_value": "B9999999",      "severity": "critical","note": ""},  # REAL  → keep
]
result = _filter_mismatches(mixed)
check("Mixed: 3 false + 3 real → 3 kept",  len(result), 3)
check("Real name mismatch in results",
      any(m["field"] == "Full Name" and "Dev" in m["document_value"] for m in result), True)
check("False nationality NOT in results",
      not any(m["field"] == "Nationality" for m in result), True)
check("False date format NOT in results",
      not any(m["field"] == "Date of Birth" and m["document_value"] == "15/08/1986" for m in result), True)

# ════════════════════════════════════════════════════════════════
# SECTION 7 — Edge cases
# ════════════════════════════════════════════════════════════════
section("EDGE CASES")

check("Empty list",          _filter_mismatches([]),   [])
check("None returns empty",  _filter_mismatches(None), [])
check("Empty strings normalise to empty", _normalise_value(""), "")
check("None normalises to empty",         _normalise_value(None) if hasattr(_normalise_value, '__call__') else _normalise_value(""), "")

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════
print(f"\n{'═'*60}")
print(f"  Results: {passed} passed, {failed} failed out of {passed+failed} tests")
print(f"{'═'*60}\n")

if failed > 0:
    sys.exit(1)

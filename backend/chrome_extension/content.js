// content.js — EE Autofill for IRCC Express Entry (complete end-to-end)
// Covers: wizard pages (questionId-based) + profile builder (eeForm)

;(function () {
  if (window.__EE_AUTOFILL_INJECTED__) return
  window.__EE_AUTOFILL_INJECTED__ = true

  function log(msg, data) { console.log(`[EE Autofill] ${msg}`, data || '') }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  // ── Core setter ─────────────────────────────────────────────────
  function setVal(el, value) {
    if (!el || value === undefined || value === null || value === '') return false
    if (el.disabled || el.readOnly) return false
    try {
      if (el.tagName === 'SELECT') {
        const opts = Array.from(el.options)
        const strVal = String(value)
        const match = opts.find(o => o.value === strVal)
          || opts.find(o => o.text.trim().toLowerCase() === strVal.toLowerCase())
          || opts.find(o => o.text.trim().toLowerCase().includes(strVal.toLowerCase()))
        if (!match) { log(`No option match for "${value}" in #${el.id || el.name}`); return false }
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
        if (setter) setter.call(el, match.value); else el.value = match.value
      } else if (el.type === 'checkbox') {
        el.checked = !!value
      } else {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(el, value); else el.value = value
      }
      el.dispatchEvent(new Event('input',  { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('blur',   { bubbles: true }))
      return true
    } catch(e) { log('setVal error', e); return false }
  }

  // answerList fields by index (wizard pages)
  function answerEl(index) {
    return document.getElementById(`answerlist[${index}]`)
      || document.querySelector(`[name="answerList[${index}].value"]`)
  }

  function checkboxEl(value) {
    return document.querySelector(`input[type="checkbox"][value="${value}"]`)
  }

  // ── Year/month/day IRCC lookup tables ───────────────────────────
  // Years: 2026=4378, 2025=4377 ... step back by 1 each year from 4378
  function yearCode(year) {
    const base = 4378; const baseYear = 2026
    const diff = baseYear - parseInt(year)
    if (diff < 0) return null
    if (diff <= 16) return String(base - diff)         // 2026–2010
    // older years have different codes
    const oldMap = {
      2009:2904, 2008:2903, 2007:990, 2006:989, 2005:988, 2004:987,
      2003:986,  2002:985,  2001:984, 2000:983, 1999:982, 1998:981,
      1997:980,  1996:979,  1995:978, 1994:977, 1993:976, 1992:975,
      1991:974,  1990:973,  1989:972, 1988:971, 1987:970, 1986:969,
      1985:968,  1984:967,  1983:966, 1982:965, 1981:964, 1980:963,
    }
    return oldMap[parseInt(year)] ? String(oldMap[parseInt(year)]) : null
  }

  const MONTH_CODES = {
    1:1819, 2:1818, 3:1822, 4:1827, 5:1823, 6:1821,
    7:1820, 8:1816, 9:1826, 10:1825, 11:1824, 12:1817
  }

  // Day codes: 01=547, 02=548 ... 31=577
  function dayCode(day) { return String(546 + parseInt(day)) }

  function fillDateFields(selects, year, month, day) {
    // selects = array of [yearEl, monthEl, dayEl]
    let filled = 0
    if (selects[0] && year)  { if (setVal(selects[0], yearCode(year)  || year))  filled++ }
    if (selects[1] && month) { if (setVal(selects[1], String(MONTH_CODES[parseInt(month)] || month))) filled++ }
    if (selects[2] && day)   { if (setVal(selects[2], dayCode(day)))              filled++ }
    return filled
  }

  // ── Province → IRCC code ─────────────────────────────────────────
  const PROVINCE_CODES = {
    'alberta': '2720', 'british columbia': '2721', 'bc': '2721',
    'manitoba': '2722', 'new brunswick': '2726', 'newfoundland': '2719',
    'newfoundland and labrador': '2719', 'northwest territories': '2727',
    'nova scotia': '2725', 'nunavut': '2735', 'ontario': '2731',
    'on': '2731', 'prince edward island': '2730', 'pei': '2730',
    'quebec': '2732', 'saskatchewan': '2733', 'yukon': '2734',
  }

  // Language test → IRCC code
  const LANG_TEST_CODES = {
    'ielts': '12965', 'celpip': '12966', 'tef': '12967',
    'tcf': '19637', 'pearson': '376461', 'none': '12964',
  }

  // IELTS score → IRCC code (same for all 4 skills)
  const IELTS_SCORE_CODES = {
    '9': '13124', '8.5': '13125', '8': '13126', '7.5': '13127',
    '7': '13128', '6.5': '13129', '6': '13130', '5.5': '13148',
    '5': '13149', '4.5': '13150', '4': '13151', '3.5': '13152',
    '3': '13153',
  }

  // Marital status → IRCC code
  const MARITAL_CODES = {
    'married': '2952', 'legally separated': '2951', 'separated': '2951',
    'divorced': '2953', 'annulled': '4678', 'widowed': '2954',
    'common-law': '2956', 'common_law': '2956', 'commonlaw': '2956',
    'single': '4677', 'never married': '4677', 'never married/single': '4677',
  }

  // Education level → IRCC code (question 1810)
  const EDUCATION_CODES = {
    'phd': '13167', 'doctorate': '13167',
    'masters': '13166', "master's": '13166', 'master': '13166',
    'bachelors': '13164', "bachelor's": '13164', 'bachelor': '13164',
    'two_year_diploma': '13163', 'two year': '13163',
    'one_year_diploma': '13162', 'one year': '13162',
    'high_school': '13161', 'secondary': '13161', 'high school': '13161',
    'less than secondary': '13160', 'none': '13160',
  }

  // Canadian work exp years → IRCC code (question 1794)
  const CAN_WORK_YEARS_CODES = {
    0: '12969', 'none': '12969',
    0.5: '12970', 'less': '12970', 'less than one year': '12970',
    1: '12971', 'one': '12971', 'one year or more': '12971',
  }

  // Foreign work exp years → IRCC code (question 1795)
  const FOREIGN_WORK_YEARS_CODES = {
    0: '12973', 'none': '12973',
    0.5: '12974', 'less than one': '12974',
    1: '12975', 'one': '12975',
    2: '12976', 'two': '12976', 'two to three': '12976',
    4: '12977', 'four': '12977', 'four to five': '12977',
    6: '12978', 'six': '12978', 'six or more': '12978',
  }

  // Gender → IRCC code
  const GENDER_CODES = {
    'male': '1000', 'm': '1000',
    'female': '1001', 'f': '1001',
    'unknown': '8249',
    'another gender': '21936', 'other': '21936',
  }

  // ── HARDCODED VALUES (replace with DB fields once added to profile) ──
  const HARDCODED = {
    province:              'Ontario',      // → update when DB field added
    gender:                'male',         // → update when DB field added
    canadian_work_years:   1,              // → calculate from work_experiences
    canadian_work_teer:    '374245',       // TEER 1 → update from noc_code
    foreign_work_years:    2,              // → calculate from work_experiences
    has_trades_experience: false,
    funds_range:           '13254',        // 40,392 or more → update when DB field added
    has_studied_canada:    false,          // → from education.is_canadian
    has_worked_canada:     true,           // → from work_experiences canadian
    has_relative_canada:   false,          // → from has_sibling_in_canada
  }

  // ── Page detection ───────────────────────────────────────────────
  function detectPage() {
    const url  = window.location.href
    const path = new URL(url).pathname

    // Wizard pages — /eapp/eapp
    if (path.includes('/eapp/eapp')) {
      const qId = document.getElementById('currentQuestionId')?.value
      if (qId) return { type: 'wizard', questionId: qId }
      return { type: 'wizard', questionId: null }
    }

    // Results page
    if (url.includes('expressEntryEligibilityResult')) {
      return { type: 'results' }
    }

    // Application checklist page
    if (url.includes('applicationChecklist')) {
      return { type: 'checklist' }
    }

    // Profile builder — /eapp/eeForm
    if (path.includes('/eapp/eeForm')) {
      const section = new URL(url).searchParams.get('section') || ''
      return { type: 'profile', section }
    }

    return { type: 'unknown' }
  }

  // ── WIZARD FILLERS (one per questionId) ─────────────────────────

  async function fillQ1791_province(p) {
    // Province to live in
    const province = (p.hardcoded?.province || HARDCODED.province).toLowerCase()
    const code = PROVINCE_CODES[province] || '2731' // default Ontario
    const el = answerEl(0)
    return el && setVal(el, code) ? 1 : 0
  }

  async function fillQ1792_langTest(p) {
    // First official language test
    const testType = (p.language?.first_language_test || 'ielts').toLowerCase()
    const code = LANG_TEST_CODES[testType] || '12965'
    const el = answerEl(0)
      || document.querySelector('select:not([disabled])')
    return el && setVal(el, code) ? 1 : 0
  }

  async function fillQ1822_testDate(p) {
    // Language test date — 3 selects (year, month, day)
    const dateStr = p.language?.test_date || ''
    if (!dateStr) return 0
    const d = new Date(dateStr)
    const selects = document.querySelectorAll('select')
    if (selects.length < 3) return 0
    // Selects order: year (answerList[3]), month (answerList[5]), day (answerList[6])
    // But we just pick the 3 selects by position after hidden fields
    const visibleSelects = Array.from(selects).filter(s => !s.disabled)
    return fillDateFields(
      [visibleSelects[0], visibleSelects[1], visibleSelects[2]],
      d.getFullYear(), d.getMonth() + 1, d.getDate()
    )
  }

  async function fillQ1816_scores(p) {
    // IELTS scores — 4 selects: speaking, listening, reading, writing
    // IRCC uses answerList[1],[2],[4],[6] — skip index 3 and 5 (labels/hidden)
    // Safest: grab all visible selects that have the IELTS score options
    const lang = p.language
    if (!lang) return 0

    function normalizeScore(s) {
      const str = String(s || '').trim()
      return str.endsWith('.0') ? str.slice(0, -2) : str
    }

    // Map score to IRCC code
    function scoreCode(s) {
      const norm = normalizeScore(s)
      return IELTS_SCORE_CODES[norm] || norm
    }

    // Find selects that contain IELTS score options (value 13124 = 9)
    const scoreSelects = Array.from(document.querySelectorAll('select'))
      .filter(s => !s.disabled && Array.from(s.options).some(o => o.value === '13124'))

    const scores = [
      lang.speaking_score,
      lang.listening_score,
      lang.reading_score,
      lang.writing_score,
    ]

    let filled = 0
    for (let i = 0; i < Math.min(scores.length, scoreSelects.length); i++) {
      if (setVal(scoreSelects[i], scoreCode(scores[i]))) filled++
      await sleep(80)
    }
    return filled
  }

  async function fillQ1793_secondLang(p) {
    // Second official language — default None
    const el = answerEl(0)
      || document.querySelector('select:not([disabled])')
    return el && setVal(el, '12964') ? 1 : 0  // None
  }

  async function fillQ1794_canadianWork(p) {
    // Canadian work experience: years + TEER
    let filled = 0
    const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled)

    // Work out years from DB
    const canExp = (p.work_history || []).filter(w => w.country === 'Canada')
    let years = HARDCODED.canadian_work_years
    if (canExp.length > 0) {
      // rough: count total months / 12
      const months = canExp.reduce((acc, w) => {
        const start = w.start_year ? new Date(`${w.start_year}-${w.start_month || '01'}-01`) : null
        const end   = w.end_year && w.end_year !== 'Present' ? new Date(`${w.end_year}-${w.end_month || '01'}-01`) : new Date()
        if (!start) return acc
        return acc + (end - start) / (1000*60*60*24*30)
      }, 0)
      years = months >= 12 ? 1 : 0
    }

    const yearsCode = years >= 1 ? '12971' : years > 0 ? '12970' : '12969'
    if (selects[0] && setVal(selects[0], yearsCode)) filled++

    // TEER — hardcoded for now, derive from NOC later
    const teerCode = HARDCODED.canadian_work_teer
    if (selects[1] && setVal(selects[1], teerCode)) filled++

    return filled
  }

  async function fillQ1795_foreignWork(p) {
    // Foreign work experience: years + trades
    let filled = 0
    const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled)

    const foreignExp = (p.work_history || []).filter(w => w.country !== 'Canada')
    let years = HARDCODED.foreign_work_years
    if (foreignExp.length > 0) {
      const months = foreignExp.reduce((acc, w) => {
        const start = w.start_year ? new Date(`${w.start_year}-${w.start_month || '01'}-01`) : null
        const end   = w.end_year && w.end_year !== 'Present' ? new Date(`${w.end_year}-${w.end_month || '01'}-01`) : new Date()
        if (!start) return acc
        return acc + (end - start) / (1000*60*60*24*30)
      }, 0)
      if (months >= 72) years = 6
      else if (months >= 48) years = 4
      else if (months >= 24) years = 2
      else if (months >= 12) years = 1
      else if (months > 0)   years = 0.5
      else years = 0
    }

    const yearsKey = years >= 6 ? '12978' : years >= 4 ? '12977' : years >= 2 ? '12976'
                   : years >= 1 ? '12975' : years > 0  ? '12974' : '12973'
    if (selects[0] && setVal(selects[0], yearsKey)) filled++

    // Trades experience — default None
    if (selects[1] && setVal(selects[1], '12979')) filled++  // None < 2 years

    return filled
  }

  async function fillQ1797_fundsFamilyMembers(p) {
    // Funds range + family members count
    let filled = 0
    const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled)

    // Funds — hardcoded (not in DB yet)
    const fundsCode = HARDCODED.funds_range
    if (selects[0] && setVal(selects[0], fundsCode)) filled++

    // Family members
    const count  = p.family_members_count || 1
    // IRCC codes: 1=13239, 2=13240, 3=13241, 4=13242, 5=13243, 6=13244, 7=13245, >7=13246
    const famCode = count <= 7 ? String(13238 + count) : '13246'
    if (selects[1] && setVal(selects[1], famCode)) filled++

    return filled
  }

  async function fillQ1798_jobOffer(p) {
    // Job offer Yes/No
    const hasOffer = !!(p.adaptability?.has_job_offer === 'True' || p.adaptability?.has_job_offer === true)
    const el = answerEl(0)
    return el && setVal(el, hasOffer ? '991' : '997') ? 1 : 0
  }

  async function fillQ1810_dobEducation(p) {
    // Date of birth (3 date selects) + education level (1 select)
    let filled = 0
    const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled)

    // DOB
    const dob = p.personal
    if (dob?.dob_year && selects.length >= 3) {
      filled += fillDateFields(
        [selects[0], selects[1], selects[2]],
        dob.dob_year, dob.dob_month, dob.dob_day
      )
    }

    // Education level
    const eduLevel = (p.education?.highest_level || '').toLowerCase().replace(/_/g, ' ')
    const eduCode  = EDUCATION_CODES[eduLevel] || '13164' // default bachelor
    if (selects[3] && setVal(selects[3], eduCode)) filled++

    return filled
  }

  async function fillQ1811_checkboxes(p) {
    // 4 checkboxes: studied in Canada, worked in Canada, relative in Canada, none
    let filled = 0

    const studiedCanada = p.education?.is_canadian === 'True' || HARDCODED.has_studied_canada
    const workedCanada  = (p.work_history || []).some(w => w.country === 'Canada') || HARDCODED.has_worked_canada
    const relativeCA    = p.adaptability?.has_sibling === 'True' || HARDCODED.has_relative_canada

    const noneApply = !studiedCanada && !workedCanada && !relativeCA

    if (noneApply) {
      const el = checkboxEl('14769')
      if (el && setVal(el, true)) filled++
    } else {
      if (studiedCanada) { const el = checkboxEl('13261'); if (el && setVal(el, true)) filled++ }
      if (workedCanada)  { const el = checkboxEl('13262'); if (el && setVal(el, true)) filled++ }
      if (relativeCA)    { const el = checkboxEl('13263'); if (el && setVal(el, true)) filled++ }
    }

    return filled
  }

  async function fillQ1812_maritalStatus(p) {
    const status = (p.personal?.marital_status || 'single').toLowerCase().replace(/[_]/g, ' ')
    const code   = MARITAL_CODES[status] || '4677'
    const el     = answerEl(0)
    return el && setVal(el, code) ? 1 : 0
  }

  async function fillQ1778_nameGenderDob(p) {
    // Phase 3 — name, gender, DOB (before they get locked)
    let filled = 0
    const personal = p.personal

    // Last name (answerlist[1] text)
    const lastEl = document.querySelector('[name="answerList[1].value"]')
      || document.getElementById('answerlist[1]')
    if (lastEl && personal?.family_name && setVal(lastEl, personal.family_name)) filled++

    // First name (answerlist[2] text)
    const firstEl = document.querySelector('[name="answerList[2].value"]')
      || document.getElementById('answerlist[2]')
    if (firstEl && personal?.given_name && setVal(firstEl, personal.given_name)) filled++

    // All selects (not disabled) — gender + year + month + day
    const selects = Array.from(document.querySelectorAll('select')).filter(s => !s.disabled)

    // Gender from DB
    const gender = (p.personal?.gender || HARDCODED.gender || 'male').toLowerCase()
    const genderCode = GENDER_CODES[gender] || '1000'
    if (selects[0] && setVal(selects[0], genderCode)) filled++

    // DOB (next 3 selects)
    if (personal?.dob_year) {
      filled += fillDateFields(
        [selects[1], selects[2], selects[3]],
        personal.dob_year, personal.dob_month, personal.dob_day
      )
    }

    return filled
  }


  // ── Accompany question (wizard page) ───────────────────────────
  async function fillQ_accompany(p) {
    // answerlist[0] = Will this person accompany you to Canada?
    const el = document.getElementById('answerlist[0]')
    if (!el) return 0
    return setVal(el, '991') ? 1 : 0  // '991' = Yes
  }

  // ── Spouse info wizard page ─────────────────────────────────────
  // answerlist[1]=last name, [2]=first name, [3]=gender, [5]=dob year, [6]=month, [7]=day
  async function fillQ_spouseInfo(p) {
    const spouse = p.spouse
    if (!spouse) { log('No spouse data'); return 0 }
    let filled = 0

    const lastEl   = document.getElementById('answerlist[1]')
    const firstEl  = document.getElementById('answerlist[2]')
    const genderEl = document.getElementById('answerlist[3]')
    const dobYrEl  = document.getElementById('answerlist[5]')
    const dobMoEl  = document.getElementById('answerlist[6]')
    const dobDyEl  = document.getElementById('answerlist[7]')

    if (lastEl  && spouse.family_name && setVal(lastEl,  spouse.family_name)) filled++
    if (firstEl && spouse.given_name  && setVal(firstEl, spouse.given_name))  filled++

    if (genderEl && spouse.gender) {
      const gc = GENDER_CODES[(spouse.gender).toLowerCase()] || '8249'
      if (setVal(genderEl, gc)) filled++
    }

    if (spouse.dob_year) {
      filled += fillDateFields(
        [dobYrEl, dobMoEl, dobDyEl],
        spouse.dob_year, spouse.dob_month, spouse.dob_day
      )
    }

    log(`fillQ_spouseInfo: ${filled} fields`)
    return filled
  }

  // ── WIZARD DISPATCHER ────────────────────────────────────────────
  const WIZARD_FILLERS = {
    '1791': fillQ1791_province,
    '1792': fillQ1792_langTest,
    '1822': fillQ1822_testDate,
    '1816': fillQ1816_scores,
    '1793': fillQ1793_secondLang,
    '1794': fillQ1794_canadianWork,
    '1795': fillQ1795_foreignWork,
    '1797': fillQ1797_fundsFamilyMembers,
    '1798': fillQ1798_jobOffer,
    '1810': fillQ1810_dobEducation,
    '1811': fillQ1811_checkboxes,
    '1812': fillQ1812_maritalStatus,
    '1784': fillQ1812_maritalStatus,  // same question, different ID path
    '1778': fillQ1778_nameGenderDob,
  }

  // ── PROFILE FORM FILLERS (eeForm?section=...) ────────────────────

  function $ (id) { return document.getElementById(id) }

  async function fillProfilePersonalInfo(p) {
    const personal = p.personal
    let filled = 0

    // familyName + givenName may be locked (disabled) — setVal handles that gracefully
    if (setVal($('familyName'), personal?.family_name)) filled++
    if (setVal($('givenName'),  personal?.given_name))  filled++

    // Gender — profile builder uses plain text options like "Male"/"Female"
    const genderText = (p.personal?.gender || HARDCODED.gender || 'male')
    const genderDisplay = genderText.charAt(0).toUpperCase() + genderText.slice(1).toLowerCase()
    if (setVal($('gender'), genderDisplay)) filled++

    // DOB — profile builder uses plain year/month/day numbers (not IRCC codes)
    if (setVal($('dateOfBirth-year'),  personal?.dob_year))  filled++
    if (setVal($('dateOfBirth-month'), personal?.dob_month)) filled++
    if (setVal($('dateOfBirth-day'),   personal?.dob_day))   filled++

    // Country of birth — text match
    if (setVal($('countryOfBirth'), personal?.country_of_birth)) filled++

    // City of birth
    if (personal?.city_of_birth && setVal($('cityOfBirth'), personal.city_of_birth)) filled++

    // Marital status — try plain text first, then code
    const msRaw = (personal?.marital_status || 'single').toLowerCase().replace(/_/g,' ')
    const msDisplay = msRaw.charAt(0).toUpperCase() + msRaw.slice(1)
    const msCode = MARITAL_CODES[msRaw] || '4677'
    if (!setVal($('currentMaritalStatus'), msDisplay)) setVal($('currentMaritalStatus'), msCode)
    filled++

    // Has travel document → Yes
    if (!setVal($('hasTravelDocument'), 'Yes')) setVal($('hasTravelDocument'), '991')
    filled++; await sleep(600)  // Wait for passport fields to appear dynamically

    // ── Passport fields — confirmed IDs from dump ──
    // documentType, documentNumber, countryOfIssue, issueDate-*, expiryDate-*
    // All have no name attribute — id only
    const passport = p.passport || {}

    // Document type → Passport
    if (setVal($('documentType'), 'Passport')) filled++

    // Document number
    if (passport.document_number && setVal($('documentNumber'), passport.document_number)) filled++

    // Country of issue
    if (passport.country_of_issue && setVal($('countryOfIssue'), passport.country_of_issue)) filled++

    // Issue date — SELECT, plain year/month/day numbers
    if (passport.issue_date) {
      const id = new Date(passport.issue_date)
      if (setVal($('issueDate-year'),  String(id.getFullYear()))) filled++
      if (setVal($('issueDate-month'), String(id.getMonth()+1)))  filled++
      if (setVal($('issueDate-day'),   String(id.getDate())))     filled++
    }

    // Expiry date
    if (passport.expiry_date) {
      const ed = new Date(passport.expiry_date)
      if (setVal($('expiryDate-year'),  String(ed.getFullYear()))) filled++
      if (setVal($('expiryDate-month'), String(ed.getMonth()+1)))  filled++
      if (setVal($('expiryDate-day'),   String(ed.getDate())))     filled++
    }

    // Save passport record — confirmed button id
    await sleep(300)
    const savePassportBtn = $('saveAndAddBtn-personalIdentification_idDocuments-travelDocumentContent')
    if (savePassportBtn) { savePassportBtn.click(); await sleep(600); filled++ }

    // Has another gov document → No
    if (!setVal($('hasAnotherGovDocument'), 'No')) setVal($('hasAnotherGovDocument'), '997')
    filled++

    // Has applied to IRCC before → No
    if (!setVal($('hasAppliedToCitBefore'), 'No')) setVal($('hasAppliedToCitBefore'), '997')
    filled++

    // Country of citizenship
    if (setVal($('immigrationDetails_countriesOfCit_countryOfCitizenship_1'), personal?.country_of_citizenship)) filled++

    // Country of residence
    if (setVal($('countryOfResidence'), personal?.country_of_residence || personal?.country_of_citizenship)) filled++

    // Family members count — try plain number first
    const fmCount = p.family_members_count || 1
    if (!setVal($('familyMembersCount'), String(fmCount))) {
      setVal($('familyMembersCount'), String(13238 + Math.min(fmCount, 7)))
    }
    filled++

    // Has relatives in Canada
    const hasRel = p.adaptability?.has_sibling === 'True' || HARDCODED.has_relative_canada
    const relVal = hasRel ? 'Yes' : 'No'
    if (!setVal($('hasRelativesInCanada'), relVal)) setVal($('hasRelativesInCanada'), hasRel ? '991' : '997')
    filled++

    log(`fillPersonalDetails: ${filled} fields`)
    return filled
  }

  async function fillProfileContactDetails(p) {
    let filled = 0

    // Service language → English
    if (setVal($('serviceLanguage'), 'English')) filled++

    // Email from profile
    // Note: email comes from the user object — ircc-ready endpoint should include it
    const email = p.email || p.personal?.email || ''
    if (email && setVal($('emailAddress'), email)) filled++

    log(`fillContactDetails: ${filled} fields`)
    return filled
  }

  async function fillProfileLanguages(p) {
    const lang = p.language
    const edu  = p.education
    let filled = 0

    // ── Education part (top of languages page) ──
    const hasEdu = !!(edu?.highest_level)
    // hasEducation: try plain text (profile builder)
    if (!setVal($('hasEducation'), hasEdu ? 'Yes' : 'No')) {
      setVal($('hasEducation'), hasEdu ? '991' : '997')
    }
    filled++; await sleep(400)

    if (hasEdu) {
      // Field of study — SELECT (text match against IRCC options)
      if (edu?.field_of_study) {
        if (!setVal($('fieldOfStudy'), edu.field_of_study)) {
          // Log all options so we can see what IRCC actually uses
          const opts = Array.from($('fieldOfStudy')?.options||[]).map(o=>o.text+'|'+o.value)
          log('fieldOfStudy options (first 20):', opts.slice(0,20).join(' | '))
          // Try partial match on common terms
          const fos = edu.field_of_study.toLowerCase()
          const fosEl = $('fieldOfStudy')
          if (fosEl) {
            const match = Array.from(fosEl.options).find(o =>
              o.text.toLowerCase().includes(fos.split(' ')[0]) ||
              fos.includes(o.text.toLowerCase().split(' ')[0])
            )
            if (match) setVal(fosEl, match.value)
          }
        }
        filled++
      }

      // Study FROM date — use DB value or compute from degree type
      const degreeYears = {
        'phd':3, 'doctorate':3, 'masters':2, "master's":2, 'master':2,
        'bachelors':4, "bachelor's":4, 'bachelor':4,
        'two_year_diploma':2, 'one_year_diploma':1, 'high_school':4,
      }
      const degType = (edu?.highest_level || '').toLowerCase().replace(/_/g,' ')
      const defaultDuration = degreeYears[degType] || 2
      let studyFromYear = edu?.study_from_year
      if (!studyFromYear && edu?.completion_year) {
        studyFromYear = String(parseInt(edu.completion_year) - defaultDuration)
      }
      if (!studyFromYear) {
        studyFromYear = String(new Date().getFullYear() - defaultDuration)
      }
      if (setVal($('studyFromDate-year'),  studyFromYear)) filled++
      if (setVal($('studyFromDate-month'), edu?.study_from_month || '9')) filled++

      // Study TO date
      if (edu?.completion_year) {
        if (setVal($('studyToDate-year'),  edu.completion_year)) filled++
        if (setVal($('studyToDate-month'), edu?.completion_month || '6')) filled++
      }

      // Is study ongoing → No
      if (!setVal($('isStudyOngoing'), 'No')) setVal($('isStudyOngoing'), '997')
      filled++

      // Complete years — use DB value; Masters=2, Bachelor=4, Diploma=1 or 2
      const completeYears = edu?.full_academic_years || edu?.complete_years || String(defaultDuration)
      // completeYearsOfStudy might be text input or select — try both
      if (!setVal($('completeYearsOfStudy'), String(completeYears))) {
        // Try as text input directly
        const el = $('completeYearsOfStudy')
        if (el) { el.value = String(completeYears); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})) }
      }
      filled++

      // Enrollment — try multiple text variants IRCC uses
      const enrollRaw = (edu?.enrollment_status || 'full-time').toLowerCase()
      const enrollVariants = enrollRaw.includes('part') 
        ? ['Part-time', 'Part time', 'part-time', 'Part'] 
        : ['Full-time', 'Full time', 'full-time', 'Full']
      let enrollFilled = false
      for (const v of enrollVariants) { if (setVal($('enrollmentStatus'), v)) { enrollFilled = true; break } }
      if (!enrollFilled) {
        const opts = Array.from($('enrollmentStatus')?.options||[]).map(o=>o.text+'|'+o.value)
        log('enrollmentStatus options:', opts.join(', '))
      }
      filled++

      // Standing / end result — try multiple IRCC option text variants
      const standingRaw = (edu?.academic_standing || 'successfully completed').toLowerCase()
      const standingVariants = standingRaw.includes('fail') || standingRaw.includes('incomplete')
        ? ['Unsuccessful - did not complete', 'Did not complete', 'Incomplete', 'Unsuccessful']
        : ['Successfully completed', 'Successful - Completed', 'Completed successfully', 'Graduated', 'Completed']
      let standingFilled = false
      for (const v of standingVariants) { if (setVal($('endResult'), v)) { standingFilled = true; break } }
      if (!standingFilled) {
        const opts = Array.from($('endResult')?.options||[]).map(o=>o.text+'|'+o.value)
        log('endResult options:', opts.join(', '))
      }
      filled++

      // Country of study
      if (edu?.country_studied && setVal($('countryOfStudy'), edu.country_studied)) filled++

      // City of study — confirmed id: nonCanadianCityOfStudy
      const cityStudy = edu?.city_of_study || edu?.city || ''
      if (cityStudy) {
        const cityEl = $('nonCanadianCityOfStudy') || $('cityOfStudy') || $('canadianCityOfStudy')
        if (cityEl && setVal(cityEl, cityStudy)) filled++
      }

      // School name
      if (edu?.institution && setVal($('schoolName'), edu.institution)) filled++

      // Education level — SELECT, try multiple text variants (IRCC option text varies)
      const eduRaw = (edu?.highest_level || 'bachelors').toLowerCase().replace(/_/g,' ')
      // Try multiple possible IRCC option texts from most to least specific
      const eduVariantMap = {
        'phd':         ["Doctorate - Ph.D.", "Doctorate", "Ph.D", "PhD"],
        'doctorate':   ["Doctorate - Ph.D.", "Doctorate", "Ph.D", "PhD"],
        'masters':     ["Master's degree", "Masters degree", "Master degree", "Master's"],
        "master's":    ["Master's degree", "Masters degree", "Master degree", "Master's"],
        'master':      ["Master's degree", "Masters degree", "Master degree", "Master's"],
        'bachelors':   ["Bachelor's degree", "Bachelors degree", "Bachelor degree", "Bachelor's"],
        "bachelor's":  ["Bachelor's degree", "Bachelors degree", "Bachelor degree", "Bachelor's"],
        'bachelor':    ["Bachelor's degree", "Bachelors degree", "Bachelor degree", "Bachelor's"],
        'two year diploma': ["Two-year post-secondary", "2-year diploma", "Two year diploma", "Diploma - 2 year"],
        'two_year_diploma': ["Two-year post-secondary", "2-year diploma", "Two year diploma", "Diploma - 2 year"],
        'one year diploma': ["One-year post-secondary", "1-year diploma", "One year diploma", "Diploma - 1 year"],
        'one_year_diploma': ["One-year post-secondary", "1-year diploma", "One year diploma", "Diploma - 1 year"],
        'high school': ["Secondary school", "High school", "Secondary (high school)", "High School Diploma"],
        'high_school': ["Secondary school", "High school", "Secondary (high school)", "High School Diploma"],
      }
      const eduVariants = eduVariantMap[eduRaw] || [eduRaw]
      let eduFilled = false
      for (const v of eduVariants) { if (setVal($('educationLevel'), v)) { eduFilled = true; break } }
      if (!eduFilled) {
        const opts = Array.from($('educationLevel')?.options||[]).map(o=>o.text+'|'+o.value)
        log('educationLevel options:', opts.join(', '))
        // Last resort: IRCC numeric code
        const eduCode = EDUCATION_CODES[eduRaw] || '13164'
        setVal($('educationLevel'), eduCode)
      }
      filled++

      // Has Canadian degree
      const isCanadian = edu?.is_canadian === 'True'
      if (!setVal($('hasCanadianDegree'), isCanadian ? 'Yes' : 'No'))
        setVal($('hasCanadianDegree'), isCanadian ? '991' : '997')
      filled++

      // Has ECA equivalency — new field confirmed in dump
      // Only relevant for non-Canadian degrees; default to No unless DB says otherwise
      const hasEca = !!(edu?.eca_organization || edu?.eca_reference)
      await sleep(200)
      if (!setVal($('hasEcaEquivalency'), hasEca ? 'Yes' : 'No'))
        setVal($('hasEcaEquivalency'), hasEca ? '991' : '997')
      filled++

      // Save education record
      await sleep(300)
      const saveEduBtn = $('saveAndAddBtn-studyRecords-studyHistoryContent')
        || document.querySelector('[id*="saveAndAdd"][id*="stud"]')
        || document.querySelector('[id*="saveAndAdd"]')
      if (saveEduBtn) {
        saveEduBtn.click()
        await sleep(800)
        filled++
        log('Clicked Save and Add for education')
      }
    }

    // ── Language part ──
    // Official language ability → English
    if (setVal($('officialLanguageAbility'), 'English')) { filled++; await sleep(300) }

    // Taken English lang test → Yes
    if (!setVal($('takenEnglishLangTest'), 'Yes')) setVal($('takenEnglishLangTest'), '991')
    filled++; await sleep(400)

    // English test type → IELTS
    if (setVal($('englishLangTestType'), 'IELTS')) { filled++; await sleep(400) }

    // IELTS version → try both text and code
    if (!setVal($('englishLangTestVersionIELTS'), 'General Training')) {
      setVal($('englishLangTestVersionIELTS'), '13234')
    }
    filled++

    // Test date — plain year/month/day numbers
    if (lang?.test_date) {
      const d = new Date(lang.test_date)
      const yr = String(d.getFullYear())
      const mo = String(d.getMonth() + 1)
      const dy = String(d.getDate())
      if (setVal($('englishLangTestDate-year'),  yr)) filled++
      if (setVal($('englishLangTestDate-month'), mo)) filled++
      if (setVal($('englishLangTestDate-day'),   dy)) filled++
      // Result date = test date + 14 days
      const resultD = new Date(lang.test_date)
      resultD.setDate(resultD.getDate() + 14)
      const ryr = String(resultD.getFullYear())
      const rmo = String(resultD.getMonth() + 1)
      const rdy = String(resultD.getDate())
      if (setVal($('englishLangResultDate-year'),  ryr)) filled++
      if (setVal($('englishLangResultDate-month'), rmo)) filled++
      if (setVal($('englishLangResultDate-day'),   rdy)) filled++
    }

    // Certificate number — certificate_number takes priority over registration_number
    const certNum = lang?.certificate_number || lang?.registration_number || ''
    if (certNum && setVal($('englishLangTestCertNum'), certNum)) filled++

    // Scores
    function normScore(s) { const str = String(s||'').trim(); return str.endsWith('.0') ? str.slice(0,-2) : str }
    function sCode(s) { return IELTS_SCORE_CODES[normScore(s)] || normScore(s) }

    if (setVal($('englishLangSpeakingScoreIELTS'),  sCode(lang?.speaking_score)))  filled++
    if (setVal($('englishLangReadingScoreIELTS'),   sCode(lang?.reading_score)))   filled++
    if (setVal($('englishLangListeningScoreIELTS'), sCode(lang?.listening_score))) filled++
    if (setVal($('englishLangWritingScoreIELTS'),   sCode(lang?.writing_score)))   filled++

    // Taken French lang test → No
    if (!setVal($('takenFrenchLangTest'), 'No')) setVal($('takenFrenchLangTest'), '997')
    filled++

    log(`fillLanguages: ${filled} fields`)
    return filled
  }

  async function fillProfileApplicationDetails(p) {
    // Province checkboxes + nomination certificate
    let filled = 0

    // Province checkbox — tick the hardcoded/profile province
    const province = (p.hardcoded?.province || HARDCODED.province || 'Ontario').toLowerCase()
    const provinceCheckboxMap = {
      'alberta':                  'intendedProvinces-16460',
      'british columbia':         'intendedProvinces-16461',
      'bc':                       'intendedProvinces-16461',
      'manitoba':                 'intendedProvinces-16462',
      'new brunswick':            'intendedProvinces-16464',
      'newfoundland and labrador':'intendedProvinces-16459',
      'northwest territories':    'intendedProvinces-16465',
      'nova scotia':              'intendedProvinces-16463',
      'nunavut':                  'intendedProvinces-16470',
      'ontario':                  'intendedProvinces-16467',
      'prince edward island':     'intendedProvinces-16466',
      'quebec':                   'intendedProvinces-16468',
      'saskatchewan':             'intendedProvinces-16469',
      'yukon':                    'intendedProvinces-16471',
    }
    const cbId = provinceCheckboxMap[province]
    if (cbId) {
      const cb = $(cbId)
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change',{bubbles:true})); filled++; await sleep(300) }
    }

    // BC/Ontario consent dropdowns — appear if those provinces selected
    const bcConsent = $('britishColumbiaConsent')
    if (bcConsent && !bcConsent.disabled) { if (setVal(bcConsent, 'Yes')) filled++ }

    const onConsent = $('ontarioConsent')
    if (onConsent && !onConsent.disabled) { if (setVal(onConsent, 'Yes')) filled++ }

    // Has nomination certificate
    const hasNom = p.adaptability?.has_pnp === 'True'
    if (setVal($('hasNominationCertificate'), hasNom ? 'Yes' : 'No')) filled++

    log(`fillApplicationDetails: ${filled} fields`)
    return filled
  }

  async function fillProfileApplicationDetails(p) {
    let filled = 0
    const province = (HARDCODED.province || 'Ontario').toLowerCase()
    const provinceCheckboxMap = {
      'alberta':'intendedProvinces-16460', 'british columbia':'intendedProvinces-16461',
      'bc':'intendedProvinces-16461', 'manitoba':'intendedProvinces-16462',
      'new brunswick':'intendedProvinces-16464', 'newfoundland and labrador':'intendedProvinces-16459',
      'northwest territories':'intendedProvinces-16465', 'nova scotia':'intendedProvinces-16463',
      'nunavut':'intendedProvinces-16470', 'ontario':'intendedProvinces-16467',
      'prince edward island':'intendedProvinces-16466', 'quebec':'intendedProvinces-16468',
      'saskatchewan':'intendedProvinces-16469', 'yukon':'intendedProvinces-16471',
    }
    const cbId = provinceCheckboxMap[province]
    if (cbId) {
      const cb = $(cbId)
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change',{bubbles:true})); filled++; await sleep(400) }
    }
    // BC/Ontario consent — appear if those provinces ticked
    const bcConsent = $('britishColumbiaConsent')
    if (bcConsent && !bcConsent.disabled) { if (setVal(bcConsent, 'Yes')) filled++ }
    const onConsent = $('ontarioConsent')
    if (onConsent && !onConsent.disabled) { if (setVal(onConsent, 'Yes')) filled++ }
    // Has nomination certificate
    const hasNom = p.adaptability?.has_pnp === 'True'
    if (setVal($('hasNominationCertificate'), hasNom ? 'Yes' : 'No')) filled++
    log(`fillApplicationDetails: ${filled} fields`)
    return filled
  }

  async function fillProfileRepresentative(p) {
    // Always No representative — use text match since we don't know option codes
    const el = $('hasRepresentative')
    if (!el) return 0
    // Try code first, then text matching
    const filled = setVal(el, '997') || setVal(el, 'No') || setVal(el, 'None') ? 1 : 0
    log(`fillRepresentative: ${filled} fields`)
    return filled
  }

  // Fill one job's fields into the currently visible tab
  async function fillOneJobTab(job) {
    let filled = 0
    if (!job) return 0

    if (job.start_year) {
      if (setVal($('dateJobStartedOn-year'),  job.start_year)) filled++
      if (setVal($('dateJobStartedOn-month'), String(parseInt(job.start_month||'1')))) filled++
    }
    if (job.is_current === 'True' || job.is_current === true) {
      const ongoingEl = $('currentlyOngoing')
      if (ongoingEl) { ongoingEl.checked = true; ongoingEl.dispatchEvent(new Event('change',{bubbles:true})); filled++ }
    } else if (job.end_year && job.end_year !== 'Present') {
      if (setVal($('dateJobTerminatedOn-year'),  job.end_year)) filled++
      if (setVal($('dateJobTerminatedOn-month'), String(parseInt(job.end_month||'1')))) filled++
    }
    if (job.hours_per_week && setVal($('hoursPerWeek'), String(job.hours_per_week))) filled++
    if (job.job_title  && setVal($('jobTitle'),     job.job_title))   filled++
    if (job.employer   && setVal($('employerName'), job.employer))     filled++
    if (setVal($('country'), job.country || 'Canada')) filled++

    log(`fillOneJobTab: ${filled} fields — ${job.employer || 'unknown'}`)
    return filled
  }

  async function fillProfileWorkHistory(p) {
    const jobs = p.work_history || []
    if (!jobs.length) return 0
    let filled = 0

    // ── Page-level fields (NOC, occupation date, certificate, job offer, etc.) ──
    const job0 = jobs[0]

    // Primary NOC — text input (may be unnamed)
    if (job0?.noc_code) {
      const nocInput = document.querySelector('input[type="text"]:not([id])')
        || document.querySelector('input[type="text"]')
      if (nocInput && setVal(nocInput, job0.noc_code)) { filled++; await sleep(400) }
    }

    // nocLevel — TEER dropdown
    const teerMap = { '0':'TEER 0','1':'TEER 1','2':'TEER 2','3':'TEER 3','4':'TEER 4','5':'TEER 5' }
    const teer = teerMap[String(job0?.noc_code||'').charAt(0)] || 'TEER 1'
    if (setVal($('nocLevel'), teer)) filled++

    // Date occupation qualified
    if (job0?.start_year) {
      if (setVal($('dateOccupationQualified-year'),  job0.start_year)) filled++
      if (setVal($('dateOccupationQualified-month'), String(parseInt(job0.start_month||'1')))) filled++
    }

    // Has Canadian certificate
    const hasCert = p.adaptability?.has_certificate === 'True'
    if (!setVal($('hasCanadianCertificateOfQualification'), hasCert ? 'Yes' : 'No'))
      setVal($('hasCanadianCertificateOfQualification'), hasCert ? '991' : '997')
    filled++

    // Has job offer
    const hasOffer = p.adaptability?.has_job_offer === 'True'
    if (!setVal($('hasJobOffer'), hasOffer ? 'Yes' : 'No'))
      setVal($('hasJobOffer'), hasOffer ? '991' : '997')
    filled++

    // Has research → No (always)
    if (!setVal($('hasResearch'), 'No')) setVal($('hasResearch'), '997')
    filled++

    // Has work history → Yes, then wait for tab UI to appear
    if (!setVal($('hasWorkHistory'), 'Yes')) setVal($('hasWorkHistory'), '991')
    filled++; await sleep(600)

    // ── Fill each job via tab navigation ──
    // IRCC work history uses tabs: job 0 is shown first,
    // then Next button advances to each additional job tab.
    // Button IDs confirmed from dump:
    //   showTabNextBtn-1           (first Next, appears on tab 0)
    //   showNextPrevTabNextBtn-2   (Next on tab 1)
    //   showNextPrevTabNextBtn-3   (Next on tab 2)
    //   showNextPrevTabNextBtn-4   (Next on tab 3)
    // There is NO "Save and Add" button on this page — each Next click advances the tab.

    // Fill first job (tab 0 — already visible after setting hasWorkHistory=Yes)
    filled += await fillOneJobTab(jobs[0])

    for (let i = 1; i < jobs.length; i++) {
      // Click the Next tab button to create/advance to next job tab
      const nextBtn = $(`showTabNextBtn-${i}`)
        || $(`showNextPrevTabNextBtn-${i + 1}`)
        || Array.from(document.querySelectorAll('button'))
             .find(b => {
               const txt = b.textContent.trim().toLowerCase()
               return (txt === 'next' || txt === 'add another') && !b.disabled
             })

      if (!nextBtn) {
        log(`No Next button found for job tab ${i} — stopping at job ${i}`)
        break
      }

      nextBtn.click()
      await sleep(700)  // wait for new tab fields to render

      filled += await fillOneJobTab(jobs[i])
    }

    log(`fillWorkHistory: ${filled} total fields across ${jobs.length} job(s)`)
    return filled
  }

  // ── MAIN FILL DISPATCHER ─────────────────────────────────────────
  async function fillPage(profile) {
    const page = detectPage()
    log('Page detected:', JSON.stringify(page))
    let filledCount = 0
    let label = 'unknown'

    if (page.type === 'wizard') {
      const qId = page.questionId
      label = `wizard Q${qId}`
      if (qId && WIZARD_FILLERS[qId]) {
        filledCount = await WIZARD_FILLERS[qId](profile)
      } else {
        // Fallback: detect page by DOM structure when questionId unknown
        const bodyText = document.body?.textContent?.toLowerCase() || ''
        // Spouse info page: has last name + first name + gender + DOB fields
        const hasSpouseFields = document.getElementById('answerlist[1]')
          && document.getElementById('answerlist[2]')
          && document.getElementById('answerlist[3]')
        if (hasSpouseFields && (bodyText.includes('last name') || bodyText.includes('family name'))) {
          label = '👫 Spouse information'
          filledCount = await fillQ_spouseInfo(profile)
        } else if (document.getElementById('answerlist[0]')
          && document.getElementById('answerlist[0]').tagName === 'SELECT'
          && bodyText.includes('accompany')) {
          label = '✈️ Spouse accompany'
          filledCount = await fillQ_accompany(profile)
        } else if (qId) {
          label = `wizard Q${qId} — no handler yet`
        }
      }
    } else if (page.type === 'profile') {
      label = `profile / ${page.section}`
      const sectionFillers = {
        'personalDetails':  fillProfilePersonalInfo,
        'contactDetails':   fillProfileContactDetails,
        'languages':        fillProfileLanguages,
        'applicationDetails': fillProfileApplicationDetails,
        'representative':   fillProfileRepresentative,
        'workHistory':      fillProfileWorkHistory,
      }
      const filler = sectionFillers[page.section]
      if (filler) {
        filledCount = await filler(profile)
      } else {
        label = `profile / ${page.section} — no handler yet`
      }
    } else if (page.type === 'results') {
      label = 'results page — click Continue manually'
      filledCount = 1  // show as "handled" so overlay is not red
    }

    return { label, filledCount }
  }

  // ── OVERLAY UI ───────────────────────────────────────────────────
  function getPageLabel() {
    const page = detectPage()
    const LABELS = {
      '1791': '🏙 Province selection',
      '1792': '🗣 Language test type',
      '1822': '📅 Language test date',
      '1816': '📊 Language scores',
      '1793': '🗣 Second language',
      '1794': '🍁 Canadian work experience',
      '1795': '🌍 Foreign work experience',
      '1797': '💰 Funds & family size',
      '1798': '💼 Job offer',
      '1810': '🎂 DOB & education',
      '1811': '✅ Canada connections',
      '1812': '💑 Marital status',
      '1778': '👤 Name, gender & DOB',
    }
    if (page.type === 'wizard') {
      return LABELS[page.questionId] || `❓ Wizard page Q${page.questionId}`
    }
    if (page.type === 'results')   return '📋 Results — click Continue'
    if (page.type === 'checklist') return '📋 Profile Checklist — choose a section'
    if (page.type === 'profile') {
      const sectionLabels = {
        'personalDetails': '👤 Personal Details',
        'contactDetails':  '📧 Contact Details',
        'languages':       '🗣 Study & Languages',
        'applicationDetails': '🏙 Application Details',
        'representative':     '🤝 Representative',
        'workHistory':        '💼 Work History',
      }
      return sectionLabels[page.section] || `📝 Profile / ${page.section}`
    }
    return '❓ Unknown page'
  }

  function injectOverlay() {
    if (document.getElementById('ee-autofill-overlay')) return
    const label = getPageLabel()
    const isFillable = detectPage().type !== 'unknown'

    const overlay = document.createElement('div')
    overlay.id = 'ee-autofill-overlay'
    overlay.innerHTML = `
      <div id="ee-overlay-inner">
        <div id="ee-overlay-header">
          <span>🍁</span>
          <span id="ee-overlay-title">EE Autofill</span>
          <button id="ee-overlay-close">×</button>
        </div>
        <div id="ee-overlay-body">
          <p id="ee-overlay-status">${label}</p>
          <button id="ee-overlay-fill-btn">${isFillable ? 'Fill This Page' : 'Not fillable'}</button>
          <div id="ee-overlay-result"></div>
          <p id="ee-overlay-note">Locked fields are skipped automatically.</p>
        </div>
      </div>
    `
    const style = document.createElement('style')
    style.textContent = `
      #ee-autofill-overlay {
        position:fixed; bottom:24px; right:24px; z-index:999999;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      }
      #ee-overlay-inner {
        background:#0f172a; border:1px solid #334155; border-radius:16px;
        padding:16px; width:260px; box-shadow:0 20px 60px rgba(0,0,0,.6); color:#e2e8f0;
      }
      #ee-overlay-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
      #ee-overlay-title  { font-weight:700; font-size:13px; color:#f8fafc; flex:1; }
      #ee-overlay-close  { background:none; border:none; color:#64748b; cursor:pointer; font-size:18px; padding:0 4px; }
      #ee-overlay-close:hover { color:#f8fafc; }
      #ee-overlay-status { font-size:11px; color:#94a3b8; margin:0 0 10px; }
      #ee-overlay-fill-btn {
        width:100%; padding:9px 0; background:#2563eb; color:#fff;
        border:none; border-radius:10px; font-weight:700; font-size:13px;
        cursor:pointer; transition:background .15s;
      }
      #ee-overlay-fill-btn:hover    { background:#1d4ed8; }
      #ee-overlay-fill-btn:disabled { background:#1e3a5f; color:#64748b; cursor:not-allowed; }
      #ee-overlay-result { font-size:11px; margin-top:8px; min-height:16px; color:#94a3b8; }
      #ee-overlay-note   { font-size:9px; color:#475569; margin-top:6px; }
      .ee-ok  { color:#34d399!important; }
      .ee-err { color:#f87171!important; }
    `
    document.head.appendChild(style)
    document.body.appendChild(overlay)
    document.getElementById('ee-overlay-close').onclick = () => overlay.remove()
    document.getElementById('ee-overlay-fill-btn').onclick = handleFillClick
  }

  async function handleFillClick() {
    if (!isContextValid()) {
      const result = document.getElementById('ee-overlay-result')
      if (result) { result.textContent = '⟳ Extension reloaded — refresh tab (F5)'; result.className = 'ee-err' }
      return
    }
    const btn    = document.getElementById('ee-overlay-fill-btn')
    const result = document.getElementById('ee-overlay-result')
    const status = document.getElementById('ee-overlay-status')

    btn.disabled = true
    btn.textContent = 'Filling…'
    result.textContent = ''
    result.className = ''

    const resp = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' })
    if (!resp.ok) {
      result.textContent = resp.error === 'not_authenticated'
        ? 'Not logged in — open extension popup.'
        : `Error: ${resp.error}`
      result.className = 'ee-err'
      btn.disabled = false
      btn.textContent = 'Fill This Page'
      return
    }

    const { label, filledCount } = await fillPage(resp.data)

    if (filledCount === 0) {
      result.textContent = `Nothing filled on "${label}"`
      result.className = 'ee-err'
    } else {
      result.textContent = `✓ Filled ${filledCount} field${filledCount !== 1 ? 's' : ''}!`
      result.className = 'ee-ok'
      status.textContent = `✓ ${label}`
    }

    btn.disabled = false
    btn.textContent = 'Fill Again'
  }

  // Message listeners for popup
  // Context invalidation guard
  function isContextValid() {
    try { chrome.runtime.id; return true } catch(e) { return false }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_FILL') {
      handleFillClick().then(() => sendResponse({ ok: true }))
      return true
    }
    if (message.type === 'DETECT_PAGE') {
      const page = detectPage()
      const qId  = page.questionId
      const FILLABLE_QIDS = Object.keys(WIZARD_FILLERS)
      const pageType = page.type === 'wizard' && FILLABLE_QIDS.includes(qId)
        ? 'wizard_fillable'
        : page.type === 'profile'
          ? 'personal_info'
          : page.type
      sendResponse({ page: pageType, label: getPageLabel() })
    }
  })

  setTimeout(injectOverlay, 1200)
  log('Loaded on:', window.location.href, '| Page:', JSON.stringify(detectPage()))
})()

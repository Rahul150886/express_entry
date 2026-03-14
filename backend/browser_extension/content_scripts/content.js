// content.js — Injected into IRCC pages
// Detects which page/section the user is on and fills the right fields

;(function () {
  if (window.__EE_AUTOFILL_INJECTED__) return
  window.__EE_AUTOFILL_INJECTED__ = true

  // Never run on login / auth pages — avoids triggering GCKey bot detection
  const url = window.location.href
  const isAuthPage = (
    url.includes('gckey.gc.ca') ||
    url.includes('/login') ||
    url.includes('/auth') ||
    url.includes('/signin') ||
    url.includes('/sign-in') ||
    url.includes('account/signin') ||
    url.includes('clegc-gckey')
  )
  if (isAuthPage) return

  // ── Utilities ────────────────────────────────────────────────

  function log(msg, data) {
    console.log(`[EE Autofill] ${msg}`, data || '')
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Set a native input value and trigger React/Angular/Vue change events
  function setInputValue(el, value) {
    if (!el) return false
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set
    const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value'
    )?.set

    if (el.tagName === 'SELECT') {
      if (nativeSelectValueSetter) nativeSelectValueSetter.call(el, value)
      else el.value = value
    } else {
      if (nativeInputValueSetter) nativeInputValueSetter.call(el, value)
      else el.value = value
    }

    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur',   { bubbles: true }))
    return true
  }

  function setRadioValue(name, value) {
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`)
    for (const radio of radios) {
      if (radio.value === value || radio.id?.toLowerCase().includes(value.toLowerCase())) {
        radio.click()
        radio.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      }
    }
    return false
  }

  function setCheckbox(selector, checked) {
    const el = document.querySelector(selector)
    if (!el) return false
    if (el.checked !== checked) el.click()
    return true
  }

  function findByLabel(labelText, tagName = 'input') {
    // Try aria-label
    const byAria = document.querySelector(
      `${tagName}[aria-label*="${labelText}" i]`
    )
    if (byAria) return byAria

    // Try placeholder
    const byPlaceholder = document.querySelector(
      `${tagName}[placeholder*="${labelText}" i]`
    )
    if (byPlaceholder) return byPlaceholder

    // Walk all labels
    const labels = document.querySelectorAll('label')
    for (const label of labels) {
      if (label.textContent.toLowerCase().includes(labelText.toLowerCase())) {
        const forId = label.getAttribute('for')
        if (forId) {
          const el = document.getElementById(forId)
          if (el && el.tagName.toLowerCase() === tagName.toLowerCase()) return el
        }
        // Try sibling
        const sibling = label.nextElementSibling
        if (sibling && sibling.tagName.toLowerCase() === tagName.toLowerCase()) return sibling
      }
    }
    return null
  }

  function findById(id) {
    return document.getElementById(id)
  }

  function findByName(name) {
    return document.querySelector(`[name="${name}"]`)
  }

  function findByCssOrId(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }

  // ── Field mappers per IRCC page section ──────────────────────
  // IRCC Express Entry profile creation has these key pages/steps:
  //  1. Enter the Pool — personal info, language, education, work history
  //  2. Work history details — per-employer entries
  //  3. Personal history / background
  //  4. Spouse/partner info
  //  5. Summary and submission

  function detectPage() {
    const url    = window.location.href
    const title  = document.title.toLowerCase()
    const h1     = document.querySelector('h1')?.textContent?.toLowerCase() || ''
    const body   = document.body?.textContent?.toLowerCase() || ''

    if (body.includes('personal information') && body.includes('date of birth'))
      return 'personal_info'
    if (body.includes('language') && (body.includes('ielts') || body.includes('celpip') || body.includes('first official language')))
      return 'language'
    if (body.includes('education') && (body.includes('highest level') || body.includes('field of study')))
      return 'education'
    if (body.includes('work history') || (body.includes('employer') && body.includes('noc')))
      return 'work_history'
    if (body.includes('spouse') || body.includes('common-law partner'))
      return 'spouse'
    if (body.includes('provincial nomination') || body.includes('certificate of qualification'))
      return 'adaptability'
    if (body.includes('summary') && body.includes('comprehensive ranking'))
      return 'summary'
    if (body.includes('express entry') && body.includes('profile'))
      return 'landing'

    return 'unknown'
  }

  // ── Fillers per page ──────────────────────────────────────────

  async function fillPersonalInfo(p) {
    const personal = p.personal
    log('Filling personal info', personal)
    let filled = 0

    const fieldMap = [
      // [selectors to try, value]
      { selectors: ['#family-name', '#familyName', '[name="familyName"]', '[name="family_name"]'], label: 'Family name', value: personal.family_name },
      { selectors: ['#given-name',  '#givenName',  '[name="givenName"]',  '[name="given_name"]'],  label: 'Given name',  value: personal.given_name  },
    ]

    for (const f of fieldMap) {
      const el = findByCssOrId(f.selectors) || findByLabel(f.label)
      if (el && setInputValue(el, f.value)) {
        filled++
        await sleep(80)
      }
    }

    // DOB — year/month/day may be separate fields or a single date input
    const dobYear  = findByCssOrId(['#dob-year', '#dobYear', '[name="dobYear"]', '[name="dob_year"]']) || findByLabel('Year', 'input')
    const dobMonth = findByCssOrId(['#dob-month', '#dobMonth', '[name="dobMonth"]', '[name="dob_month"]']) || findByLabel('Month', 'select')
    const dobDay   = findByCssOrId(['#dob-day', '#dobDay', '[name="dobDay"]', '[name="dob_day"]']) || findByLabel('Day', 'input')
    const dobSingle = findByCssOrId(['input[type="date"]#dob', '[name="dateOfBirth"]'])

    if (dobSingle) {
      setInputValue(dobSingle, `${personal.dob_year}-${personal.dob_month}-${personal.dob_day}`)
      filled++
    } else {
      if (dobYear)  { setInputValue(dobYear,  personal.dob_year);  filled++ }
      if (dobMonth) { setInputValue(dobMonth, personal.dob_month); filled++ }
      if (dobDay)   { setInputValue(dobDay,   personal.dob_day);   filled++ }
    }

    // Country of birth / citizenship — select elements
    const countryFields = [
      { selectors: ['#country-of-birth', '#countryOfBirth', '[name="countryOfBirth"]'], value: personal.country_of_birth },
      { selectors: ['#country-of-citizenship', '#citizenship', '[name="countryOfCitizenship"]'], value: personal.country_of_citizenship },
      { selectors: ['#country-of-residence', '#residence', '[name="countryOfResidence"]'], value: personal.country_of_residence },
    ]
    for (const f of countryFields) {
      const el = findByCssOrId(f.selectors)
      if (el) { setInputValue(el, f.value); filled++; await sleep(60) }
    }

    // Marital status radio/select
    const maritalEl = findByCssOrId(['#marital-status', '#maritalStatus', '[name="maritalStatus"]', 'select[name="marital"]'])
      || findByLabel('marital status', 'select')
    if (maritalEl) {
      setInputValue(maritalEl, personal.marital_status)
      filled++
    } else {
      setRadioValue('maritalStatus', personal.marital_status)
    }

    return filled
  }

  async function fillLanguage(p) {
    const lang = p.language
    log('Filling language test', lang)
    let filled = 0

    // Test type selector
    const testTypeEl = findByCssOrId(['#language-test', '#languageTest', '[name="languageTest"]', '[name="firstLanguageTest"]', 'select[id*="language"]'])
      || findByLabel('language test', 'select')
      || findByLabel('official language test', 'select')
    if (testTypeEl) {
      setInputValue(testTypeEl, lang.first_language_test.toUpperCase())
      filled++
      await sleep(200) // Wait for conditional fields to appear
    }

    // Scores
    const scoreMap = [
      { keys: ['#listening-score', '#listeningScore', '[name="listeningScore"]', '[name="listening"]'], value: lang.listening_score, label: 'listening' },
      { keys: ['#reading-score',   '#readingScore',   '[name="readingScore"]',   '[name="reading"]'],   value: lang.reading_score,   label: 'reading'   },
      { keys: ['#writing-score',   '#writingScore',   '[name="writingScore"]',   '[name="writing"]'],   value: lang.writing_score,   label: 'writing'   },
      { keys: ['#speaking-score',  '#speakingScore',  '[name="speakingScore"]',  '[name="speaking"]'],  value: lang.speaking_score,  label: 'speaking'  },
    ]

    for (const s of scoreMap) {
      const el = findByCssOrId(s.keys) || findByLabel(s.label)
      if (el) { setInputValue(el, s.value); filled++; await sleep(60) }
    }

    // Test date
    const testDateYear  = findByCssOrId(['#test-date-year', '#testDateYear', '[name="testDateYear"]'])
    const testDateMonth = findByCssOrId(['#test-date-month', '#testDateMonth', '[name="testDateMonth"]'])
    const testDateDay   = findByCssOrId(['#test-date-day', '#testDateDay', '[name="testDateDay"]'])
    const testDateSingle = findByCssOrId(['input[type="date"][name*="testDate"]', 'input[type="date"][id*="test"]'])

    if (lang.test_date) {
      const [yr, mo, dy] = lang.test_date.split('-')
      if (testDateSingle) {
        setInputValue(testDateSingle, lang.test_date); filled++
      } else {
        if (testDateYear)  { setInputValue(testDateYear,  yr); filled++ }
        if (testDateMonth) { setInputValue(testDateMonth, mo); filled++ }
        if (testDateDay)   { setInputValue(testDateDay,   dy); filled++ }
      }
    }

    // Registration / TRF number
    const regEl = findByCssOrId(['#registration-number', '#trf-number', '[name="registrationNumber"]', '[name="trfNumber"]'])
      || findByLabel('registration number')
      || findByLabel('TRF number')
    if (regEl && lang.registration_number) {
      setInputValue(regEl, lang.registration_number); filled++
    }

    return filled
  }

  async function fillEducation(p) {
    const edu = p.education
    log('Filling education', edu)
    let filled = 0

    // Highest level of education
    const levelEl = findByCssOrId(['#highest-level', '#educationLevel', '[name="educationLevel"]', '[name="highestLevelOfEducation"]', 'select[id*="education"]'])
      || findByLabel('highest level', 'select')
      || findByLabel('level of education', 'select')
    if (levelEl) { setInputValue(levelEl, edu.highest_level); filled++; await sleep(120) }

    // Field of study
    const fieldEl = findByCssOrId(['#field-of-study', '#fieldOfStudy', '[name="fieldOfStudy"]'])
      || findByLabel('field of study')
    if (fieldEl) { setInputValue(fieldEl, edu.field_of_study); filled++ }

    // Institution
    const instEl = findByCssOrId(['#institution', '#institutionName', '[name="institutionName"]', '[name="institution"]'])
      || findByLabel('institution')
      || findByLabel('school')
    if (instEl) { setInputValue(instEl, edu.institution); filled++ }

    // Country studied
    const countryEl = findByCssOrId(['#country-studied', '#countryStudied', '[name="countryStudied"]', 'select[id*="country"]'])
      || findByLabel('country', 'select')
    if (countryEl) { setInputValue(countryEl, edu.country_studied); filled++ }

    // Canadian education checkbox
    if (edu.is_canadian === 'True') {
      const canadianEl = findByCssOrId(['#canadian-education', '#isCanadian', '[name="isCanadian"]'])
        || findByLabel('canadian', 'input')
      if (canadianEl) { canadianEl.checked || canadianEl.click(); filled++ }
    }

    // ECA info
    if (edu.eca_organization) {
      const ecaOrgEl = findByCssOrId(['#eca-organization', '#ecaOrg', '[name="ecaOrganization"]'])
        || findByLabel('ECA organization', 'select')
        || findByLabel('assessment organization', 'select')
      if (ecaOrgEl) { setInputValue(ecaOrgEl, edu.eca_organization); filled++ }
    }

    if (edu.eca_reference) {
      const ecaRefEl = findByCssOrId(['#eca-reference', '#ecaReference', '[name="ecaReference"]'])
        || findByLabel('ECA reference')
        || findByLabel('reference number')
      if (ecaRefEl) { setInputValue(ecaRefEl, edu.eca_reference); filled++ }
    }

    return filled
  }

  async function fillWorkHistory(p) {
    const jobs = p.work_history
    if (!jobs?.length) return 0
    log('Filling work history', jobs)
    let filled = 0

    // IRCC shows one job entry form at a time.
    // We find the first visible/current form and fill it.
    const job = jobs[0]

    const jobFieldMap = [
      { keys: ['#job-title', '#jobTitle', '[name="jobTitle"]', '[name="occupation"]'], value: job.job_title, label: 'job title' },
      { keys: ['#employer', '#employerName', '[name="employerName"]', '[name="employer"]'], value: job.employer, label: 'employer' },
      { keys: ['#noc-code', '#nocCode', '[name="nocCode"]', '[name="noc"]'], value: job.noc_code, label: 'NOC' },
      { keys: ['#hours-per-week', '#hoursPerWeek', '[name="hoursPerWeek"]'], value: job.hours_per_week, label: 'hours per week' },
    ]

    for (const f of jobFieldMap) {
      const el = findByCssOrId(f.keys) || findByLabel(f.label)
      if (el) { setInputValue(el, f.value); filled++; await sleep(60) }
    }

    // Country of work
    const countryEl = findByCssOrId(['#country-of-work', '#workCountry', '[name="countryOfWork"]'])
      || findByLabel('country of work', 'select')
    if (countryEl) { setInputValue(countryEl, job.country); filled++ }

    // Start date
    const startYear  = findByCssOrId(['#start-year', '#startYear', '[name="startYear"]', '[name="employmentStartYear"]'])
    const startMonth = findByCssOrId(['#start-month', '#startMonth', '[name="startMonth"]', '[name="employmentStartMonth"]'])
    if (startYear)  { setInputValue(startYear,  job.start_year);  filled++ }
    if (startMonth) { setInputValue(startMonth, job.start_month); filled++ }
    await sleep(80)

    // End date / currently employed
    if (job.is_current === 'True') {
      const currentEl = findByCssOrId(['#currently-employed', '#currentJob', '[name="currentlyEmployed"]'])
        || findByLabel('currently employed', 'input')
      if (currentEl) { currentEl.checked || currentEl.click(); filled++ }
    } else {
      const endYear  = findByCssOrId(['#end-year', '#endYear', '[name="endYear"]', '[name="employmentEndYear"]'])
      const endMonth = findByCssOrId(['#end-month', '#endMonth', '[name="endMonth"]', '[name="employmentEndMonth"]'])
      if (endYear  && job.end_year  !== 'Present') { setInputValue(endYear,  job.end_year);  filled++ }
      if (endMonth && job.end_month)               { setInputValue(endMonth, job.end_month); filled++ }
    }

    return filled
  }

  async function fillSpouseInfo(p) {
    if (!p.spouse) return 0
    const sp = p.spouse
    log('Filling spouse info', sp)
    let filled = 0

    const fieldMap = [
      { keys: ['#spouse-family-name', '#spouseFamilyName', '[name="spouseFamilyName"]'], value: sp.family_name, label: 'spouse family name' },
      { keys: ['#spouse-given-name',  '#spouseGivenName',  '[name="spouseGivenName"]'],  value: sp.given_name,  label: 'spouse given name'  },
    ]

    for (const f of fieldMap) {
      const el = findByCssOrId(f.keys) || findByLabel(f.label)
      if (el && f.value) { setInputValue(el, f.value); filled++; await sleep(60) }
    }

    // Spouse education
    const spouseEduEl = findByCssOrId(['#spouse-education', '#spouseEducation', '[name="spouseEducationLevel"]'])
      || findByLabel('spouse', 'select')
    if (spouseEduEl && sp.education_level) {
      setInputValue(spouseEduEl, sp.education_level); filled++
    }

    return filled
  }

  async function fillAdaptability(p) {
    const adapt = p.adaptability
    log('Filling adaptability', adapt)
    let filled = 0

    if (adapt.has_sibling === 'True') {
      const siblingEl = findByCssOrId(['#sibling-in-canada', '#hasSibling', '[name="siblingInCanada"]'])
        || findByLabel('sibling in canada', 'input')
      if (siblingEl) { siblingEl.checked || siblingEl.click(); filled++ }
    }

    if (adapt.has_pnp === 'True') {
      const pnpEl = findByCssOrId(['#provincial-nomination', '#hasPNP', '[name="provincialNomination"]'])
        || findByLabel('provincial nomination', 'input')
      if (pnpEl) { pnpEl.checked || pnpEl.click(); filled++ }
    }

    return filled
  }

  // ── Main fill dispatcher ──────────────────────────────────────

  async function fillPage(profile) {
    const page = detectPage()
    log('Detected page:', page)

    let filledCount = 0
    let section = page

    switch (page) {
      case 'personal_info':
        filledCount = await fillPersonalInfo(profile)
        break
      case 'language':
        filledCount = await fillLanguage(profile)
        break
      case 'education':
        filledCount = await fillEducation(profile)
        break
      case 'work_history':
        filledCount = await fillWorkHistory(profile)
        break
      case 'spouse':
        filledCount = await fillSpouseInfo(profile)
        break
      case 'adaptability':
        filledCount = await fillAdaptability(profile)
        break
      default:
        section = 'unknown'
    }

    return { page, filledCount, section }
  }

  // ── Overlay UI injected into IRCC page ────────────────────────

  function injectOverlay() {
    if (document.getElementById('ee-autofill-overlay')) return

    const overlay = document.createElement('div')
    overlay.id = 'ee-autofill-overlay'
    overlay.innerHTML = `
      <div id="ee-overlay-inner">
        <div id="ee-overlay-header">
          <span id="ee-overlay-icon">🍁</span>
          <span id="ee-overlay-title">EE Autofill</span>
          <button id="ee-overlay-close">×</button>
        </div>
        <div id="ee-overlay-body">
          <p id="ee-overlay-status">Ready to fill</p>
          <button id="ee-overlay-fill-btn">Fill This Page</button>
          <div id="ee-overlay-result"></div>
        </div>
      </div>
    `

    const style = document.createElement('style')
    style.textContent = `
      #ee-autofill-overlay {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #ee-overlay-inner {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 16px;
        width: 220px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        color: #e2e8f0;
      }
      #ee-overlay-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      #ee-overlay-icon { font-size: 18px; }
      #ee-overlay-title {
        font-weight: 700;
        font-size: 13px;
        color: #f8fafc;
        flex: 1;
      }
      #ee-overlay-close {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0 4px;
      }
      #ee-overlay-close:hover { color: #f8fafc; }
      #ee-overlay-status {
        font-size: 11px;
        color: #94a3b8;
        margin: 0 0 10px;
      }
      #ee-overlay-fill-btn {
        width: 100%;
        padding: 9px 0;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 10px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s;
      }
      #ee-overlay-fill-btn:hover { background: #1d4ed8; }
      #ee-overlay-fill-btn:disabled { background: #1e3a5f; color: #64748b; cursor: not-allowed; }
      #ee-overlay-result {
        font-size: 11px;
        margin-top: 8px;
        color: #94a3b8;
        min-height: 16px;
      }
      .ee-result-ok  { color: #34d399 !important; }
      .ee-result-err { color: #f87171 !important; }
    `
    document.head.appendChild(style)
    document.body.appendChild(overlay)

    document.getElementById('ee-overlay-close').onclick = () => overlay.remove()
    document.getElementById('ee-overlay-fill-btn').onclick = handleFillClick

    // Update status label with detected page
    const page = detectPage()
    if (page !== 'unknown') {
      document.getElementById('ee-overlay-status').textContent =
        `Detected: ${page.replace(/_/g, ' ')}`
    }
  }

  async function handleFillClick() {
    const btn     = document.getElementById('ee-overlay-fill-btn')
    const result  = document.getElementById('ee-overlay-result')
    const status  = document.getElementById('ee-overlay-status')

    btn.disabled = true
    btn.textContent = 'Filling…'
    result.textContent = ''
    result.className = ''

    // Fetch profile from background
    const resp = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' })

    if (!resp.ok) {
      if (resp.error === 'not_authenticated') {
        result.textContent = 'Not logged in — open the extension popup.'
        result.className = 'ee-result-err'
      } else if (resp.error === 'token_expired') {
        result.textContent = 'Session expired — log in again via popup.'
        result.className = 'ee-result-err'
      } else if (resp.error === 'no_profile') {
        result.textContent = 'No profile found — complete My Profile in the app first.'
        result.className = 'ee-result-err'
      } else {
        result.textContent = `Error: ${resp.error}`
        result.className = 'ee-result-err'
      }
      btn.disabled = false
      btn.textContent = 'Fill This Page'
      return
    }

    // Warn about missing sections but still attempt fill
    if (resp.incomplete && resp.missing?.length) {
      status.textContent = `⚠ Missing: ${resp.missing.join(', ')}`
    }

    const { page, filledCount } = await fillPage(resp.data)

    if (filledCount === 0) {
      result.textContent = `No fields matched on "${page}" page.`
      result.className = 'ee-result-err'
      status.textContent = page !== 'unknown' ? `Page: ${page}` : 'Page not recognised'
    } else {
      result.textContent = `✓ Filled ${filledCount} field${filledCount !== 1 ? 's' : ''}`
      result.className = 'ee-result-ok'
      status.textContent = `Done — ${page.replace(/_/g, ' ')}`
    }

    btn.disabled = false
    btn.textContent = 'Fill This Page'
  }

  // ── Listen for messages from popup ────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_FILL') {
      handleFillClick().then(() => sendResponse({ ok: true }))
      return true
    }
    if (message.type === 'DETECT_PAGE') {
      sendResponse({ page: detectPage() })
    }
  })

  // ── Init ──────────────────────────────────────────────────────
  // Small delay to let the page settle
  setTimeout(injectOverlay, 1200)

  log('Content script loaded on:', window.location.href)
})()

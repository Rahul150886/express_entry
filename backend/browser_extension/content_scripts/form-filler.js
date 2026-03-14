/**
 * field-mapper.js
 * Maps Express Entry PR app data fields to IRCC portal form field selectors
 */

const IRCC_FIELD_MAP = {
  PERSONAL_INFO: {
    "personal.family_name": [
      'input[name*="lastName"]', 'input[id*="lastName"]',
      'input[name*="family_name"]', '#familyName', '#nom-de-famille'
    ],
    "personal.given_name": [
      'input[name*="firstName"]', 'input[id*="firstName"]',
      'input[name*="given_name"]', '#firstName', '#prenom'
    ],
    "personal.dob_year": [
      'select[name*="dobYear"]', 'input[name*="dobYear"]',
      'select[id*="yearOfBirth"]', '#annee-naissance'
    ],
    "personal.dob_month": [
      'select[name*="dobMonth"]', 'input[name*="dobMonth"]',
      'select[id*="monthOfBirth"]'
    ],
    "personal.dob_day": [
      'select[name*="dobDay"]', 'input[name*="dobDay"]',
      'select[id*="dayOfBirth"]'
    ],
    "personal.country_of_citizenship": [
      'select[name*="citizenship"]', 'select[id*="citizenship"]',
      '#country-citizenship', '#pays-citoyennete'
    ],
    "personal.marital_status": [
      'select[name*="maritalStatus"]', 'select[id*="marital"]',
      '#marital-status', '#etat-civil'
    ],
  },
  LANGUAGE_TEST: {
    "language.first_language_test": [
      'select[name*="languageTest"]', 'select[id*="test-type"]',
      '#official-language-test', '#test-linguistique-officiel'
    ],
    "language.listening_score": [
      'input[name*="listeningScore"]', 'input[id*="listening"]',
      '#listening', '#comprehension-orale'
    ],
    "language.reading_score": [
      'input[name*="readingScore"]', 'input[id*="reading"]',
      '#reading', '#comprehension-ecrite'
    ],
    "language.writing_score": [
      'input[name*="writingScore"]', 'input[id*="writing"]',
      '#writing', '#expression-ecrite'
    ],
    "language.speaking_score": [
      'input[name*="speakingScore"]', 'input[id*="speaking"]',
      '#speaking', '#expression-orale'
    ],
    "language.test_date": [
      'input[name*="testDate"]', 'input[id*="test-date"]',
      '#language-test-date', '#date-test'
    ],
    "language.registration_number": [
      'input[name*="registrationNumber"]', 'input[id*="registration"]',
      '#trfNumber', '#test-registration-number'
    ],
  },
  EDUCATION: {
    "education.highest_level": [
      'select[name*="educationLevel"]', 'select[id*="education-level"]',
      '#highest-education', '#niveau-scolarite'
    ],
    "education.country_studied": [
      'select[name*="countryStudied"]', 'select[id*="country-of-study"]',
      '#country-education', '#pays-etudes'
    ],
    "education.field_of_study": [
      'input[name*="fieldOfStudy"]', 'input[id*="field-of-study"]',
      '#field-study', '#domaine-etudes'
    ],
    "education.institution": [
      'input[name*="institution"]', 'input[id*="institution"]',
      '#school-name', '#nom-etablissement'
    ],
    "education.eca_organization": [
      'select[name*="ecaOrganization"]', 'select[id*="eca-org"]',
      '#eca-organization', '#organisme-ae'
    ],
    "education.eca_reference": [
      'input[name*="ecaReference"]', 'input[id*="eca-reference"]',
      '#eca-number', '#numero-ae'
    ],
  },
  ADAPTABILITY: {
    "adaptability.has_sibling": [
      'input[name*="sibling"][value="yes"]', '#has-sibling-yes'
    ],
    "adaptability.has_job_offer": [
      'input[name*="jobOffer"][value="yes"]', '#has-job-offer-yes'
    ],
    "adaptability.has_pnp": [
      'input[name*="pnp"][value="yes"]', '#has-provincial-nomination-yes'
    ],
  }
};

window.IRCC_FIELD_MAP = IRCC_FIELD_MAP;

/**
 * form-filler.js
 * Core auto-fill logic
 */

let profileData = null;
let filledFields = [];

async function loadProfileData() {
  const stored = await chrome.storage.local.get(['access_token', 'api_base_url']);
  const token = stored.access_token;
  const baseUrl = stored.api_base_url || 'https://api.expressentry.app';

  if (!token) {
    updateStatus('⚠️ Please log in to the Express Entry PR app first', 'error');
    return null;
  }

  try {
    updateStatus('⏳ Loading your profile data...', 'loading');
    const response = await fetch(`${baseUrl}/api/v1/profile/ircc-ready`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      updateStatus('❌ Failed to load profile. Please log in again.', 'error');
      return null;
    }

    profileData = await response.json();
    updateStatus(`✅ Profile loaded for ${profileData.personal?.family_name || 'applicant'}`, 'success');
    return profileData;
  } catch (err) {
    updateStatus(`❌ Connection error: ${err.message}`, 'error');
    return null;
  }
}

async function fillPage(pageKey) {
  if (!profileData) {
    profileData = await loadProfileData();
    if (!profileData) return;
  }

  const fieldMap = IRCC_FIELD_MAP[pageKey];
  if (!fieldMap) {
    updateStatus(`ℹ️ No auto-fill data for this page`, 'info');
    return;
  }

  let filledCount = 0;
  let skippedCount = 0;
  filledFields = [];

  for (const [dataPath, selectors] of Object.entries(fieldMap)) {
    const value = getNestedValue(profileData, dataPath);
    if (!value) {
      skippedCount++;
      continue;
    }

    let filled = false;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        fillElement(element, value);
        highlightElement(element);
        filledFields.push({ element, originalValue: element.value || element.checked });
        filledCount++;
        filled = true;
        break;
      }
    }

    if (!filled) {
      // Try fuzzy matching by label text
      const filled2 = tryFillByLabel(dataPath, value);
      if (filled2) filledCount++;
      else skippedCount++;
    }
  }

  // Fill work history if on work page
  if (pageKey === 'WORK_HISTORY' && profileData.work_history?.length > 0) {
    await fillWorkHistory(profileData.work_history);
  }

  const msg = `✅ Filled ${filledCount} fields${skippedCount > 0 ? ` (${skippedCount} not found on this page)` : ''}`;
  updateStatus(msg, 'success');

  // Scroll to first filled field
  if (filledFields.length > 0) {
    filledFields[0].element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function fillElement(element, value) {
  const tag = element.tagName.toLowerCase();
  const type = element.getAttribute('type')?.toLowerCase();

  if (tag === 'select') {
    // Try exact match first, then partial
    const options = Array.from(element.options);
    const match = options.find(o => 
      o.value.toLowerCase() === value.toLowerCase() ||
      o.text.toLowerCase() === value.toLowerCase() ||
      o.text.toLowerCase().includes(value.toLowerCase())
    );
    if (match) {
      element.value = match.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else if (type === 'radio') {
    if (value === 'yes' || value === 'true') {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else if (type === 'checkbox') {
    element.checked = value === 'true' || value === 'yes' || value === true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // Text input
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

function highlightElement(element) {
  const original = element.style.border;
  const originalBg = element.style.backgroundColor;
  
  element.style.border = '2px solid #d63031';
  element.style.backgroundColor = '#fff5f5';
  element.setAttribute('data-ee-filled', 'true');

  // Fade highlight after 3 seconds
  setTimeout(() => {
    element.style.border = '2px solid #00b894';
    element.style.backgroundColor = '#f0fff4';
  }, 3000);
}

async function fillWorkHistory(workItems) {
  // Click "Add" button for each work experience entry
  for (let i = 0; i < workItems.length; i++) {
    const work = workItems[i];
    const addBtn = document.querySelector('#add-work-history, .add-employment, [data-action="add-employment"]');
    if (addBtn && i > 0) {
      addBtn.click();
      await sleep(500);
    }

    const rowSelectors = [
      `#work-history-${i}`,
      `.work-history-row:nth-child(${i + 1})`,
      `[data-index="${i}"]`
    ];

    for (const rowSel of rowSelectors) {
      const row = document.querySelector(rowSel);
      if (row) {
        const employerInput = row.querySelector('input[name*="employer"], input[id*="employer"]');
        if (employerInput) fillElement(employerInput, work.employer);

        const nocInput = row.querySelector('input[name*="noc"], input[id*="noc"]');
        if (nocInput) fillElement(nocInput, work.noc_code);

        break;
      }
    }
  }
}

function tryFillByLabel(dataPath, value) {
  const fieldName = dataPath.split('.').pop().replace(/_/g, ' ');
  const labels = document.querySelectorAll('label');

  for (const label of labels) {
    if (label.textContent.toLowerCase().includes(fieldName.toLowerCase())) {
      const forId = label.getAttribute('for');
      if (forId) {
        const input = document.getElementById(forId);
        if (input) {
          fillElement(input, value);
          highlightElement(input);
          return true;
        }
      }
    }
  }
  return false;
}

function clearFilledFields() {
  const filled = document.querySelectorAll('[data-ee-filled="true"]');
  filled.forEach(el => {
    el.style.border = '';
    el.style.backgroundColor = '';
    el.removeAttribute('data-ee-filled');
  });
  updateStatus('🗑 Filled fields cleared', 'info');
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current?.[key] ?? null;
  }, obj);
}

function updateStatus(message, type = 'info') {
  const statusEl = document.getElementById('ee-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `ee-status ee-status-${type}`;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

window.fillPage = fillPage;
window.clearFilledFields = clearFilledFields;

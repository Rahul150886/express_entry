// popup.js — controls popup.html

const PAGE_LABELS = {
  personal_info: '👤 Personal Information',
  language:      '🗣 Language Test',
  education:     '🎓 Education',
  work_history:  '💼 Work History',
  spouse:        '👫 Spouse / Partner',
  adaptability:  '🏔 Adaptability Factors',
  summary:       '📋 Summary',
  landing:       '🏠 Express Entry Landing',
  unknown:       '❓ Page not recognised',
}

const PAGE_IS_FILLABLE = ['personal_info', 'language', 'education', 'work_history', 'spouse', 'adaptability']

// ── Helpers ───────────────────────────────────────────────────
function msg(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data })
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function showResult(text, type = 'ok') {
  const el = document.getElementById('fill-result')
  el.textContent = text
  el.className = `result-bar result-${type}`
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 4000)
}

function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId)
  if (loading) {
    btn.disabled = true
    btn.innerHTML = `<div class="spinner"></div> ${label}`
  } else {
    btn.disabled = false
    btn.textContent = label
  }
}

// ── Auth views ────────────────────────────────────────────────
function showLoginView() {
  document.getElementById('view-login').classList.remove('hidden')
  document.getElementById('view-main').classList.add('hidden')
  document.getElementById('auth-badge').textContent = 'Not connected'
  document.getElementById('auth-badge').className = 'badge badge-off'
}

function showMainView() {
  document.getElementById('view-login').classList.add('hidden')
  document.getElementById('view-main').classList.remove('hidden')
  document.getElementById('auth-badge').textContent = 'Connected'
  document.getElementById('auth-badge').className = 'badge badge-ok'
}

// ── Load profile data into the popup UI ───────────────────────
async function loadProfile() {
  const resp = await msg('GET_PROFILE')

  if (!resp.ok) {
    if (resp.error === 'no_profile') {
      document.getElementById('profile-name').textContent = 'Profile incomplete'
      document.getElementById('profile-meta').textContent = 'Go to My Profile in the app'
      document.getElementById('profile-crs').textContent  = '—'
      // Disable fill button with explanation
      const fillBtn = document.getElementById('fill-btn')
      fillBtn.disabled = true
      fillBtn.textContent = 'Complete profile first'
      showResult('Open the app → My Profile and fill in your Express Entry details.', 'info')
    }
    return
  }

  const p = resp.data
  const name = p.personal?.given_name
    ? `${p.personal.given_name} ${p.personal.family_name}`
    : 'Your profile'

  const nationality = p.personal?.country_of_citizenship || '—'
  const lang        = p.language?.first_language_test     || '—'
  const crs         = p.crs_score || '—'

  document.getElementById('profile-name').textContent = name
  document.getElementById('profile-meta').textContent = `${nationality} · ${lang}`
  document.getElementById('profile-crs').textContent  = crs

  // Show missing data warning
  if (resp.incomplete && resp.missing?.length) {
    showResult(`Missing data: ${resp.missing.join(', ')} — some fields won't fill`, 'info')
  }
}

// ── Detect page from active tab ───────────────────────────────
async function detectCurrentPage() {
  const fillBtn  = document.getElementById('fill-btn')
  const pageDot  = document.getElementById('page-dot')
  const pageLabel = document.getElementById('page-label')

  try {
    const tab = await getActiveTab()
    if (!tab?.id) return

    const url = tab.url || ''
    const isIrcc = url.includes('canada.ca') || url.includes('prson-srpel.apps.cic.gc.ca')

    if (!isIrcc) {
      pageLabel.textContent = 'Not on an IRCC page'
      pageDot.classList.remove('active')
      fillBtn.disabled = true
      fillBtn.textContent = 'Fill This Page'
      return
    }

    // Ask the content script what page it sees
    let page = 'unknown'
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_PAGE' })
      page = result?.page || 'unknown'
    } catch {
      // Content script may not be injected yet on this exact tab state
      page = 'unknown'
    }

    pageLabel.textContent = PAGE_LABELS[page] || page
    pageDot.classList.toggle('active', PAGE_IS_FILLABLE.includes(page))
    fillBtn.disabled = !PAGE_IS_FILLABLE.includes(page)
    fillBtn.textContent = PAGE_IS_FILLABLE.includes(page) ? 'Fill This Page' : 'Nothing to fill here'

  } catch (e) {
    pageLabel.textContent = 'Could not detect'
    fillBtn.disabled = true
  }
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  const status = await msg('GET_AUTH_STATUS')

  if (status.authenticated) {
    showMainView()
    await loadProfile()
    await detectCurrentPage()
  } else {
    showLoginView()
  }
}

// ── Login handler ─────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const errEl    = document.getElementById('login-error')

  if (!email || !password) {
    errEl.textContent = 'Enter email and password.'
    errEl.classList.remove('hidden')
    return
  }

  setLoading('login-btn', true, 'Signing in…')
  errEl.classList.add('hidden')

  const resp = await msg('LOGIN', { email, password })

  if (resp.ok) {
    showMainView()
    await loadProfile()
    await detectCurrentPage()
  } else {
    errEl.textContent = resp.error || 'Login failed.'
    errEl.classList.remove('hidden')
  }

  setLoading('login-btn', false, 'Sign In')
})

// ── Fill handler ──────────────────────────────────────────────
document.getElementById('fill-btn').addEventListener('click', async () => {
  setLoading('fill-btn', true, 'Filling…')

  try {
    const tab = await getActiveTab()
    if (!tab?.id) {
      showResult('No active tab found.', 'err')
      return
    }

    // Trigger fill in content script
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FILL' })
    showResult(resp?.ok ? '✓ Page filled!' : 'Fill triggered — check the page.', 'ok')

    // Re-check page state
    await detectCurrentPage()
  } catch (e) {
    showResult('Could not reach the page — try reloading the IRCC tab.', 'err')
  } finally {
    setLoading('fill-btn', false, 'Fill This Page')
  }
})

// ── Logout handler ────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  await msg('CLEAR_TOKEN')
  showLoginView()
})

// ── Tab change detection ──────────────────────────────────────
chrome.tabs.onActivated.addListener(() => {
  const mainVisible = !document.getElementById('view-main').classList.contains('hidden')
  if (mainVisible) detectCurrentPage()
})

// ── Boot ──────────────────────────────────────────────────────
init()

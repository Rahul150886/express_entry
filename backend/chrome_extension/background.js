// background.js — Service worker for Express Entry Autofill extension

const API_BASE = 'http://localhost:8000/api/v1'

// ── Auth token management ──────────────────────────────────────
// Token is stored in extension storage (synced from app on login)
async function getToken() {
  const result = await chrome.storage.local.get(['access_token'])
  return result.access_token || null
}

async function setToken(token) {
  await chrome.storage.local.set({ access_token: token })
}

async function clearToken() {
  await chrome.storage.local.remove(['access_token', 'cached_profile', 'cache_time'])
}

// ── Fetch profile from backend ────────────────────────────────
async function fetchProfile(forceRefresh = false) {
  // Return cached if fresh (< 5 min)
  if (!forceRefresh) {
    const cached = await chrome.storage.local.get(['cached_profile', 'cache_time'])
    if (cached.cached_profile && cached.cache_time) {
      const age = Date.now() - cached.cache_time
      if (age < 5 * 60 * 1000) {
        return { ok: true, data: cached.cached_profile }
      }
    }
  }

  const token = await getToken()
  if (!token) {
    return { ok: false, error: 'not_authenticated' }
  }

  try {
    const res = await fetch(`${API_BASE}/profile/ircc-ready`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (res.status === 401) {
      await clearToken()
      return { ok: false, error: 'token_expired' }
    }
    if (!res.ok) {
      return { ok: false, error: `api_error_${res.status}` }
    }

    const data = await res.json()
console.log("Backend profile response:", data)
    // Profile exists in DB but has no Express Entry data yet
    if (data.missing === 'no_profile') {
      return { ok: false, error: 'no_profile', message: data.message }
    }

    await chrome.storage.local.set({ cached_profile: data, cache_time: Date.now() })
    return { ok: true, data, incomplete: !data.profile_complete, missing: data.missing }
  } catch (e) {
    return { ok: false, error: 'network_error', detail: e.message }
  }
}

// ── Message handler ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {

      case 'GET_PROFILE':
        return await fetchProfile(message.forceRefresh || false)

      case 'SET_TOKEN':
        await setToken(message.token)
        return { ok: true }

      case 'CLEAR_TOKEN':
        await clearToken()
        return { ok: true }

      case 'GET_AUTH_STATUS': {
        const token = await getToken()
        if (!token) return { authenticated: false }
        // Quick validate
        try {
          const res = await fetch(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.status === 401) {
            await clearToken()
            return { authenticated: false }
          }
          return { authenticated: true }
        } catch {
          return { authenticated: false, error: 'network_error' }
        }
      }

      case 'LOGIN': {
        const { email, password } = message
        try {
          const form = new FormData()
          form.append('username', email)
          form.append('password', password)
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            body: form,
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            return { ok: false, error: err.detail || 'Invalid credentials' }
          }
          const data = await res.json()
          await setToken(data.access_token)
          return { ok: true }
        } catch (e) {
          return { ok: false, error: 'Cannot connect to Express Entry app. Make sure it is running on localhost:8000.' }
        }
      }

      case 'NOTIFY': {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: message.title || 'Express Entry Autofill',
          message: message.body || '',
        })
        return { ok: true }
      }

      default:
        return { ok: false, error: 'unknown_message_type' }
    }
  }

  handle().then(sendResponse)
  return true  // Keep channel open for async response
})

// ── Tab listener — badge on IRCC pages ───────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const url = tab.url || ''
  const isIrcc = url.includes('cic.gc.ca') || url.includes('canada.ca')
  if (!isIrcc) return

  const token = await getToken()
  if (token) {
    chrome.action.setBadgeText({ text: '✓', tabId })
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId })
  } else {
    chrome.action.setBadgeText({ text: '!', tabId })
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId })
  }
})

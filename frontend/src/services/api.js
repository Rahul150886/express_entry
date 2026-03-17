// src/services/api.js — Axios instance + all API calls

import axios from 'axios'
import toast from 'react-hot-toast'
import log from './logger'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' }
})

// ── Request interceptor: log every outgoing call ──
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  log.debug('API', `▶ ${config.method?.toUpperCase()} ${config.url}`, {
    params: config.params,
    data:   config.data instanceof FormData ? '[FormData]' : config.data,
  })
  config._t0 = Date.now()
  return config
})

// ── Response interceptor: log result or error ──
let isRedirectingToLogin = false  // prevent multiple simultaneous 401 redirects

api.interceptors.response.use(
  res => {
    const ms = Date.now() - (res.config._t0 || 0)
    log.info('API', `✓ ${res.config.method?.toUpperCase()} ${res.config.url} → ${res.status} (${ms}ms)`)
    return res
  },
  async err => {
    const ms     = Date.now() - (err.config?._t0 || 0)
    const status = err.response?.status
    const url    = err.config?.url
    const method = err.config?.method?.toUpperCase()
    const detail = err.response?.data?.detail || err.message

    if (status === 401) {
      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true
        log.warn('API', `401 on ${method} ${url} — clearing tokens, redirecting to login`)
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        // Use React Router navigation instead of hard redirect to avoid flash
        window.dispatchEvent(new CustomEvent('auth:logout'))
        setTimeout(() => { isRedirectingToLogin = false }, 3000)
      }
    } else if (status !== 404) {
      // Suppress 404s — they are expected (no active case, no profile yet)
      log.error('API', `✗ ${method} ${url} → ${status ?? 'network error'} (${ms}ms): ${detail}`, err.response?.data)
      toast.error(detail || 'Something went wrong')
    }

    return Promise.reject(err)
  }
)

// ─── Auth ───────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (email, password) => {
    const form = new FormData()
    form.append('username', email)
    form.append('password', password)
    return api.post('/auth/login', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}

// ─── Profile ────────────────────────────────
export const profileAPI = {
  get:              ()     => api.get('/profile'),
  create:           (data) => api.post('/profile', data),
  update:           (data) => api.put('/profile', data),
  // Smart upsert — creates profile if none exists, updates if it does
  // Used by onboarding where user may not have a profile yet
  updatePersonal: async (data) => {
    try {
      return await api.put('/profile', data)
    } catch (err) {
      if (err?.response?.status === 404) {
        // No profile yet — create it
        return await api.post('/profile', data)
      }
      throw err
    }
  },
  getIrccReady:    ()     => api.get('/profile/ircc-ready'),
  getVerified:     ()     => api.get('/profile/ircc-verified'),
  getSyncStatus:   ()     => api.get('/profile/sync-status'),
  syncAction:      (data) => api.post('/profile/sync-action', data),
  addLanguageTest:    (data)     => api.post('/profile/language-tests', data),
  updateLanguageTest: (id, data) => api.put(`/profile/language-tests/${id}`, data),
  deleteLanguageTest: (id)       => api.delete(`/profile/language-tests/${id}`),
  saveSpouseLanguageTest:   (data) => api.post('/profile/spouse-language-test', data),
  getSpouseLanguageTest:    ()     => api.get('/profile/spouse-language-test'),
  deleteSpouseLanguageTest: ()     => api.delete('/profile/spouse-language-test'),
  addWorkExperience:    (data)     => api.post('/profile/work-experience', data),
  updateWorkExperience: (id, data) => api.put(`/profile/work-experience/${id}`, data),
  deleteWorkExperience: (id)       => api.delete(`/profile/work-experience/${id}`),
  setEducation: (data) => api.post('/profile/education', data),
  setJobOffer:  (data) => api.post('/profile/job-offer', data),
}

// ─── CRS ────────────────────────────────────
export const crsAPI = {
  calculate: () => api.post('/crs/calculate'),
  getHistory:() => api.get('/crs/history'),
}

// ─── Documents ──────────────────────────────
export const documentsAPI = {
  getAll: () => api.get('/documents'),
  upload: (file, documentType, personLabel = 'applicant', personNote = '') => {
    const form = new FormData()
    form.append('file', file)
    form.append('document_type', documentType)
    form.append('person_label', personLabel)
    form.append('person_note', personNote)
    log.info('Documents', `Uploading file="${file.name}" size=${(file.size/1024).toFixed(1)}KB type=${documentType} person=${personLabel}`)
    return api.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getReview:   (id) => api.get(`/documents/${id}/review`),
  getPreview:  (id) => api.get(`/documents/${id}/preview`, { responseType: 'arraybuffer' }),
  reReview:    (id) => api.post(`/documents/${id}/re-review`),
  delete:    (id) => api.delete(`/documents/${id}`),
}

// ─── Draws ──────────────────────────────────
export const drawsAPI = {
  getAll:          (params) => api.get('/draws', { params }),
  getStats:        ()       => api.get('/draws/stats'),
  getTypes:        ()       => api.get('/draws/types'),
  getEligibility:  ()       => api.get('/draws/eligibility'),
}

// ─── Cases ──────────────────────────────────
export const casesAPI = {
  getActive: () => api.get('/cases/active').catch(err => {
    if (err?.response?.status === 404) return { data: null }  // No ITA yet — not an error
    return Promise.reject(err)
  }),
  recordITA:           (drawId)     => api.post('/cases/ita-received', null, { params: drawId ? { draw_id: drawId } : {} }),
  updateChecklistItem: (id, data)   => api.patch(`/cases/checklist/${id}`, null, { params: data }),
  updateStatus:        (id, status) => api.patch(`/cases/${id}/status`, null, { params: { status } }),
}

// ─── AI ─────────────────────────────────────
export const aiAPI = {
  findNoc:            (data) => api.post('/ai/noc-finder', { job_duties: '', ...data }),
  getCrsImprovements: ()     => api.get('/ai/crs-improvements'),
  getDrawPrediction:  ()     => api.get('/ai/draw-prediction'),
  // Chat is streaming — handled separately in hook
}

// ─── Tools ──────────────────────────────────
export const toolsAPI = {
  // Score Simulator
  simulateChanges:   (changes) => api.post('/tools/simulator', { changes }),
  getScenarios:      ()        => api.get('/tools/simulator/scenarios'),

  // PNP Matcher
  matchPNP:          (province_preference) => api.post('/tools/pnp-matcher', { province_preference }),

  // Draw Frequency Predictor
  predictDraws:      (draw_type) => api.get('/tools/draw-predictor', { params: draw_type ? { draw_type } : {} }),

  // Study Plan
  generateStudyPlan: (target_crs, timeline_months) => api.post('/tools/study-plan', { target_crs, timeline_months }),

  // Letter Writer
  getLetterTypes:    ()         => api.get('/tools/letter-writer/types'),
  generateLetter:    (letter_type, context) => api.post('/tools/letter-writer', { letter_type, context }),

  // Peer Comparison
  getPeerComparison: ()         => api.get('/tools/peer-comparison'),
}

// ─── Notifications ──────────────────────────
export const notificationsAPI = {
  getAll:    (unreadOnly = false) => api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markRead:  (id)                 => api.patch(`/notifications/${id}/read`),
  markAllRead: ()                 => api.post('/notifications/mark-all-read'),
}

export default api

// ─── IELTS ───────────────────────────────────
export const ieltsAPI = {
  getDiagnostic:    ()           => api.get('/ielts/diagnostic'),
  assessLevel:      (data)       => api.post('/ielts/assess-level', data),
  getPractice:      (data)       => api.post('/ielts/practice', data),
  grade:            (data)       => api.post('/ielts/grade', data),
  getProgress:      ()           => api.get('/ielts/progress'),
  getSessionDetail: (id)         => api.get(`/ielts/progress/${id}`),
  generateMock:     (data)       => api.post('/ielts/mock/generate', data),
  gradeMock:        (data)       => api.post('/ielts/mock/grade', data),
}

// ─── Eligibility ─────────────────────────────
export const eligibilityAPI = {
  check: () => api.get('/eligibility/check'),
}

// ─── Form 1 Application Workflow ─────────────
export const applicationAPI = {
  getForm1Readiness:        ()    => api.get('/application/form1/readiness'),
  validateDocumentDeep:     (id)  => api.post(`/application/form1/validate-document?document_id=${id}`),
  getForm2Readiness:        ()    => api.get('/application/form2/readiness'),
  validateDocumentForm2:    (id)  => api.post(`/application/form2/validate-document?document_id=${id}`),
}

// ─── IRCC PDF Generator ──────────────────────
export const irccPdfAPI = {
  downloadForm1: () => api.get('/profile/ircc-pdf/form1', { responseType: 'blob' }),
  downloadForm2: () => api.get('/profile/ircc-pdf/form2', { responseType: 'blob' }),
}


export const documentsGeneratorAPI = {
  generateTranscript: (extra_context = '') => api.post('/documents/generate-transcript', { extra_context }),
  generateWorkLetter: (work_experience_id, extra_context = '') => api.post('/documents/generate-work-letter', { work_experience_id, extra_context }),
}

// ─── Student Visa Module ──────────────────────
export const studentAPI = {
  // Profile & Eligibility
  getProfile:              ()        => api.get('/student/profile'),
  upsertProfile:           (data)    => api.post('/student/profile', data),
  checkEligibility:        ()        => api.post('/student/eligibility'),
  // AI Document Tools
  generateSOP:             (data)    => api.post('/student/ai/sop', data),
  generateFinancialLetter: (data)    => api.post('/student/ai/financial-letter', data),
  analyzeVisaRisk:         (country) => api.post('/student/ai/visa-risk', { country }),
  getDocuments:            ()        => api.get('/student/documents'),
  deleteDocument:          (id)      => api.delete(`/student/documents/${id}`),
  // Application Tracker
  listApplications:        ()        => api.get('/student/applications'),
  createApplication:       (data)    => api.post('/student/applications', data),
  updateApplication:       (id, data)=> api.put(`/student/applications/${id}`, data),
  deleteApplication:       (id)      => api.delete(`/student/applications/${id}`),
  getDeadlines:            ()        => api.get('/student/deadlines'),
  // Financial Tools
  calculateFunds:          (params)  => api.get('/student/financial/calculator', { params }),
  findScholarships:        (params)  => api.get('/student/scholarships', { params }),
  // PR Pathway
  getPRPathway:            (country)  => api.get('/student/pr-pathway', { params: { country } }),
  saveMilestoneCheckins:   (checkins) => api.post('/student/pr-pathway/checkin', { checkins }),
}
// src/services/logger.js
// Structured browser logger — all output tagged with [EE] so you can filter in DevTools
// Usage: import log from '../services/logger'
//        log.info('Auth', 'login success', { userId })
//        log.error('Documents', 'upload failed', err)

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL = import.meta.env.DEV ? LEVELS.debug : LEVELS.info

const COLOURS = {
  debug: 'color:#64748b',
  info:  'color:#38bdf8',
  warn:  'color:#f59e0b;font-weight:bold',
  error: 'color:#f87171;font-weight:bold',
}

function buildLogger(level) {
  return (module, message, data) => {
    if (LEVELS[level] < MIN_LEVEL) return
    const ts   = new Date().toISOString().slice(11, 23)          // HH:MM:SS.mmm
    const tag  = `%c[EE][${ts}][${module}]`
    const text = ` ${level.toUpperCase()} — ${message}`
    if (data !== undefined) {
      console[level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error'](
        tag + text, COLOURS[level], data
      )
    } else {
      console[level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error'](
        tag + text, COLOURS[level]
      )
    }
  }
}

const log = {
  debug: buildLogger('debug'),
  info:  buildLogger('info'),
  warn:  buildLogger('warn'),
  error: buildLogger('error'),

  // Convenience: log an API error with status code + endpoint
  apiError: (module, method, url, err) => {
    const status  = err?.response?.status
    const detail  = err?.response?.data?.detail || err?.message || String(err)
    buildLogger('error')(module, `API ${method} ${url} → ${status ?? 'network error'}: ${detail}`, err?.response?.data)
  },

  // Convenience: log a successful API response
  apiOk: (module, method, url, extra) => {
    buildLogger('info')(module, `API ${method} ${url} → 200 OK`, extra)
  },
}

export default log

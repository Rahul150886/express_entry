// src/hooks/index.js

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { profileAPI, crsAPI, documentsAPI, drawsAPI, casesAPI, notificationsAPI } from '../services/api'
import { useAppStore, useAuthStore } from '../store'
import log from '../services/logger'

// ─── Profile ─────────────────────────────────
export function useProfile() {
  return useQuery('profile', () => profileAPI.get().then(r => r.data), {
    onSuccess: (data) => log.info('useProfile', `loaded: name=${data?.full_name}  crs=${data?.crs_score}`),
    onError: (err) => log.error('useProfile', 'fetch failed', err?.response?.data),
    retry: false,
  })
}

// ─── CRS ─────────────────────────────────────
export function useCrs() {
  const setCrs = useAppStore(s => s.setCrs)
  const qc = useQueryClient()

  const calculate = useMutation(() => crsAPI.calculate().then(r => r.data), {
    onMutate: () => log.info('useCrs', 'calculate triggered'),
    onSuccess: (data) => {
      log.info('useCrs', `calculate success: total=${data?.score?.total}  programs=${JSON.stringify(data?.eligibility?.eligible_programs)}`)
      setCrs(data.score, data.breakdown)

      // Seed the eligibility cache directly from the CRS response so the
      // Dashboard eligibility grid refreshes immediately without waiting for
      // a separate /eligibility/check round-trip.
      if (data?.eligibility) {
        const programs = data.eligibility.eligible_programs || []
        const reasons  = data.eligibility.reasons || {}
        // Build the shape the Dashboard expects from eligibilityAPI.check()
        const eligibilityPayload = {
          programs: Object.fromEntries(
            ['FSW', 'CEC', 'FST', 'PNP', 'Atlantic', 'Rural'].map(code => [
              code,
              { eligible: programs.includes(code), reasons: reasons[code] || [] }
            ])
          ),
          eligible_programs: programs,
          crs_score: data.score?.total,
        }
        qc.setQueryData('eligibility-check-dashboard', eligibilityPayload)
      }

      // Invalidate stale derived queries
      qc.invalidateQueries('crs-history')
      qc.invalidateQueries('profile')
      qc.invalidateQueries('crs-improvements')
      qc.invalidateQueries('draw-prediction')
      toast.success(`CRS Score: ${data.score.total} pts — dashboard updated!`)
    },
    onError: (err) => log.error('useCrs', 'calculate failed', err?.response?.data),
  })

  const history = useQuery('crs-history', () => crsAPI.getHistory().then(r => r.data), {
    onSuccess: (data) => log.debug('useCrs', `history loaded: ${data?.length} entries`),
    onError:   (err)  => log.error('useCrs', 'history fetch failed', err?.response?.data),
  })

  return { calculate, history }
}

// ─── Documents ────────────────────────────────
export function useDocuments() {
  const qc = useQueryClient()

  const query = useQuery('documents', () => documentsAPI.getAll().then(r => r.data), {
    onSuccess: (data) => log.info('useDocuments', `loaded: ${data?.length} docs`),
    onError: (err) => log.error('useDocuments', 'getAll failed', err?.response?.data),
  })

  const upload = useMutation(
    ({ file, type }) => {
      log.info('useDocuments', `uploading: file="${file.name}"  size=${(file.size/1024).toFixed(1)}KB  type=${type}`)
      return documentsAPI.upload(file, type).then(r => r.data)
    },
    {
      onSuccess: (data) => {
        log.info('useDocuments', `upload success: doc_id=${data?.document_id}  status=${data?.status}`)
        toast.success('Document uploaded! AI analysis started...')
        qc.invalidateQueries('documents')
      },
      onError: (err) => log.error('useDocuments', 'upload failed', err?.response?.data),
    }
  )

  return { query, upload }
}

// ─── Draws ────────────────────────────────────
export function useDraws() {
  return useQuery('draws', () => drawsAPI.getAll().then(r => r.data), {
    onSuccess: (data) => log.info('useDraws', `loaded: ${data?.length} draws  latest_min_crs=${data?.[0]?.minimum_crs}`),
    onError: (err) => log.error('useDraws', 'fetch failed', err?.response?.data),
    refetchInterval: 30 * 60 * 1000,
  })
}

export function useDrawStats() {
  return useQuery('draw-stats', () => drawsAPI.getStats().then(r => r.data), {
    onSuccess: (data) => log.debug('useDrawStats', 'loaded', data),
    onError:   (err)  => log.error('useDrawStats', 'fetch failed', err?.response?.data),
  })
}

// ─── Cases ────────────────────────────────────
export function useActiveCase() {
  return useQuery('active-case',
    () => casesAPI.getActive().then(r => r.data).catch(err => {
      if (err?.response?.status === 404) return null  // No ITA yet — expected
      throw err
    }),
    {
      onSuccess: (data) => {
        if (data) log.info('useActiveCase', `loaded: case_id=${data?.case?.id}`)
      },
      onError: (err) => log.error('useActiveCase', 'unexpected error', err?.response?.data),
      retry: false,
    }
  )
}

// ─── Notifications ────────────────────────────
export function useNotifications() {
  return useQuery('notifications', () => notificationsAPI.getAll().then(r => r.data), {
    onSuccess: (data) => {
      const unread = data?.filter(n => !n.is_read).length ?? 0
      log.debug('useNotifications', `polled: total=${data?.length}  unread=${unread}`)
    },
    onError: (err) => log.error('useNotifications', 'fetch failed', err?.response?.data),
    refetchInterval: 60000,
  })
}

// ─── WebSocket (Draw Alerts) ──────────────────
export function useDrawWebSocket() {
  const { user } = useAuthStore()
  const { addNotification, setWsConnected } = useAppStore()
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const reconnectAttempts = useRef(0)

  useEffect(() => {
    if (!user?.id) {
      log.debug('useDrawWebSocket', 'no user — skipping WebSocket setup')
      return
    }

    function connect() {
      const wsUrl = `ws://${window.location.host}/ws/draws/${user.id}`
      log.info('useDrawWebSocket', `connecting: ${wsUrl}  attempt=${reconnectAttempts.current + 1}`)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttempts.current = 0
        log.info('useDrawWebSocket', `connected: user_id=${user.id}`)
        setWsConnected(true)
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
            log.debug('useDrawWebSocket', 'ping sent')
          }
        }, 30000)
        ws._pingInterval = ping
      }

      ws.onmessage = (e) => {
        log.debug('useDrawWebSocket', `message received: ${e.data.slice(0, 120)}`)
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'new_draw') {
            log.info('useDrawWebSocket', `NEW DRAW #${data.draw_number}  min_crs=${data.min_crs}  qualifies=${data.qualifies}`)
            toast.success(`🍁 New Draw #${data.draw_number}! Min CRS: ${data.min_crs}`, { duration: 8000 })
            addNotification({
              id: Date.now(),
              title: `New Draw #${data.draw_number}`,
              body: `Min CRS: ${data.min_crs} | ${data.invitations} invitations`,
              is_read: false,
              created_at: new Date().toISOString(),
              notification_type: 'draw_alert'
            })
          } else if (data.type === 'document_analyzed') {
            log.info('useDrawWebSocket', `document_analyzed: doc_id=${data.document_id}  status=${data.status}  issues=${data.issues_count}`)
            toast.success('Document analysis complete!', { duration: 4000 })
          } else if (data.type !== 'pong') {
            log.warn('useDrawWebSocket', `unknown message type: ${data.type}`, data)
          }
        } catch (err) {
          log.warn('useDrawWebSocket', `could not parse message: ${e.data.slice(0, 80)}`, err)
        }
      }

      ws.onerror = (err) => {
        log.error('useDrawWebSocket', `WebSocket error — url=${wsUrl}`, err)
      }

      ws.onclose = (ev) => {
        clearInterval(ws._pingInterval)
        setWsConnected(false)
        reconnectAttempts.current += 1
        const delay = Math.min(5000 * reconnectAttempts.current, 30000)
        log.warn('useDrawWebSocket', `closed: code=${ev.code}  reason=${ev.reason || 'none'}  reconnect in ${delay}ms  attempt=${reconnectAttempts.current}`)
        reconnectRef.current = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      log.info('useDrawWebSocket', 'cleanup — closing WebSocket')
      wsRef.current?.close()
    }
  }, [user?.id])
}

// ─── AI Chat (Streaming) ──────────────────────
export function useAiChat(sessionId, welcomeMessage) {
  const defaultWelcome = welcomeMessage || "Hi! I'm your Express Entry assistant 🍁 I can help you understand the process, improve your CRS score, and answer any questions about your application. What would you like to know?"
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: defaultWelcome
  }])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(null)

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return

    log.info('useAiChat', `sending: session=${sessionId}  msg_len=${text.length}  history=${messages.length}  text="${text.slice(0, 60)}"`)

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)

    const aiMsg = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, aiMsg])

    const token = localStorage.getItem('access_token')
    const controller = new AbortController()
    abortRef.current = controller
    const t0 = Date.now()

    try {
      const params = new URLSearchParams({ message: text, session_id: sessionId })
      log.debug('useAiChat', `fetch stream: GET /api/v1/ai/chat?${params}`)
      const response = await fetch(`/api/v1/ai/chat?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      })

      if (!response.ok) {
        log.error('useAiChat', `stream response error: status=${response.status}`)
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let chunkCount = 0
      let charCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const rawText = decoder.decode(value)
        const lines = rawText.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk) {
              chunkCount++
              charCount += data.chunk.length
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + data.chunk
                }
                return updated
              })
            } else if (data.error) {
              log.error('useAiChat', `stream error from server: ${data.error}`)
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: `⚠️ ${data.error}` }
                return updated
              })
            }
          } catch (parseErr) {
            log.warn('useAiChat', `could not parse SSE line: ${line.slice(0, 80)}`, parseErr)
          }
        }
      }

      log.info('useAiChat', `stream complete: chunks=${chunkCount}  chars=${charCount}  elapsed=${Date.now()-t0}ms`)

    } catch (err) {
      if (err.name === 'AbortError') {
        log.info('useAiChat', `stream aborted by user after ${Date.now()-t0}ms`)
      } else {
        log.error('useAiChat', `stream error after ${Date.now()-t0}ms: ${err.message}`, err)
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
    }
  }, [sessionId, isStreaming])

  const stop  = () => { log.info('useAiChat', 'stop requested'); abortRef.current?.abort() }
  const clear = () => { log.info('useAiChat', 'conversation cleared'); setMessages([{ role: 'assistant', content: defaultWelcome }]) }

  return { messages, sendMessage, isStreaming, stop, clear }
}
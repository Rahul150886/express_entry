// src/store/index.js — Global state with Zustand

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import log from '../services/logger'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) => {
        log.info('AuthStore', `setAuth: user=${user?.email}  authenticated=true`)
        set({ user, token, isAuthenticated: true })
      },
      logout: () => {
        log.info('AuthStore', 'logout: clearing tokens and user state')
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, token: null, isAuthenticated: false })
      }
    }),
    { name: 'auth-store', partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }) }
  )
)

export const useAppStore = create((set, get) => ({
  profile: null,
  crsScore: null,
  crsBreakdown: null,
  documents: [],
  draws: [],
  activeCase: null,
  notifications: [],
  unreadCount: 0,
  wsConnected: false,

  setProfile: (profile) => {
    log.info('AppStore', `setProfile: name=${profile?.full_name}  crs=${profile?.crs_score}`)
    set({ profile })
  },
  setCrs: (score, breakdown) => {
    log.info('AppStore', `setCrs: total=${score?.total}  core=${score?.core_human_capital}  transferability=${score?.skill_transferability}  additional=${score?.additional_points}`)
    set({ crsScore: score, crsBreakdown: breakdown })
  },
  setDocuments: (documents) => {
    log.info('AppStore', `setDocuments: count=${documents?.length}  statuses=${[...new Set(documents?.map(d => d.status))].join(',')}`)
    set({ documents })
  },
  setDraws: (draws) => {
    log.info('AppStore', `setDraws: count=${draws?.length}  latest=${draws?.[0]?.minimum_crs ?? 'none'}`)
    set({ draws })
  },
  setActiveCase: (activeCase) => {
    log.info('AppStore', `setActiveCase: case_id=${activeCase?.id}  status=${activeCase?.status}  checklist_items=${activeCase?.checklist_items?.length ?? 0}`)
    set({ activeCase })
  },
  setNotifications: (notifications) => {
    const unread = notifications?.filter(n => !n.is_read).length ?? 0
    log.info('AppStore', `setNotifications: total=${notifications?.length}  unread=${unread}`)
    set({ notifications, unreadCount: unread })
  },
  addNotification: (notification) => {
    log.info('AppStore', `addNotification: id=${notification.id}  type=${notification.notification_type}  title=${notification.title}`)
    set(state => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.is_read ? 0 : 1)
    }))
  },
  markNotificationRead: (id) => {
    log.debug('AppStore', `markNotificationRead: id=${id}`)
    set(state => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, is_read: true } : n),
      unreadCount: Math.max(0, state.unreadCount - 1)
    }))
  },
  setWsConnected: (wsConnected) => {
    log.info('AppStore', `setWsConnected: ${wsConnected}`)
    set({ wsConnected })
  },
  addDocument: (doc) => {
    log.info('AppStore', `addDocument: id=${doc.id}  type=${doc.document_type}  status=${doc.status}`)
    set(state => ({ documents: [doc, ...state.documents] }))
  },
  updateDocument: (id, updates) => {
    log.debug('AppStore', `updateDocument: id=${id}  updates=${JSON.stringify(updates)}`)
    set(state => ({
      documents: state.documents.map(d => d.id === id ? { ...d, ...updates } : d)
    }))
  },
}))

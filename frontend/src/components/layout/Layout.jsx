import React from 'react'
// src/components/layout/Layout.jsx

import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, User, FileText, TrendingUp, MessageSquare,
  Bell, LogOut, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Leaf, Wrench, ClipboardCheck, GraduationCap
} from 'lucide-react'
import { useAuthStore, useAppStore } from '../../store'
import { useDrawWebSocket, useNotifications } from '../../hooks'
import { notificationsAPI } from '../../services/api'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

// 5 nav items — consolidated from 10
const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',     desc: 'Overview & score'  },
  { to: '/profile',   icon: User,            label: 'My Profile',    desc: 'CRS profile data'  },
  { to: '/documents', icon: FileText,        label: 'Documents',     desc: 'Upload & review'   },
  { to: '/draws',     icon: TrendingUp,      label: 'Draw Tracker',  desc: 'CRS history'       },
  { to: '/tools/hub', icon: Wrench,          label: 'Tools',         desc: 'All AI tools'      },
  { to: '/ircc-assist',   icon: ClipboardCheck,  label: 'IRCC Assist',   desc: 'Fill forms faster' },
  { to: '/student',   icon: GraduationCap,   label: 'Student Visa',  desc: 'Eligibility & SOP' },
]

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const { logout, user } = useAuthStore()
  const { unreadCount, notifications, markNotificationRead, wsConnected } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()

  useDrawWebSocket()
  useNotifications()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden gradient-bg">

      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 224 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="relative flex flex-col glass border-r border-slate-800 z-10 flex-shrink-0"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
          <div className="w-9 h-9 bg-maple-500 rounded-xl flex items-center justify-center flex-shrink-0 glow-maple">
            <Leaf size={18} className="text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="font-display font-bold text-white text-sm leading-tight">Express</p>
                <p className="font-display font-bold text-maple-400 text-sm leading-tight">Entry PR</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label, desc }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx('nav-link group relative', isActive && 'active', collapsed && 'justify-center px-2')
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    <p className="text-sm leading-tight">{label}</p>
                    <p className="text-[10px] text-slate-600 group-hover:text-slate-500 leading-tight">{desc}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                  <p className="font-semibold">{label}</p>
                  <p className="text-slate-400 text-[10px]">{desc}</p>
                </div>
              )}
            </NavLink>
          ))}

          {/* AI Assistant — separated visually */}
          <div className="pt-3 mt-2 border-t border-slate-800/60">
            <NavLink
              to="/assistant"
              className={({ isActive }) =>
                clsx('nav-link group relative', isActive && 'active', collapsed && 'justify-center px-2')
              }
            >
              <MessageSquare size={18} className="flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    <p className="text-sm leading-tight">AI Assistant</p>
                    <p className="text-[10px] text-slate-600 group-hover:text-slate-500 leading-tight">Ask anything</p>
                  </motion.div>
                )}
              </AnimatePresence>
              {collapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                  <p className="font-semibold">AI Assistant</p>
                  <p className="text-slate-400 text-[10px]">Ask anything</p>
                </div>
              )}
            </NavLink>
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-2 py-4 border-t border-slate-800 space-y-0.5">
          <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg text-xs', collapsed && 'justify-center')}>
            {wsConnected
              ? <Wifi size={13} className="text-emerald-400 flex-shrink-0" />
              : <WifiOff size={13} className="text-slate-500 flex-shrink-0" />
            }
            {!collapsed && (
              <span className={clsx('text-[10px]', wsConnected ? 'text-emerald-400' : 'text-slate-500')}>
                {wsConnected ? 'Live alerts on' : 'Connecting...'}
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={clsx('nav-link w-full text-slate-500 hover:text-maple-400', collapsed && 'justify-center px-2')}
          >
            <LogOut size={17} />
            {!collapsed && <span className="text-sm">Sign Out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center border border-slate-600 transition-colors z-20"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </motion.aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 glass">
          <div>
            <p className="text-slate-500 text-xs">Welcome back</p>
            <p className="font-semibold text-white text-sm">{user?.full_name || 'Applicant'}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="relative w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                <Bell size={15} className="text-slate-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-maple-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifs && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 top-12 w-80 glass rounded-2xl border border-slate-700 shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                      <p className="font-semibold text-white text-sm">Notifications</p>
                      <button onClick={() => setShowNotifs(false)} className="text-slate-500 hover:text-white text-xs">Close</button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-center text-slate-500 py-6 text-sm">No notifications</p>
                      ) : notifications.slice(0, 10).map(n => (
                        <div
                          key={n.id}
                          onClick={async () => {
                            markNotificationRead(n.id)
                            if (!n.is_read) { try { await notificationsAPI.markRead(n.id) } catch {} }
                          }}
                          className={clsx('px-4 py-3 border-b border-slate-800 hover:bg-slate-800 cursor-pointer transition-colors', !n.is_read && 'bg-maple-500/5')}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && <div className="w-1.5 h-1.5 bg-maple-400 rounded-full mt-1.5 flex-shrink-0" />}
                            <div className={!n.is_read ? '' : 'ml-3.5'}>
                              <p className="text-sm font-medium text-white">{n.title}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Avatar */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-maple-500 to-maple-700 flex items-center justify-center text-white font-bold text-sm">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}

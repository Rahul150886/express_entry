import React from 'react'
// src/pages/Application.jsx
// Existing application tracker + Chrome Extension Setup Guide

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, Clock, CheckCircle2, Circle, AlertTriangle,
  ChevronDown, ChevronRight, Loader2, Flag,
  Chrome, Download, ExternalLink, Play, CheckCheck,
  Zap, Shield, Copy, Check, MousePointer, LogIn, Bot
} from 'lucide-react'
import { useMutation, useQueryClient } from 'react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { useActiveCase } from '../hooks'
import { casesAPI } from '../services/api'
import log from '../services/logger'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Extension Guide ────────────────────────────────────────────────
const GUIDE_STEPS = [
  {
    num: 1,
    icon: Download,
    title: 'Download the Extension',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    desc: 'Download the Express Entry Autofill extension from your dashboard.',
    action: 'Download Extension (.zip)',
    actionHref: null, // handled by onClick
    tip: 'The extension is a .zip file — you\'ll unpack it in step 2.',
  },
  {
    num: 2,
    icon: Chrome,
    title: 'Load in Chrome',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    desc: 'Open Chrome and go to chrome://extensions — enable Developer Mode, then click "Load unpacked" and select the unzipped folder.',
    code: 'chrome://extensions',
    tip: 'Toggle "Developer mode" in the top-right corner first.',
  },
  {
    num: 3,
    icon: LogIn,
    title: 'Log in via Extension',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    desc: 'Click the 🍁 extension icon in your Chrome toolbar. Log in with your Express Entry PR account email and password.',
    tip: 'This is your login for this app — not your GCKey or IRCC login.',
  },
  {
    num: 4,
    icon: ExternalLink,
    title: 'Start your IRCC Application',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    desc: 'Go to the IRCC Express Entry portal. The extension detects the page automatically.',
    action: 'Open IRCC Portal',
    actionHref: 'https://onlineservices-servicesenligne.cic.gc.ca/eapp/eapp?modifyCaller=PAQ',
    tip: 'You\'ll need a GCKey / Sign-In Canada account to access the IRCC portal.',
  },
  {
    num: 5,
    icon: MousePointer,
    title: 'Fill Each Page',
    color: 'bg-maple-500/10 text-maple-400 border-maple-500/20',
    desc: 'On each IRCC page, click "Fill This Page" in the overlay widget. The extension auto-fills all detected fields from your profile.',
    tip: 'Locked fields (grey) are already filled by IRCC and are skipped automatically.',
  },
  {
    num: 6,
    icon: CheckCheck,
    title: 'Review & Submit',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    desc: 'Review every filled field before submitting each section. The extension fills — you verify. Never submit without reviewing.',
    tip: '⚠️ Always verify the data before clicking Save or Next on IRCC.',
  },
]

const FEATURES = [
  { icon: Zap,    label: 'Auto-fills wizard questions',  desc: 'Province, language, work, education, DOB — all filled from your profile' },
  { icon: Bot,    label: 'Smart field detection',        desc: 'Detects which IRCC page you\'re on and fills the right fields' },
  { icon: Shield, label: 'Read-only on locked fields',   desc: 'Never touches fields that IRCC has locked — safe and compliant' },
]

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 hover:border-slate-600 transition-colors"
    >
      {code}
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-slate-500" />}
    </button>
  )
}

function ExtensionGuide() {
  const [openStep, setOpenStep] = useState(1)

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="card border border-slate-700">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-maple-500/10 border border-maple-500/20 flex items-center justify-center flex-shrink-0 text-2xl">
            🍁
          </div>
          <div>
            <p className="font-bold text-white text-base">Chrome Extension — Auto-fill IRCC Forms</p>
            <p className="text-xs text-slate-400 mt-1">
              Your profile data is already saved here. The extension reads it and fills your IRCC application automatically — no re-typing.
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {FEATURES.map(f => (
            <div key={f.label} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <f.icon size={14} className="text-maple-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-white">{f.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* What it fills */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">What it fills automatically</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              'Province selection', 'Language test type', 'IELTS scores',
              'Test date', 'Canadian work exp.', 'Foreign work exp.',
              'Funds & family size', 'Job offer (Yes/No)', 'Date of birth',
              'Education level', 'Marital status', 'Name + gender',
              'Country of birth', 'Citizenship', 'Country of residence',
            ].map(item => (
              <div key={item} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <CheckCircle2 size={10} className="text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step by step */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Setup Guide — 6 steps</p>
        <div className="space-y-2">
          {GUIDE_STEPS.map((step) => {
            const Icon = step.icon
            const isOpen = openStep === step.num
            return (
              <div
                key={step.num}
                className={clsx(
                  'rounded-2xl border transition-all',
                  isOpen ? 'border-slate-700 bg-slate-800/40' : 'border-slate-800 bg-slate-800/20'
                )}
              >
                <button
                  onClick={() => setOpenStep(isOpen ? null : step.num)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border', step.color)}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-600">STEP {step.num}</span>
                    </div>
                    <p className="font-semibold text-white text-sm">{step.title}</p>
                  </div>
                  <ChevronDown size={14} className={clsx('text-slate-500 transition-transform', isOpen && 'rotate-180')} />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
                        <p className="text-sm text-slate-300">{step.desc}</p>

                        {step.code && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Type in Chrome:</span>
                            <CopyCode code={step.code} />
                          </div>
                        )}

                        {step.tip && (
                          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50">
                            <Zap size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-slate-400">{step.tip}</p>
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          {step.action && step.actionHref && (
                            <a
                              href={step.actionHref}
                              target="_blank" rel="noopener noreferrer"
                              className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
                            >
                              <ExternalLink size={12} /> {step.action}
                            </a>
                          )}
                          {step.num < GUIDE_STEPS.length && (
                            <button
                              onClick={() => setOpenStep(step.num + 1)}
                              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                            >
                              Next step <ChevronRight size={12} />
                            </button>
                          )}
                          {step.num === GUIDE_STEPS.length && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                              <CheckCheck size={14} /> Setup complete — start filling!
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      {/* Important notes */}
      <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
        <p className="text-sm font-semibold text-amber-400 mb-2">⚠️ Important — Always review before submitting</p>
        <ul className="space-y-1 text-xs text-slate-400">
          <li>• The extension fills fields based on your profile — verify every field is correct</li>
          <li>• Some fields may need manual entry (city of birth, funds amount, passport details)</li>
          <li>• Never click "Save" or "Next" on IRCC without reviewing the filled data</li>
          <li>• If a field looks wrong, correct it manually before proceeding</li>
        </ul>
      </div>
    </div>
  )
}

// ── Original Application page content (preserved) ─────────────────
function DeadlineCountdown({ deadline, daysRemaining }) {
  const isUrgent = daysRemaining <= 7
  const isWarning = daysRemaining <= 14

  return (
    <div className={clsx(
      'p-4 rounded-2xl border text-center',
      isUrgent ? 'bg-maple-500/15 border-maple-500/40' : isWarning ? 'bg-amber-500/15 border-amber-500/40' : 'bg-emerald-500/10 border-emerald-500/20'
    )}>
      <p className="text-xs text-slate-400 mb-1">ITA Deadline</p>
      <p className={clsx('text-4xl font-display font-extrabold', isUrgent ? 'text-maple-400 glow-text' : isWarning ? 'text-amber-400' : 'text-emerald-400')}>
        {daysRemaining}
      </p>
      <p className="text-slate-300 text-sm font-medium">days remaining</p>
      <p className="text-xs text-slate-500 mt-1">{format(parseISO(deadline), 'MMMM d, yyyy')}</p>
      {isUrgent && <p className="text-xs text-maple-400 font-semibold mt-2">⚠️ URGENT — Submit immediately!</p>}
    </div>
  )
}

const CHECKLIST = [
  { id: 'passport',    label: 'Valid passport (all family members)',           category: 'identity'   },
  { id: 'ielts',       label: 'Language test results (IELTS TRF / CELPIP)',   category: 'language'   },
  { id: 'eca',         label: 'Educational Credential Assessment (ECA)',       category: 'education'  },
  { id: 'work_letter', label: 'Work reference letters (all qualifying jobs)',  category: 'work'       },
  { id: 'pay_stubs',   label: 'Pay stubs or T4s (Canadian experience)',        category: 'work'       },
  { id: 'police',      label: 'Police certificates (each country 6+ months)', category: 'background' },
  { id: 'medical',     label: 'Medical exam by IRCC-designated physician',    category: 'health'     },
  { id: 'photos',      label: 'Photos — IRCC specification (45mm × 35mm)',   category: 'identity'   },
  { id: 'funds',       label: 'Proof of settlement funds',                    category: 'financial'  },
  { id: 'biometrics',  label: 'Biometrics appointment booked',                category: 'identity'   },
]

const TABS = [
  { id: 'guide',    label: '🍁 Extension Guide', desc: 'Auto-fill your IRCC forms' },
  { id: 'tracker',  label: '📋 ITA Tracker',     desc: 'Deadline & checklist'      },
]

export default function Application() {
  const [tab, setTab] = useState('guide')
  const [checkedItems, setCheckedItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eapr_checklist') || '{}') } catch { return {} }
  })

  const { data: activeCase, isLoading } = useActiveCase()
  const queryClient = useQueryClient()

  const toggleItem = (id) => {
    const next = { ...checkedItems, [id]: !checkedItems[id] }
    setCheckedItems(next)
    localStorage.setItem('eapr_checklist', JSON.stringify(next))
  }

  const checkedCount = Object.values(checkedItems).filter(Boolean).length

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-64">
      <Loader2 size={22} className="animate-spin text-maple-400" />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">Application</h1>
        <p className="text-slate-400 text-sm mt-1">
          Extension setup guide + ITA tracker and document checklist
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 rounded-2xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all',
              tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'guide' && <ExtensionGuide />}

          {tab === 'tracker' && (
            <div className="space-y-5">
              {activeCase ? (
                <>
                  <DeadlineCountdown
                    deadline={activeCase.ita_deadline}
                    daysRemaining={activeCase.days_remaining}
                  />
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <p className="font-semibold text-white">eAPR Document Checklist</p>
                      <span className="text-xs text-slate-400">{checkedCount}/{CHECKLIST.length} done</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4">
                      <div
                        className="h-full bg-maple-500 rounded-full transition-all"
                        style={{ width: `${(checkedCount / CHECKLIST.length) * 100}%` }}
                      />
                    </div>
                    <div className="space-y-2">
                      {CHECKLIST.map(item => (
                        <button
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={clsx(
                            'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                            checkedItems[item.id]
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-slate-800 hover:border-slate-700 bg-slate-800/20'
                          )}
                        >
                          {checkedItems[item.id]
                            ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                            : <Circle size={16} className="text-slate-600 flex-shrink-0" />
                          }
                          <span className={clsx('text-sm', checkedItems[item.id] ? 'line-through text-slate-500' : 'text-slate-200')}>
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card text-center py-12">
                  <Flag size={32} className="text-slate-600 mx-auto mb-3" />
                  <p className="font-semibold text-white mb-1">No active ITA yet</p>
                  <p className="text-slate-400 text-sm">
                    When you receive an Invitation to Apply, your 60-day deadline and checklist will appear here.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

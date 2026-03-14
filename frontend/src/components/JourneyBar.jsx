import React from 'react'
// src/components/JourneyBar.jsx
// 6-step PR journey tracker — shown on Dashboard only
// Reads live state from profile, documents, eligibility

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  User, ShieldCheck, Upload, Bot, FileCheck, Chrome,
  Check, ChevronRight
} from 'lucide-react'
import clsx from 'clsx'

const STEPS = [
  {
    id: 'profile',
    label: 'Create Profile',
    icon: User,
    desc: 'Basic info, language, work, education',
    link: '/profile',
  },
  {
    id: 'eligibility',
    label: 'Check Eligibility',
    icon: ShieldCheck,
    desc: 'CRS score + FSW/CEC/FST result',
    link: '/readiness',
  },
  {
    id: 'documents',
    label: 'Upload Documents',
    icon: Upload,
    desc: 'Passport, IELTS, degree, employment',
    link: '/documents',
  },
  {
    id: 'ai_check',
    label: 'AI Document Check',
    icon: Bot,
    desc: 'Azure AI reads and validates your docs',
    link: '/documents',
  },
  {
    id: 'readiness',
    label: 'Readiness Report',
    icon: FileCheck,
    desc: 'Green/red per doc — final verdict',
    link: '/readiness',
  },
  {
    id: 'ircc',
    label: 'Start IRCC + Extension',
    icon: Chrome,
    desc: 'Our extension auto-fills your forms',
    link: '/application',
  },
]

function getStepStatus(stepId, state) {
  const { hasProfile, hasScore, hasEligibility, docCount, docIssues, aiDone, isEligible } = state

  switch (stepId) {
    case 'profile':
      return hasProfile ? 'done' : 'active'
    case 'eligibility':
      if (!hasProfile) return 'locked'
      return hasScore && hasEligibility ? 'done' : 'active'
    case 'documents':
      if (!hasProfile) return 'locked'
      return docCount >= 3 ? 'done' : hasProfile ? 'active' : 'locked'
    case 'ai_check':
      if (docCount === 0) return 'locked'
      return aiDone ? (docIssues > 0 ? 'warning' : 'done') : docCount > 0 ? 'active' : 'locked'
    case 'readiness':
      if (!aiDone) return 'locked'
      return aiDone && docIssues === 0 ? 'done' : aiDone ? 'warning' : 'locked'
    case 'ircc':
      if (!isEligible) return 'locked'
      return 'active'
    default:
      return 'locked'
  }
}

function StepNode({ step, status, isLast, index }) {
  const Icon = step.icon
  const isClickable = status !== 'locked'

  const nodeClass = clsx(
    'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all border-2',
    status === 'done'    && 'bg-emerald-500 border-emerald-500 text-white',
    status === 'active'  && 'bg-maple-600 border-maple-500 text-white shadow-lg shadow-maple-500/25',
    status === 'warning' && 'bg-amber-500 border-amber-400 text-white',
    status === 'locked'  && 'bg-slate-800 border-slate-700 text-slate-600',
  )

  const labelClass = clsx(
    'text-xs font-semibold leading-tight',
    status === 'done'    && 'text-emerald-400',
    status === 'active'  && 'text-white',
    status === 'warning' && 'text-amber-400',
    status === 'locked'  && 'text-slate-600',
  )

  const content = (
    <div className="flex flex-col items-center gap-1.5 relative">
      {/* Connector line */}
      {!isLast && (
        <div className={clsx(
          'absolute left-[calc(50%+18px)] top-4 h-0.5 w-full',
          status === 'done' ? 'bg-emerald-500/40' : 'bg-slate-800'
        )} style={{ width: 'calc(100% - 36px)', left: 'calc(50% + 18px)' }} />
      )}

      <motion.div
        className={nodeClass}
        animate={status === 'active' ? { scale: [1, 1.05, 1] } : {}}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
      >
        {status === 'done'
          ? <Check size={15} />
          : <Icon size={15} />
        }
      </motion.div>

      <div className="text-center hidden sm:block">
        <p className={labelClass}>{step.label}</p>
        <p className="text-[10px] text-slate-600 leading-tight max-w-[80px] mx-auto">{step.desc}</p>
      </div>

      {status === 'active' && (
        <span className="text-[9px] font-bold text-maple-400 bg-maple-500/10 px-1.5 py-0.5 rounded-full border border-maple-500/20">
          NOW
        </span>
      )}
      {status === 'warning' && (
        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
          FIX
        </span>
      )}
    </div>
  )

  if (isClickable) {
    return (
      <Link to={step.link} className="flex-1 hover:opacity-80 transition-opacity">
        {content}
      </Link>
    )
  }
  return <div className="flex-1 cursor-not-allowed opacity-60">{content}</div>
}

export default function JourneyBar({ profile, crsScore, documents, eligibility }) {
  const hasProfile   = !!(profile?.full_name && profile?.date_of_birth)
  const hasScore     = !!(crsScore)
  const hasEligibility = !!(eligibility)
  const docCount     = documents?.length || 0
  const docIssues    = documents?.filter(d => (d.ai_issues || []).length > 0 || d.status === 'rejected').length || 0
  const aiDone       = documents?.some(d => d.status === 'ai_reviewed' || d.status === 'verified') || false
  const isEligible   = eligibility?.programs
    ? Object.values(eligibility.programs).some(p => p.eligible)
    : false

  const state = { hasProfile, hasScore, hasEligibility, docCount, docIssues, aiDone, isEligible }

  const activeStep = STEPS.find(s => {
    const status = getStepStatus(s.id, state)
    return status === 'active' || status === 'warning'
  })

  return (
    <div className="card border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Your PR Journey</p>
          {activeStep && (
            <p className="text-xs text-slate-500 mt-0.5">
              Current step: <span className="text-white font-semibold">{activeStep.label}</span>
            </p>
          )}
        </div>
        {activeStep && (
          <Link
            to={activeStep.link}
            className="text-xs font-semibold text-maple-400 hover:text-maple-300 flex items-center gap-1 transition-colors"
          >
            Continue <ChevronRight size={12} />
          </Link>
        )}
      </div>

      {/* Steps */}
      <div className="flex items-start gap-0 relative">
        {STEPS.map((step, i) => (
          <StepNode
            key={step.id}
            step={step}
            status={getStepStatus(step.id, state)}
            isLast={i === STEPS.length - 1}
            index={i}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-maple-500 to-emerald-500 rounded-full"
          initial={{ width: 0 }}
          animate={{
            width: `${(STEPS.filter(s => {
              const st = getStepStatus(s.id, state)
              return st === 'done'
            }).length / STEPS.length) * 100}%`
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

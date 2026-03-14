import React from 'react'
// src/pages/IRCCAssist.jsx
// IRCC Application Assistant — 3 features:
//   1. Smart Copy Sheet  — profile data formatted exactly as IRCC asks
//   2. Application Progress Tracker — section-by-section checklist for both forms
//   3. AI Field Validator — catches rejection causes before IRCC does

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from 'react-query'
import {
  ClipboardCopy, CheckCircle2, XCircle, AlertTriangle, ChevronDown,
  ChevronRight, Copy, Check, Loader2, ShieldCheck, FileText,
  User, Languages, Briefcase, GraduationCap, Globe, Users,
  ListChecks, Sparkles, ExternalLink, RefreshCw, Info, Clock,
  MapPin, BadgeCheck, AlertCircle, Zap, Lock, Download, FileDown
} from 'lucide-react'
import { profileAPI, eligibilityAPI, irccPdfAPI } from '../services/api'
import { useProfile } from '../hooks'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// ─── Tabs ─────────────────────────────────────────────────────
const TABS = [
  { id: 'copy',      icon: ClipboardCopy, label: 'Smart Copy Sheet',        desc: 'All fields, IRCC-formatted' },
  { id: 'tracker',   icon: ListChecks,    label: 'Application Tracker',     desc: 'Section-by-section progress' },
  { id: 'validator', icon: ShieldCheck,   label: 'AI Field Validator',      desc: 'Catch issues before IRCC does' },
]

// ─── Tiny copy button ──────────────────────────────────────────
function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    if (!value) return
    navigator.clipboard.writeText(String(value))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button onClick={handle} title="Copy to clipboard"
      className={clsx('ml-2 flex-shrink-0 p-1 rounded transition-colors',
        copied ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-300'
      )}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

// ─── Field row ────────────────────────────────────────────────
function Field({ label, value, note, missing }) {
  const display = value !== undefined && value !== null && value !== '' ? String(value) : null
  return (
    <div className={clsx(
      'flex items-start justify-between gap-4 px-4 py-3 rounded-xl border transition-colors group',
      missing || !display
        ? 'border-red-500/20 bg-red-500/5'
        : 'border-slate-800 bg-slate-800/30 hover:border-slate-700'
    )}>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        {display
          ? <p className="text-sm text-white font-mono mt-0.5 break-all">{display}</p>
          : <p className="text-sm text-red-400 mt-0.5 italic">Missing — complete your profile</p>
        }
        {note && <p className="text-[10px] text-slate-600 mt-0.5">{note}</p>}
      </div>
      {display && <CopyBtn value={display} />}
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────
function Section({ title, icon: Icon, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card border border-slate-800">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon size={16} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white text-sm">{title}</p>
        </div>
        <ChevronDown size={16} className={clsx('text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FEATURE 1 — Smart Copy Sheet
// ═══════════════════════════════════════════════════════════════
function SmartCopySheet() {
  const { data: ircc, isLoading, refetch } = useQuery(
    'ircc-ready',
    () => profileAPI.getIrccReady().then(r => r.data),
    { staleTime: 2 * 60 * 1000 }
  )
  const { data: profile } = useProfile()

  const copyAll = () => {
    if (!ircc) return
    const lines = []
    const p = ircc.personal || {}
    lines.push('=== PERSONAL ===')
    lines.push(`Family Name: ${p.family_name}`)
    lines.push(`Given Name: ${p.given_name}`)
    lines.push(`Date of Birth: ${p.dob_year}-${p.dob_month}-${p.dob_day}`)
    lines.push(`Country of Birth: ${p.country_of_birth}`)
    lines.push(`Citizenship: ${p.country_of_citizenship}`)
    lines.push(`Marital Status: ${p.marital_status}`)
    const l = ircc.language || {}
    lines.push('\n=== LANGUAGE ===')
    lines.push(`Test Type: ${l.first_language_test}`)
    lines.push(`Listening: ${l.listening_score}  (CLB ${l.clb_listening})`)
    lines.push(`Reading:   ${l.reading_score}  (CLB ${l.clb_reading})`)
    lines.push(`Writing:   ${l.writing_score}  (CLB ${l.clb_writing})`)
    lines.push(`Speaking:  ${l.speaking_score}  (CLB ${l.clb_speaking})`)
    lines.push(`Test Date: ${l.test_date}`)
    lines.push(`Registration #: ${l.registration_number}`)
    const e = ircc.education || {}
    lines.push('\n=== EDUCATION ===')
    lines.push(`Highest Level: ${e.highest_level}`)
    lines.push(`Institution: ${e.institution}`)
    lines.push(`Field of Study: ${e.field_of_study}`)
    lines.push(`Country Studied: ${e.country_studied}`)
    lines.push(`Canadian Credential: ${e.is_canadian}`)
    if (e.eca_organization) lines.push(`ECA Organization: ${e.eca_organization}`)
    if (e.eca_reference) lines.push(`ECA Reference #: ${e.eca_reference}`)
    lines.push('\n=== WORK HISTORY ===')
    ;(ircc.work_history || []).forEach((w, i) => {
      lines.push(`\nJob ${i + 1}:`)
      lines.push(`  Employer: ${w.employer}`)
      lines.push(`  Title: ${w.job_title}`)
      lines.push(`  NOC Code: ${w.noc_code}`)
      lines.push(`  Country: ${w.country}`)
      lines.push(`  Dates: ${w.start_year}-${w.start_month} to ${w.end_year}${w.end_month ? '-' + w.end_month : ''}`)
      lines.push(`  Hours/Week: ${w.hours_per_week}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('All IRCC fields copied to clipboard!')
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-maple-400" />
    </div>
  )

  const p = ircc?.personal || {}
  const l = ircc?.language || {}
  const e = ircc?.education || {}
  const a = ircc?.adaptability || {}
  const work = ircc?.work_history || []

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-800/50 border border-slate-700">
        <div>
          <p className="font-semibold text-white text-sm">IRCC-Formatted Profile Data</p>
          <p className="text-xs text-slate-400 mt-0.5">
            All fields formatted exactly as IRCC asks — open your IRCC form in one tab, this in another, and read across.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => refetch()} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={copyAll} className="btn-primary text-xs gap-1.5">
            <Copy size={12} /> Copy All
          </button>
        </div>
      </div>

      {/* IRCC tip */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <span>
          <span className="text-white font-semibold">Tip:</span> Click any value row's <Copy size={10} className="inline" /> icon to copy just that field. Use <span className="text-white font-semibold">Copy All</span> to get everything formatted for a text file.
          &nbsp;<a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html"
            target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">
            Open IRCC <ExternalLink size={10} />
          </a>
        </span>
      </div>

      {/* ── Form 1: Express Entry Profile ── */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">
        📋 Form 1 — Express Entry Profile (Enter the Pool)
      </p>

      <Section title="Personal Information" icon={User} color="bg-maple-500" defaultOpen>
        <Field label="Family Name (Last Name)" value={p.family_name} />
        <Field label="Given Name (First Name)" value={p.given_name} />
        <Field label="Date of Birth — Year" value={p.dob_year} note="YYYY format" />
        <Field label="Date of Birth — Month" value={p.dob_month} note="MM format (01–12)" />
        <Field label="Date of Birth — Day" value={p.dob_day} note="DD format (01–31)" />
        <Field label="Country of Birth" value={p.country_of_birth} />
        <Field label="Country of Citizenship" value={p.country_of_citizenship} />
        <Field label="Marital Status" value={p.marital_status}
          note="IRCC values: Single / Married / Common-law / Widowed / Divorced / Separated / Annulled" />
      </Section>

      <Section title="Language Test Results" icon={Languages} color="bg-blue-500" defaultOpen>
        <Field label="Official Language Test Type" value={l.first_language_test} note="IELTS General Training / CELPIP-General / TEF Canada / TCF Canada" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Listening Score" value={l.listening_score} />
          <Field label="Listening CLB" value={l.clb_listening} note="Canadian Language Benchmark" />
          <Field label="Reading Score" value={l.reading_score} />
          <Field label="Reading CLB" value={l.clb_reading} />
          <Field label="Writing Score" value={l.writing_score} />
          <Field label="Writing CLB" value={l.clb_writing} />
          <Field label="Speaking Score" value={l.speaking_score} />
          <Field label="Speaking CLB" value={l.clb_speaking} />
        </div>
        <Field label="Test Date" value={l.test_date} note="Must be within 2 years of profile creation" />
        <Field label="Registration / Candidate Number" value={l.registration_number}
          note="Found on your official test result letter" />
      </Section>

      <Section title="Education" icon={GraduationCap} color="bg-purple-500">
        <Field label="Highest Level of Education" value={e.highest_level}
          note="IRCC values: Secondary / One-year post-secondary / Two-year post-secondary / Bachelor's / Two or more post-secondary / Master's / Doctoral" />
        <Field label="Name of Institution" value={e.institution} />
        <Field label="Field of Study" value={e.field_of_study} />
        <Field label="Country Where You Studied" value={e.country_studied} />
        <Field label="Canadian Credential?" value={e.is_canadian} note="True = studied in Canada" />
        {e.eca_organization && <Field label="ECA Organization" value={e.eca_organization} />}
        {e.eca_reference && <Field label="ECA Reference Number" value={e.eca_reference} />}
      </Section>

      <Section title="Adaptability Factors" icon={BadgeCheck} color="bg-emerald-600">
        <Field label="Sibling in Canada (citizen or PR)" value={a.has_sibling} />
        <Field label="Valid Job Offer from Canadian Employer" value={a.has_job_offer} />
        <Field label="Provincial Nomination" value={a.has_pnp} />
      </Section>

      {/* Work history */}
      {work.length > 0 && (
        <Section title={`Work History (${work.length} job${work.length > 1 ? 's' : ''})`} icon={Briefcase} color="bg-orange-500">
          {work.map((w, i) => (
            <div key={i} className="space-y-2 pt-2 border-t border-slate-800 first:border-0 first:pt-0">
              <p className="text-xs font-semibold text-slate-400">Job {i + 1}</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Employer Name" value={w.employer} />
                <Field label="Job Title" value={w.job_title} />
                <Field label="NOC Code" value={w.noc_code} />
                <Field label="Country" value={w.country} />
                <Field label="Start Year" value={w.start_year} />
                <Field label="Start Month" value={w.start_month} />
                <Field label="End Year" value={w.end_year} />
                <Field label="End Month" value={w.end_month || '(Current)'} />
                <Field label="Hours per Week" value={w.hours_per_week} />
                <Field label="Currently Employed Here" value={w.is_current} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* ── Form 2: eAPR ── */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-4">
        📋 Form 2 — eAPR (After ITA — Full Application)
      </p>

      <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <p className="text-sm font-semibold text-white">eAPR Additional Requirements</p>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The eAPR (after ITA) repeats everything from your profile PLUS requires: 10-year travel history, complete address history, all family members' details, and background declaration. The fields above cover the repeating parts. Use the tracker below to manage the eAPR-specific sections.
        </p>
      </div>

      <Section title="Travel History (last 10 years)" icon={Globe} color="bg-teal-600">
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700">
          <p className="text-xs text-slate-400 leading-relaxed">
            IRCC requires every country visited for 6+ months in the past 10 years. This data is not currently stored in your profile.
          </p>
          <p className="text-xs text-slate-300 mt-2 font-semibold">Fields needed per entry:</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {['Country', 'From Date (YYYY-MM)', 'To Date (YYYY-MM)', 'Purpose of stay', 'Immigration status', 'Status details'].map(f => (
              <div key={f} className="text-[11px] text-slate-500 bg-slate-700/40 px-2 py-1 rounded-lg">{f}</div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Family Members (for eAPR)" icon={Users} color="bg-rose-500">
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700">
          <p className="text-xs text-slate-400">Required for spouse/common-law partner and dependent children:</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {['Full name (as in passport)', 'Date of birth', 'Country of birth', 'Relationship to applicant', 'Immigration status in Canada', 'Accompanying you to Canada?'].map(f => (
              <div key={f} className="text-[11px] text-slate-500 bg-slate-700/40 px-2 py-1 rounded-lg">{f}</div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FEATURE 2 — Application Progress Tracker
// ═══════════════════════════════════════════════════════════════
const FORM1_SECTIONS = [
  {
    id: 'f1_personal', label: 'Personal Information',
    icon: User, link: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/works.html',
    fields: ['Full legal name (as in passport)', 'Date of birth', 'Country of birth', 'Country of citizenship', 'Marital status', 'Contact information (email, phone)']
  },
  {
    id: 'f1_language', label: 'Official Language Results',
    icon: Languages,
    fields: ['Test type (IELTS / CELPIP / TEF)', 'Scores for all 4 skills', 'CLB equivalents for all 4 skills', 'Test date & registration number', 'Second language results (if applicable)']
  },
  {
    id: 'f1_education', label: 'Education History',
    icon: GraduationCap,
    fields: ['Highest credential level', 'Institution name & country', 'Field of study', 'ECA reference number (for foreign credentials)', 'Is credential Canadian?']
  },
  {
    id: 'f1_work', label: 'Work Experience',
    icon: Briefcase,
    fields: ['All jobs in last 10 years', 'NOC code for each job', 'Employer, dates, hours/week', 'Canadian experience (years)', 'Foreign experience (years)']
  },
  {
    id: 'f1_adaptability', label: 'Adaptability Factors',
    icon: BadgeCheck,
    fields: ['Valid job offer?', 'Sibling in Canada?', 'Provincial nomination?', 'Studied in Canada?', 'Worked in Canada before?']
  },
  {
    id: 'f1_submitted', label: 'Profile Submitted to Pool',
    icon: CheckCircle2,
    fields: ['Profile created in IRCC portal', 'CRS score confirmed', 'Entered the draw pool']
  },
]

const FORM2_SECTIONS = [
  {
    id: 'f2_personal', label: 'Personal & Background (Schedule A)',
    icon: User,
    fields: ['All names ever used', 'All citizenships held', 'Current address & history (5 years)', 'Passport number & expiry', 'National ID details']
  },
  {
    id: 'f2_language', label: 'Language Test (repeat from Form 1)',
    icon: Languages,
    fields: ['Same scores — must match your profile exactly', 'Registration number (must match official letter)']
  },
  {
    id: 'f2_education', label: 'Education Details',
    icon: GraduationCap,
    fields: ['Full education history (not just highest)', 'Institution addresses', 'ECA documents uploaded']
  },
  {
    id: 'f2_work', label: 'Work Experience (detailed)',
    icon: Briefcase,
    fields: ['Reference letters for each qualifying job', 'Pay stubs / T4s for Canadian experience', 'NOC duties description verified']
  },
  {
    id: 'f2_travel', label: '10-Year Travel History',
    icon: Globe,
    fields: ['Every country visited 6+ months', 'Dates of entry and exit', 'Purpose and immigration status', 'No gaps in timeline']
  },
  {
    id: 'f2_family', label: 'Family Members',
    icon: Users,
    fields: ['Spouse/partner details', 'All dependent children', 'Whether each is accompanying you', 'Passports for all family members']
  },
  {
    id: 'f2_background', label: 'Background Declaration',
    icon: ShieldCheck,
    fields: ['Criminal history declaration', 'Military/police service', 'Government employment', 'Previous visa refusals', 'Health conditions (if applicable)']
  },
  {
    id: 'f2_docs', label: 'Documents Uploaded to IRCC',
    icon: FileText,
    fields: ['Passport (all family)', 'Language test results', 'ECA for education', 'Work reference letters', 'Police certificates', 'Medical exam results', 'Proof of funds', 'Photos (IRCC spec)']
  },
  {
    id: 'f2_submitted', label: 'Application Submitted',
    icon: CheckCircle2,
    fields: ['All documents certified', 'Fees paid ($1,365 principal + $500/dependent)', 'Biometrics completed', 'Application number noted']
  },
]

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started', color: 'text-slate-500', dot: 'bg-slate-600' },
  { value: 'in_progress', label: 'In progress', color: 'text-amber-400', dot: 'bg-amber-400' },
  { value: 'done',        label: 'Done',         color: 'text-emerald-400', dot: 'bg-emerald-400' },
  { value: 'blocked',     label: 'Blocked',       color: 'text-red-400', dot: 'bg-red-400' },
]

function TrackerSection({ section, status, onChange }) {
  const [open, setOpen] = useState(false)
  const Icon = section.icon
  const st = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]

  return (
    <div className={clsx('rounded-2xl border transition-all',
      status === 'done' ? 'border-emerald-500/30 bg-emerald-500/5' :
      status === 'in_progress' ? 'border-amber-500/30 bg-amber-500/5' :
      status === 'blocked' ? 'border-red-500/30 bg-red-500/5' :
      'border-slate-800 bg-slate-800/20'
    )}>
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
          status === 'done' ? 'bg-emerald-500/20' :
          status === 'in_progress' ? 'bg-amber-500/20' :
          status === 'blocked' ? 'bg-red-500/20' : 'bg-slate-700'
        )}>
          {status === 'done'
            ? <CheckCircle2 size={15} className="text-emerald-400" />
            : <Icon size={15} className={status === 'in_progress' ? 'text-amber-400' : status === 'blocked' ? 'text-red-400' : 'text-slate-400'} />
          }
        </div>
        <div className="flex-1">
          <p className={clsx('font-semibold text-sm', status === 'done' ? 'text-emerald-300' : 'text-white')}>{section.label}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={clsx('w-1.5 h-1.5 rounded-full', st.dot)} />
            <p className={clsx('text-xs', st.color)}>{st.label}</p>
          </div>
        </div>
        <select
          value={status}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange(e.target.value)}
          className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 cursor-pointer"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className={clsx('text-slate-500 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-1.5 border-t border-slate-800/60 pt-3">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Fields to complete</p>
              {section.fields.map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-slate-400">
                  <ChevronRight size={10} className="text-slate-600 flex-shrink-0" />
                  {f}
                </div>
              ))}
              {section.link && (
                <a href={section.link} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline mt-2">
                  Open IRCC page <ExternalLink size={10} />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ApplicationTracker() {
  const STORAGE_KEY = 'ircc_tracker_v1'
  const [statuses, setStatuses] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  })

  const update = (id, value) => {
    const next = { ...statuses, [id]: value }
    setStatuses(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const allSections = [...FORM1_SECTIONS, ...FORM2_SECTIONS]
  const doneCount = allSections.filter(s => statuses[s.id] === 'done').length
  const pct = Math.round((doneCount / allSections.length) * 100)

  const form1Done = FORM1_SECTIONS.filter(s => statuses[s.id] === 'done').length
  const form2Done = FORM2_SECTIONS.filter(s => statuses[s.id] === 'done').length

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div className="card border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-white">Overall Progress</p>
          <p className="text-2xl font-bold text-white">{pct}<span className="text-slate-500 text-base">%</span></p>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
          <motion.div
            className="h-full bg-gradient-to-r from-maple-500 to-emerald-500 rounded-full"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-800/50 text-center">
            <p className="text-xl font-bold text-white">{form1Done}/{FORM1_SECTIONS.length}</p>
            <p className="text-xs text-slate-400">Express Entry Profile</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/50 text-center">
            <p className="text-xl font-bold text-white">{form2Done}/{FORM2_SECTIONS.length}</p>
            <p className="text-xs text-slate-400">eAPR (post-ITA)</p>
          </div>
        </div>
      </div>

      {/* ITA reminder */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs">
        <Clock size={14} className="text-amber-400 flex-shrink-0" />
        <span className="text-slate-400">
          <span className="text-white font-semibold">After ITA:</span> You have <span className="text-amber-400 font-semibold">60 days</span> to submit your full eAPR application. Start gathering documents immediately.
        </span>
      </div>

      {/* Form 1 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-maple-500 flex items-center justify-center text-white text-[10px] font-bold">1</div>
          <p className="font-bold text-white">Express Entry Profile — Enter the Pool</p>
        </div>
        <div className="space-y-2">
          {FORM1_SECTIONS.map(s => (
            <TrackerSection key={s.id} section={s} status={statuses[s.id] || 'not_started'} onChange={v => update(s.id, v)} />
          ))}
        </div>
      </div>

      {/* Form 2 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">2</div>
          <p className="font-bold text-white">eAPR — Full Application (After ITA)</p>
        </div>
        <div className="space-y-2">
          {FORM2_SECTIONS.map(s => (
            <TrackerSection key={s.id} section={s} status={statuses[s.id] || 'not_started'} onChange={v => update(s.id, v)} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FEATURE 3 — AI Field Validator
// ═══════════════════════════════════════════════════════════════
const VALIDATOR_RULES = [
  // Language
  {
    id: 'lang_clb',
    category: 'Language',
    label: 'Minimum Language Requirement (CLB 7)',
    severity: 'critical',
    check: (data) => {
      const l = data?.language || {}
      const scores = [l.clb_listening, l.clb_reading, l.clb_writing, l.clb_speaking].map(Number).filter(Boolean)
      if (scores.length < 4) return { pass: false, reason: 'Language test not on file — upload your IELTS/CELPIP scores in Profile → Language.' }
      const min = Math.min(...scores)
      if (min < 7) return { pass: false, reason: `Your lowest CLB is ${min}. FSW requires CLB 7+ in all 4 skills. Current gap: ${7 - min} CLB band${7 - min > 1 ? 's' : ''}.` }
      return { pass: true, reason: `All 4 CLB scores are 7+. Minimum met.` }
    }
  },
  {
    id: 'lang_test_date',
    category: 'Language',
    label: 'Language Test Not Expired (2-year limit)',
    severity: 'critical',
    check: (data) => {
      const testDate = data?.language?.test_date
      if (!testDate) return { pass: false, reason: 'No test date on file.' }
      const d = new Date(testDate)
      const twoYearsLater = new Date(d)
      twoYearsLater.setFullYear(d.getFullYear() + 2)
      const now = new Date()
      if (now > twoYearsLater) return { pass: false, reason: `Test expired on ${twoYearsLater.toDateString()}. You must retake your language test.` }
      const daysLeft = Math.round((twoYearsLater - now) / (1000 * 60 * 60 * 24))
      if (daysLeft < 60) return { pass: 'warn', reason: `Test expires in ${daysLeft} days (${twoYearsLater.toDateString()}). File your application before it expires.` }
      return { pass: true, reason: `Valid until ${twoYearsLater.toDateString()} (${daysLeft} days remaining).` }
    }
  },
  {
    id: 'lang_registration',
    category: 'Language',
    label: 'Language Test Registration Number',
    severity: 'high',
    check: (data) => {
      const reg = data?.language?.registration_number
      if (!reg) return { pass: 'warn', reason: 'Registration/candidate number missing. IRCC requires this to verify your test results. Find it on your official result letter.' }
      return { pass: true, reason: 'Registration number on file.' }
    }
  },
  // Education
  {
    id: 'edu_level',
    category: 'Education',
    label: 'Education Level on File',
    severity: 'critical',
    check: (data) => {
      const level = data?.education?.highest_level
      if (!level) return { pass: false, reason: 'No education on file. Add your highest credential in Profile → Education.' }
      return { pass: true, reason: `${level} recorded.` }
    }
  },
  {
    id: 'edu_eca',
    category: 'Education',
    label: 'ECA Reference for Foreign Credentials',
    severity: 'high',
    check: (data) => {
      const isCdn = data?.education?.is_canadian
      const eca = data?.education?.eca_reference
      if (isCdn === 'True' || isCdn === true) return { pass: true, reason: 'Canadian credential — no ECA required.' }
      if (!eca) return { pass: 'warn', reason: 'Foreign credential detected but no ECA reference number. IRCC requires an ECA from a designated organization (WES, ICAS, etc.) for non-Canadian credentials.' }
      return { pass: true, reason: `ECA reference on file: ${eca}` }
    }
  },
  // Work
  {
    id: 'work_noc',
    category: 'Work',
    label: 'NOC Code for All Jobs',
    severity: 'high',
    check: (data) => {
      const jobs = data?.work_history || []
      if (jobs.length === 0) return { pass: 'warn', reason: 'No work experience on file. Add work history in Profile → Work.' }
      const missing = jobs.filter(j => !j.noc_code)
      if (missing.length > 0) return { pass: false, reason: `${missing.length} job(s) missing NOC code: ${missing.map(j => j.job_title || 'untitled').join(', ')}. Use NOC Finder in Tools to identify the correct code.` }
      return { pass: true, reason: `All ${jobs.length} job(s) have NOC codes.` }
    }
  },
  {
    id: 'work_hours',
    category: 'Work',
    label: 'Hours Per Week Recorded',
    severity: 'medium',
    check: (data) => {
      const jobs = data?.work_history || []
      if (jobs.length === 0) return { pass: true, reason: 'No jobs to check.' }
      const missing = jobs.filter(j => !j.hours_per_week || j.hours_per_week === '0')
      if (missing.length > 0) return { pass: 'warn', reason: `${missing.length} job(s) missing hours/week. IRCC requires 30+ hours/week for qualifying work experience.` }
      const partTime = jobs.filter(j => parseFloat(j.hours_per_week) < 30)
      if (partTime.length > 0) return { pass: 'warn', reason: `${partTime.length} job(s) are under 30 hrs/week: ${partTime.map(j => `${j.job_title} (${j.hours_per_week}h)`).join(', ')}. These may not count toward work experience.` }
      return { pass: true, reason: `All ${jobs.length} job(s) are 30+ hrs/week.` }
    }
  },
  {
    id: 'work_dates',
    category: 'Work',
    label: 'Work Experience Dates Complete',
    severity: 'medium',
    check: (data) => {
      const jobs = data?.work_history || []
      const missing = jobs.filter(j => !j.start_year || !j.start_month)
      if (missing.length > 0) return { pass: false, reason: `${missing.length} job(s) missing start dates. IRCC calculates experience duration from exact dates.` }
      return { pass: true, reason: 'All jobs have start dates.' }
    }
  },
  // Personal
  {
    id: 'personal_dob',
    category: 'Personal',
    label: 'Date of Birth Complete',
    severity: 'critical',
    check: (data) => {
      const p = data?.personal || {}
      if (!p.dob_year || !p.dob_month || !p.dob_day) return { pass: false, reason: 'Date of birth incomplete. All 3 fields (year, month, day) are required.' }
      return { pass: true, reason: `DOB: ${p.dob_year}-${p.dob_month}-${p.dob_day}` }
    }
  },
  {
    id: 'personal_name',
    category: 'Personal',
    label: 'Full Name as in Passport',
    severity: 'critical',
    check: (data) => {
      const p = data?.personal || {}
      if (!p.family_name || !p.given_name) return { pass: false, reason: 'Name incomplete. Both family name and given name must match your passport exactly.' }
      return { pass: true, reason: `${p.given_name} ${p.family_name}` }
    }
  },
  {
    id: 'age_cutoff',
    category: 'Personal',
    label: 'Age — CRS Age Points',
    severity: 'info',
    check: (data) => {
      const p = data?.personal || {}
      if (!p.dob_year) return { pass: 'warn', reason: 'DOB missing — cannot calculate age.' }
      const age = new Date().getFullYear() - parseInt(p.dob_year)
      if (age >= 45) return { pass: 'warn', reason: `Age ${age}: You receive 0 CRS points for age (max age for points is 44). This significantly impacts your score.` }
      if (age > 35) return { pass: 'warn', reason: `Age ${age}: CRS age points decrease by ~6 pts/year after 35. Consider applying as soon as you meet all other requirements.` }
      return { pass: true, reason: `Age ${age}: Receiving maximum or near-maximum age points.` }
    }
  },
]

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    icon: XCircle },
  high:     { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: AlertTriangle },
  medium:   { label: 'Medium',   color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: AlertCircle },
  info:     { label: 'Info',     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   icon: Info },
}

function ValidatorResult({ rule, result }) {
  const cfg = SEVERITY_CONFIG[rule.severity]
  const StatusIcon = result.pass === true ? CheckCircle2 : result.pass === 'warn' ? AlertTriangle : XCircle
  const statusColor = result.pass === true ? 'text-emerald-400' : result.pass === 'warn' ? 'text-amber-400' : 'text-red-400'

  return (
    <div className={clsx(
      'flex items-start gap-3 p-4 rounded-xl border',
      result.pass === true ? 'border-emerald-500/20 bg-emerald-500/5' :
      result.pass === 'warn' ? 'border-amber-500/20 bg-amber-500/5' :
      'border-red-500/20 bg-red-500/5'
    )}>
      <StatusIcon size={16} className={clsx('flex-shrink-0 mt-0.5', statusColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-white">{rule.label}</p>
          <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.color, cfg.bg)}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{result.reason}</p>
      </div>
    </div>
  )
}

function AIFieldValidator() {
  const [ran, setRan] = useState(false)
  const [results, setResults] = useState([])

  const { data: ircc, isLoading } = useQuery(
    'ircc-ready',
    () => profileAPI.getIrccReady().then(r => r.data),
    { staleTime: 2 * 60 * 1000 }
  )

  const runValidation = () => {
    if (!ircc) return
    const res = VALIDATOR_RULES.map(rule => ({
      rule,
      result: rule.check(ircc)
    }))
    setResults(res)
    setRan(true)
  }

  const categories = [...new Set(VALIDATOR_RULES.map(r => r.category))]
  const criticalFails = results.filter(r => r.result.pass === false && r.rule.severity === 'critical').length
  const highFails = results.filter(r => r.result.pass === false).length
  const warnings = results.filter(r => r.result.pass === 'warn').length
  const passes = results.filter(r => r.result.pass === true).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card border border-slate-700">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-maple-500/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={18} className="text-maple-400" />
          </div>
          <div>
            <p className="font-bold text-white">AI Field Validator</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Runs {VALIDATOR_RULES.length} checks against your profile data to catch common IRCC rejection causes before you submit.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4 text-xs text-slate-400">
          {[
            'Language test expiry and CLB minimums',
            'Missing ECA for foreign credentials',
            'NOC codes for all jobs',
            'Work hours (30+ hrs/week requirement)',
            'Name/DOB completeness (must match passport)',
          ].map(c => (
            <div key={c} className="flex items-center gap-2">
              <Zap size={10} className="text-maple-400 flex-shrink-0" />
              {c}
            </div>
          ))}
        </div>

        <button
          onClick={runValidation}
          disabled={isLoading}
          className="btn-primary w-full gap-2"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {ran ? 'Re-run Validation' : 'Run Validation Check'}
        </button>
      </div>

      {/* Results summary */}
      {ran && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={clsx('p-3 rounded-xl text-center border', criticalFails > 0 ? 'border-red-500/30 bg-red-500/10' : 'border-slate-800 bg-slate-800/30')}>
              <p className={clsx('text-2xl font-bold', criticalFails > 0 ? 'text-red-400' : 'text-slate-500')}>{highFails}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Issues</p>
            </div>
            <div className={clsx('p-3 rounded-xl text-center border', warnings > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-slate-800 bg-slate-800/30')}>
              <p className={clsx('text-2xl font-bold', warnings > 0 ? 'text-amber-400' : 'text-slate-500')}>{warnings}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Warnings</p>
            </div>
            <div className="p-3 rounded-xl text-center border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-2xl font-bold text-emerald-400">{passes}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Passed</p>
            </div>
          </div>

          {criticalFails === 0 && highFails === 0 && warnings === 0 && (
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
              <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">All checks passed!</p>
                <p className="text-xs text-slate-400">No common issues detected. Your profile looks ready to submit.</p>
              </div>
            </div>
          )}

          {/* Results by category */}
          {categories.map(cat => {
            const catResults = results.filter(r => r.rule.category === cat)
            return (
              <div key={cat}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{cat}</p>
                <div className="space-y-2">
                  {catResults.map(({ rule, result }) => (
                    <ValidatorResult key={rule.id} rule={rule} result={result} />
                  ))}
                </div>
              </div>
            )
          })}

          <p className="text-[11px] text-slate-600 text-center pt-2">
            This validator checks your profile data against known IRCC rules. Always verify requirements at canada.ca/express-entry.
          </p>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PDF DOWNLOAD CARDS
// ═══════════════════════════════════════════════════════════════
function PdfDownloadCards() {
  const [downloading, setDownloading] = useState({})

  const downloadPdf = async (form) => {
    setDownloading(d => ({ ...d, [form]: true }))
    try {
      const res = form === 1
        ? await irccPdfAPI.downloadForm1()
        : await irccPdfAPI.downloadForm2()
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = form === 1
        ? 'IRCC_Form1_Express_Entry_Profile.pdf'
        : 'IRCC_Form2_eAPR_Application.pdf'
      link.click()
      window.URL.revokeObjectURL(url)
      toast.success(`Form ${form} PDF downloaded!`)
    } catch {
      toast.error('Download failed — make sure your profile has data')
    }
    setDownloading(d => ({ ...d, [form]: false }))
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Form 1 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-maple-500/30 bg-gradient-to-br from-maple-500/10 to-slate-800/40 p-5"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-maple-500/20 flex items-center justify-center flex-shrink-0">
            <FileDown size={18} className="text-maple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-white text-sm">Form 1</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-maple-500/20 text-maple-400 font-semibold">Enter the Pool</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Express Entry Profile Reference</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          Pre-filled with your personal info, language scores (with CLB equivalents), education, work history, and adaptability factors — formatted exactly as IRCC displays them.
        </p>
        <div className="space-y-1 mb-4">
          {['Personal info & DOB formatted for IRCC', 'Language scores + CLB side-by-side', 'All jobs with NOC codes & dates', 'Pre-submission checklist'].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-slate-400">
              <CheckCircle2 size={10} className="text-maple-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
        <button
          onClick={() => downloadPdf(1)}
          disabled={downloading[1]}
          className="btn-primary w-full gap-2 justify-center"
        >
          {downloading[1]
            ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
            : <><Download size={14} /> Download Form 1 PDF</>
          }
        </button>
      </motion.div>

      {/* Form 2 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-slate-800/40 p-5"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <FileDown size={18} className="text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-white text-sm">Form 2</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">⏱ After ITA</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">eAPR Full Application Reference</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          Everything from Form 1 plus: detailed work experience fields, travel history template, family members table, background declaration checklist, and complete document upload checklist.
        </p>
        <div className="space-y-1 mb-4">
          {['All Form 1 fields pre-filled', '10-year travel history template', 'Family members table', 'Full document upload checklist', '60-day deadline guidance'].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-slate-400">
              <CheckCircle2 size={10} className="text-blue-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
        <button
          onClick={() => downloadPdf(2)}
          disabled={downloading[2]}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors w-full gap-2 flex items-center justify-center"
        >
          {downloading[2]
            ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
            : <><Download size={14} /> Download Form 2 PDF</>
          }
        </button>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function IRCCAssist() {
  const [activeTab, setActiveTab] = useState('copy')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="section-title">IRCC Application Assistant</h1>
          <p className="text-slate-400 text-sm mt-1">
            Your data is already here — use it to fill IRCC forms faster, track your progress, and catch errors before IRCC does.
          </p>
        </div>
        <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html"
          target="_blank" rel="noreferrer"
          className="btn-secondary text-xs gap-1.5 flex-shrink-0 whitespace-nowrap">
          Open IRCC <ExternalLink size={12} />
        </a>
      </div>

      {/* PDF Downloads */}
      <PdfDownloadCards />

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 rounded-2xl p-1.5">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-slate-700 text-white shadow-lg'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'copy'      && <SmartCopySheet />}
          {activeTab === 'tracker'   && <ApplicationTracker />}
          {activeTab === 'validator' && <AIFieldValidator />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

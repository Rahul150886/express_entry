import React from 'react'
// src/components/EaprWorkflow.jsx
// Form 2 "eAPR Application" wizard — post-ITA workflow embedded in Documents page
// Steps: ITA Setup → Readiness Check → Upload Missing → Non-File Items → Validate → Download PDF

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useDropzone } from 'react-dropzone'
import {
  Stamp, CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  Upload, Loader2, FileDown, Bot, ShieldCheck, RefreshCw,
  ChevronDown, Sparkles, ExternalLink, Check, AlertCircle,
  Clock, Timer, Calendar, User, Users, Baby, Info,
  ClipboardList, PenLine, Plus, Minus, FileText, TriangleAlert,
} from 'lucide-react'
import { applicationAPI, documentsAPI, irccPdfAPI } from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Constants ─────────────────────────────────────────────────
const STORAGE_KEY_ITA   = 'eapr_ita_date_v1'
const STORAGE_KEY_DEPS  = 'eapr_dependants_v1'
const STORAGE_KEY_NONFILE = 'eapr_nonfile_v1'

const STEPS = [
  { id: 'setup',    label: 'ITA Setup',         icon: Calendar    },
  { id: 'check',    label: 'Readiness',          icon: ShieldCheck },
  { id: 'upload',   label: 'Upload Docs',        icon: Upload      },
  { id: 'nonfile',  label: 'Declarations',       icon: PenLine     },
  { id: 'validate', label: 'Validate',           icon: Bot         },
  { id: 'download', label: 'Download PDF',       icon: FileDown    },
]

const DOC_ICONS = {
  passport: '🛂', language_test_result: '🗣️', education_credential: '🎓',
  eca_report: '📋', employment_letter: '💼', police_certificate: '👮',
  medical_exam: '🏥', photo: '📷', proof_of_funds: '💰',
  birth_certificate: '📄', marriage_certificate: '💍',
}

const PERSON_COLORS = {
  applicant: 'blue', spouse: 'purple',
  child_1: 'green', child_2: 'green', child_3: 'green',
}

// ── Shared helpers ────────────────────────────────────────────
const Pill = ({ ok, warn, children }) => (
  <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',
    ok   ? 'bg-emerald-500/15 text-emerald-400' :
    warn ? 'bg-amber-500/15 text-amber-400' :
           'bg-red-500/15 text-red-400'
  )}>{children}</span>
)

function StepBar({ current }) {
  const idx = STEPS.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const done = i < idx; const active = i === idx
        const Icon = step.icon
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none min-w-0">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all',
                done   ? 'bg-emerald-500 border-emerald-500' :
                active ? 'bg-maple-500 border-maple-500 shadow-lg shadow-maple-500/30' :
                         'bg-slate-800 border-slate-700'
              )}>
                {done ? <Check size={12} className="text-white" />
                      : <Icon size={12} className={active ? 'text-white' : 'text-slate-500'} />}
              </div>
              <p className={clsx('text-[9px] font-semibold whitespace-nowrap hidden sm:block',
                active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-600'
              )}>{step.label}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mx-1 mb-3', done ? 'bg-emerald-500' : 'bg-slate-800')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── ITA Countdown banner ──────────────────────────────────────
function ITACountdown({ itaDate }) {
  if (!itaDate) return null
  const ita   = new Date(itaDate)
  const deadline = new Date(ita)
  deadline.setDate(deadline.getDate() + 60)
  const now   = new Date()
  const days  = Math.max(0, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)))
  const urgent = days <= 10
  const warn   = days <= 20

  return (
    <div className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm',
      urgent ? 'border-red-500/40 bg-red-500/10' :
      warn   ? 'border-amber-500/40 bg-amber-500/10' :
               'border-blue-500/30 bg-blue-500/8'
    )}>
      <Timer size={16} className={urgent ? 'text-red-400' : warn ? 'text-amber-400' : 'text-blue-400'} />
      <span className={urgent ? 'text-red-300' : warn ? 'text-amber-300' : 'text-blue-300'}>
        <span className="font-bold">{days} days</span> until your 60-day eAPR deadline
        {urgent ? ' — submit immediately!' : warn ? ' — act fast!' : ''}
      </span>
      <span className="ml-auto text-xs text-slate-500">
        Deadline: {deadline.toLocaleDateString('en-CA')}
      </span>
    </div>
  )
}

// ── Step 0: ITA Setup ─────────────────────────────────────────
function StepSetup({ onNext }) {
  const [itaDate, setItaDate] = useState(
    () => localStorage.getItem(STORAGE_KEY_ITA) || ''
  )
  const [hasSpouse, setHasSpouse] = useState(false)
  const [numChildren, setNumChildren] = useState(
    () => parseInt(localStorage.getItem(STORAGE_KEY_DEPS) || '0')
  )

  const save = () => {
    if (!itaDate) { toast.error('Please enter your ITA date'); return }
    localStorage.setItem(STORAGE_KEY_ITA, itaDate)
    localStorage.setItem(STORAGE_KEY_DEPS, String(numChildren))
    onNext({ itaDate, hasSpouse, numChildren })
  }

  const ita = itaDate ? new Date(itaDate) : null
  const deadline = ita ? new Date(ita.getTime() + 60 * 24 * 60 * 60 * 1000) : null
  const daysLeft = deadline ? Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)) : null

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/8">
        <div className="flex items-center gap-2 mb-2">
          <TriangleAlert size={15} className="text-amber-400" />
          <p className="text-sm font-bold text-amber-300">60-Day Deadline</p>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          After receiving your Invitation to Apply (ITA), you have exactly <span className="text-white font-semibold">60 calendar days</span> to
          submit your complete eAPR. Missing this deadline means your ITA expires — you return to the pool
          and must wait for another draw.
        </p>
      </div>

      {/* ITA date */}
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
          When did you receive your ITA?
        </label>
        <input
          type="date"
          value={itaDate}
          onChange={e => setItaDate(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="input w-full text-sm"
        />
        {daysLeft !== null && (
          <div className={clsx('mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5',
            daysLeft <= 10 ? 'bg-red-500/15 text-red-400' :
            daysLeft <= 20 ? 'bg-amber-500/15 text-amber-400' :
                             'bg-emerald-500/15 text-emerald-400'
          )}>
            <Clock size={11} />
            {daysLeft > 0
              ? `${daysLeft} days remaining — deadline: ${deadline.toLocaleDateString('en-CA')}`
              : 'Deadline has passed — contact IRCC immediately'
            }
          </div>
        )}
      </div>

      {/* Family */}
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">
          Who is included in your application?
        </label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-700 cursor-pointer hover:border-slate-600 transition-colors">
            <input type="checkbox" checked={hasSpouse} onChange={e => setHasSpouse(e.target.checked)}
              className="w-4 h-4 accent-maple-500" />
            <Users size={16} className="text-purple-400" />
            <div>
              <p className="text-sm font-semibold text-white">Spouse or common-law partner</p>
              <p className="text-xs text-slate-500">Accompanying or not — must still be declared</p>
            </div>
          </label>

          <div className="p-3 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Baby size={16} className="text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Dependent children</p>
                  <p className="text-xs text-slate-500">Under 22, unmarried — separate doc checklist per child</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setNumChildren(Math.max(0, numChildren - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                  <Minus size={12} className="text-white" />
                </button>
                <span className="w-6 text-center font-bold text-white text-sm">{numChildren}</span>
                <button onClick={() => setNumChildren(Math.min(3, numChildren + 1))}
                  className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                  <Plus size={12} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
        <Info size={12} className="inline mr-1.5 text-blue-400" />
        The document checklist will be generated based on your family composition above. You can update this any time.
      </div>

      <button onClick={save} className="btn-primary w-full gap-2 justify-center">
        Start eAPR Workflow <ChevronRight size={15} />
      </button>
    </div>
  )
}

// ── Step 1: Readiness Check ───────────────────────────────────
function ProfileCheck({ item }) {
  return (
    <div className={clsx('flex items-start gap-3 p-3 rounded-xl border',
      item.ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
    )}>
      {item.ok
        ? <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
        : <XCircle      size={14} className="text-red-400 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{item.field}</p>
        {item.fix && <p className="text-xs text-red-300 mt-0.5">{item.fix}</p>}
      </div>
    </div>
  )
}

function DocGroupSection({ group }) {
  const [expanded, setExpanded] = useState(true)
  const missing  = group.docs.filter(d => !d.uploaded && d.critical).length
  const errors   = group.docs.filter(d => d.has_errors).length
  const uploaded = group.docs.filter(d => d.uploaded).length
  const color    = PERSON_COLORS[group.person] || 'slate'

  return (
    <div className="rounded-2xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 bg-slate-800/40 hover:bg-slate-800/60 transition-colors"
      >
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
          `bg-${color}-500/20`
        )}>
          {group.person === 'applicant' ? <User size={13} className={`text-${color}-400`} /> :
           group.person === 'spouse'    ? <Users size={13} className={`text-${color}-400`} /> :
           <Baby size={13} className={`text-${color}-400`} />}
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-white">{group.label}</p>
          <p className="text-xs text-slate-500">
            {uploaded}/{group.docs.length} uploaded
            {missing > 0 ? ` · ${missing} critical missing` : ''}
            {errors > 0 ? ` · ${errors} with issues` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {missing > 0 && <Pill>{missing} missing</Pill>}
          {missing === 0 && <Pill ok>{uploaded} ✓</Pill>}
          <ChevronDown size={14} className={clsx('text-slate-500 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-slate-800"
          >
            <div className="p-3 space-y-2">
              {group.docs.map(doc => (
                <div key={doc.type} className={clsx('flex items-center gap-3 p-2.5 rounded-xl border',
                  doc.uploaded
                    ? doc.has_errors ? 'border-amber-500/20 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
                    : doc.critical   ? 'border-red-500/20 bg-red-500/5'
                    : 'border-slate-700 bg-slate-800/30'
                )}>
                  <span className="text-base flex-shrink-0">{DOC_ICONS[doc.type] || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white">{doc.label}</p>
                    <p className="text-xs text-slate-500">{doc.description}</p>
                  </div>
                  <Pill ok={doc.uploaded && !doc.has_errors} warn={doc.uploaded && doc.has_errors}>
                    {doc.uploaded ? doc.has_errors ? 'Issues' : '✓' : doc.critical ? 'Required' : 'Optional'}
                  </Pill>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepCheck({ readiness, itaDate, onNext, onRecheck }) {
  const s = readiness.summary
  return (
    <div className="space-y-5">
      <ITACountdown itaDate={itaDate} />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Profile Issues', val: s.profile_issues, ok: s.profile_issues === 0 },
          { label: 'Docs Missing',   val: s.missing_docs,   ok: s.missing_docs === 0 },
          { label: 'Doc Errors',     val: s.doc_errors,     ok: s.doc_errors === 0 },
        ].map(item => (
          <div key={item.label} className={clsx('p-3 rounded-xl border text-center',
            item.ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
          )}>
            <p className={clsx('text-2xl font-bold', item.ok ? 'text-emerald-400' : 'text-red-400')}>{item.val}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Docs progress bar */}
      <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400">Documents uploaded</span>
          <span className="font-mono text-white">{s.uploaded_docs} / {s.total_docs}</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-maple-500 rounded-full transition-all duration-500"
            style={{ width: `${s.total_docs ? (s.uploaded_docs / s.total_docs) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Profile checks */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Profile Data</p>
        <div className="space-y-2">
          {readiness.profile_checks.map((item, i) => <ProfileCheck key={i} item={item} />)}
        </div>
      </div>

      {/* Doc groups per person */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Required Documents</p>
        <div className="space-y-3">
          {readiness.doc_groups.map(g => <DocGroupSection key={g.person} group={g} />)}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onRecheck} className="btn-secondary gap-2"><RefreshCw size={13} /> Recheck</button>
        <button onClick={onNext} disabled={!readiness.profile_complete} className="btn-primary flex-1 gap-2 justify-center">
          {s.missing_docs > 0
            ? <>Upload {s.missing_docs} Missing Doc{s.missing_docs > 1 ? 's' : ''} <ChevronRight size={14} /></>
            : <>Next: Declarations <ChevronRight size={14} /></>}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Upload Missing Docs ───────────────────────────────
function MiniDropzone({ docType, person, onUploaded }) {
  const qc = useQueryClient()
  const upload = useMutation(
    ({ file }) => documentsAPI.upload(file, docType.type, person, ''),
    {
      onSuccess: () => {
        qc.invalidateQueries('form2-readiness')
        toast.success(`${docType.label} uploaded!`)
        onUploaded(docType.type)
      },
      onError: () => toast.error('Upload failed — try again')
    }
  )
  const onDrop = useCallback(files => { if (files[0]) upload.mutate({ file: files[0] }) }, [upload])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  return (
    <div {...getRootProps()} className={clsx(
      'border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all',
      isDragActive ? 'border-maple-400 bg-maple-500/10' : 'border-slate-700 hover:border-slate-500',
      upload.isLoading && 'opacity-50 pointer-events-none'
    )}>
      <input {...getInputProps()} />
      {upload.isLoading
        ? <Loader2 size={16} className="mx-auto animate-spin text-maple-400" />
        : <Upload size={16} className={clsx('mx-auto', isDragActive ? 'text-maple-400' : 'text-slate-500')} />}
      <p className="text-xs text-slate-400 mt-1">
        {upload.isLoading ? 'Uploading...' : isDragActive ? 'Drop here' : 'Drop or click to upload'}
      </p>
    </div>
  )
}

function StepUpload({ readiness, onNext, onRecheck }) {
  const [uploadedNow, setUploadedNow] = useState(new Set())
  const markUploaded = (type) => setUploadedNow(s => new Set([...s, type]))

  const missingByGroup = readiness.doc_groups.map(g => ({
    ...g,
    missing: g.docs.filter(d => !d.uploaded && d.critical && !uploadedNow.has(d.type))
  })).filter(g => g.missing.length > 0)

  const allUploaded = missingByGroup.length === 0

  return (
    <div className="space-y-5">
      {allUploaded ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-white text-sm">All critical documents uploaded!</p>
            <p className="text-xs text-slate-400">Proceed to complete your declarations.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
          <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <span>Upload each required document directly into its box. Drop any person's docs in the correct section.</span>
        </div>
      )}

      {missingByGroup.map(group => (
        <div key={group.person}>
          <div className="flex items-center gap-2 mb-2">
            <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center',
              `bg-${PERSON_COLORS[group.person] || 'slate'}-500/20`
            )}>
              {group.person === 'applicant' ? <User size={10} className={`text-${PERSON_COLORS[group.person]}-400`} /> :
               group.person === 'spouse'    ? <Users size={10} className={`text-${PERSON_COLORS[group.person]}-400`} /> :
               <Baby size={10} className="text-green-400" />}
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{group.label}</p>
          </div>
          <div className="space-y-2">
            {group.missing.map(doc => (
              <div key={doc.type} className="p-3 rounded-2xl border border-slate-700 bg-slate-800/30">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xl">{DOC_ICONS[doc.type] || '📄'}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{doc.label}</p>
                    <p className="text-xs text-slate-400">{doc.description}</p>
                  </div>
                </div>
                <MiniDropzone docType={doc} person={group.person} onUploaded={markUploaded} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Already uploaded summary */}
      {readiness.doc_groups.some(g => g.docs.some(d => d.uploaded)) && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Already uploaded</p>
          <div className="space-y-1">
            {readiness.doc_groups.flatMap(g =>
              g.docs.filter(d => d.uploaded).map(d => (
                <div key={`${g.person}-${d.type}`} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span className="text-xs text-slate-300">{DOC_ICONS[d.type]} {d.label}</span>
                  <span className="text-xs text-slate-500 ml-auto">{g.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onRecheck} className="btn-secondary gap-2"><RefreshCw size={13} /> Recheck</button>
        <button onClick={onNext} disabled={!allUploaded} className="btn-primary flex-1 gap-2 justify-center">
          Next: Declarations <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Non-File Declarations ────────────────────────────
function StepNonFile({ nonfileItems, onNext }) {
  const [values, setValues] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_NONFILE) || '{}') }
    catch { return {} }
  })

  const update = (id, val) => {
    const next = { ...values, [id]: val }
    setValues(next)
    localStorage.setItem(STORAGE_KEY_NONFILE, JSON.stringify(next))
  }

  const checkboxItems = nonfileItems.filter(i => i.type === 'checkbox')
  const textItems     = nonfileItems.filter(i => i.type === 'text')

  const allCheckboxes = checkboxItems.every(i => values[i.id])
  const allTexts      = textItems.every(i => values[i.id]?.trim().length > 10)
  const allDone       = allCheckboxes && allTexts

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
        <PenLine size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <span>
          <span className="text-white font-semibold">These items can't be uploaded as files</span> — 
          fill in the text fields and check the declarations. This data populates the IRCC forms and your eAPR PDF reference.
        </span>
      </div>

      {/* Text entry items */}
      {textItems.map(item => (
        <div key={item.id}>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
            {item.label} <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-slate-500 mb-2">{item.description}</p>
          <textarea
            rows={3}
            value={values[item.id] || ''}
            onChange={e => update(item.id, e.target.value)}
            placeholder={item.placeholder}
            className={clsx(
              'w-full rounded-xl border bg-slate-900 text-white text-sm px-3 py-2.5 resize-none',
              'placeholder:text-slate-600 focus:outline-none focus:ring-1 transition-colors',
              values[item.id]?.trim().length > 10
                ? 'border-emerald-500/40 focus:ring-emerald-500/40'
                : 'border-slate-700 focus:ring-maple-500/40'
            )}
          />
          {values[item.id]?.trim().length > 0 && values[item.id].trim().length < 10 && (
            <p className="text-xs text-red-400 mt-1">Please provide more detail</p>
          )}
        </div>
      ))}

      {/* Checkbox confirmations */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Declarations</p>
        <div className="space-y-3">
          {checkboxItems.map(item => (
            <label key={item.id} className={clsx(
              'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all',
              values[item.id]
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-slate-700 hover:border-slate-600'
            )}>
              <div className={clsx(
                'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 mt-0.5 transition-all',
                values[item.id] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
              )}>
                {values[item.id] && <Check size={12} className="text-white" />}
              </div>
              <input type="checkbox" className="sr-only"
                checked={!!values[item.id]}
                onChange={e => update(item.id, e.target.checked)} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {!allDone && (
        <p className="text-xs text-amber-400">
          ⚠ Complete all fields and confirmations above before proceeding
        </p>
      )}

      <button onClick={onNext} disabled={!allDone} className="btn-primary w-full gap-2 justify-center">
        Next: Validate Documents <ChevronRight size={14} />
      </button>
    </div>
  )
}

// ── Step 4: Validate ──────────────────────────────────────────
function DocValidationCard({ doc, person }) {
  const [expanded, setExpanded] = useState(false)
  const [deepResult, setDeepResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const hasIssues = doc.has_errors && doc.ai_issues?.length > 0

  const runDeep = async () => {
    const docId = doc.doc_ids?.[0]
    if (!docId) return
    setLoading(true)
    try {
      const res = await applicationAPI.validateDocumentForm2(docId)
      setDeepResult(res.data)
    } catch {
      toast.error('AI validation failed')
    }
    setLoading(false)
  }

  return (
    <div className={clsx('rounded-2xl border overflow-hidden',
      !doc.uploaded ? 'border-red-500/25' :
      hasIssues     ? 'border-amber-500/25' : 'border-emerald-500/20'
    )}>
      <div
        onClick={() => doc.uploaded && setExpanded(!expanded)}
        className={clsx('flex items-center gap-3 p-3 cursor-pointer',
          !doc.uploaded ? 'bg-red-500/5' : hasIssues ? 'bg-amber-500/5' : 'bg-emerald-500/5'
        )}
      >
        <span className="text-lg flex-shrink-0">{DOC_ICONS[doc.type] || '📄'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">{doc.label}</p>
          {hasIssues && <p className="text-xs text-amber-300 mt-0.5">{doc.ai_issues.length} issue{doc.ai_issues.length > 1 ? 's' : ''}</p>}
          {deepResult && (
            <p className={clsx('text-xs mt-0.5', deepResult.overall_valid ? 'text-emerald-400' : 'text-red-400')}>
              Deep check: {deepResult.overall_valid ? 'passed' : `${deepResult.critical_mismatches?.length || 0} critical`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Pill ok={doc.uploaded && !hasIssues} warn={hasIssues}>
            {!doc.uploaded ? 'Missing' : hasIssues ? 'Issues' : '✓ OK'}
          </Pill>
          {doc.uploaded && <ChevronDown size={13} className={clsx('text-slate-500 transition-transform', expanded && 'rotate-180')} />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && doc.uploaded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-800">
            <div className="p-4 space-y-3">
              {hasIssues && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Upload-time issues</p>
                  {doc.ai_issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-300">
                      <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {issue}
                    </div>
                  ))}
                </div>
              )}

              {deepResult && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">AI Cross-Check</p>
                  <div className="space-y-1.5">
                    {deepResult.cross_checks?.map((c, i) => (
                      <div key={i} className={clsx('flex items-start gap-2 p-2 rounded-lg text-xs',
                        c.status === 'pass' ? 'bg-emerald-500/5 border border-emerald-500/15' :
                        c.status === 'fail' ? 'bg-red-500/5 border border-red-500/20' :
                        c.status === 'warn' ? 'bg-amber-500/5 border border-amber-500/15' :
                        'bg-slate-800/40 border border-slate-700'
                      )}>
                        {c.status === 'pass' ? <CheckCircle2 size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" /> :
                         c.status === 'fail' ? <XCircle size={11} className="text-red-400 mt-0.5 flex-shrink-0" /> :
                         c.status === 'warn' ? <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" /> :
                         <AlertCircle size={11} className="text-slate-500 mt-0.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white">{c.field}</p>
                          <div className="flex gap-3 text-slate-500 flex-wrap mt-0.5">
                            <span>Profile: <span className="text-slate-300">{c.profile_value || '—'}</span></span>
                            <span>Doc: <span className="text-slate-300">{c.document_value || '—'}</span></span>
                          </div>
                          {c.note && <p className="text-amber-300 mt-0.5">{c.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {deepResult.eapr_specific_issues?.length > 0 && (
                    <div className="mt-2 p-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5">
                      <p className="text-xs font-bold text-amber-400 mb-1">eAPR-specific issues</p>
                      {deepResult.eapr_specific_issues.map((issue, i) => (
                        <p key={i} className="text-xs text-amber-300">• {issue}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!deepResult && (
                <button onClick={runDeep} disabled={loading}
                  className="btn-secondary w-full gap-2 justify-center text-xs">
                  {loading
                    ? <><Loader2 size={12} className="animate-spin" /> AI reading document...</>
                    : <><Sparkles size={12} /> Run AI Deep-Check (eAPR cross-validate)</>}
                </button>
              )}
              {deepResult && (
                <button onClick={() => { setDeepResult(null); runDeep() }} disabled={loading}
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5">
                  <RefreshCw size={10} /> Re-run
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepValidate({ readiness, onNext }) {
  const hasErrors = readiness.docs_with_errors?.length > 0
  const allUploaded = readiness.summary.missing_docs === 0

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
        <Bot size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <span>
          Expand any document to run the <span className="text-white font-semibold">eAPR Deep-Check</span> — 
          the AI reads each document and cross-validates against your profile with eAPR-specific checks
          (police cert recency, employment letter completeness, medical exam physician, etc).
        </span>
      </div>

      {readiness.doc_groups.map(group => (
        <div key={group.person}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{group.label}</p>
          <div className="space-y-2">
            {group.docs.map(doc => (
              <DocValidationCard key={doc.type} doc={doc} person={group.person} />
            ))}
          </div>
        </div>
      ))}

      {allUploaded && !hasErrors && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-white text-sm">Documents validated — ready to generate PDF</p>
            <p className="text-xs text-slate-400">No critical issues detected across all documents.</p>
          </div>
        </div>
      )}

      <button onClick={onNext} disabled={!allUploaded} className="btn-primary w-full gap-2 justify-center">
        {hasErrors
          ? <>Generate PDF (with {readiness.docs_with_errors.length} warning{readiness.docs_with_errors.length > 1 ? 's' : ''}) <ChevronRight size={14} /></>
          : <>Generate eAPR Reference PDF <ChevronRight size={14} /></>}
      </button>
      {hasErrors && (
        <p className="text-xs text-amber-400 text-center">
          ⚠ You can download the PDF now but fix the flagged issues before submitting to IRCC.
        </p>
      )}
    </div>
  )
}

// ── Step 5: Download ──────────────────────────────────────────
function StepDownload({ readiness, itaDate }) {
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded]   = useState(false)

  const ita = itaDate ? new Date(itaDate) : null
  const deadline = ita ? new Date(ita.getTime() + 60 * 24 * 60 * 60 * 1000) : null
  const daysLeft = deadline ? Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)) : null

  const download = async () => {
    setDownloading(true)
    try {
      const res  = await irccPdfAPI.downloadForm2()
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href  = url
      link.download = 'IRCC_Form2_eAPR_Application.pdf'
      link.click()
      window.URL.revokeObjectURL(url)
      setDownloaded(true)

      // Update tracker — mark eAPR sections in progress
      const tracker = JSON.parse(localStorage.getItem('ircc_tracker_v1') || '{}')
      const eaprSections = ['f2_personal','f2_language','f2_education','f2_work','f2_travel','f2_family','f2_background','f2_docs']
      eaprSections.forEach(id => { if (tracker[id] !== 'done') tracker[id] = 'in_progress' })
      localStorage.setItem('ircc_tracker_v1', JSON.stringify(tracker))
      toast.success('eAPR PDF downloaded! Application tracker updated.')
    } catch {
      toast.error('PDF generation failed — ensure your profile has complete data')
    }
    setDownloading(false)
  }

  const warnings = readiness.docs_with_errors || []

  return (
    <div className="space-y-5">
      {/* Deadline reminder */}
      {daysLeft !== null && (
        <div className={clsx('flex items-center gap-3 p-3 rounded-xl border text-sm',
          daysLeft <= 10 ? 'border-red-500/40 bg-red-500/8' :
          daysLeft <= 20 ? 'border-amber-500/30 bg-amber-500/8' :
                          'border-emerald-500/25 bg-emerald-500/5'
        )}>
          <Timer size={16} className={daysLeft <= 10 ? 'text-red-400' : daysLeft <= 20 ? 'text-amber-400' : 'text-emerald-400'} />
          <span className="text-sm text-white">
            <span className="font-bold">{daysLeft} days</span> to submit to IRCC — deadline{' '}
            <span className="font-semibold">{deadline?.toLocaleDateString('en-CA')}</span>
          </span>
        </div>
      )}

      {/* PDF contents */}
      <div className="p-4 rounded-2xl border border-slate-700 bg-slate-800/30">
        <p className="text-sm font-semibold text-white mb-3">Your eAPR PDF reference includes:</p>
        {[
          ['👤', 'Schedule A — personal, background declarations, address history'],
          ['🗣️', 'Language scores (raw + CLB) formatted for eAPR'],
          ['🎓', 'Complete education history with ECA references'],
          ['💼', 'Detailed work history — employer address, supervisor, duties, salary fields'],
          ['✈️', '10-year travel history fillable table (8 rows)'],
          ['👨‍👩‍👧', 'Family members declaration table'],
          ['📄', 'Section-by-section document upload checklist'],
          ['✅', '13-item final submission checklist'],
        ].map(([icon, text]) => (
          <div key={text} className="flex items-start gap-2 text-xs text-slate-400 mb-1.5">
            <span>{icon}</span>{text}
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={12} className="text-amber-400" />
            <p className="text-xs font-semibold text-amber-300">{warnings.length} doc issue{warnings.length > 1 ? 's' : ''} — fix before submitting to IRCC</p>
          </div>
          {warnings.slice(0, 3).map(w => (
            <p key={w.type} className="text-xs text-slate-400 ml-4">• {w.label}: {w.ai_issues?.[0]}</p>
          ))}
        </div>
      )}

      {!downloaded ? (
        <button onClick={download} disabled={downloading} className="btn-primary w-full gap-2 justify-center py-3 text-base">
          {downloading
            ? <><Loader2 size={16} className="animate-spin" /> Generating eAPR PDF...</>
            : <><FileDown size={16} /> Download eAPR Form 2 PDF</>}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
            <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-white text-sm">eAPR PDF Downloaded!</p>
              <p className="text-xs text-slate-400">IRCC tracker updated to "in progress".</p>
            </div>
          </div>

          {/* Next steps */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Next Steps on IRCC Portal</p>
            {[
              'Sign in at canada.ca with your GCKey and go to your Express Entry account',
              'Click "Submit Application" on your Invitation to Apply (ITA)',
              'Open your eAPR PDF alongside the IRCC portal — use it as your reference for every section',
              'Upload each required document directly to the IRCC portal (not to this app)',
              'Fill in travel history and family declarations using the tables in your PDF',
              'Complete Schedule A background declaration carefully — misrepresentation = permanent ban',
              'Pay fees: $1,365 principal + $500/dependent + $85 biometrics',
              'Submit before your 60-day deadline and save your Application Reference Number (ARN)',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {text}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/works.html"
              target="_blank" rel="noreferrer" className="btn-secondary flex-1 gap-2 justify-center text-sm">
              Open IRCC Portal <ExternalLink size={13} />
            </a>
            <button onClick={download} className="btn-ghost gap-2 text-xs">
              <FileDown size={13} /> Re-download
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function EaprWorkflow() {
  const [open, setOpen]       = useState(false)
  const [step, setStep]       = useState('setup')
  const [itaDate, setItaDate] = useState(() => localStorage.getItem(STORAGE_KEY_ITA) || '')
  const [hasSetup, setHasSetup] = useState(() => !!localStorage.getItem(STORAGE_KEY_ITA))

  const { data: readiness, isLoading, isFetching, refetch } = useQuery(
    'form2-readiness',
    () => applicationAPI.getForm2Readiness().then(r => r.data),
    { enabled: open && step !== 'setup', staleTime: 30_000 }
  )

  const handleOpen = () => {
    setOpen(true)
    setStep(hasSetup ? 'check' : 'setup')
  }

  const recheck = async () => { await refetch(); setStep('check') }

  const nextStep = (from) => {
    const flow = { setup: 'check', check: 'upload', upload: 'nonfile', nonfile: 'validate', validate: 'download' }
    // Skip upload if all docs already present
    if (from === 'check' && readiness?.summary?.missing_docs === 0) {
      setStep('nonfile')
    } else {
      setStep(flow[from] || 'download')
    }
  }

  // ITA days left for top-level countdown
  const ita = itaDate ? new Date(itaDate) : null
  const deadline = ita ? new Date(ita.getTime() + 60 * 24 * 60 * 60 * 1000) : null
  const daysLeft = deadline ? Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)) : null

  return (
    <>
      {/* Entry button */}
      <motion.button
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        onClick={handleOpen}
        className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-blue-500/40 bg-gradient-to-r from-blue-500/10 to-slate-800/40 hover:border-blue-500/70 transition-all group"
      >
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/30 group-hover:shadow-blue-600/50 transition-shadow">
          <Stamp size={22} className="text-white" />
        </div>
        <div className="text-left flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-white text-base">Submit eAPR After ITA</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">60-day deadline</span>
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            {daysLeft !== null
              ? `${daysLeft} days remaining → Upload docs → Declare travel & family → Download pre-filled PDF`
              : 'Received your ITA? Check readiness → Upload → Validate → Download pre-filled eAPR PDF'}
          </p>
        </div>
        <ChevronRight size={20} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
      </motion.button>

      {/* Workflow panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Stamp size={15} className="text-blue-400" />
                <p className="font-bold text-white text-sm">Form 2 — eAPR Full Application (Post-ITA)</p>
              </div>
              <div className="flex items-center gap-3">
                {hasSetup && step !== 'setup' && (
                  <button onClick={() => setStep('setup')}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                    Edit setup
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-white transition-colors">
                  Collapse ↑
                </button>
              </div>
            </div>

            <div className="p-5">
              <StepBar current={step} />

              {(isLoading || isFetching) && step !== 'setup' ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                  <p className="text-slate-400 text-sm">Checking eAPR readiness...</p>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div key={step}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}
                  >
                    {step === 'setup' && (
                      <StepSetup onNext={({ itaDate: d, hasSpouse, numChildren }) => {
                        setItaDate(d)
                        setHasSetup(true)
                        refetch()
                        nextStep('setup')
                      }} />
                    )}
                    {step === 'check'    && readiness && <StepCheck readiness={readiness} itaDate={itaDate} onNext={() => nextStep('check')} onRecheck={recheck} />}
                    {step === 'upload'   && readiness && <StepUpload readiness={readiness} onNext={() => nextStep('upload')} onRecheck={recheck} />}
                    {step === 'nonfile'  && readiness && <StepNonFile nonfileItems={readiness.nonfile_items} onNext={() => nextStep('nonfile')} />}
                    {step === 'validate' && readiness && <StepValidate readiness={readiness} onNext={() => nextStep('validate')} />}
                    {step === 'download' && readiness && <StepDownload readiness={readiness} itaDate={itaDate} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

import React from 'react'
// src/pages/StudentTracker.jsx
// Phase 3 — University Application Tracker
// Kanban-style pipeline: Researching → Applied → Offer → Visa → Done

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ChevronRight, ChevronDown, Trash2, ExternalLink,
  Calendar, DollarSign, GraduationCap, Globe, Check,
  AlertTriangle, Clock, Star, StarOff, Loader2, X,
  FileText, BarChart3, Building, MapPin, BookOpen,
  Pencil, CheckCircle2, Circle, AlertCircle, Trophy
} from 'lucide-react'
import { studentAPI } from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Constants ─────────────────────────────────────────────────
const COUNTRY_FLAGS = {
  canada: '🍁', uk: '🇬🇧', australia: '🇦🇺', usa: '🇺🇸', germany: '🇩🇪'
}

const PIPELINE = [
  { id: 'researching',    label: 'Researching',    color: 'slate',   icon: BookOpen,      desc: 'Considering this option'    },
  { id: 'applied',        label: 'Applied',         color: 'blue',    icon: FileText,      desc: 'Application submitted'      },
  { id: 'offer_received', label: 'Offer Received',  color: 'amber',   icon: Trophy,        desc: 'Conditional / unconditional'},
  { id: 'offer_accepted', label: 'Offer Accepted',  color: 'emerald', icon: CheckCircle2,  desc: 'Accepted & deposit paid'    },
  { id: 'visa_applied',   label: 'Visa Applied',    color: 'purple',  icon: Globe,         desc: 'Visa application submitted' },
  { id: 'visa_approved',  label: 'Visa Approved ✓', color: 'green',   icon: CheckCircle2,  desc: 'Ready to go!'               },
  { id: 'rejected',       label: 'Not Successful',  color: 'red',     icon: X,             desc: 'Application unsuccessful'  },
]

const COUNTRIES = [
  { id: 'canada', label: 'Canada', flag: '🍁' },
  { id: 'uk', label: 'UK', flag: '🇬🇧' },
  { id: 'australia', label: 'Australia', flag: '🇦🇺' },
  { id: 'usa', label: 'USA', flag: '🇺🇸' },
  { id: 'germany', label: 'Germany', flag: '🇩🇪' },
]

const DOC_CATEGORY_COLORS = {
  identity: 'blue', academic: 'emerald', financial: 'amber', visa: 'purple'
}

// ── Helpers ────────────────────────────────────────────────────
function DeadlineBadge({ days }) {
  if (days === null || days === undefined) return null
  if (days < 0) return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-500 font-semibold">Passed</span>
  )
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
      days <= 7  ? 'bg-red-500/20 text-red-400' :
      days <= 21 ? 'bg-amber-500/20 text-amber-400' :
                   'bg-blue-500/20 text-blue-400'
    )}>
      {days === 0 ? 'Today!' : `${days}d`}
    </span>
  )
}

function StatusBadge({ status }) {
  const stage = PIPELINE.find(s => s.id === status) || PIPELINE[0]
  return (
    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold',
      `bg-${stage.color}-500/15 text-${stage.color}-400`
    )}>{stage.label}</span>
  )
}

// ── Add Application Modal ─────────────────────────────────────
function AddAppModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    university_name: '', program_name: '', country: '', city: '',
    intake: '', duration_years: '', tuition_usd: '', ranking: '',
    website_url: '', notes: '', application_deadline: '',
  })
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.university_name && form.program_name && form.country

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <p className="font-bold text-white">Add University Application</p>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Country selector */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Country <span className="text-red-400">*</span></p>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map(c => (
                <button key={c.id} onClick={() => up('country', c.id)}
                  className={clsx('px-3 py-1.5 rounded-xl border text-sm transition-all',
                    form.country === c.id
                      ? 'border-blue-500 bg-blue-500/10 text-white font-semibold'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'
                  )}>
                  {c.flag} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Required fields */}
          {[
            { key: 'university_name', label: 'University Name', placeholder: 'e.g. University of Toronto', required: true },
            { key: 'program_name',    label: 'Program / Course', placeholder: 'e.g. MSc Data Science', required: true },
          ].map(f => (
            <div key={f.key}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {f.label} {f.required && <span className="text-red-400">*</span>}
              </p>
              <input className="input w-full text-sm" placeholder={f.placeholder}
                value={form[f.key]} onChange={e => up(f.key, e.target.value)} />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'city',     label: 'City',             placeholder: 'e.g. Toronto'  },
              { key: 'intake',   label: 'Intake',           placeholder: 'e.g. Sep 2025' },
              { key: 'duration_years', label: 'Duration (years)', placeholder: '2',      type: 'number' },
              { key: 'tuition_usd',    label: 'Annual Tuition (USD)', placeholder: '25000', type: 'number' },
              { key: 'ranking',        label: 'QS Ranking (optional)', placeholder: '50', type: 'number' },
              { key: 'application_deadline', label: 'Application Deadline', type: 'date' },
            ].map(f => (
              <div key={f.key}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">{f.label}</p>
                <input type={f.type || 'text'} className="input w-full text-sm"
                  placeholder={f.placeholder}
                  value={form[f.key]} onChange={e => up(f.key, e.target.value)} />
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">University Website</p>
            <input className="input w-full text-sm" placeholder="https://..."
              value={form.website_url} onChange={e => up('website_url', e.target.value)} />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Notes</p>
            <textarea rows={2} className="input w-full text-sm resize-none"
              placeholder="Anything to remember about this application..."
              value={form.notes} onChange={e => up('notes', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => valid && onSave(form)} disabled={!valid}
            className="btn-primary flex-1 gap-2">
            <Plus size={14} /> Add Application
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Application Card ──────────────────────────────────────────
function AppCard({ app, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const stage = PIPELINE.find(s => s.id === app.status) || PIPELINE[0]
  const docsDone  = app.docs_done  || 0
  const docsTotal = app.docs_total || 0
  const docsPct   = docsTotal > 0 ? Math.round((docsDone / docsTotal) * 100) : 0

  const toggleDoc = (docId) => {
    const updated = (app.doc_checklist || []).map(d =>
      d.id === docId ? { ...d, done: !d.done } : d
    )
    onUpdate(app.id, { doc_checklist: updated })
  }

  const docsByCategory = (app.doc_checklist || []).reduce((acc, d) => {
    const cat = d.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(d)
    return acc
  }, {})

  return (
    <motion.div layout className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-xl flex-shrink-0 mt-0.5">
          {COUNTRY_FLAGS[app.country] || '🌍'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-white text-sm leading-tight">{app.university_name}</p>
              <p className="text-xs text-slate-400">{app.program_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge status={app.status} />
                {app.intake && <span className="text-[10px] text-slate-500">{app.intake}</span>}
                {app.ranking && <span className="text-[10px] text-slate-500">QS #{app.ranking}</span>}
                {app.days_to_deadline !== null && <DeadlineBadge days={app.days_to_deadline} />}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => onUpdate(app.id, { is_favourite: !app.is_favourite })}
                className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                {app.is_favourite
                  ? <Star size={14} className="text-amber-400 fill-amber-400" />
                  : <StarOff size={14} className="text-slate-600" />}
              </button>
              <button onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                <ChevronDown size={14} className={clsx('text-slate-400 transition-transform', expanded && 'rotate-180')} />
              </button>
              <button onClick={() => onDelete(app.id)}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                <Trash2 size={13} className="text-slate-600 hover:text-red-400 transition-colors" />
              </button>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="flex items-center gap-4 mt-2">
            {app.tuition_usd && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <DollarSign size={10} />{app.tuition_usd.toLocaleString()}/yr
              </div>
            )}
            {app.city && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin size={10} />{app.city}
              </div>
            )}
            {docsTotal > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full',
                    docsPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                  )} style={{ width: `${docsPct}%` }} />
                </div>
                <span>{docsDone}/{docsTotal} docs</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
          >
            <div className="pt-4 mt-3 border-t border-slate-800 space-y-4">

              {/* Status updater */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Update Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {PIPELINE.map(s => (
                    <button key={s.id}
                      onClick={() => onUpdate(app.id, { status: s.id })}
                      className={clsx('text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all',
                        app.status === s.id
                          ? `border-${s.color}-500 bg-${s.color}-500/10 text-${s.color}-400`
                          : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                      )}>{s.label}</button>
                  ))}
                </div>
              </div>

              {/* Key dates */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Key Dates</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'application_deadline', label: 'Application Deadline' },
                    { key: 'applied_date',          label: 'Applied Date'         },
                    { key: 'offer_date',            label: 'Offer Received'       },
                    { key: 'tuition_deposit_due',   label: 'Deposit Due'          },
                    { key: 'visa_applied_date',     label: 'Visa Applied'         },
                    { key: 'visa_decision_date',    label: 'Visa Decision'        },
                  ].map(f => (
                    <div key={f.key}>
                      <p className="text-[10px] text-slate-600 mb-0.5">{f.label}</p>
                      <input type="date" className="input w-full text-xs py-1.5"
                        value={app[f.key] || ''}
                        onChange={e => onUpdate(app.id, { [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Offer details */}
              {(app.status === 'offer_received' || app.status === 'offer_accepted') && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Offer Details</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className={clsx('w-4 h-4 rounded flex items-center justify-center border-2',
                        app.offer_letter_received ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                      )}>
                        {app.offer_letter_received && <Check size={10} className="text-white" />}
                      </div>
                      <input type="checkbox" className="sr-only"
                        checked={!!app.offer_letter_received}
                        onChange={e => onUpdate(app.id, { offer_letter_received: e.target.checked })} />
                      <span className="text-xs text-slate-400">Offer letter received</span>
                    </label>
                    <input className="input w-full text-xs" placeholder="Offer conditions (if conditional)..."
                      value={app.offer_conditions || ''}
                      onChange={e => onUpdate(app.id, { offer_conditions: e.target.value })} />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                      <input type="number" className="input w-full text-xs pl-6"
                        placeholder="Scholarship amount (if any)"
                        value={app.scholarship_amount_usd || ''}
                        onChange={e => onUpdate(app.id, { scholarship_amount_usd: parseInt(e.target.value) || null })} />
                    </div>
                  </div>
                </div>
              )}

              {/* Document checklist */}
              {app.doc_checklist?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Document Checklist</p>
                    <span className="text-xs text-slate-500">{docsDone}/{docsTotal}</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(docsByCategory).map(([cat, docs]) => (
                      <div key={cat}>
                        <p className={clsx('text-[10px] font-bold uppercase tracking-wider mb-1.5',
                          `text-${DOC_CATEGORY_COLORS[cat] || 'slate'}-400`
                        )}>{cat}</p>
                        <div className="space-y-1">
                          {docs.map(doc => (
                            <label key={doc.id} className={clsx(
                              'flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors',
                              doc.done ? 'bg-emerald-500/5' : 'hover:bg-slate-800/50'
                            )}>
                              <div onClick={() => toggleDoc(doc.id)}
                                className={clsx('w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all',
                                  doc.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                                )}>
                                {doc.done && <Check size={9} className="text-white" />}
                              </div>
                              <span className={clsx('text-xs', doc.done ? 'text-slate-500 line-through' : 'text-slate-300')}>
                                {doc.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes + website */}
              <div className="flex items-center gap-3">
                {app.website_url && (
                  <a href={app.website_url} target="_blank" rel="noreferrer"
                    className="btn-secondary text-xs gap-1.5">
                    <ExternalLink size={11} /> University Website
                  </a>
                )}
                {app.notes && (
                  <p className="text-xs text-slate-500 flex-1 italic">"{app.notes}"</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Deadlines sidebar ─────────────────────────────────────────
function DeadlinesSidebar({ apps }) {
  const today = new Date()
  const allDeadlines = apps.flatMap(a => {
    const items = []
    const fields = [
      { key: 'application_deadline', label: 'Apply by' },
      { key: 'tuition_deposit_due',  label: 'Deposit'  },
      { key: 'visa_applied_date',    label: 'Visa'     },
    ]
    fields.forEach(({ key, label }) => {
      if (a[key]) {
        const d = new Date(a[key])
        const days = Math.ceil((d - today) / (1000 * 60 * 60 * 24))
        if (days >= 0 && days <= 90) {
          items.push({ university: a.university_name, label, date: a[key], days, appId: a.id })
        }
      }
    })
    return items
  }).sort((x, y) => x.days - y.days)

  if (!allDeadlines.length) return null

  return (
    <div className="card">
      <h3 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
        <Clock size={14} className="text-amber-400" /> Upcoming Deadlines
      </h3>
      <div className="space-y-2">
        {allDeadlines.slice(0, 6).map((d, i) => (
          <div key={i} className={clsx('flex items-center gap-2 p-2 rounded-lg',
            d.days <= 7  ? 'bg-red-500/5 border border-red-500/15' :
            d.days <= 21 ? 'bg-amber-500/5 border border-amber-500/15' :
                           'bg-slate-800/30 border border-slate-800'
          )}>
            <DeadlineBadge days={d.days} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{d.university}</p>
              <p className="text-[10px] text-slate-500">{d.label} · {d.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function StudentTracker() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCountry, setFilterCountry] = useState('all')
  const [view, setView] = useState('list')   // list | pipeline

  const { data: apps = [], isLoading } = useQuery(
    'student-applications',
    () => studentAPI.listApplications().then(r => r.data),
    { staleTime: 30_000 }
  )

  const create = useMutation(
    (data) => studentAPI.createApplication({
      ...data,
      duration_years: parseFloat(data.duration_years) || null,
      tuition_usd:    parseInt(data.tuition_usd)    || null,
      ranking:        parseInt(data.ranking)         || null,
    }),
    {
      onSuccess: () => { qc.invalidateQueries('student-applications'); setShowAdd(false); toast.success('Application added!') },
      onError:   () => toast.error('Failed to add — try again'),
    }
  )

  const update = useMutation(
    ({ id, data }) => studentAPI.updateApplication(id, data),
    {
      onSuccess: () => qc.invalidateQueries('student-applications'),
      onError:   () => toast.error('Update failed'),
    }
  )

  const remove = useMutation(
    (id) => studentAPI.deleteApplication(id),
    {
      onSuccess: () => { qc.invalidateQueries('student-applications'); toast.success('Removed') },
      onError:   () => toast.error('Delete failed'),
    }
  )

  const handleUpdate = (id, data) => update.mutate({ id, data })
  const handleDelete = (id) => {
    if (window.confirm('Remove this application?')) remove.mutate(id)
  }

  // Filter
  let filtered = apps
  if (filterStatus  !== 'all') filtered = filtered.filter(a => a.status  === filterStatus)
  if (filterCountry !== 'all') filtered = filtered.filter(a => a.country === filterCountry)

  // Pipeline view groups
  const byStatus = PIPELINE.reduce((acc, s) => {
    acc[s.id] = apps.filter(a => a.status === s.id)
    return acc
  }, {})

  // Stats
  const total    = apps.length
  const offers   = apps.filter(a => ['offer_received','offer_accepted'].includes(a.status)).length
  const approved = apps.filter(a => a.status === 'visa_approved').length
  const favourite = apps.filter(a => a.is_favourite).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <GraduationCap size={22} className="text-blue-400" /> Application Tracker
          </h1>
          <p className="text-slate-400 text-sm mt-1">Track every university application from research to visa approval</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary gap-2">
          <Plus size={15} /> Add University
        </button>
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Tracking',  val: total,    color: 'blue'    },
            { label: 'Favourites',val: favourite, color: 'amber'   },
            { label: 'Offers',    val: offers,    color: 'emerald' },
            { label: 'Approved',  val: approved,  color: 'green'   },
          ].map(s => (
            <div key={s.label} className="card text-center py-3">
              <p className={clsx('text-2xl font-bold', `text-${s.color}-400`)}>{s.val}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-6">
        {/* Main column */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* View toggle + filters */}
          {total > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* View toggle */}
              <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
                {['list', 'pipeline'].map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize',
                      view === v ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
                    )}>{v}</button>
                ))}
              </div>

              {/* Status filter */}
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="input text-xs py-1.5 px-3">
                <option value="all">All statuses</option>
                {PIPELINE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>

              {/* Country filter */}
              <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
                className="input text-xs py-1.5 px-3">
                <option value="all">All countries</option>
                {COUNTRIES.map(c => <option key={c.id} value={c.id}>{c.flag} {c.label}</option>)}
              </select>
            </div>
          )}

          {/* Empty state */}
          {total === 0 && (
            <div className="card text-center py-16">
              <GraduationCap size={44} className="mx-auto text-slate-700 mb-4" />
              <p className="text-slate-300 font-semibold">No applications yet</p>
              <p className="text-slate-500 text-sm mt-1 mb-5">Add universities you're researching or applying to</p>
              <button onClick={() => setShowAdd(true)} className="btn-primary gap-2 mx-auto">
                <Plus size={14} /> Add Your First University
              </button>
            </div>
          )}

          {/* List view */}
          {view === 'list' && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map(app => (
                <AppCard key={app.id} app={app} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Pipeline view */}
          {view === 'pipeline' && total > 0 && (
            <div className="space-y-3">
              {PIPELINE.filter(s => byStatus[s.id]?.length > 0 || s.id === 'researching').map(s => {
                const stageApps = byStatus[s.id] || []
                if (!stageApps.length) return null
                return (
                  <div key={s.id} className={clsx('rounded-2xl border overflow-hidden',
                    `border-${s.color}-500/20`
                  )}>
                    <div className={clsx('flex items-center gap-2 px-4 py-2.5',
                      `bg-${s.color}-500/8`
                    )}>
                      <s.icon size={13} className={`text-${s.color}-400`} />
                      <p className={clsx('text-xs font-bold', `text-${s.color}-400`)}>{s.label}</p>
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto',
                        `bg-${s.color}-500/15 text-${s.color}-400`
                      )}>{stageApps.length}</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {stageApps.map(app => (
                        <AppCard key={app.id} app={app} onUpdate={handleUpdate} onDelete={handleDelete} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 space-y-4 hidden lg:block">
          <DeadlinesSidebar apps={apps} />
        </div>
      </div>

      {showAdd && <AddAppModal onClose={() => setShowAdd(false)} onSave={(data) => create.mutate(data)} />}
    </div>
  )
}

import React from 'react'
// src/pages/StudentPRPathway.jsx
// Phase 5 — Post-Acceptance + PR Pathway Tracker
// PGWP eligibility, CRS projection, Express Entry timeline, milestone tracker

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Briefcase, Globe, CheckCircle2, Circle,
  AlertTriangle, Info, Loader2, TrendingUp, MapPin,
  ChevronDown, ChevronRight, Star, Clock, Flag,
  ArrowRight, Zap, Trophy, Shield, FileText, BarChart3
} from 'lucide-react'
import { studentAPI } from '../services/api'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Constants ──────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  study: {
    label: 'Study Phase',
    color: 'blue',
    icon: GraduationCap,
    bg: 'bg-blue-500',
  },
  pgwp: {
    label: 'PGWP',
    color: 'emerald',
    icon: FileText,
    bg: 'bg-emerald-500',
  },
  express_entry: {
    label: 'Express Entry',
    color: 'amber',
    icon: TrendingUp,
    bg: 'bg-amber-500',
  },
  pr: {
    label: 'Permanent Residence',
    color: 'purple',
    icon: Trophy,
    bg: 'bg-purple-500',
  },
}

// ── CRS Gauge ─────────────────────────────────────────────────
function CRSGauge({ score, cutoff, label, delta }) {
  const pct   = Math.min(100, Math.round((score / 600) * 100))
  const above = score >= cutoff
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{label}</p>
        {delta !== undefined && delta !== null && (
          <span className={clsx('text-xs font-bold',
            delta > 0 ? 'text-emerald-400' : 'text-slate-500'
          )}>
            {delta > 0 ? `+${delta}` : delta} pts
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className={clsx('h-full rounded-full',
              above ? 'bg-emerald-500' : score >= cutoff * 0.9 ? 'bg-amber-500' : 'bg-blue-500'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <span className={clsx('text-lg font-bold tabular-nums w-12 text-right',
          above ? 'text-emerald-400' : 'text-white'
        )}>{score}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        <div className="w-2 h-2 rounded-full bg-slate-600" />
        <span>Avg cutoff: {cutoff}</span>
        {above
          ? <span className="text-emerald-400 ml-1">✓ Above cutoff by {score - cutoff} pts</span>
          : <span className="text-amber-400 ml-1">⚠ {cutoff - score} pts below avg cutoff</span>
        }
      </div>
    </div>
  )
}

// ── CRS Breakdown bar ─────────────────────────────────────────
function CRSBreakdown({ data, title }) {
  const items = [
    { label: 'Age',              val: data.age,            color: 'bg-blue-500'    },
    { label: 'Education',        val: data.education,      color: 'bg-emerald-500' },
    { label: 'Language',         val: data.language,       color: 'bg-amber-500'   },
    { label: 'Canadian Work',    val: data.canadian_work,  color: 'bg-purple-500'  },
    { label: 'Canadian Edu Bonus', val: data.canadian_edu, color: 'bg-cyan-500'    },
    { label: 'Job Offer Bonus',  val: data.job_offer_bonus,color: 'bg-rose-500'    },
  ].filter(i => i.val > 0)

  const maxVal = Math.max(...items.map(i => i.val), 1)

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</p>}
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-3">
          <p className="text-xs text-slate-400 w-36 flex-shrink-0">{item.label}</p>
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full', item.color)}
              style={{ width: `${Math.round((item.val / maxVal) * 100)}%` }} />
          </div>
          <p className="text-xs font-mono text-white w-8 text-right">{item.val}</p>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1 border-t border-slate-800/60">
        <p className="text-xs font-bold text-white w-36">Total</p>
        <div className="flex-1" />
        <p className="text-sm font-bold text-white">{data.total}</p>
      </div>
    </div>
  )
}

// ── PGWP Status card ──────────────────────────────────────────
function PGWPCard({ pgwp }) {
  const ok = pgwp.eligible && pgwp.lang_ok && pgwp.field_ok

  return (
    <div className={clsx('rounded-2xl border p-5',
      ok
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : pgwp.eligible
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-red-500/30 bg-red-500/5'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-white">PGWP Eligibility</p>
          <p className="text-xs text-slate-400 mt-0.5">Post-Graduation Work Permit</p>
        </div>
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center',
          ok ? 'bg-emerald-500/15' : 'bg-amber-500/15'
        )}>
          {ok
            ? <CheckCircle2 size={20} className="text-emerald-400" />
            : <AlertTriangle size={20} className="text-amber-400" />
          }
        </div>
      </div>

      {pgwp.eligible ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">{pgwp.duration_months}</span>
            <span className="text-sm text-slate-400">months PGWP</span>
            {pgwp.duration_months === 36 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">Maximum</span>
            )}
          </div>

          <div className="space-y-1.5 mt-3">
            {[
              { label: 'Program duration',  ok: pgwp.eligible,   note: pgwp.duration_months > 0 ? `${pgwp.duration_months} months granted` : 'Not eligible'  },
              { label: 'Language (CLB 7+)', ok: pgwp.lang_ok,    note: pgwp.lang_ok ? 'IELTS 6.0+ confirmed' : 'Need IELTS 6.0 in all bands'  },
              { label: 'Field of study',    ok: pgwp.field_ok,   note: pgwp.field_ok ? 'Likely eligible' : 'Verify with IRCC — may need STEM/healthcare field'  },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2">
                {row.ok
                  ? <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                  : <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
                }
                <span className="text-xs text-slate-400 w-36">{row.label}</span>
                <span className={clsx('text-xs', row.ok ? 'text-slate-300' : 'text-amber-300')}>{row.note}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {pgwp.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{issue}</p>
            </div>
          ))}
        </div>
      )}

      {pgwp.issues.length > 0 && pgwp.eligible && (
        <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-1">
          {pgwp.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{issue}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CRS Projection section ────────────────────────────────────
function CRSProjection({ proj }) {
  const [expanded, setExpanded] = useState(null)

  const stages = [
    {
      id: 'baseline',
      label: 'Before Canadian Study',
      crs:   proj.baseline.total,
      data:  proj.baseline,
      color: 'slate',
      icon:  Circle,
    },
    {
      id: 'post_graduation',
      label: 'After Graduation',
      crs:   proj.post_graduation.total,
      data:  proj.post_graduation,
      delta: proj.post_graduation.total - proj.baseline.total,
      color: 'blue',
      icon:  GraduationCap,
    },
    {
      id: 'after_1yr_work',
      label: 'After 1yr Canadian Work',
      crs:   proj.after_1yr_work.total,
      data:  proj.after_1yr_work,
      delta: proj.after_1yr_work.total - proj.post_graduation.total,
      color: 'emerald',
      icon:  Briefcase,
    },
    {
      id: 'after_2yr_work',
      label: 'After 2yr Work (no offer)',
      crs:   proj.after_2yr_work.total,
      data:  proj.after_2yr_work,
      delta: proj.after_2yr_work.total - proj.after_1yr_work.total,
      color: 'amber',
      icon:  TrendingUp,
    },
    {
      id: 'after_2yr_with_job_offer',
      label: '2yr Work + Job Offer',
      crs:   proj.after_2yr_with_job_offer.total,
      data:  proj.after_2yr_with_job_offer,
      delta: proj.after_2yr_with_job_offer.total - proj.after_2yr_work.total,
      color: 'purple',
      icon:  Star,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-white">CRS Score Projection</p>
        <div className="text-xs text-slate-500">
          Avg cutoff: <span className="text-white font-semibold">{proj.recent_avg_cutoff}</span>
          {' · '}Latest: <span className="text-white font-semibold">{proj.latest_cutoff}</span>
        </div>
      </div>

      {proj.existing_crs && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs">
          <Info size={12} className="text-blue-400 flex-shrink-0" />
          <span className="text-slate-400">Your current Express Entry CRS: </span>
          <span className="text-white font-bold">{proj.existing_crs}</span>
        </div>
      )}

      <div className="space-y-2">
        {stages.map(stage => {
          const isOpen = expanded === stage.id
          const above  = stage.crs >= proj.recent_avg_cutoff
          const Icon   = stage.icon
          return (
            <div key={stage.id} className={clsx('rounded-xl border overflow-hidden',
              above ? 'border-emerald-500/20' : 'border-slate-700'
            )}>
              <button
                onClick={() => setExpanded(isOpen ? null : stage.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <Icon size={14} className={`text-${stage.color}-400 flex-shrink-0`} />
                <span className="text-sm text-slate-300 flex-1 text-left">{stage.label}</span>
                {stage.delta !== undefined && (
                  <span className={clsx('text-xs font-bold',
                    stage.delta > 0 ? 'text-emerald-400' : 'text-slate-500'
                  )}>+{stage.delta}</span>
                )}
                <span className={clsx('text-lg font-bold tabular-nums w-12 text-right',
                  above ? 'text-emerald-400' : 'text-white'
                )}>{stage.crs}</span>
                <ChevronDown size={13} className={clsx('text-slate-500 transition-transform', isOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-slate-800"
                  >
                    <div className="p-4">
                      <CRSBreakdown data={stage.data} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Competitiveness summary */}
      <div className={clsx('p-3 rounded-xl border text-sm',
        proj.likely_competitive
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-amber-500/30 bg-amber-500/8'
      )}>
        {proj.likely_competitive ? (
          <p className="text-emerald-300">
            <span className="font-bold">✓ Competitive profile.</span> Your projected CRS of {proj.after_1yr_work.total} after 1 year of Canadian work is above the recent average cutoff of {proj.recent_avg_cutoff}.
          </p>
        ) : (
          <p className="text-amber-300">
            <span className="font-bold">⚠ Gap to close:</span> Your projected CRS of {proj.after_1yr_work.total} is {proj.gap_to_avg} pts below the recent average cutoff. See the tips below to close the gap.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Milestone timeline ────────────────────────────────────────
function MilestoneTimeline({ milestones, checkins, onToggle }) {
  // Group by year
  const byYear = milestones.reduce((acc, m) => {
    if (!acc[m.year]) acc[m.year] = []
    acc[m.year].push(m)
    return acc
  }, {})

  const years = Object.keys(byYear).sort()

  return (
    <div className="space-y-6">
      {years.map(year => (
        <div key={year}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">
              <Flag size={13} className="text-slate-400" />
            </div>
            <p className="font-bold text-white">{year}</p>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <div className="ml-4 space-y-2">
            {byYear[year].map((m, i) => {
              const cat    = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.study
              const done   = !!checkins[m.id]
              const CatIcon = cat.icon

              return (
                <div key={m.id} className={clsx('rounded-xl border overflow-hidden transition-colors',
                  done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-700/50'
                )}>
                  <div className="flex items-start gap-3 p-3.5">
                    {/* Check circle */}
                    <button
                      onClick={() => onToggle(m.id)}
                      className="flex-shrink-0 mt-0.5"
                    >
                      {done
                        ? <CheckCircle2 size={18} className="text-emerald-400" />
                        : <Circle size={18} className="text-slate-600 hover:text-slate-400 transition-colors" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={clsx('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                          `bg-${cat.color}-500/15 text-${cat.color}-400`
                        )}>
                          <CatIcon size={9} />{cat.label}
                        </span>
                        {m.crs && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-semibold">
                            CRS ~{m.crs}
                          </span>
                        )}
                      </div>

                      <p className={clsx('text-sm font-semibold', done ? 'text-slate-400 line-through' : 'text-white')}>
                        {m.label}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.detail}</p>

                      <div className="flex items-start gap-1.5 mt-2">
                        <ArrowRight size={11} className="text-blue-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-300">{m.action}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PNP + CRS Tips ────────────────────────────────────────────
function BoostPanel({ pnpStreams, crsTips }) {
  const [tab, setTab] = useState('pnp')
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-amber-400" />
        <h3 className="font-semibold text-white">Boost Your CRS</h3>
      </div>

      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
        {[
          { id: 'pnp', label: '🏔 PNP Streams' },
          { id: 'tips', label: '📈 CRS Tips' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
              tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            )}>{t.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'pnp' && (
          <motion.div key="pnp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-3">
              {pnpStreams.map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-white">{s.stream}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold whitespace-nowrap">+600 pts</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">{s.province}</p>
                  <p className="text-xs text-slate-400">{s.detail}</p>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 mt-1.5 hover:underline">
                      Learn more <ChevronRight size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {tab === 'tips' && (
          <motion.div key="tips" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-3">
              {crsTips.map((tip, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-white">{tip.action}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">+{tip.pts}</span>
                  </div>
                  <p className="text-xs text-slate-400">{tip.note}</p>
                </div>
              ))}
              {crsTips.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  Your projected CRS is already competitive. Keep your profile updated!
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Timeline summary strip ────────────────────────────────────
function TimelineSummary({ years }) {
  const items = [
    { label: 'Arrive',          year: years.study_start,        color: 'blue'    },
    { label: 'Graduate',        year: years.graduation,         color: 'emerald' },
    { label: 'PGWP ends',       year: years.pgwp_end,           color: 'amber'   },
    { label: 'CEC eligible',    year: years.cec_eligible,       color: 'orange'  },
    { label: 'PR estimate',     year: years.pr_estimate,        color: 'purple'  },
    { label: 'Citizenship',     year: years.citizenship_eligible, color: 'rose'  },
  ]

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center flex-shrink-0">
          <div className="text-center px-3">
            <div className={clsx('w-3 h-3 rounded-full mx-auto mb-1', `bg-${item.color}-500`)} />
            <p className="text-[10px] font-bold text-white">{item.year}</p>
            <p className="text-[10px] text-slate-500 whitespace-nowrap">{item.label}</p>
          </div>
          {i < items.length - 1 && (
            <div className="w-8 h-px bg-slate-700 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function StudentPRPathway() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('timeline')
  const [checkins, setCheckins] = useState({})

  const { data, isLoading, error } = useQuery(
    'pr-pathway',
    () => studentAPI.getPRPathway('canada').then(r => r.data),
    { staleTime: 5 * 60_000 }
  )

  // Load saved checkins from API result
  useEffect(() => {
    if (data?.profile_found === false) return
    // Checkins come back via the student profile eligibility_result blob
    // We initialise from localStorage as a fast fallback
    const saved = localStorage.getItem('pr_milestone_checkins_v1')
    if (saved) {
      try { setCheckins(JSON.parse(saved)) } catch {}
    }
  }, [data])

  const saveMutation = useMutation(
    (c) => studentAPI.saveMilestoneCheckins(c),
    { onError: () => {} } // silent
  )

  const toggleMilestone = (id) => {
    const next = { ...checkins, [id]: !checkins[id] }
    if (!next[id]) delete next[id]
    setCheckins(next)
    localStorage.setItem('pr_milestone_checkins_v1', JSON.stringify(next))
    saveMutation.mutate(next)
  }

  const SECTIONS = [
    { id: 'timeline',    label: '🗺 Roadmap'       },
    { id: 'pgwp',        label: '📄 PGWP'          },
    { id: 'crs',         label: '📊 CRS Projection' },
    { id: 'boost',       label: '⚡ Boost CRS'     },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-purple-400" />
      </div>
    )
  }

  // No student profile yet
  if (!data || !data.profile_found) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto">
          <Trophy size={28} className="text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Set Up Your Student Profile First</h2>
        <p className="text-slate-400 text-sm">
          The PR pathway analysis needs your student profile (nationality, target program, IELTS score, date of birth) to calculate PGWP eligibility and CRS projections.
        </p>
        <button onClick={() => navigate('/student/profile')} className="btn-primary gap-2 mx-auto">
          <GraduationCap size={14} /> Complete Student Profile
        </button>
      </div>
    )
  }

  const completedCount = Object.values(checkins).filter(Boolean).length
  const totalCount     = data.milestones.length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Trophy size={22} className="text-purple-400" /> PR Pathway
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Your personalised Student → PGWP → Express Entry → Permanent Residence roadmap
        </p>
      </div>

      {/* Accepted application banner */}
      {data.accepted_app.university && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
          <GraduationCap size={18} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">{data.accepted_app.university}</p>
            <p className="text-xs text-slate-400">{data.accepted_app.program} · {data.accepted_app.intake} · {data.accepted_app.duration_yr}yr</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-500">PGWP (if eligible)</p>
            <p className="text-sm font-bold text-emerald-400">{data.pgwp.duration_months} months</p>
          </div>
        </div>
      )}

      {/* Timeline summary strip */}
      <div className="card overflow-x-auto">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Your Timeline</p>
        <TimelineSummary years={data.timeline_years} />
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div className="h-full bg-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        <p className="text-xs text-slate-400 whitespace-nowrap">
          {completedCount}/{totalCount} milestones
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-2xl overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={clsx('flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap',
              activeSection === s.id
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            )}>{s.label}</button>
        ))}
      </div>

      {/* Section content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeSection}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeSection === 'timeline' && (
            <MilestoneTimeline
              milestones={data.milestones}
              checkins={checkins}
              onToggle={toggleMilestone}
            />
          )}

          {activeSection === 'pgwp' && (
            <div className="space-y-4">
              <PGWPCard pgwp={data.pgwp} />
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Key Rules to Know</p>
                <p className="text-xs text-slate-400 leading-relaxed">{data.pgwp.rules_note}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{data.pgwp.field_of_study_note}</p>
              </div>
            </div>
          )}

          {activeSection === 'crs' && (
            <div className="card">
              <CRSProjection proj={data.crs_projection} />
            </div>
          )}

          {activeSection === 'boost' && (
            <BoostPanel
              pnpStreams={data.pnp_streams}
              crsTips={data.crs_tips}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Link to eAPR when ready */}
      {completedCount >= 6 && (
        <div className="p-4 rounded-xl bg-purple-500/8 border border-purple-500/20 flex items-center gap-3">
          <Trophy size={18} className="text-purple-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Getting close to PR!</p>
            <p className="text-xs text-slate-400">When you receive your ITA, use the eAPR workflow in the Documents section.</p>
          </div>
          <button onClick={() => navigate('/documents')} className="btn-secondary text-xs whitespace-nowrap">
            Go to Documents
          </button>
        </div>
      )}
    </div>
  )
}

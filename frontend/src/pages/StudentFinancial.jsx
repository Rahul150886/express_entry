import React from 'react'
// src/pages/StudentFinancial.jsx
// Phase 4 — Financial Tools: Proof of Funds Calculator + Scholarship Finder

import { useState } from 'react'
import { useQuery } from 'react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Calculator, GraduationCap, ExternalLink,
  CheckCircle2, AlertTriangle, Info, Loader2, Filter,
  ChevronDown, Star, Globe, BookOpen, Sparkles
} from 'lucide-react'
import { studentAPI } from '../services/api'
import clsx from 'clsx'

const COUNTRY_FLAGS = { canada: '🍁', uk: '🇬🇧', australia: '🇦🇺', usa: '🇺🇸', germany: '🇩🇪' }
const COUNTRY_CITIES = {
  canada:    ['toronto', 'vancouver', 'montreal', 'calgary', 'ottawa', 'other'],
  uk:        ['london', 'manchester', 'birmingham', 'edinburgh', 'other'],
  australia: ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'other'],
  usa:       ['new_york', 'los_angeles', 'boston', 'chicago', 'other'],
  germany:   ['berlin', 'munich', 'hamburg', 'frankfurt', 'other'],
}

const LEVEL_LABELS = {
  bachelors: "Bachelor's", masters: "Master's", phd: 'PhD',
  diploma: 'Diploma', any: 'Any level', language_course: 'Language',
}

// ── Proof of Funds Calculator ─────────────────────────────────
function FundsCalculator({ profile }) {
  const [form, setForm] = useState({
    country: profile?.target_countries?.[0] || 'canada',
    city: 'other',
    tuition_usd: profile?.annual_budget_usd ? Math.round(profile.annual_budget_usd * 0.6) : 0,
    duration_years: 2,
  })
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: result, isLoading, refetch } = useQuery(
    ['funds-calc', form],
    () => studentAPI.calculateFunds(form).then(r => r.data),
    { enabled: !!form.country, staleTime: 60_000 }
  )

  const cities = COUNTRY_CITIES[form.country] || ['other']

  const sufficiency = result ? (() => {
    const have = (profile?.savings_usd || 0) + (profile?.sponsor_annual_income_usd || 0) * 0.3
    const need  = result.visa_requirement.must_show_usd
    if (have >= need * 1.15) return 'strong'
    if (have >= need)        return 'sufficient'
    if (have >= need * 0.7)  return 'borderline'
    return 'insufficient'
  })() : null

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-white">Proof of Funds Calculator</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Calculates exactly what a visa officer needs to see on your bank statement
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        {/* Country */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Country</p>
          <div className="flex flex-wrap gap-1.5">
            {['canada','uk','australia','usa','germany'].map(c => (
              <button key={c} onClick={() => { up('country', c); up('city', 'other') }}
                className={clsx('px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                  form.country === c
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                )}>
                {COUNTRY_FLAGS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* City */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">City</p>
          <select value={form.city} onChange={e => up('city', e.target.value)} className="input w-full text-sm">
            {cities.map(c => (
              <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {/* Tuition */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Annual Tuition (USD)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
            <input type="number" min="0" step="500" className="input w-full pl-7 text-sm"
              placeholder="25000"
              value={form.tuition_usd}
              onChange={e => up('tuition_usd', parseInt(e.target.value) || 0)} />
          </div>
        </div>

        {/* Duration */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Program Duration</p>
          <div className="flex gap-2">
            {[1, 1.5, 2, 3, 4].map(y => (
              <button key={y} onClick={() => up('duration_years', y)}
                className={clsx('flex-1 py-2 rounded-xl border text-xs font-semibold transition-all',
                  form.duration_years === y
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-slate-700 text-slate-400'
                )}>{y}yr</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-slate-800/40">
          <Loader2 size={14} className="animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Calculating...</p>
        </div>
      )}

      {result && !isLoading && (
        <div className="space-y-4">
          {/* What to show the embassy */}
          <div className={clsx('p-5 rounded-2xl border',
            sufficiency === 'strong'       ? 'border-emerald-500/30 bg-emerald-500/5' :
            sufficiency === 'sufficient'   ? 'border-emerald-500/20 bg-emerald-500/5' :
            sufficiency === 'borderline'   ? 'border-amber-500/30 bg-amber-500/8' :
            sufficiency === 'insufficient' ? 'border-red-500/30 bg-red-500/5' :
                                             'border-slate-700 bg-slate-800/30'
          )}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Show Embassy (First Year)</p>
              {sufficiency && (
                <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full',
                  sufficiency === 'strong'       ? 'bg-emerald-500/15 text-emerald-400' :
                  sufficiency === 'sufficient'   ? 'bg-emerald-500/15 text-emerald-400' :
                  sufficiency === 'borderline'   ? 'bg-amber-500/15 text-amber-400' :
                                                   'bg-red-500/15 text-red-400'
                )}>
                  {sufficiency === 'strong' ? '✓ Strong' :
                   sufficiency === 'sufficient' ? '✓ Sufficient' :
                   sufficiency === 'borderline' ? '⚠ Borderline' : '✗ Insufficient'}
                </span>
              )}
            </div>
            <p className="text-4xl font-bold text-white mb-1">
              ${result.visa_requirement.must_show_usd.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">{result.visa_requirement.note}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Info size={11} />
              Recommended buffer: <span className="text-white font-semibold">
                ${result.visa_requirement.comfortable_buffer.toLocaleString()}
              </span> (20% above minimum)
            </div>
          </div>

          {/* Breakdown */}
          <div className="rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/40 border-b border-slate-800">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Annual Breakdown</p>
            </div>
            <div className="p-4 space-y-2">
              {[
                { label: 'Tuition', val: result.breakdown_annual.tuition, color: 'blue' },
                { label: 'Rent',   val: result.breakdown_annual.rent,    color: 'slate' },
                { label: 'Food',   val: result.breakdown_annual.food,    color: 'slate' },
                { label: 'Transport', val: result.breakdown_annual.transport, color: 'slate' },
                { label: 'Health Insurance', val: result.breakdown_annual.health_insurance, color: 'slate' },
                { label: 'Miscellaneous', val: result.breakdown_annual.miscellaneous, color: 'slate' },
              ].map(item => {
                const pct = result.breakdown_annual.total_annual
                  ? Math.round((item.val / result.breakdown_annual.total_annual) * 100) : 0
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <p className="text-xs text-slate-400 w-36 flex-shrink-0">{item.label}</p>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full',
                        item.color === 'blue' ? 'bg-blue-500' : 'bg-slate-600'
                      )} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs font-mono text-white w-20 text-right">
                      ${item.val.toLocaleString()}
                    </p>
                  </div>
                )
              })}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                <p className="text-xs font-bold text-white w-36">Total Annual</p>
                <div className="flex-1" />
                <p className="text-sm font-bold text-white">${result.breakdown_annual.total_annual.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Full program cost */}
          {form.duration_years > 1 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: `Tuition (${form.duration_years}yr)`, val: result.program_totals.total_tuition },
                { label: `Living (${form.duration_years}yr)`,  val: result.program_totals.total_living  },
                { label: 'Total Program Cost', val: result.program_totals.total_program_cost, highlight: true },
              ].map(item => (
                <div key={item.label} className={clsx('p-3 rounded-xl border text-center',
                  item.highlight ? 'border-blue-500/30 bg-blue-500/8' : 'border-slate-700 bg-slate-800/30'
                )}>
                  <p className={clsx('text-lg font-bold', item.highlight ? 'text-blue-400' : 'text-white')}>
                    ${item.val.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Country comparison */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Minimum Proof Required — All Countries
            </p>
            <div className="space-y-1.5">
              {Object.entries(result.savings_needed_by_country)
                .sort(([,a], [,b]) => a - b)
                .map(([country, amount]) => (
                  <div key={country} className={clsx('flex items-center gap-3 p-2.5 rounded-xl',
                    country === form.country ? 'bg-blue-500/8 border border-blue-500/20' : 'bg-slate-800/30'
                  )}>
                    <span className="text-base">{COUNTRY_FLAGS[country]}</span>
                    <span className="text-xs text-slate-400 capitalize w-20">{country}</span>
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/50 rounded-full"
                        style={{ width: `${Math.round((amount / 25000) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-mono text-white">${amount.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Scholarship Finder ────────────────────────────────────────
function ScholarshipFinder({ profile }) {
  const [filters, setFilters] = useState({
    country: '',
    level: '',
    full_only: false,
  })
  const up = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  const { data: result, isLoading, refetch } = useQuery(
    ['scholarships', filters],
    () => studentAPI.findScholarships({
      ...(filters.country   ? { country: filters.country }   : {}),
      ...(filters.level     ? { level: filters.level }       : {}),
      ...(filters.full_only ? { full_only: true }            : {}),
    }).then(r => r.data),
    { staleTime: 5 * 60_000 }
  )

  const scholarships = result?.scholarships || []

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-white">Scholarship Finder</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {result?.profile_used ? 'Matched against your student profile — ranked by eligibility' : 'Curated scholarships for the top 5 destinations'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Country */}
        <div className="flex flex-wrap gap-1.5">
          {['', 'canada', 'uk', 'australia', 'usa', 'germany'].map(c => (
            <button key={c} onClick={() => up('country', c)}
              className={clsx('px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                filters.country === c
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600'
              )}>
              {c ? `${COUNTRY_FLAGS[c]} ${c.charAt(0).toUpperCase() + c.slice(1)}` : 'All countries'}
            </button>
          ))}
        </div>

        {/* Level */}
        <select value={filters.level} onChange={e => up('level', e.target.value)}
          className="input text-xs py-1.5 px-3">
          <option value="">All levels</option>
          {['bachelors','masters','phd','any'].map(l => (
            <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
          ))}
        </select>

        {/* Full scholarship toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div className={clsx('w-8 h-4.5 rounded-full transition-colors relative',
            filters.full_only ? 'bg-amber-500' : 'bg-slate-700'
          )} onClick={() => up('full_only', !filters.full_only)}>
            <div className={clsx('absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform',
              filters.full_only ? 'translate-x-4' : 'translate-x-0.5'
            )} />
          </div>
          <span className="text-xs text-slate-400">Full scholarships only</span>
        </label>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-slate-800/40">
          <Loader2 size={14} className="animate-spin text-amber-400" />
          <p className="text-sm text-slate-400">Finding scholarships...</p>
        </div>
      )}

      {result && !isLoading && (
        <>
          <p className="text-xs text-slate-500">
            {result.total} scholarship{result.total !== 1 ? 's' : ''} found
            {result.profile_used ? ' · ranked by your eligibility' : ''}
          </p>

          <div className="space-y-3">
            {scholarships.map((s, i) => (
              <ScholarshipCard key={i} scholarship={s} />
            ))}
          </div>

          {scholarships.length === 0 && (
            <div className="text-center py-8">
              <GraduationCap size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-slate-400 text-sm">No scholarships match your filters</p>
              <button onClick={() => setFilters({ country: '', level: '', full_only: false })}
                className="text-xs text-blue-400 mt-1">Clear filters</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ScholarshipCard({ scholarship: s }) {
  const [expanded, setExpanded] = useState(false)
  const matchColor = s.match_score >= 70 ? 'emerald' : s.match_score >= 45 ? 'amber' : 'slate'

  return (
    <motion.div layout className={clsx('rounded-2xl border overflow-hidden',
      s.eligible ? 'border-slate-700' : 'border-slate-800 opacity-60'
    )}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-800/20 transition-colors"
      >
        <span className="text-xl flex-shrink-0 mt-0.5">{COUNTRY_FLAGS[s.country] || '🌍'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-white text-sm leading-tight">{s.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.provider}</p>
            </div>
            <div className="text-right flex-shrink-0">
              {s.is_full ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                  Full Scholarship
                </span>
              ) : s.amount_usd ? (
                <p className="text-sm font-bold text-emerald-400">${s.amount_usd.toLocaleString()}/yr</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 font-semibold capitalize">
              {LEVEL_LABELS[s.level] || s.level}
            </span>
            {s.deadline_note && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <BookOpen size={9} />{s.deadline_note}
              </span>
            )}
            {s.match_score !== undefined && (
              <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto',
                `bg-${matchColor}-500/15 text-${matchColor}-400`
              )}>{s.match_score}% match</span>
            )}
          </div>
        </div>
        <ChevronDown size={14} className={clsx('text-slate-500 flex-shrink-0 mt-1 transition-transform', expanded && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-800"
          >
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Eligibility</p>
                <p className="text-xs text-slate-400 leading-relaxed">{s.eligibility}</p>
              </div>
              {s.min_gpa && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Minimum GPA:</span>
                  <span className="text-white font-semibold">{s.min_gpa} / 4.0</span>
                </div>
              )}
              {s.min_ielts && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Minimum IELTS:</span>
                  <span className="text-white font-semibold">{s.min_ielts}</span>
                </div>
              )}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer"
                  className="btn-secondary text-xs gap-1.5 inline-flex">
                  <ExternalLink size={11} /> Apply / Learn More
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function StudentFinancial() {
  const [activeTab, setActiveTab] = useState('calculator')

  const { data: profile } = useQuery(
    'student-profile',
    () => studentAPI.getProfile().then(r => r.data),
    { staleTime: 5 * 60 * 1000 }
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <DollarSign size={22} className="text-emerald-400" /> Financial Tools
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Calculate exactly how much to show the embassy, and find scholarships matched to your profile
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-2xl">
        {[
          { id: 'calculator', label: '🧮 Proof of Funds Calculator', color: 'blue'    },
          { id: 'scholarships', label: '🎓 Scholarship Finder',      color: 'amber'   },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx('flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all',
              activeTab === tab.id ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 'calculator'   && <FundsCalculator profile={profile} />}
            {activeTab === 'scholarships' && <ScholarshipFinder profile={profile} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

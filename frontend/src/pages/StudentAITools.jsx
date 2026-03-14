import React from 'react'
// src/pages/StudentAITools.jsx
// All AI-powered student visa tools: Eligibility, SOP, Financial Letters, Visa Risk

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, FileText, DollarSign, AlertTriangle, Loader2,
  CheckCircle2, XCircle, ChevronDown, Copy, Check, Download,
  Sparkles, ArrowRight, Clock, BarChart3, RefreshCw, Info,
  Globe, BookOpen, Trash2
} from 'lucide-react'
import { studentAPI } from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const TABS = [
  { id: 'eligibility', label: 'Eligibility',       icon: ShieldCheck, color: 'emerald' },
  { id: 'sop',         label: 'SOP Generator',     icon: FileText,    color: 'blue'    },
  { id: 'financial',   label: 'Financial Letter',  icon: DollarSign,  color: 'amber'   },
  { id: 'risk',        label: 'Visa Risk',         icon: AlertTriangle, color: 'red'   },
]

const COUNTRY_FLAGS = {
  canada: '🍁', uk: '🇬🇧', australia: '🇦🇺', usa: '🇺🇸', germany: '🇩🇪'
}
const RISK_COLORS = {
  low: 'emerald', medium: 'amber', high: 'red', very_high: 'red'
}
const SEVERITY_COLORS = {
  critical: 'red', high: 'amber', medium: 'blue', low: 'slate'
}

// ── Shared utilities ───────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="btn-secondary gap-1.5 text-xs">
      {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
    </button>
  )
}

function WordCountBadge({ count, target }) {
  const pct = Math.round((count / target) * 100)
  return (
    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold',
      pct >= 85 && pct <= 115 ? 'bg-emerald-500/15 text-emerald-400' :
      pct >= 70               ? 'bg-amber-500/15 text-amber-400' :
                                'bg-red-500/15 text-red-400'
    )}>{count} words</span>
  )
}

// ── Eligibility Tab ────────────────────────────────────────────
function EligibilityTab({ profile }) {
  const qc = useQueryClient()

  const check = useMutation(
    () => studentAPI.checkEligibility().then(r => r.data),
    {
      onSuccess: (data) => {
        qc.setQueryData('student-profile', old => old ? { ...old, eligibility_result: data } : old)
        toast.success('Eligibility check complete!')
      },
      onError: () => toast.error('Check failed — ensure your profile is complete')
    }
  )

  const result = profile?.eligibility_result

  if (!profile) {
    return (
      <div className="text-center py-12">
        <ShieldCheck size={40} className="mx-auto text-slate-600 mb-3" />
        <p className="text-slate-400">Complete your student profile first</p>
        <p className="text-slate-500 text-sm mt-1">Go to Student → Edit Profile</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Eligibility Assessment</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {result ? `Last checked: ${new Date(profile.eligibility_generated_at || Date.now()).toLocaleDateString()}` : 'Not yet checked'}
          </p>
        </div>
        <button onClick={() => check.mutate()} disabled={check.isLoading} className="btn-primary gap-2">
          {check.isLoading
            ? <><Loader2 size={13} className="animate-spin" /> Analyzing...</>
            : <><Sparkles size={13} /> {result ? 'Recheck' : 'Run Check'}</>}
        </button>
      </div>

      {check.isLoading && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-blue-500/25 bg-blue-500/5">
          <Loader2 size={18} className="animate-spin text-blue-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">AI is assessing your eligibility...</p>
            <p className="text-xs text-slate-400">Checking 5 countries against your profile — takes ~15 seconds</p>
          </div>
        </div>
      )}

      {result && !check.isLoading && (
        <>
          {/* Profile strength gauge */}
          <div className="flex items-center gap-4 p-4 rounded-2xl border border-slate-700 bg-slate-800/30">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#1e293b" strokeWidth="6"/>
                <circle cx="28" cy="28" r="24" fill="none" stroke="#3B82F6" strokeWidth="6"
                  strokeDasharray={`${(result.overall_profile_strength || 0) * 1.508} 150.8`}
                  strokeLinecap="round"/>
              </svg>
              <p className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">
                {result.overall_profile_strength}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Overall Profile Strength</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{result.profile_summary}</p>
              {result.top_recommendation && (
                <p className="text-xs text-emerald-400 mt-1.5 font-semibold">
                  ⭐ Top pick: {COUNTRY_FLAGS[result.top_recommendation]} {result.top_recommendation.charAt(0).toUpperCase() + result.top_recommendation.slice(1)}
                </p>
              )}
            </div>
          </div>

          {/* Country cards */}
          <div className="space-y-3">
            {(result.countries || []).map(c => (
              <CountryEligibilityCard key={c.country} country={c} isTop={c.country === result.top_recommendation} />
            ))}
          </div>

          {/* Critical gaps */}
          {result.critical_gaps?.length > 0 && (
            <div className="p-4 rounded-2xl border border-amber-500/25 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-sm font-bold text-amber-300">Fix these before applying anywhere</p>
              </div>
              {result.critical_gaps.map((g, i) => (
                <p key={i} className="text-xs text-slate-400 ml-5 mb-1">• {g}</p>
              ))}
            </div>
          )}

          {/* Express Entry connection */}
          {result.express_entry_connection && (
            <div className="p-4 rounded-2xl border border-maple-500/25 bg-maple-500/5">
              <p className="text-xs font-bold text-maple-400 mb-1">🍁 Express Entry PR Pathway</p>
              <p className="text-xs text-slate-400 leading-relaxed">{result.express_entry_connection}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CountryEligibilityCard({ country: c, isTop }) {
  const [expanded, setExpanded] = useState(isTop)
  const riskColor = RISK_COLORS[c.risk_level] || 'slate'

  return (
    <div className={clsx('rounded-2xl border overflow-hidden',
      isTop ? 'border-emerald-500/30' : 'border-slate-700'
    )}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/30 transition-colors text-left"
      >
        <span className="text-2xl flex-shrink-0">{COUNTRY_FLAGS[c.country] || '🌍'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white text-sm">{c.visa_type}</p>
            {isTop && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">TOP PICK</span>}
          </div>
          <p className="text-xs text-slate-500">{c.processing_time_weeks} weeks · {c.pr_pathway?.slice(0, 50)}</p>
        </div>
        <div className="text-right flex-shrink-0 mr-2">
          <p className="text-2xl font-bold text-white">{c.eligibility_score}</p>
          <p className={clsx('text-[10px] font-bold', `text-${riskColor}-400`)}>
            {c.risk_level?.replace('_', ' ').toUpperCase()}
          </p>
        </div>
        <ChevronDown size={14} className={clsx('text-slate-500 transition-transform flex-shrink-0', expanded && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-800"
          >
            <div className="p-4 space-y-4">
              {/* Requirements */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Requirements Check</p>
                <div className="space-y-1.5">
                  {c.requirements_met?.map((req, i) => (
                    <div key={i} className={clsx('flex items-start gap-2.5 p-2 rounded-lg text-xs',
                      req.status === 'met'     ? 'bg-emerald-500/5 border border-emerald-500/15' :
                      req.status === 'partial' ? 'bg-amber-500/5 border border-amber-500/15' :
                                                 'bg-red-500/5 border border-red-500/20'
                    )}>
                      {req.status === 'met'
                        ? <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                        : req.status === 'partial'
                          ? <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                          : <XCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />}
                      <div>
                        <span className="font-semibold text-white">{req.requirement}: </span>
                        <span className="text-slate-400">{req.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial */}
              {c.financial_assessment && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Financial Capacity</p>
                  <div className={clsx('p-3 rounded-xl border text-xs',
                    c.financial_assessment.status === 'sufficient'   ? 'border-emerald-500/20 bg-emerald-500/5' :
                    c.financial_assessment.status === 'borderline'   ? 'border-amber-500/20 bg-amber-500/5' :
                                                                        'border-red-500/20 bg-red-500/5'
                  )}>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Required per year</span>
                      <span className="font-semibold text-white">${c.financial_assessment.required_usd_per_year?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">You have</span>
                      <span className="font-semibold text-white">${c.financial_assessment.applicant_has_usd?.toLocaleString()}</span>
                    </div>
                    {c.financial_assessment.gap_usd > 0 && (
                      <div className="flex justify-between text-red-400 border-t border-red-500/20 pt-1 mt-1">
                        <span>Gap</span>
                        <span className="font-bold">-${c.financial_assessment.gap_usd?.toLocaleString()}</span>
                      </div>
                    )}
                    <p className="text-slate-400 mt-2">{c.financial_assessment.notes}</p>
                  </div>
                </div>
              )}

              {/* Strengths + Risk factors + Action items */}
              <div className="grid grid-cols-2 gap-3">
                {c.strengths?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-emerald-400 mb-1.5">Strengths</p>
                    {c.strengths.slice(0, 3).map((s, i) => (
                      <p key={i} className="text-xs text-slate-400 mb-1">✓ {s}</p>
                    ))}
                  </div>
                )}
                {c.risk_factors?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-amber-400 mb-1.5">Risk factors</p>
                    {c.risk_factors.slice(0, 3).map((r, i) => (
                      <p key={i} className="text-xs text-slate-400 mb-1">⚠ {r}</p>
                    ))}
                  </div>
                )}
              </div>

              {c.action_items?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-blue-400 mb-1.5">Action items</p>
                  {c.action_items.map((a, i) => (
                    <p key={i} className="text-xs text-slate-400 mb-1 flex items-start gap-1.5">
                      <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span> {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── SOP Tab ────────────────────────────────────────────────────
function SOPTab({ profile }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    country: '', university: '', program: '', word_count: 800, custom_notes: ''
  })
  const [result, setResult] = useState(null)

  const COUNTRIES = ['canada','uk','australia','usa','germany']

  const generate = useMutation(
    () => studentAPI.generateSOP(form).then(r => r.data),
    {
      onSuccess: (data) => { setResult(data); qc.invalidateQueries('student-documents') },
      onError: () => toast.error('SOP generation failed — try again')
    }
  )

  const wordTarget = form.word_count || 800

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-white">Statement of Purpose Generator</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          AI writes a tailored SOP using your profile data, adapted to each country's visa officer expectations
        </p>
      </div>

      {!profile && (
        <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-amber-300">
          Complete your student profile first — the SOP uses your academic and personal background.
        </div>
      )}

      {/* Form */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Country</p>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, country: c }))}
                className={clsx('px-3 py-1.5 rounded-xl border text-sm transition-all',
                  form.country === c ? 'border-blue-500 bg-blue-500/10 text-white' :
                                       'border-slate-700 text-slate-400 hover:border-slate-600'
                )}>
                {COUNTRY_FLAGS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">University</p>
            <input className="input w-full text-sm"
              placeholder="e.g. University of Toronto"
              value={form.university}
              onChange={e => setForm(f => ({ ...f, university: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Program</p>
            <input className="input w-full text-sm"
              placeholder="e.g. MSc Data Science"
              value={form.program}
              onChange={e => setForm(f => ({ ...f, program: e.target.value }))} />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Target Length — {form.word_count} words
          </p>
          <div className="flex gap-2">
            {[600, 800, 1000, 1200].map(w => (
              <button key={w} onClick={() => setForm(f => ({ ...f, word_count: w }))}
                className={clsx('px-3 py-1.5 rounded-xl border text-sm transition-all',
                  form.word_count === w ? 'border-blue-500 bg-blue-500/10 text-white font-semibold' :
                                          'border-slate-700 text-slate-400'
                )}>{w}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            Additional Notes <span className="text-slate-600 font-normal">(optional)</span>
          </p>
          <textarea rows={2} className="input w-full resize-none text-sm"
            placeholder="e.g. mention my internship at TATA, explain the gap year, focus on research interest in NLP..."
            value={form.custom_notes}
            onChange={e => setForm(f => ({ ...f, custom_notes: e.target.value }))} />
        </div>

        <button
          onClick={() => generate.mutate()}
          disabled={generate.isLoading || !form.country || !form.university || !form.program || !profile}
          className="btn-primary w-full gap-2 justify-center"
        >
          {generate.isLoading
            ? <><Loader2 size={14} className="animate-spin" /> Generating SOP (~20 seconds)...</>
            : <><Sparkles size={14} /> Generate Statement of Purpose</>}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-sm font-semibold text-white">SOP Generated</p>
              <WordCountBadge count={result.word_count} target={wordTarget} />
            </div>
            <CopyButton text={result.sop_text} />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Key themes',       items: result.key_themes },
              { label: 'Profile strengths', items: result.strengths_highlighted },
              { label: 'Country-specific',  items: result.country_specific_elements },
            ].map(({ label, items }) => (
              <div key={label} className="p-3 rounded-xl bg-slate-800/40 border border-slate-700">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
                {(items || []).slice(0, 3).map((item, i) => (
                  <p key={i} className="text-xs text-slate-400 mb-1 leading-relaxed">• {item}</p>
                ))}
              </div>
            ))}
          </div>

          {result.visa_officer_notes && (
            <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
              <Info size={12} className="inline mr-1.5 text-blue-400" />
              <span className="text-white font-semibold">Visa officer focus: </span>
              {result.visa_officer_notes}
            </div>
          )}

          {/* Full SOP text */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-800/30">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Statement of Purpose</p>
              <CopyButton text={result.sop_text} />
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{result.sop_text}</p>
            </div>
          </div>

          {result.improvement_suggestions?.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <p className="text-xs font-bold text-amber-400 mb-1.5">Improve this SOP further</p>
              {result.improvement_suggestions.map((s, i) => (
                <p key={i} className="text-xs text-slate-400 mb-1">• {s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Financial Letter Tab ───────────────────────────────────────
function FinancialLetterTab({ profile }) {
  const [form, setForm] = useState({ country: '', letter_type: 'sponsorship' })
  const [result, setResult] = useState(null)
  const COUNTRIES = ['canada','uk','australia','usa','germany']
  const LETTER_TYPES = [
    { id: 'sponsorship',         label: 'Sponsorship Letter',        desc: 'From parent/relative to embassy' },
    { id: 'personal_statement',  label: 'Personal Financial Statement', desc: "Applicant's own funds declaration" },
    { id: 'bank_explanation',    label: 'Bank Source Explanation',   desc: 'Explains origin of bank funds'   },
  ]

  const generate = useMutation(
    () => studentAPI.generateFinancialLetter(form).then(r => r.data),
    {
      onSuccess: setResult,
      onError: () => toast.error('Generation failed — try again')
    }
  )

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-white">Financial Letter Generator</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Generates formal letters with the exact amounts each country's embassy requires
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Country</p>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, country: c }))}
                className={clsx('px-3 py-1.5 rounded-xl border text-sm transition-all',
                  form.country === c ? 'border-amber-500 bg-amber-500/10 text-white' :
                                       'border-slate-700 text-slate-400 hover:border-slate-600'
                )}>
                {COUNTRY_FLAGS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Letter Type</p>
          <div className="space-y-2">
            {LETTER_TYPES.map(lt => (
              <button key={lt.id} onClick={() => setForm(f => ({ ...f, letter_type: lt.id }))}
                className={clsx('w-full text-left px-4 py-3 rounded-xl border transition-all',
                  form.letter_type === lt.id
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700 hover:border-slate-600'
                )}>
                <p className={clsx('text-sm font-semibold', form.letter_type === lt.id ? 'text-white' : 'text-slate-400')}>{lt.label}</p>
                <p className="text-xs text-slate-500">{lt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => generate.mutate()}
          disabled={generate.isLoading || !form.country || !profile}
          className="btn-primary w-full gap-2 justify-center"
        >
          {generate.isLoading
            ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
            : <><Sparkles size={14} /> Generate Letter</>}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-sm font-semibold text-white">Letter Generated</p>
            </div>
            <CopyButton text={result.letter_text} />
          </div>
          {result.usage_notes && (
            <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
              <Info size={12} className="inline mr-1.5 text-blue-400" />
              {result.usage_notes}
            </div>
          )}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-800/30">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{result.letter_type}</p>
              <span className="text-xs text-amber-400 font-semibold">{result.amount_referenced}</span>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{result.letter_text}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Visa Risk Tab ──────────────────────────────────────────────
function VisaRiskTab({ profile }) {
  const [country, setCountry] = useState('')
  const [result, setResult] = useState(null)
  const COUNTRIES = ['canada','uk','australia','usa','germany']

  const analyze = useMutation(
    () => studentAPI.analyzeVisaRisk(country).then(r => r.data),
    {
      onSuccess: setResult,
      onError: () => toast.error('Analysis failed — try again')
    }
  )

  const riskColor = RISK_COLORS[result?.overall_risk] || 'slate'

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-white">Visa Risk Analyzer</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Identifies your specific refusal risk factors and mitigation strategies per country
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Analyze for which country?</p>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setCountry(c)}
                className={clsx('px-3 py-1.5 rounded-xl border text-sm transition-all',
                  country === c ? 'border-red-500 bg-red-500/10 text-white' :
                                   'border-slate-700 text-slate-400 hover:border-slate-600'
                )}>
                {COUNTRY_FLAGS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => analyze.mutate()}
          disabled={analyze.isLoading || !country || !profile}
          className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors w-full gap-2 flex items-center justify-center"
        >
          {analyze.isLoading
            ? <><Loader2 size={14} className="animate-spin" /> Analyzing risk factors...</>
            : <><AlertTriangle size={14} /> Run Risk Analysis</>}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Overall risk */}
          <div className={clsx('flex items-center gap-4 p-4 rounded-2xl border',
            `border-${riskColor}-500/30 bg-${riskColor}-500/5`
          )}>
            <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0',
              `bg-${riskColor}-500/15`
            )}>
              <p className={clsx('text-2xl font-bold', `text-${riskColor}-400`)}>{result.risk_score}</p>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold text-white">{result.overall_risk?.replace('_', ' ').toUpperCase()} RISK</p>
                <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full',
                  `bg-${riskColor}-500/15 text-${riskColor}-400`
                )}>{result.approval_probability}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{result.honest_assessment}</p>
            </div>
          </div>

          {/* Priority actions */}
          {result.priority_actions?.length > 0 && (
            <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
              <p className="text-xs font-bold text-blue-400 mb-2">Top 3 Priority Actions</p>
              {result.priority_actions.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 mb-2 text-xs text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400 flex-shrink-0 mt-0.5">{i+1}</span>
                  {a}
                </div>
              ))}
            </div>
          )}

          {/* Risk factors */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Risk Factors</p>
            <div className="space-y-2">
              {result.risk_factors?.map((rf, i) => {
                const sc = SEVERITY_COLORS[rf.severity] || 'slate'
                return (
                  <div key={i} className={clsx('p-3 rounded-xl border',
                    `border-${sc}-500/20 bg-${sc}-500/5`
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        `bg-${sc}-500/15 text-${sc}-400`
                      )}>{rf.severity?.toUpperCase()}</span>
                      <p className="text-xs font-semibold text-white">{rf.category}: {rf.issue}</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-1.5">Impact: {rf.impact}</p>
                    <p className="text-xs text-emerald-400">✓ Fix: {rf.mitigation}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Red flags */}
          {result.red_flags_for_officer?.length > 0 && (
            <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
              <p className="text-xs font-bold text-red-400 mb-1.5">What the officer will flag immediately</p>
              {result.red_flags_for_officer.map((f, i) => (
                <p key={i} className="text-xs text-slate-400 mb-1">⚑ {f}</p>
              ))}
            </div>
          )}

          {/* Strengths */}
          {result.strengths?.length > 0 && (
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-xs font-bold text-emerald-400 mb-1.5">Factors working in your favour</p>
              {result.strengths.map((s, i) => (
                <p key={i} className="text-xs text-slate-400 mb-1">✓ {s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function StudentAITools() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tool') || 'eligibility'
  const navigate = useNavigate()

  const { data: profile } = useQuery(
    'student-profile',
    () => studentAPI.getProfile().then(r => r.data),
    { staleTime: 5 * 60 * 1000 }
  )

  const setTab = (id) => setSearchParams({ tool: id })

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Sparkles size={22} className="text-blue-400" /> Student Visa Tools
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          AI-powered eligibility assessment, SOP generation, financial letters, and visa risk analysis
        </p>
      </div>

      {!profile && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-500/25 bg-amber-500/5">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Student profile not found</p>
            <p className="text-xs text-slate-400 mt-0.5">Complete your profile to unlock all tools</p>
            <button onClick={() => navigate('/student/profile')} className="btn-primary mt-2 text-xs gap-1.5">
              Set up profile <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-2xl flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setTab(tab.id)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-1',
                activeTab === tab.id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              )}>
              <Icon size={14} className={activeTab === tab.id ? `text-${tab.color}-400` : ''} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="card">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 'eligibility' && <EligibilityTab profile={profile} />}
            {activeTab === 'sop'         && <SOPTab         profile={profile} />}
            {activeTab === 'financial'   && <FinancialLetterTab profile={profile} />}
            {activeTab === 'risk'        && <VisaRiskTab    profile={profile} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

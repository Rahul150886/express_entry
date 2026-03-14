import React from 'react'
// src/pages/Tools.jsx
// 7 Tools: Score Simulator, PNP Matcher, Draw Predictor,
//          Peer Comparison, Study Plan, Letter Writer
// (AI Document Pre-Check handled inline in Documents page)

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from 'react-query'
import toast from 'react-hot-toast'
import {
  Sliders, MapPin, BarChart2, Users2, BookOpen,
  FileText, Loader2, ChevronRight, TrendingUp,
  TrendingDown, Minus, Copy, Check, AlertCircle,
  CheckCircle2, Clock, Zap, Target, Download
} from 'lucide-react'
import { toolsAPI } from '../services/api'
import { useAppStore } from '../store'
import { useProfile } from '../hooks'
import clsx from 'clsx'

// ─── Tool definitions ────────────────────────
const TOOLS = [
  { id: 'simulator',   icon: Sliders,    label: 'Score Simulator',       color: 'text-maple-400',   bg: 'bg-maple-500/10',   border: 'border-maple-500/30',   desc: 'See exactly how each improvement affects your CRS' },
  { id: 'pnp',         icon: MapPin,     label: 'PNP Matcher',           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', desc: 'Find Provincial Nominee streams you qualify for' },
  { id: 'predictor',   icon: BarChart2,  label: 'Draw Predictor',        color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    desc: 'Predict next draw dates and CRS cutoffs' },
  { id: 'peers',       icon: Users2,     label: 'Peer Comparison',       color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  desc: 'See how your profile compares to similar applicants' },
  { id: 'studyplan',   icon: BookOpen,   label: 'Study Plan',            color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   desc: 'Personalized AI roadmap to hit your target CRS' },
  { id: 'letters',     icon: FileText,   label: 'Letter Writer',         color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    desc: 'AI-drafted IRCC explanation letters, ready to submit' },
]

// ─── Reusable components ──────────────────────

function ToolCard({ tool, active, onClick }) {
  const Icon = tool.icon
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={clsx(
        'w-full text-left p-4 rounded-2xl border transition-all duration-200',
        active
          ? `${tool.bg} ${tool.border} border`
          : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
      )}
    >
      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-3', tool.bg)}>
        <Icon size={18} className={tool.color} />
      </div>
      <p className={clsx('font-semibold text-sm mb-1', active ? 'text-white' : 'text-slate-300')}>{tool.label}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{tool.desc}</p>
    </motion.button>
  )
}

function LoadingState({ message = 'AI is thinking...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-maple-400 animate-spin" />
      </div>
      <p className="text-slate-400 text-sm">{message}</p>
    </div>
  )
}

function DeltaBadge({ delta }) {
  if (delta > 0) return <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">+{delta} pts</span>
  if (delta < 0) return <span className="text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">{delta} pts</span>
  return <span className="text-xs text-slate-500">no change</span>
}

// ─── Reusable slider card ─────────────────────
function SliderCard({ label, value, original, min, max, step, format, onChange, note }) {
  const changed = original !== null && original !== undefined && value !== original
  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-start">
        <label className="text-sm font-medium text-white">{label}</label>
        <span className="text-maple-400 font-bold text-sm text-right">
          {format ? format(value) : value}
          {changed && (
            <span className="block text-emerald-400 text-xs font-normal">
              was {format ? format(original) : original}
            </span>
          )}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(step % 1 === 0 ? parseInt(e.target.value) : parseFloat(e.target.value))}
        className="w-full accent-maple-500"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>{format ? format(min) : min}</span>
        {note && <span className="text-slate-600 italic text-center px-2">{note}</span>}
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 1. SCORE SIMULATOR
// ═══════════════════════════════════════════════════════════════
function ScoreSimulator() {
  const crsScore = useAppStore(s => s.crsScore)
  const { data: profile, isLoading: profileLoading } = useProfile()

  const baseCRS = crsScore?.total || profile?.crs_score_json?.total || 0

  // Load real values from scenarios endpoint (which returns profile data too)
  const { data: scenarios, isLoading: scenariosLoading } = useQuery(
    'simulator-scenarios',
    () => toolsAPI.getScenarios().then(r => r.data),
    { enabled: !!baseCRS, staleTime: 5 * 60 * 1000 }
  )

  // Real profile IELTS band — comes back in scenarios.base_profile
  // We fetch it separately via the simulate endpoint with empty changes
  const { data: profileData } = useQuery(
    'simulator-profile-data',
    () => toolsAPI.simulateChanges({}).then(r => r.data),
    { enabled: !!baseCRS, staleTime: 5 * 60 * 1000 }
  )

  const currentIeltsBand = profileData?.base_profile?.ielts_band ?? null
  const currentCdnWork   = profileData?.base_profile?.canadian_work_years ?? 0
  const hasIelts         = currentIeltsBand !== null

  // Slider state — null means "not adjusted yet"
  const [sliders, setSliders] = useState({
    ielts_band: null, canadian_work_years: null, foreign_work_years: null,
    age: null, education_upgrade: null, spouse_language: null,
  })

  // Initialise sliders from profile once loaded
  const [initialised, setInitialised] = useState(false)
  useEffect(() => {
    if (profileData && !initialised) {
      const bp = profileData.base_profile || {}
      setSliders({
        ielts_band:           bp.ielts_band ?? null,
        canadian_work_years:  Math.round(bp.canadian_work_years ?? 0),
        foreign_work_years:   Math.round(bp.foreign_work_years ?? 0),
        age:                  bp.age ?? 30,
        education_upgrade:    null,
        spouse_language:      bp.spouse_clb ?? null,
      })
      setInitialised(true)
    }
  }, [profileData, initialised])

  const bp = profileData?.base_profile || {}

  const simulate = useMutation(
    (changes) => toolsAPI.simulateChanges(changes).then(r => r.data)
  )

  // Only send changes that differ from current profile
  const activeChanges = {}
  if (sliders.ielts_band !== null && sliders.ielts_band !== bp.ielts_band)
    activeChanges.ielts_band = sliders.ielts_band
  if (sliders.canadian_work_years !== null && sliders.canadian_work_years !== Math.round(bp.canadian_work_years ?? 0))
    activeChanges.canadian_work_years = sliders.canadian_work_years
  if (sliders.foreign_work_years !== null && sliders.foreign_work_years !== Math.round(bp.foreign_work_years ?? 0))
    activeChanges.foreign_work_years = sliders.foreign_work_years
  if (sliders.age !== null && sliders.age !== bp.age)
    activeChanges.age = sliders.age
  if (sliders.education_upgrade !== null)
    activeChanges.education_upgrade = sliders.education_upgrade
  if (sliders.spouse_language !== null && sliders.spouse_language !== bp.spouse_clb)
    activeChanges.spouse_language = sliders.spouse_language

  const hasChanges = Object.keys(activeChanges).length > 0

  useEffect(() => {
    if (hasChanges) simulate.mutate(activeChanges)
  }, [JSON.stringify(activeChanges)])

  const result    = hasChanges ? simulate.data : null
  const simDelta  = result?.total_gain ?? 0
  const projectedCRS = Math.min(baseCRS + simDelta, 1200)

  const EDU_OPTIONS = [
    { value: 'secondary',               label: 'Secondary / High School' },
    { value: 'one_year_post_secondary', label: '1-Year Post-Secondary' },
    { value: 'two_year_post_secondary', label: '2-Year Post-Secondary' },
    { value: 'bachelors',               label: "Bachelor's Degree" },
    { value: 'two_or_more_degrees',     label: '2+ Degrees (one 3-yr+)' },
    { value: 'masters',                 label: "Master's Degree" },
    { value: 'doctoral',                label: 'PhD / Doctoral' },
  ]

  const set = (key, val) => setSliders(s => ({ ...s, [key]: val }))

  if (profileLoading || scenariosLoading) return <LoadingState message="Loading your profile..." />

  if (!baseCRS) {
    return (
      <div className="text-center py-16 space-y-3">
        <Sliders size={40} className="mx-auto text-slate-600" />
        <p className="text-slate-300 font-medium">No CRS score found</p>
        <p className="text-slate-500 text-sm max-w-xs mx-auto">
          Complete your profile and click <strong className="text-white">Calculate CRS Score</strong> on the Dashboard — your score will appear here automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Score Simulator</h2>
        <p className="text-slate-400 text-sm">Adjust any factor to see its real-time CRS impact, grouped by category.</p>
      </div>

      {/* Current → Projected banner */}
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
        <div>
          <p className="text-xs text-slate-500">Current CRS</p>
          <p className="text-3xl font-bold text-white">{baseCRS}</p>
        </div>
        {hasChanges && (
          <>
            <ChevronRight size={20} className="text-slate-600" />
            <div>
              <p className="text-xs text-slate-500">Projected CRS</p>
              <p className={clsx('text-3xl font-bold', projectedCRS > baseCRS ? 'text-emerald-400' : projectedCRS < baseCRS ? 'text-red-400' : 'text-white')}>
                {simulate.isLoading ? '...' : projectedCRS}
              </p>
            </div>
            {simDelta !== 0 && (
              <span className={clsx('ml-auto font-bold text-lg', simDelta > 0 ? 'text-emerald-400' : 'text-red-400')}>
                {simDelta > 0 ? '+' : ''}{simDelta} pts
              </span>
            )}
          </>
        )}
        {hasChanges && (
          <button onClick={() => { setSliders({ ielts_band: bp.ielts_band ?? null, canadian_work_years: Math.round(bp.canadian_work_years ?? 0), foreign_work_years: Math.round(bp.foreign_work_years ?? 0), age: bp.age ?? 30, education_upgrade: null, spouse_language: bp.spouse_clb ?? null }); setInitialised(false) }}
            className="ml-auto text-xs text-slate-500 hover:text-white transition-colors">
            Reset
          </button>
        )}
      </div>

      {/* ── Language ─────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">🗣 Language</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bp.ielts_band !== undefined && bp.ielts_band !== null ? (
            <SliderCard
              label="IELTS Average Band"
              value={sliders.ielts_band ?? bp.ielts_band}
              original={bp.ielts_band}
              min={6} max={9} step={0.5}
              format={v => v.toFixed(1)}
              onChange={v => set('ielts_band', v)}
            />
          ) : (
            <div className="card border-dashed border-slate-600 space-y-1">
              <p className="text-sm font-medium text-slate-400">IELTS Average Band</p>
              <p className="text-xs text-amber-400">Add IELTS scores in Profile → Language first</p>
            </div>
          )}
          {bp.has_spouse && (
            <SliderCard
              label="Spouse Language CLB"
              value={sliders.spouse_language ?? bp.spouse_clb ?? 5}
              original={bp.spouse_clb ?? null}
              min={4} max={9} step={1}
              format={v => `CLB ${v}`}
              onChange={v => set('spouse_language', v)}
            />
          )}
        </div>
      </div>

      {/* ── Work Experience ───────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">💼 Work Experience</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SliderCard
            label="Canadian Work Experience"
            value={sliders.canadian_work_years ?? Math.round(bp.canadian_work_years ?? 0)}
            original={Math.round(bp.canadian_work_years ?? 0)}
            min={0} max={5} step={1}
            format={v => `${v} yr`}
            onChange={v => set('canadian_work_years', v)}
          />
          <SliderCard
            label="Foreign Work Experience"
            value={sliders.foreign_work_years ?? Math.round(bp.foreign_work_years ?? 0)}
            original={Math.round(bp.foreign_work_years ?? 0)}
            min={0} max={3} step={1}
            format={v => `${v} yr`}
            onChange={v => set('foreign_work_years', v)}
          />
        </div>
      </div>

      {/* ── Education ────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">🎓 Education</p>
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white">Education Level</label>
            <span className="text-xs text-slate-500">
              Current: <span className="text-slate-300">{EDU_OPTIONS.find(e => e.value === bp.education_level)?.label ?? bp.education_level ?? '—'}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {EDU_OPTIONS.map(opt => {
              const isActive   = sliders.education_upgrade === opt.value
              const isCurrent  = opt.value === bp.education_level
              return (
                <button key={opt.value}
                  onClick={() => set('education_upgrade', isActive ? null : opt.value)}
                  className={clsx('text-xs px-2 py-1.5 rounded-lg border transition-all text-left',
                    isActive   ? 'border-maple-500 bg-maple-500/15 text-maple-300' :
                    isCurrent  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' :
                                 'border-slate-700 text-slate-400 hover:border-slate-500'
                  )}>
                  {isCurrent && <span className="text-blue-400 mr-1">●</span>}
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-600">Blue = current. Click another to simulate upgrading.</p>
        </div>
      </div>

      {/* ── Other ────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">📊 Other (Planning)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SliderCard
            label="Age (planning reference)"
            value={sliders.age ?? bp.age ?? 30}
            original={bp.age ?? 30}
            min={20} max={44} step={1}
            format={v => `${v} yrs`}
            onChange={v => set('age', v)}
            note="Shows age points at different ages — for planning only"
          />
        </div>
      </div>
      {/* All scenarios */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">All Improvement Scenarios</h3>
        {scenariosLoading && <LoadingState message="Calculating scenarios..." />}
        {(scenarios?.changes || []).map((change, i) => (
          <motion.div
            key={change.change_key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-all"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{change.label}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{change.explanation}</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-3">
              <span className={clsx('text-xs px-2 py-0.5 rounded-full',
                change.effort === 'Low'    ? 'bg-emerald-500/15 text-emerald-400' :
                change.effort === 'Medium' ? 'bg-amber-500/15 text-amber-400' :
                                             'bg-red-500/15 text-red-400'
              )}>{change.effort} effort</span>
              <span className="text-xs text-slate-500">{change.timeframe}</span>
              <DeltaBadge delta={change.delta} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 2. PNP MATCHER
// ═══════════════════════════════════════════════════════════════
const PROVINCES = [
  'Any', 'Ontario', 'British Columbia', 'Alberta', 'Saskatchewan',
  'Manitoba', 'Nova Scotia', 'New Brunswick', 'Prince Edward Island',
  'Newfoundland', 'Rural/Northern'
]

const ELIGIBILITY_CONFIG = {
  likely_eligible:   { label: 'Likely Eligible',   color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  possibly_eligible: { label: 'Possibly Eligible', color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: Clock },
  missing_requirements: { label: 'Missing Reqs',   color: 'text-red-400',     bg: 'bg-red-500/10',     icon: AlertCircle },
}

function PNPMatcher() {
  const [province, setProvince] = useState('Any')
  const [searched, setSearched] = useState(false)

  const match = useMutation(
    (pref) => toolsAPI.matchPNP(pref).then(r => r.data),
    { onError: () => toast.error('PNP matching failed. Check your profile is complete.') }
  )

  const handleSearch = () => {
    setSearched(true)
    match.mutate(province)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">PNP Stream Matcher</h2>
        <p className="text-slate-400 text-sm">AI analyzes 45+ PNP streams across all provinces against your profile.</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select
          value={province}
          onChange={e => setProvince(e.target.value)}
          className="input flex-1 min-w-48"
        >
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={handleSearch} disabled={match.isLoading} className="btn-primary flex-shrink-0">
          {match.isLoading ? <Loader2 size={16} className="animate-spin" /> : <><Zap size={16} /> Find Matches</>}
        </button>
      </div>

      {match.isLoading && <LoadingState message="Analyzing 45+ PNP streams..." />}

      {match.data && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Summary */}
          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <p className="text-sm text-emerald-300 font-medium">{match.data.summary}</p>
            <p className="text-xs text-slate-400 mt-2">💡 {match.data.recommended_action}</p>
          </div>

          {/* Stream cards */}
          <div className="space-y-3">
            {(match.data.top_matches || []).map((stream, i) => {
              const cfg = ELIGIBILITY_CONFIG[stream.eligibility_status] || ELIGIBILITY_CONFIG.possibly_eligible
              const StatusIcon = cfg.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="card border border-slate-700/50"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge-blue text-xs">{stream.province_code}</span>
                        <h3 className="font-semibold text-white text-sm">{stream.stream_name}</h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{stream.province}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={clsx('flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                        <StatusIcon size={11} /> {cfg.label}
                      </span>
                      <span className="text-xs text-slate-500">Match: {stream.match_score}%</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mb-3">{stream.advantages}</p>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500 mb-1">Requirements Met</p>
                      {(stream.key_requirements_met || []).map((r, j) => (
                        <p key={j} className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={10} /> {r}</p>
                      ))}
                    </div>
                    {(stream.missing_requirements || []).length > 0 && (
                      <div>
                        <p className="text-slate-500 mb-1">Missing</p>
                        {stream.missing_requirements.map((r, j) => (
                          <p key={j} className="text-amber-400 flex items-center gap-1"><AlertCircle size={10} /> {r}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
                    <span>⏱ {stream.processing_time}</span>
                    <span>🎯 {stream.nomination_benefit}</span>
                    {stream.min_clb && <span>🗣 Min CLB {stream.min_clb}</span>}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {!searched && !match.isLoading && (
        <div className="text-center py-12 text-slate-500">
          <MapPin size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a province preference and click Find Matches</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 3. DRAW FREQUENCY PREDICTOR
// ═══════════════════════════════════════════════════════════════
function DrawPredictor() {
  const crsScore = useAppStore(s => s.crsScore)
  const { data: profile } = useProfile()
  const crs = crsScore?.total || profile?.crs_score_json?.total || 0

  const { data, isLoading } = useQuery(
    'draw-predictions-all',
    () => toolsAPI.predictDraws().then(r => r.data),
    { staleTime: 30 * 60 * 1000 }
  )

  const formatDate = (iso) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return iso }
  }

  if (isLoading) return <LoadingState message="Analyzing draw patterns..." />

  const predictions = data ? Object.entries(data) : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Draw Frequency Predictor</h2>
        <p className="text-slate-400 text-sm">Statistical analysis of historical IRCC draw patterns to predict upcoming draws.</p>
      </div>

      {predictions.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Not enough draw history yet. Draws are fetched every 30 minutes.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {predictions.map(([type, pred]) => {
          if (pred.error) return null
          const trendIcon = pred.crs_trend === 'rising' ? TrendingUp : pred.crs_trend === 'falling' ? TrendingDown : Minus
          const TrendIcon = trendIcon
          const trendColor = pred.crs_trend === 'rising' ? 'text-red-400' : pred.crs_trend === 'falling' ? 'text-emerald-400' : 'text-slate-400'
          const isEligible = crs && pred.predicted_crs_range && crs >= pred.predicted_crs_range.low

          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx('card border', isEligible ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/50')}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-white capitalize">{type === 'overall' ? '🌐 All Draws' : `🍁 ${type}`}</p>
                  <p className="text-xs text-slate-500">{pred.draws_analyzed} draws analyzed</p>
                </div>
                <div className="flex items-center gap-1">
                  <TrendIcon size={14} className={trendColor} />
                  <span className="text-xs text-slate-500 capitalize">{pred.crs_trend}</span>
                </div>
              </div>

              {/* Next draw prediction */}
              <div className="p-3 rounded-xl bg-slate-900/60 mb-3">
                <p className="text-xs text-slate-500 mb-1">Predicted Next Draw</p>
                <p className="text-lg font-bold text-white">{formatDate(pred.predicted_next_date)}</p>
                <p className="text-xs text-slate-500">
                  Window: {formatDate(pred.predicted_window?.earliest)} – {formatDate(pred.predicted_window?.latest)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-maple-500 rounded-full" style={{ width: `${pred.confidence_pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{pred.confidence_pct}% confidence</span>
                </div>
              </div>

              {/* CRS range */}
              {pred.predicted_crs_range && (
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <p className="text-slate-500">Low</p>
                    <p className={clsx('font-bold', crs >= pred.predicted_crs_range.low ? 'text-emerald-400' : 'text-white')}>
                      {pred.predicted_crs_range.low}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-700">
                    <p className="text-slate-400">Mid</p>
                    <p className={clsx('font-bold', crs >= pred.predicted_crs_range.mid ? 'text-emerald-400' : 'text-white')}>
                      {pred.predicted_crs_range.mid}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <p className="text-slate-500">High</p>
                    <p className={clsx('font-bold', crs >= pred.predicted_crs_range.high ? 'text-emerald-400' : 'text-white')}>
                      {pred.predicted_crs_range.high}
                    </p>
                  </div>
                </div>
              )}

              {crs && pred.predicted_crs_range && (
                <p className={clsx('text-xs text-center mt-2 font-medium',
                  crs >= pred.predicted_crs_range.low ? 'text-emerald-400' : 'text-slate-500'
                )}>
                  {crs >= pred.predicted_crs_range.low
                    ? `✓ Your score (${crs}) meets predicted low cutoff`
                    : `${pred.predicted_crs_range.low - crs} pts below predicted low cutoff`
                  }
                </p>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 4. PEER COMPARISON
// ═══════════════════════════════════════════════════════════════
function PeerComparison() {
  const { data, isLoading } = useQuery(
    'peer-comparison',
    () => toolsAPI.getPeerComparison().then(r => r.data),
    { staleTime: 10 * 60 * 1000 }
  )

  if (isLoading) return <LoadingState message="Analyzing peer data..." />

  const ai = data?.ai_benchmarks
  const local = data?.local_comparison

  if (!ai) return (
    <div className="text-center py-12 text-slate-500">
      <Users2 size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">Complete your profile to see peer comparison data.</p>
    </div>
  )

  const userCrs = data?.profile_snapshot?.crs_score || 0
  const percentile = ai.percentile_estimate || local?.user_percentile || 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Peer Comparison</h2>
        <p className="text-slate-400 text-sm">See how your CRS and profile stack up against similar applicants.</p>
      </div>

      {/* Percentile display */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-slate-800/50 border border-purple-500/20 text-center">
        <p className="text-slate-400 text-sm mb-2">Your Estimated Percentile</p>
        <div className="relative inline-flex items-center justify-center">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle cx="60" cy="60" r="50" fill="none" stroke="#a855f7" strokeWidth="10"
              strokeDasharray={`${(percentile / 100) * 314} 314`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute text-center">
            <p className="text-2xl font-bold text-white">{Math.round(percentile)}th</p>
            <p className="text-xs text-purple-400">percentile</p>
          </div>
        </div>
        <p className="text-slate-300 text-sm mt-2">{ai.percentile_label}</p>
        {local && (
          <p className="text-xs text-slate-500 mt-1">Based on {local.total_users} platform users</p>
        )}
      </div>

      {/* CRS comparison */}
      {ai.typical_crs_for_profile && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white text-sm">Typical CRS for Your Profile</h3>
          <p className="text-xs text-slate-500">{ai.typical_crs_for_profile.description}</p>
          <div className="space-y-2">
            {[
              { label: 'Low range', value: ai.typical_crs_for_profile.low },
              { label: 'Average',   value: ai.typical_crs_for_profile.average },
              { label: 'High range', value: ai.typical_crs_for_profile.high },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0">{item.label}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full', userCrs >= item.value ? 'bg-emerald-500' : 'bg-slate-600')}
                    style={{ width: `${Math.min(100, (item.value / (ai.typical_crs_for_profile.high * 1.1)) * 100)}%` }} />
                </div>
                <span className={clsx('text-xs font-bold w-10 text-right', userCrs >= item.value ? 'text-emerald-400' : 'text-slate-300')}>
                  {item.value}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <span className="text-xs text-maple-400 w-20 flex-shrink-0 font-semibold">You</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-maple-500"
                  style={{ width: `${Math.min(100, (userCrs / (ai.typical_crs_for_profile.high * 1.1)) * 100)}%` }} />
              </div>
              <span className="text-xs font-bold w-10 text-right text-maple-400">{userCrs}</span>
            </div>
          </div>
        </div>
      )}

      {/* Wait time */}
      {ai.typical_wait_time && (
        <div className="card">
          <h3 className="font-semibold text-white text-sm mb-3">Typical Wait Time for Similar Profiles</h3>
          <p className="text-xs text-slate-500 mb-3">{ai.typical_wait_time.description}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: '50% of applicants', value: ai.typical_wait_time.months_p50, color: 'text-emerald-400' },
              { label: '75% of applicants', value: ai.typical_wait_time.months_p75, color: 'text-amber-400' },
              { label: '90% of applicants', value: ai.typical_wait_time.months_p90, color: 'text-slate-300' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl bg-slate-800">
                <p className={clsx('text-xl font-bold', item.color)}>{item.value}mo</p>
                <p className="text-xs text-slate-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advantages / disadvantages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-emerald-400 mb-2">Your Advantages</h3>
          {(ai.your_advantages || []).map((a, i) => (
            <p key={i} className="text-xs text-slate-300 flex items-start gap-2 mb-1.5">
              <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /> {a}
            </p>
          ))}
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">Areas to Improve</h3>
          {(ai.your_disadvantages || []).map((d, i) => (
            <p key={i} className="text-xs text-slate-300 flex items-start gap-2 mb-1.5">
              <TrendingUp size={12} className="text-amber-400 mt-0.5 flex-shrink-0" /> {d}
            </p>
          ))}
        </div>
      </div>

      {ai.data_note && (
        <p className="text-xs text-slate-600 text-center">{ai.data_note}</p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 5. STUDY PLAN GENERATOR
// ═══════════════════════════════════════════════════════════════
const FEASIBILITY_CONFIG = {
  highly_feasible: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Highly Feasible' },
  feasible:        { color: 'text-blue-400',    bg: 'bg-blue-500/10',    label: 'Feasible' },
  challenging:     { color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: 'Challenging' },
  very_challenging:{ color: 'text-red-400',     bg: 'bg-red-500/10',     label: 'Very Challenging' },
}

function StudyPlanGenerator() {
  const crsScore = useAppStore(s => s.crsScore)
  const { data: profile } = useProfile()
  const baseCRS = crsScore?.total || profile?.crs_score_json?.total || 0
  const [targetCRS, setTargetCRS] = useState(() => baseCRS ? baseCRS + 50 : 500)
  const [timeline, setTimeline] = useState(6)

  // Update targetCRS once profile loads if not set yet
  useEffect(() => {
    if (baseCRS && targetCRS === 500) setTargetCRS(baseCRS + 50)
  }, [baseCRS])

  const generatePlan = useMutation(
    ({ target, months }) => toolsAPI.generateStudyPlan(target, months).then(r => r.data),
    { onError: () => toast.error('Failed to generate plan. Ensure your profile is complete.') }
  )

  const plan = generatePlan.data
  const feasibility = plan ? FEASIBILITY_CONFIG[plan.feasibility] || FEASIBILITY_CONFIG.feasible : null

  const CATEGORY_ICONS = {
    language: '🗣️', work: '💼', education: '🎓',
    pnp: '🏛️', job_offer: '📋', other: '✨'
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Personalized Study Plan</h2>
        <p className="text-slate-400 text-sm">AI-generated roadmap with monthly milestones to hit your target CRS.</p>
      </div>

      {/* Config */}
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="label">Current CRS</label>
          <div className="input bg-slate-700/50 text-slate-400 cursor-default">{baseCRS || 'Calculate first'}</div>
        </div>
        <div>
          <label className="label">Target CRS</label>
          <input type="number" className="input" value={targetCRS}
            onChange={e => setTargetCRS(parseInt(e.target.value))}
            min={crsScore + 1} max={1200} />
        </div>
        <div>
          <label className="label">Timeline</label>
          <select className="input" value={timeline} onChange={e => setTimeline(parseInt(e.target.value))}>
            {[3, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m} months</option>)}
          </select>
        </div>
        <button
          onClick={() => generatePlan.mutate({ target: targetCRS, months: timeline })}
          disabled={generatePlan.isLoading || !baseCRS}
          className="btn-primary sm:col-span-3"
        >
          {generatePlan.isLoading
            ? <><Loader2 size={16} className="animate-spin" /> Generating your plan...</>
            : <><Target size={16} /> Generate My Plan</>
          }
        </button>
      </div>

      {generatePlan.isLoading && <LoadingState message="Building your personalized roadmap..." />}

      {plan && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Header */}
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-slate-500">Gap to Close</p>
              <p className="text-2xl font-bold text-maple-400">+{plan.gap} pts</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Timeline</p>
              <p className="text-2xl font-bold text-white">{plan.timeline_months} months</p>
            </div>
            {feasibility && (
              <span className={clsx('px-3 py-1.5 rounded-full text-sm font-semibold', feasibility.bg, feasibility.color)}>
                {feasibility.label}
              </span>
            )}
            <p className="flex-1 text-sm text-slate-400">{plan.feasibility_reason}</p>
          </div>

          {/* Quick wins */}
          {plan.quick_wins?.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <h3 className="text-sm font-semibold text-amber-400 mb-2">⚡ Quick Wins — Do These Now</h3>
              <div className="space-y-1">
                {plan.quick_wins.map((win, i) => (
                  <p key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <CheckCircle2 size={11} className="text-amber-400 mt-0.5 flex-shrink-0" /> {win}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Priority actions */}
          <div className="space-y-3">
            <h3 className="font-semibold text-white text-sm">Priority Actions</h3>
            {(plan.priority_actions || []).map((action, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card border border-slate-700/50"
              >
                <div className="flex items-start gap-3 mb-2">
                  <span className="text-xl flex-shrink-0">{CATEGORY_ICONS[action.category] || '✨'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500">#{action.rank}</span>
                      <h4 className="font-semibold text-white text-sm">{action.action}</h4>
                      <DeltaBadge delta={action.crs_gain} />
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-slate-500">
                      <span>⏱ {action.timeframe}</span>
                      <span>💰 {action.cost_estimate}</span>
                      <span className={clsx(
                        action.effort === 'low' ? 'text-emerald-400' :
                        action.effort === 'medium' ? 'text-amber-400' : 'text-red-400'
                      )}>{action.effort} effort</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-amber-300 mb-2 italic">{action.why_this_first}</p>
                <div className="space-y-1">
                  {(action.specific_steps || []).map((step, j) => (
                    <p key={j} className="text-xs text-slate-400 flex items-start gap-2">
                      <span className="text-slate-600 flex-shrink-0">{j + 1}.</span> {step}
                    </p>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Monthly milestones */}
          {(plan.monthly_milestones || []).length > 0 && (
            <div>
              <h3 className="font-semibold text-white text-sm mb-3">Monthly Milestones</h3>
              <div className="space-y-2">
                {plan.monthly_milestones.map((month, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-maple-500/20 border border-maple-500/40 flex items-center justify-center text-xs font-bold text-maple-400 flex-shrink-0">
                        {month.month}
                      </div>
                      {i < plan.monthly_milestones.length - 1 && <div className="w-px flex-1 bg-slate-700 mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className="font-medium text-white text-sm">{month.focus}</p>
                      {month.expected_crs_gain > 0 && (
                        <span className="text-xs text-emerald-400">+{month.expected_crs_gain} pts expected</span>
                      )}
                      <div className="mt-1 space-y-0.5">
                        {(month.tasks || []).map((task, j) => (
                          <p key={j} className="text-xs text-slate-400">• {task}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motivational message */}
          {plan.motivational_message && (
            <div className="p-4 rounded-2xl bg-maple-500/5 border border-maple-500/20 text-center">
              <p className="text-sm text-maple-300 italic">"{plan.motivational_message}"</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 6. LETTER WRITER
// ═══════════════════════════════════════════════════════════════
function LetterWriter() {
  const [selectedType, setSelectedType] = useState(null)
  const [context, setContext] = useState({})
  const [copied, setCopied] = useState(false)

  const { data: letterTypes = [] } = useQuery(
    'letter-types',
    () => toolsAPI.getLetterTypes().then(r => r.data),
    { staleTime: Infinity }
  )

  const generateLetter = useMutation(
    ({ type, ctx }) => toolsAPI.generateLetter(type, ctx).then(r => r.data),
    { onError: () => toast.error('Letter generation failed. Ensure your profile is complete.') }
  )

  const CONTEXT_FIELDS = {
    employment_gap:   [
      { key: 'gap_start',       label: 'Gap Start Date',              placeholder: 'e.g. January 2022' },
      { key: 'gap_end',         label: 'Gap End Date',                placeholder: 'e.g. June 2022' },
      { key: 'reason',          label: 'Reason for Gap',              placeholder: 'e.g. Family medical emergency' },
      { key: 'activities',      label: 'Activities During Gap',       placeholder: 'e.g. Caring for sick parent, freelance consulting' },
      { key: 'supporting_docs', label: 'Supporting Documents Available', placeholder: 'e.g. Medical records, reference letters' },
    ],
    address_history:  [
      { key: 'countries',  label: 'Countries Lived In',   placeholder: 'e.g. India (2010-2018), UAE (2018-2022)' },
      { key: 'gaps',       label: 'Address History Gaps', placeholder: 'Any periods not covered' },
      { key: 'reason',     label: 'Reason for Travel',    placeholder: 'e.g. Work assignments, family visits' },
    ],
    name_change:      [
      { key: 'previous_name',   label: 'Previous Name',          placeholder: 'Full previous legal name' },
      { key: 'current_name',    label: 'Current Name',           placeholder: 'Current legal name' },
      { key: 'reason',          label: 'Reason for Change',      placeholder: 'e.g. Marriage, court order' },
      { key: 'old_name_docs',   label: 'Documents with Old Name', placeholder: 'e.g. Degree certificates, old passport' },
    ],
    criminal_record:  [
      { key: 'nature',          label: 'Nature of Incident',     placeholder: 'Brief description of the charge/arrest' },
      { key: 'date',            label: 'Date of Incident',       placeholder: 'Month and year' },
      { key: 'outcome',         label: 'Outcome / Resolution',   placeholder: 'e.g. Charges dropped, fine paid, pardon received' },
      { key: 'rehabilitation',  label: 'Rehabilitation Evidence', placeholder: 'e.g. Community service, counseling completed' },
    ],
    relationship_proof: [
      { key: 'relationship_type',       label: 'Relationship Type',        placeholder: 'Married / Common-law' },
      { key: 'duration',                label: 'Duration of Relationship',  placeholder: 'e.g. 3 years' },
      { key: 'how_met',                 label: 'How You Met',              placeholder: 'Brief story of how you met' },
      { key: 'cohabitation_evidence',   label: 'Cohabitation Evidence',    placeholder: 'e.g. Shared lease, utility bills' },
      { key: 'financial_evidence',      label: 'Joint Financial Evidence', placeholder: 'e.g. Joint bank account, shared insurance' },
    ],
    funds_source: [
      { key: 'amount',           label: 'Amount',              placeholder: 'e.g. CAD $25,000' },
      { key: 'source',           label: 'Source of Funds',     placeholder: 'e.g. Personal savings, sale of property' },
      { key: 'how_accumulated',  label: 'How Accumulated',     placeholder: 'e.g. 10 years of employment savings' },
      { key: 'supporting_docs',  label: 'Supporting Documents', placeholder: 'e.g. Bank statements, property sale deed' },
    ],
  }

  const fields = selectedType ? (CONTEXT_FIELDS[selectedType.key] || []) : []
  const letter = generateLetter.data

  const handleCopy = () => {
    if (letter?.letter_body) {
      navigator.clipboard.writeText(letter.letter_body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Letter copied to clipboard!')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">AI Letter Writer</h2>
        <p className="text-slate-400 text-sm">Generate IRCC-ready letters of explanation, submission-ready in seconds.</p>
      </div>

      {/* Letter type selection */}
      {!selectedType ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {letterTypes.map(type => (
            <button
              key={type.key}
              onClick={() => { setSelectedType(type); setContext({}) }}
              className="text-left p-4 rounded-2xl border border-slate-700 hover:border-maple-500/40 hover:bg-maple-500/5 transition-all"
            >
              <span className="text-2xl mb-2 block">{type.icon}</span>
              <p className="font-semibold text-white text-sm">{type.label}</p>
              <p className="text-xs text-slate-500 mt-1">{type.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{selectedType.icon}</span>
            <div>
              <h3 className="font-semibold text-white">{selectedType.label}</h3>
              <button onClick={() => { setSelectedType(null); generateLetter.reset() }}
                className="text-xs text-slate-500 hover:text-white transition-colors">← Choose different type</button>
            </div>
          </div>

          {/* Context form */}
          {!letter && (
            <div className="card space-y-4">
              {fields.map(field => (
                <div key={field.key}>
                  <label className="label">{field.label}</label>
                  <input
                    className="input"
                    placeholder={field.placeholder}
                    value={context[field.key] || ''}
                    onChange={e => setContext(c => ({ ...c, [field.key]: e.target.value }))}
                  />
                </div>
              ))}
              <button
                onClick={() => generateLetter.mutate({ type: selectedType.key, ctx: context })}
                disabled={generateLetter.isLoading}
                className="btn-primary w-full"
              >
                {generateLetter.isLoading
                  ? <><Loader2 size={16} className="animate-spin" /> Writing your letter...</>
                  : <><FileText size={16} /> Generate Letter</>
                }
              </button>
            </div>
          )}

          {generateLetter.isLoading && <LoadingState message="Drafting your IRCC letter..." />}

          {letter && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Letter preview */}
              <div className="card border border-slate-600">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700">
                  <h3 className="font-semibold text-white text-sm">{letter.letter_title}</h3>
                  <div className="flex gap-2">
                    <button onClick={handleCopy} className="btn-secondary text-xs px-3 flex items-center gap-1">
                      {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                    <button onClick={() => generateLetter.reset()} className="btn-ghost text-xs px-3">Regenerate</button>
                  </div>
                </div>
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
                  {letter.letter_body}
                </pre>
              </div>

              {/* Documents to attach */}
              {letter.documents_to_attach?.length > 0 && (
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <p className="text-xs font-semibold text-blue-400 mb-2">📎 Documents to Attach</p>
                  {letter.documents_to_attach.map((doc, i) => (
                    <p key={i} className="text-xs text-slate-300">• {doc}</p>
                  ))}
                </div>
              )}

              {/* IRCC tips */}
              {letter.ircc_tips?.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xs font-semibold text-amber-400 mb-2">💡 IRCC Submission Tips</p>
                  {letter.ircc_tips.map((tip, i) => (
                    <p key={i} className="text-xs text-slate-300">• {tip}</p>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {letter.warnings?.length > 0 && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <p className="text-xs font-semibold text-red-400 mb-2">⚠️ Important Warnings</p>
                  {letter.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-slate-300">• {w}</p>
                  ))}
                </div>
              )}

              <button onClick={() => { setSelectedType(null); generateLetter.reset() }} className="btn-secondary w-full text-sm">
                ← Write Another Letter
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN TOOLS PAGE
// ═══════════════════════════════════════════════════════════════

export default function Tools() {
  const [searchParams] = useSearchParams()
  const initialTool = searchParams.get('tool') || 'simulator'
  const [activeTool, setActiveTool] = useState(initialTool)

  const COMPONENTS = {
    simulator:  <ScoreSimulator />,
    pnp:        <PNPMatcher />,
    predictor:  <DrawPredictor />,
    peers:      <PeerComparison />,
    studyplan:  <StudyPlanGenerator />,
    letters:    <LetterWriter />,
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">AI Tools</h1>
        <p className="text-slate-400 text-sm mt-1">Intelligent tools to accelerate your Express Entry journey</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {TOOLS.map(tool => (
            <ToolCard
              key={tool.id}
              tool={tool}
              active={activeTool === tool.id}
              onClick={() => setActiveTool(tool.id)}
            />
          ))}
        </div>

        {/* Main content */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTool}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="card min-h-96"
            >
              {COMPONENTS[activeTool]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

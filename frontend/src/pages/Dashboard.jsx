import React from 'react'
// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  TrendingUp, FileText, ClipboardList, MessageSquare, ArrowUpRight,
  Clock, CheckCircle2, Zap, RefreshCw, Loader2, ShieldCheck,
  ChevronRight, AlertCircle, BookOpen, Target, Star, Lightbulb,
  Chrome, ExternalLink, Sparkles, Brain
} from 'lucide-react'
import { useQuery } from 'react-query'
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useProfile, useCrs, useDraws, useActiveCase } from '../hooks'
import JourneyBar from '../components/JourneyBar'
import { useAppStore, useAuthStore } from '../store'
import { aiAPI, eligibilityAPI } from '../services/api'
import log from '../services/logger'
import clsx from 'clsx'

// ─── Sub-components ───────────────────────────────────────────────────────────

function CrsGauge({ score }) {
  const max = 1200
  const pct = Math.min(score / max, 1)
  const circumference = 220
  const offset = circumference - pct * circumference
  return (
    <div className="relative flex items-center justify-center w-36 h-36 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="35" fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle cx="50" cy="50" r="35" fill="none"
          stroke="url(#g1)" strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c0392b" />
            <stop offset="100%" stopColor="#ff7070" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-3xl text-white">{score || '—'}</span>
        <span className="text-slate-400 text-[10px] font-medium tracking-wide uppercase">CRS Score</span>
      </div>
    </div>
  )
}

function CategoryBar({ label, total, max, color, subs }) {
  const [open, setOpen] = useState(false)
  const pct = max > 0 ? Math.min(((total ?? 0) / max) * 100, 100) : 0
  return (
    <div>
      <button onClick={() => subs?.length && setOpen(o => !o)} className="w-full text-left">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-300 font-medium flex items-center gap-1">
            {subs?.length > 0 && <span className="text-slate-600 text-[9px]">{open ? '▾' : '▸'}</span>}
            {label}
          </span>
          <span className="font-mono text-white font-semibold">{total ?? 0}<span className="text-slate-600">/{max}</span></span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </button>
      {open && subs?.length > 0 && (
        <div className="ml-3 pl-3 border-l border-slate-700 space-y-1.5 pt-1.5 pb-0.5">
          {subs.map(s => {
            const sp = s.max > 0 ? Math.min(((s.val ?? 0) / s.max) * 100, 100) : 0
            return (
              <div key={s.label}>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-500">{s.label}</span>
                  <span className="text-slate-400 font-mono">{s.val ?? 0}<span className="text-slate-600">/{s.max}</span></span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${sp}%`, backgroundColor: color, opacity: 0.7 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-base font-bold text-maple-400">{payload[0].value} CRS</p>
    </div>
  )
}

function QuickLink({ to, icon: Icon, label, sub, color = 'maple' }) {
  const colors = {
    maple:  'bg-maple-500/10 text-maple-400 group-hover:bg-maple-500/20',
    blue:   'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20',
    green:  'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20',
    amber:  'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20',
    cyan:   'bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20',
  }
  return (
    <Link to={to} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-700">
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors', colors[color])}>
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white">{label}</p>
        {sub && <p className="text-[10px] text-slate-500 truncate">{sub}</p>}
      </div>
      <ArrowUpRight size={13} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
    </Link>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: profile } = useProfile()
  const { calculate } = useCrs()
  const { data: draws } = useDraws()
  const { data: activeCase } = useActiveCase()
  const crsScore = useAppStore(s => s.crsScore)
  const { user } = useAuthStore()

  useEffect(() => { log.info('Dashboard', 'mounted') }, [])

  const firstName = profile?.full_name?.split(' ')[0] || user?.full_name?.split(' ')[0] || null
  const hasScore = !!crsScore || !!profile?.crs_score_json?.total
  const score = crsScore?.total || profile?.crs_score_json?.total || 0
  const latestDraw = draws?.[0]
  const programs = profile?.eligible_programs || []

  const { data: improvements, isLoading: loadingImprovements } = useQuery(
    'crs-improvements',
    () => aiAPI.getCrsImprovements().then(r => r.data),
    { enabled: hasScore, staleTime: 30 * 60 * 1000 }
  )

  const { data: prediction } = useQuery(
    'draw-prediction',
    () => aiAPI.getDrawPrediction().then(r => r.data),
    { enabled: hasScore, staleTime: 30 * 60 * 1000 }
  )

  const { data: eligibility, isLoading: loadingEligibility } = useQuery(
    'eligibility-check-dashboard',
    () => eligibilityAPI.check().then(r => r.data),
    { enabled: !!profile, staleTime: 0 }   // Fix: was 10min stale — now always refetches after recalc
  )

  const chartData = draws?.slice(0, 20).reverse().map(d => ({
    date: format(parseISO(d.draw_date), 'MMM d'),
    crs: d.minimum_crs
  })) || []

  // CRS breakdown
  const s = crsScore || profile?.crs_score_json
  const b = profile?.crs_breakdown
  const crsCategories = s ? [
    { label: 'Core Human Capital', total: s.core_human_capital, max: 500, color: '#3b82f6',
      subs: b ? [
        { label: 'Age',             val: b.age_points,            max: 110 },
        { label: 'Education',       val: b.education_points,      max: 150 },
        { label: 'First Language',  val: b.first_language_points, max: 136 },
        { label: 'Second Language', val: b.second_language_points,max: 24  },
        { label: 'Canadian Work',   val: b.canadian_work_points,  max: 80  },
      ] : [] },
    { label: 'Spouse Factors', total: s.spouse_factors, max: 40, color: '#8b5cf6',
      subs: b ? [
        { label: 'Education',       val: b.spouse_education_points, max: 10 },
        { label: 'Language',        val: b.spouse_language_points,  max: 20 },
        { label: 'CDN Work',        val: b.spouse_cdn_work_points,  max: 10 },
      ] : [] },
    { label: 'Skill Transferability', total: s.skill_transferability, max: 100, color: '#10b981',
      subs: b ? [
        { label: 'Education + Lang',val: b.edu_lang_combo,        max: 50 },
        { label: 'Education + CDN', val: b.edu_cdn_exp_combo,     max: 50 },
        { label: 'Foreign + Lang',  val: b.foreign_lang_combo,    max: 50 },
        { label: 'Foreign + CDN',   val: b.foreign_cdn_exp_combo, max: 50 },
      ] : [] },
    { label: 'Additional Points', total: s.additional_points, max: 600, color: '#f59e0b',
      subs: b ? [
        { label: 'Provincial Nom.', val: b.provincial_nomination, max: 600 },
        { label: 'Job Offer',       val: b.job_offer,             max: 200 },
        { label: 'CDN Education',   val: b.canadian_education,    max: 30  },
        { label: 'Sibling',         val: b.sibling,               max: 15  },
        { label: 'French',          val: b.french_language,       max: 50  },
      ] : [] },
  ] : []

  // API returns {FSW: {...}, CEC: {...}, FST: {...}} at top level
  // useCrs hook seeds cache with {programs: {FSW: ...}} shape — handle both
  const fsw = eligibility?.FSW || eligibility?.programs?.FSW
  const fswPts = fsw?.selection_points ?? 0
  const fswEligible = fswPts >= 67
  const fswGap = Math.max(0, 67 - fswPts)
  const fswPct = Math.min((fswPts / 67) * 100, 100)
  const fswBreakdown = fsw?.checks?.find(c => c.criterion === 'FSW 67-point selection grid')?.breakdown || {}
  const fswFix = fsw?.checks?.find(c => c.criterion === 'FSW 67-point selection grid')?.fix

  const FSW_FACTORS = [
    { key: 'Language (max 28)',       max: 28, color: '#3b82f6', icon: '🗣️', label: 'Language' },
    { key: 'Education (max 25)',      max: 25, color: '#8b5cf6', icon: '🎓', label: 'Education' },
    { key: 'Work Experience (max 15)',max: 15, color: '#10b981', icon: '💼', label: 'Work Exp.' },
    { key: 'Age (max 12)',            max: 12, color: '#f59e0b', icon: '📅', label: 'Age' },
    { key: 'Job Offer (max 10)',      max: 10, color: '#ef4444', icon: '📋', label: 'Job Offer' },
    { key: 'Adaptability (max 10)',   max: 10, color: '#06b6d4', icon: '🍁', label: 'Adaptability' },
  ]

  const gapToLatestDraw = latestDraw && score ? latestDraw.minimum_crs - score : null

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">{firstName ? `Welcome back, ${firstName}` : 'Dashboard'}</h1>
          <p className="text-slate-400 text-sm mt-0.5">Your Express Entry at a glance</p>
        </div>
        <button onClick={() => calculate.mutate()} disabled={calculate.isLoading || !profile} className="btn-secondary text-sm">
          {calculate.isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Recalculate CRS
        </button>
      </div>

      {/* ── PR Journey Bar ────────────────────────────────────────── */}
      <JourneyBar
        profile={profile}
        crsScore={score}
        documents={profile?.documents}
        eligibility={eligibility}
      />

      {/* ── Contextual Next Step Banner ─────────────────────────── */}
      {(() => {
        // Smart "what to do next" based on profile state
        if (!profile?.full_name) return (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-maple-500/30 bg-maple-500/5"
          >
            <Lightbulb size={18} className="text-maple-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Start by completing your profile</p>
              <p className="text-xs text-slate-400 mt-0.5">Your CRS score, eligibility, and all AI tools depend on your profile data.</p>
            </div>
            <Link to="/profile" className="btn-primary text-xs py-1.5 px-4 flex-shrink-0">Complete Profile <ChevronRight size={12} /></Link>
          </motion.div>
        )
        if (!hasScore) return (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-blue-500/30 bg-blue-500/5"
          >
            <Zap size={18} className="text-blue-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Calculate your CRS score</p>
              <p className="text-xs text-slate-400 mt-0.5">Profile saved — click Recalculate CRS to see your score and unlock all tools.</p>
            </div>
            <button onClick={() => calculate.mutate()} disabled={calculate.isLoading} className="btn-primary text-xs py-1.5 px-4 flex-shrink-0">
              {calculate.isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Calculate CRS'}
            </button>
          </motion.div>
        )
        if (!fswEligible && fswGap <= 15) return (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5"
          >
            <ShieldCheck size={18} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">You're {fswGap} points from FSW eligibility</p>
              <p className="text-xs text-slate-400 mt-0.5">{fswFix?.split('.')[0]}.</p>
            </div>
            <Link to="/tools?tool=simulator" className="btn-secondary text-xs py-1.5 px-4 flex-shrink-0">Score Simulator <ChevronRight size={12} /></Link>
          </motion.div>
        )
        if (gapToLatestDraw > 0 && gapToLatestDraw <= 30) return (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5"
          >
            <TrendingUp size={18} className="text-purple-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">You're only {gapToLatestDraw} pts below the latest draw cutoff</p>
              <p className="text-xs text-slate-400 mt-0.5">A PNP nomination adds 600 pts — check which provinces you qualify for now.</p>
            </div>
            <Link to="/tools?tool=pnp" className="btn-secondary text-xs py-1.5 px-4 flex-shrink-0">PNP Matcher <ChevronRight size={12} /></Link>
          </motion.div>
        )
        return null
      })()}


      {/* ── Start IRCC Application CTA (shown when eligible + has score) ── */}
      {fswEligible && hasScore && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-transparent"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">You appear eligible — ready to start your IRCC application?</p>
            <p className="text-xs text-slate-400 mt-0.5">Install our Chrome extension and we'll auto-fill your IRCC form in minutes.</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <a
              href="https://onlineservices-servicesenligne.cic.gc.ca/eapp/eapp?modifyCaller=PAQ"
              target="_blank" rel="noopener noreferrer"
              className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
            >
              <ExternalLink size={12} /> Start on IRCC
            </a>
            <Link to="/application" className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              <Chrome size={12} /> Extension Guide
            </Link>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* CRS Score */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card flex flex-col">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Your CRS Score</p>
          <div className="flex items-start gap-4">
            <CrsGauge score={score} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {programs.length > 0 ? programs.map(p => (
                  <span key={p} className="badge-maple text-[10px]">✓ {p.replace(/_/g, ' ').toUpperCase()}</span>
                )) : <span className="badge-slate text-[10px]">Complete profile</span>}
              </div>
              {latestDraw && (
                <div className={clsx('p-2 rounded-lg text-center text-[10px] font-semibold',
                  gapToLatestDraw <= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                )}>
                  {gapToLatestDraw <= 0
                    ? `✓ Above draw cutoff (${latestDraw.minimum_crs})`
                    : `${gapToLatestDraw} pts below draw cutoff (${latestDraw.minimum_crs})`}
                </div>
              )}
              {!hasScore && (
                <button onClick={() => calculate.mutate()} disabled={!profile || calculate.isLoading} className="btn-primary text-xs px-4 py-2 mt-2 w-full">
                  {calculate.isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Calculate CRS'}
                </button>
              )}
            </div>
          </div>
          {crsCategories.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800 space-y-2.5">
              {crsCategories.map(cat => <CategoryBar key={cat.label} {...cat} />)}
            </div>
          )}
        </motion.div>

        {/* Draw History */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Draw History</p>
              <p className="text-xs text-slate-400 mt-0.5">Last 20 draws</p>
            </div>
            {latestDraw && (
              <div className="text-right">
                <p className="text-2xl font-bold text-white">{latestDraw.minimum_crs}</p>
                <p className="text-[10px] text-slate-500">{format(parseISO(latestDraw.draw_date), 'MMM d, yyyy')}</p>
              </div>
            )}
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={155}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c0392b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#c0392b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<ChartTooltip />} />
                {score > 0 && <ReferenceLine y={score} stroke="#ff7070" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: 'You', fill: '#ff7070', fontSize: 9 }} />}
                <Area type="monotone" dataKey="crs" stroke="#c0392b" strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 3, fill: '#c0392b' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">No draw data yet</div>
          )}
          {prediction && (
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-3">
              <Star size={13} className="text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-400">AI invitation probability</p>
                <p className="text-xs font-bold text-emerald-400">{Math.round((prediction.invitation_probability_6_months || 0) * 100)}% chance in 6 months</p>
              </div>
              <Link to="/draws" className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-0.5">Details <ChevronRight size={10} /></Link>
            </div>
          )}
        </motion.div>

        {/* FSW Score compact */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">FSW Selection Grid</p>
              <p className="text-xs text-slate-400 mt-0.5">67 points needed to qualify</p>
            </div>
            {loadingEligibility
              ? <Loader2 size={15} className="animate-spin text-slate-500" />
              : <div className="text-right">
                  <p className={clsx('text-2xl font-bold', fswEligible ? 'text-emerald-400' : 'text-maple-400')}>
                    {fswPts}<span className="text-sm text-slate-500 font-normal">/100</span>
                  </p>
                  <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    fswEligible ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                  )}>
                    {fswEligible ? '✓ Eligible' : `Need ${fswGap} more`}
                  </span>
                </div>
            }
          </div>
          <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-1">
            <div className={clsx('h-full rounded-full transition-all duration-700', fswEligible ? 'bg-emerald-500' : 'bg-maple-500')} style={{ width: `${fswPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mb-4"><span>0</span><span>67 min</span><span>100</span></div>

          {loadingEligibility
            ? <div className="space-y-2 flex-1">{[1,2,3,4,5,6].map(i => <div key={i} className="h-5 shimmer rounded" />)}</div>
            : <div className="space-y-2 flex-1">
                {FSW_FACTORS.map(({ key, max, color, icon, label }) => {
                  const raw = fswBreakdown[key] || ''
                  const val = parseInt(raw.match(/^(\d+)/)?.[1] ?? '0')
                  const pct = max > 0 ? (val / max) * 100 : 0
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs w-4 text-center flex-shrink-0">{icon}</span>
                      <span className="text-[10px] text-slate-400 w-16 truncate flex-shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className={clsx('text-[10px] font-mono font-semibold w-8 text-right flex-shrink-0',
                        val >= max ? 'text-emerald-400' : val > 0 ? 'text-white' : 'text-slate-600'
                      )}>{val}/{max}</span>
                    </div>
                  )
                })}
              </div>
          }
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            {!fswEligible && fswFix
              ? <p className="text-[10px] text-amber-400 flex items-start gap-1 leading-relaxed flex-1"><AlertCircle size={10} className="flex-shrink-0 mt-0.5" />{fswFix?.split('.')[0]}.</p>
              : fswEligible
                ? <p className="text-[10px] text-emerald-400 flex-1">✓ FSW threshold met! Focus on CRS ranking.</p>
                : <p className="text-[10px] text-slate-500 flex-1">Complete profile for personalized advice.</p>
            }
            <Link to="/immigration-tools" className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-0.5 flex-shrink-0">
              Full check <ChevronRight size={10} />
            </Link>
          </div>
        </motion.div>
      </div>

      {/* ── ROW 2: What can I do? ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* AI Score Improvements — most actionable widget */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-maple-500/10 flex items-center justify-center">
              <Brain size={14} className="text-maple-400" />
            </div>
            <h3 className="font-semibold text-white text-sm">AI Score Improvement Plan</h3>
            <span className="flex items-center gap-1 ml-auto text-[10px] text-maple-400 bg-maple-500/10 px-2 py-0.5 rounded-full">
              <Sparkles size={9} /> AI Powered
            </span>
          </div>
          {loadingImprovements ? (
            <div className="space-y-2.5">{[1,2,3,4].map(i => <div key={i} className="h-14 shimmer rounded-xl" />)}</div>
          ) : improvements?.suggestions?.length > 0 ? (
            <>
              <div className="space-y-2">
                {improvements.suggestions.slice(0, 6).map((sug, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-maple-500/15 flex items-center justify-center text-maple-400 text-[10px] font-bold flex-shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{sug.strategy}</p>
                      <p className="text-[10px] text-slate-500">{sug.time_required} · {sug.effort_level} effort</p>
                    </div>
                    <span className="badge-green text-[10px] flex-shrink-0">+{sug.estimated_points_gain} pts</span>
                  </div>
                ))}
              </div>
              <Link to="/assistant" className="btn-ghost text-xs w-full justify-center mt-3">Discuss with AI Assistant →</Link>
            </>
          ) : !hasScore ? (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <Target size={28} className="text-maple-400/40" />
              <p className="text-slate-400 text-sm">Calculate your CRS score first to unlock personalized tips</p>
              <button onClick={() => calculate.mutate()} className="btn-primary text-xs px-5 py-2">Calculate CRS</button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <p className="text-slate-500 text-sm">AI suggestions unavailable right now</p>
              <Link to="/assistant" className="btn-ghost text-xs">Ask AI Assistant →</Link>
            </div>
          )}
        </motion.div>

        {/* Application Status sidebar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="card flex flex-col gap-3">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Application Status</p>

          <div className={clsx('p-3 rounded-xl border flex items-center gap-3',
            activeCase?.days_remaining < 14 ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-900/40'
          )}>
            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
              activeCase?.days_remaining < 14 ? 'bg-red-500/15' : 'bg-amber-500/10'
            )}>
              <Clock size={14} className={activeCase?.days_remaining < 14 ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500">ITA Deadline</p>
              <p className={clsx('text-sm font-bold', activeCase?.days_remaining < 14 ? 'text-red-400' : 'text-white')}>
                {activeCase ? `${activeCase.days_remaining} days` : 'No ITA yet'}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-slate-700 bg-slate-900/40 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <FileText size={14} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-slate-500">Documents Uploaded</p>
              <p className="text-sm font-bold text-white">{profile?.documents?.length || 0} files</p>
            </div>
            <Link to="/documents"><ChevronRight size={13} className="text-slate-600 hover:text-slate-400" /></Link>
          </div>

          <div className="p-3 rounded-xl border border-slate-700 bg-slate-900/40 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={14} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-slate-500">Checklist Progress</p>
              <p className="text-sm font-bold text-white">
                {activeCase ? `${activeCase.checklist_progress?.completed}/${activeCase.checklist_progress?.total}` : '—'}
              </p>
              {activeCase && (
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-emerald-500 rounded-full" style={{
                    width: `${(activeCase.checklist_progress?.completed / activeCase.checklist_progress?.total) * 100 || 0}%`
                  }} />
                </div>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl border border-slate-700 bg-slate-900/40 flex-1">
            <p className="text-[10px] text-slate-500 mb-2">Programs You Qualify For</p>
            {(eligibility?.programs || eligibility?.FSW || eligibility?.CEC) ? (() => {
              // Handle both {programs: {FSW:...}} and {FSW:..., CEC:...} shapes
              const progs = eligibility?.programs || {
                FSW: eligibility?.FSW,
                CEC: eligibility?.CEC,
                FST: eligibility?.FST,
              }
              const cleanProgs = Object.fromEntries(Object.entries(progs).filter(([,v]) => v !== undefined))
              return (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(cleanProgs).map(([code, prog]) => (
                  <span key={code} className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold',
                    prog.eligible ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'
                  )}>
                    {prog.eligible ? '✓' : '✗'} {code}
                  </span>
                ))}
              </div>
              )
            })() : loadingEligibility
              ? <div className="h-5 shimmer rounded" />
              : <p className="text-[10px] text-slate-600">Complete profile to check</p>
            }
          </div>
        </motion.div>
      </div>

      {/* ── ROW 3: FSW Detailed Breakdown — only shown if NOT eligible ── */}
      {!loadingEligibility && !fswEligible && eligibility && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card border-amber-500/20">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <ShieldCheck size={15} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">How to Reach 67 FSW Points</h3>
                <p className="text-xs text-slate-400">You need {fswGap} more point{fswGap !== 1 ? 's' : ''} — here's exactly where to gain them</p>
              </div>
            </div>
            <Link to="/immigration-tools" className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1">
              Full Eligibility Check <ChevronRight size={11} />
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {FSW_FACTORS.map(({ key, max, color, icon, label }) => {
              const raw = fswBreakdown[key] || ''
              const val = parseInt(raw.match(/^(\d+)/)?.[1] ?? '0')
              const detail = raw.replace(/^\d+ pts\s*/, '')
              const pct = max > 0 ? (val / max) * 100 : 0
              const atMax = val >= max
              return (
                <div key={key} className={clsx('rounded-xl p-3 border',
                  atMax ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-700 bg-slate-900/40'
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">{icon} {label}</span>
                    <span className={clsx('text-sm font-bold', atMax ? 'text-emerald-400' : val > 0 ? 'text-white' : 'text-slate-500')}>{val}/{max}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1.5">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  {atMax
                    ? <p className="text-[10px] text-emerald-400">✓ Maximum reached</p>
                    : <p className="text-[10px] text-slate-500 truncate">Up to +{max - val} pts available · {detail}</p>
                  }
                </div>
              )
            })}
          </div>

          {fswFix && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-400 mb-1">Recommended actions</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{fswFix}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to="/ielts"             className="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/15   text-blue-400   hover:bg-blue-500/25   transition-colors">📚 IELTS Prep</Link>
                    <Link to="/tools"             className="text-[10px] px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors">🎯 Score Simulator</Link>
                    <Link to="/immigration-tools" className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15  text-amber-400  hover:bg-amber-500/25  transition-colors">🔍 Full Check</Link>
                    <Link to="/assistant"         className="text-[10px] px-2.5 py-1 rounded-full bg-slate-700     text-slate-300  hover:bg-slate-600     transition-colors">💬 Ask AI</Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── ROW 4: Quick Actions ──────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="card">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <QuickLink to="/profile"           icon={TrendingUp}    label="Update Profile"    sub="Language, work, education"  color="maple"  />
          <QuickLink to="/ielts"             icon={BookOpen}      label="IELTS Prep"        sub="Diagnostic, practice, mock" color="blue"   />
          <QuickLink to="/immigration-tools" icon={ShieldCheck}   label="Eligibility Check" sub="FSW · CEC · FST"            color="amber"  />
          <QuickLink to="/tools/hub"         icon={Target}        label="AI Tools"          sub="Simulator, PNP, predictor"  color="purple" />
          <QuickLink to="/documents"         icon={FileText}      label="Documents"         sub="Upload & AI review"         color="green"  />
          <QuickLink to="/assistant"         icon={MessageSquare} label="AI Assistant"      sub="Ask anything"               color="cyan"   />
        </div>
      </motion.div>

    </div>
  )
}
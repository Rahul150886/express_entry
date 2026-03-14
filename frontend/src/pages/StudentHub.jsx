import React from 'react'
// src/pages/StudentHub.jsx
// Student Visa module hub — entry point with profile summary + tool cards

import { useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { motion } from 'framer-motion'
import {
  GraduationCap, ChevronRight, ShieldCheck, FileText, AlertTriangle,
  CheckCircle2, User, Globe, DollarSign, BookOpen, Sparkles,
  ArrowRight, Clock, BarChart3, Loader2, Plus
} from 'lucide-react'
import { studentAPI } from '../services/api'
import clsx from 'clsx'

const COUNTRY_FLAGS = {
  canada: '🍁', uk: '🇬🇧', australia: '🇦🇺', usa: '🇺🇸', germany: '🇩🇪'
}
const RISK_CONFIG = {
  low:       { color: 'emerald', label: 'Low Risk'      },
  medium:    { color: 'amber',   label: 'Medium Risk'   },
  high:      { color: 'red',     label: 'High Risk'     },
  very_high: { color: 'red',     label: 'Very High Risk'},
}

function ProfileSummaryCard({ profile, onEdit }) {
  const hasLanguage = profile?.ielts_overall || profile?.pte_overall || profile?.toefl_total
  const completeness = [
    profile?.nationality, profile?.current_education_level, profile?.field_of_study,
    hasLanguage, profile?.target_level, profile?.target_countries?.length,
    profile?.annual_budget_usd
  ].filter(Boolean).length

  const pct = Math.round((completeness / 7) * 100)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">Your Student Profile</h3>
        <button onClick={onEdit} className="btn-secondary text-xs gap-1.5">
          {profile ? 'Edit Profile' : 'Complete Profile'} <ChevronRight size={12} />
        </button>
      </div>

      {!profile ? (
        <div className="text-center py-8">
          <GraduationCap size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No student profile yet</p>
          <p className="text-slate-500 text-xs mt-1">Complete your profile to get eligibility results and AI documents</p>
          <button onClick={onEdit} className="btn-primary mt-4 gap-2">
            <Plus size={14} /> Create Student Profile
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { icon: Globe,    label: 'Nationality',  val: profile.nationality || '—' },
              { icon: BookOpen, label: 'Studying For', val: profile.target_level || '—' },
              { icon: GraduationCap, label: 'Field', val: profile.target_field?.slice(0, 20) || '—' },
              { icon: DollarSign,   label: 'Budget/yr', val: profile.annual_budget_usd ? `$${profile.annual_budget_usd.toLocaleString()}` : '—' },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} className="text-slate-500" />
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
                </div>
                <p className="text-sm font-semibold text-white truncate">{val}</p>
              </div>
            ))}
          </div>

          {/* Language score */}
          {hasLanguage && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/8 border border-blue-500/20 mb-3">
              <span className="text-base">🗣️</span>
              <div>
                <p className="text-xs font-semibold text-white">
                  {profile.language_test?.toUpperCase()}{' '}
                  {profile.ielts_overall ? `${profile.ielts_overall} overall` :
                   profile.pte_overall   ? `${profile.pte_overall} overall` :
                   profile.toefl_total   ? `${profile.toefl_total} total` : ''}
                </p>
                {profile.ielts_overall && (
                  <p className="text-[10px] text-slate-400">
                    L:{profile.ielts_listening} R:{profile.ielts_reading} W:{profile.ielts_writing} S:{profile.ielts_speaking}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Target countries */}
          {profile.target_countries?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.target_countries.map(c => (
                <span key={c} className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                  {COUNTRY_FLAGS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
                </span>
              ))}
            </div>
          )}

          {/* Profile completeness */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-500">Profile completeness</span>
              <span className="text-white font-mono">{pct}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all',
                pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-maple-500'
              )} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EligibilityResultsCard({ eligibility, onRunCheck }) {
  if (!eligibility) {
    return (
      <div className="card">
        <h3 className="font-semibold text-white mb-3">Eligibility Assessment</h3>
        <div className="text-center py-8">
          <ShieldCheck size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">Not run yet</p>
          <p className="text-slate-500 text-xs mt-1">Complete your profile then run the eligibility check</p>
          <button onClick={onRunCheck} className="btn-primary mt-4 gap-2">
            <Sparkles size={14} /> Run Eligibility Check
          </button>
        </div>
      </div>
    )
  }

  const top = eligibility.top_recommendation
  const countries = eligibility.countries || []

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">Eligibility Assessment</h3>
        <button onClick={onRunCheck} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
          Rerun <ChevronRight size={11} />
        </button>
      </div>

      {/* Overall score */}
      <div className="flex items-center gap-4 p-4 rounded-2xl border border-slate-700 bg-slate-800/30 mb-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#1e293b" strokeWidth="6"/>
            <circle cx="28" cy="28" r="24" fill="none" stroke="#C8102E" strokeWidth="6"
              strokeDasharray={`${(eligibility.overall_profile_strength || 0) * 1.508} 150.8`}
              strokeLinecap="round"/>
          </svg>
          <p className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">
            {eligibility.overall_profile_strength || 0}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Profile Strength</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
            {eligibility.profile_summary}
          </p>
          {top && (
            <p className="text-xs text-emerald-400 mt-1">
              Top recommendation: {COUNTRY_FLAGS[top]} {top.charAt(0).toUpperCase() + top.slice(1)}
            </p>
          )}
        </div>
      </div>

      {/* Country scores */}
      <div className="space-y-2">
        {countries.slice(0, 4).map(c => {
          const risk = RISK_CONFIG[c.risk_level] || RISK_CONFIG.medium
          const isTop = c.country === top
          return (
            <div key={c.country} className={clsx('flex items-center gap-3 p-3 rounded-xl border transition-all',
              isTop ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/20'
            )}>
              <span className="text-xl flex-shrink-0">{COUNTRY_FLAGS[c.country] || '🌍'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{c.visa_type}</p>
                  {isTop && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">TOP PICK</span>}
                </div>
                <p className="text-xs text-slate-500">{c.processing_time_weeks} weeks processing</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-white">{c.eligibility_score}</p>
                <p className={clsx('text-[10px] font-semibold', `text-${risk.color}-400`)}>{risk.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {eligibility.critical_gaps?.length > 0 && (
        <div className="mt-4 p-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={12} className="text-amber-400" />
            <p className="text-xs font-bold text-amber-300">Critical gaps to fix first</p>
          </div>
          {eligibility.critical_gaps.slice(0, 3).map((g, i) => (
            <p key={i} className="text-xs text-slate-400">• {g}</p>
          ))}
        </div>
      )}
    </div>
  )
}

const TOOL_CARDS = [
  {
    id: 'sop',
    icon: '✍️',
    title: 'SOP Generator',
    subtitle: 'Statement of Purpose',
    description: 'AI writes a tailored SOP for your target country, university, and program — formatted for that country\'s visa officer expectations.',
    route: '/student/tools?tool=sop',
    color: 'blue',
    badge: 'Most requested',
  },
  {
    id: 'financial-letter',
    icon: '💰',
    title: 'Financial Letter',
    subtitle: 'Sponsorship & Bank Letters',
    description: 'AI generates financial sponsorship letters, bank explanation letters, and personal financial statements with the exact amounts each country requires.',
    route: '/student/tools?tool=financial',
    color: 'emerald',
    badge: null,
  },
  {
    id: 'risk',
    icon: '🛡️',
    title: 'Visa Risk Analyzer',
    subtitle: 'Approval probability + red flags',
    description: 'Identifies your specific risk factors for each country\'s visa officer — refusal patterns, financial gaps, GTE concerns — with mitigation strategies.',
    route: '/student/tools?tool=risk',
    color: 'amber',
    badge: null,
  },
  {
    id: 'tracker',
    icon: '📋',
    title: 'Application Tracker',
    subtitle: 'University pipeline manager',
    description: 'Track every university you\'re applying to through the full pipeline — researching → applied → offer → visa approved. Document checklist per university.',
    route: '/student/tracker',
    color: 'purple',
    badge: null,
  },
  {
    id: 'funds',
    icon: '🧮',
    title: 'Proof of Funds',
    subtitle: 'Embassy-ready calculation',
    description: 'Calculates exactly what a visa officer needs to see — tuition + living costs broken down by city, with a bar chart comparison across all 5 countries.',
    route: '/student/financial?tab=calculator',
    color: 'cyan',
    badge: null,
  },
  {
    id: 'scholarships',
    icon: '🎓',
    title: 'Scholarship Finder',
    subtitle: '13 curated scholarships + match score',
    description: 'Curated government and foundation scholarships for Canada, UK, Australia, USA, Germany — ranked by your profile eligibility score.',
    route: '/student/financial?tab=scholarships',
    color: 'rose',
    badge: null,
  },
  {
    id: 'pr-pathway',
    icon: '🏆',
    title: 'PR Pathway',
    subtitle: 'Student → PGWP → Express Entry → PR',
    description: 'Your personalised roadmap from graduation to permanent residence — PGWP eligibility check, CRS projection at every stage, PNP streams, and milestone tracker.',
    route: '/student/pr-pathway',
    color: 'purple',
    badge: 'Canada only',
  },
]

export default function StudentHub() {
  const navigate = useNavigate()

  const { data: profile, isLoading: profileLoading } = useQuery(
    'student-profile',
    () => studentAPI.getProfile().then(r => r.data),
    { staleTime: 5 * 60 * 1000 }
  )

  const eligibility = profile?.eligibility_result

  const { mutate: runCheck, isLoading: checking } = useQuery(
    'student-eligibility-run',
    () => studentAPI.checkEligibility().then(r => r.data),
    { enabled: false }
  )

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-maple-400" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <GraduationCap size={24} className="text-blue-400" /> Student Visa
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Eligibility assessment, AI-generated SOPs, financial letters, and visa risk analysis for 5 countries
          </p>
        </div>
      </div>

      {/* PR pathway banner — unique angle */}
      <div className="flex items-start gap-3 p-4 rounded-2xl border border-maple-500/25 bg-gradient-to-r from-maple-500/8 to-blue-500/5">
        <span className="text-2xl">🍁→🎓→✈️</span>
        <div>
          <p className="text-sm font-bold text-white">Student → PGWP → Express Entry PR pathway</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Studying in Canada can directly feed into your Express Entry profile. A qualifying Canadian degree 
            + Canadian work experience can add 30–50+ CRS points. See your PR pathway after completing your profile.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          <ProfileSummaryCard profile={profile} onEdit={() => navigate('/student/profile')} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <EligibilityResultsCard
            eligibility={eligibility}
            onRunCheck={() => navigate('/student/eligibility')}
          />
        </div>
      </div>

      {/* AI Tools */}
      <div>
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-blue-400" /> AI Document Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOOL_CARDS.map((tool, i) => (
            <motion.button
              key={tool.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => navigate(tool.route)}
              className={clsx(
                'text-left p-5 rounded-2xl border transition-all hover:scale-[1.01]',
                `border-${tool.color}-500/25 bg-${tool.color}-500/5 hover:border-${tool.color}-500/50`
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{tool.icon}</span>
                {tool.badge && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold">
                    {tool.badge}
                  </span>
                )}
              </div>
              <p className="font-bold text-white text-sm">{tool.title}</p>
              <p className={clsx('text-[11px] font-semibold mb-2', `text-${tool.color}-400`)}>
                {tool.subtitle}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">{tool.description}</p>
              <div className={clsx('flex items-center gap-1 mt-3 text-xs font-semibold', `text-${tool.color}-400`)}>
                Open tool <ArrowRight size={12} />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}

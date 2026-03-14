import React from 'react'
// src/pages/ToolsHub.jsx
// Unified hub replacing: AI Tools, Imm. Tools, NOC Finder, IELTS Prep links
// Tools ordered by impact on Express Entry outcome

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sliders, MapPin, BarChart2, Users2, BookOpen, FileText,
  ShieldCheck, GraduationCap, Briefcase, Search, ChevronRight,
  ArrowUpRight, Zap, Star, Target, ClipboardCopy, ListChecks
} from 'lucide-react'
import clsx from 'clsx'

// ── Tool registry — ordered by impact ─────────────────────────────────────────
// Priority: things that directly change your CRS or eligibility come first
const TOOL_GROUPS = [
  {
    id: 'boost',
    label: '🎯 Boost Your Score',
    subtitle: 'Highest ROI — do these first',
    accent: 'maple',
    tools: [
      {
        id: 'simulator',
        label: 'CRS Score Simulator',
        icon: Sliders,
        color: 'text-maple-400',
        bg: 'bg-maple-500/10',
        border: 'border-maple-500/30',
        impact: 'High impact',
        impactColor: 'text-maple-400 bg-maple-500/10',
        desc: 'Adjust IELTS band, work years, education, age — watch your CRS score change live. This is a CRS ranking tool, not an eligibility checker.',
        why: 'CRS determines your draw ranking once you\'re in the pool. Optimize every factor before submitting your profile.',
        page: '/tools',
        param: 'simulator',
      },
      {
        id: 'studyplan',
        label: 'Personalized Study Plan',
        icon: Target,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        impact: 'High impact',
        impactColor: 'text-amber-400 bg-amber-500/10',
        desc: 'AI builds a week-by-week roadmap to hit your target CRS score. Covers language prep, work strategy, and education upgrades.',
        why: 'Without a plan, most applicants waste months on the wrong improvements.',
        page: '/tools',
        param: 'studyplan',
      },
      {
        id: 'ielts',
        label: 'IELTS Prep',
        icon: BookOpen,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        impact: 'High impact',
        impactColor: 'text-blue-400 bg-blue-500/10',
        desc: 'Diagnostic test, targeted practice sessions, and a full timed mock exam. CLB 9 vs CLB 7 is worth ~40 CRS points.',
        why: 'Language is the single biggest lever — CLB 9 in all 4 skills is worth 136 CRS points vs 68 at CLB 7.',
        page: '/ielts',
        external: true,
      },
    ],
  },
  {
    id: 'explore',
    label: '🔍 Find Your Path',
    subtitle: 'Understand which programs you qualify for',
    accent: 'emerald',
    tools: [
      {
        id: 'eligibility',
        label: 'Eligibility Check',
        icon: ShieldCheck,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        impact: 'Essential',
        impactColor: 'text-emerald-400 bg-emerald-500/10',
        desc: 'Instant FSW / CEC / FST eligibility check against official IRCC rules, including the 67-point selection grid with factor-by-factor breakdown.',
        why: 'Many applicants apply for the wrong stream and get rejected. Know which one you qualify for before entering the pool.',
        page: '/immigration-tools',
        param: 'eligibility',
        external: true,
      },
      {
        id: 'pnp',
        label: 'PNP Matcher',
        icon: MapPin,
        color: 'text-teal-400',
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/30',
        impact: 'Game changer',
        impactColor: 'text-teal-400 bg-teal-500/10',
        desc: 'A Provincial Nominee nomination adds 600 CRS points — virtually guaranteeing an ITA. Find which province streams you qualify for now.',
        why: 'PNP is the fastest route to an ITA for most candidates below 490 CRS. Many don\'t know they already qualify.',
        page: '/tools',
        param: 'pnp',
      },
      {
        id: 'noc',
        label: 'NOC Code Finder',
        icon: Search,
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        impact: 'Required',
        impactColor: 'text-purple-400 bg-purple-500/10',
        desc: 'AI matches your job title and duties to the correct NOC code and TEER level — required for your Express Entry profile.',
        why: 'The wrong NOC code can disqualify your application. IRCC checks NOC alignment when processing.',
        page: '/noc-finder',
        external: true,
      },
    ],
  },
  {
    id: 'track',
    label: '📊 Track & Plan',
    subtitle: 'Monitor the pool and time your application',
    accent: 'blue',
    tools: [
      {
        id: 'predictor',
        label: 'Draw Predictor',
        icon: BarChart2,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        impact: 'Strategic',
        impactColor: 'text-blue-400 bg-blue-500/10',
        desc: 'AI forecasts next draw dates and CRS cutoff ranges using historical patterns. Know when to expect your ITA.',
        why: 'Draw cutoffs fluctuate by 30–50 pts. Timing your profile submission can matter.',
        page: '/tools',
        param: 'predictor',
      },
      {
        id: 'peers',
        label: 'Peer Comparison',
        icon: Users2,
        color: 'text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/30',
        impact: 'Insight',
        impactColor: 'text-violet-400 bg-violet-500/10',
        desc: 'Compare your CRS, language, education, and work profile against successful candidates with similar backgrounds.',
        why: 'Knowing what it took for people like you helps set realistic expectations and targets.',
        page: '/tools',
        param: 'peers',
      },
    ],
  },
  {
    id: 'documents',
    label: '📄 Document Generators',
    subtitle: 'AI-drafted immigration documents',
    accent: 'rose',
    tools: [
      {
        id: 'transcript',
        label: 'Academic Transcript',
        icon: GraduationCap,
        color: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        impact: 'Document',
        impactColor: 'text-rose-400 bg-rose-500/10',
        desc: 'Generate a detailed academic transcript from your education profile — semester-by-semester with GPA, courses, and class standing.',
        why: 'Required for ECA (Educational Credential Assessment) applications and some PNP streams.',
        page: '/immigration-tools',
        param: 'transcript',
        external: true,
      },
      {
        id: 'work-letter',
        label: 'Work Experience Letter',
        icon: Briefcase,
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        impact: 'Document',
        impactColor: 'text-orange-400 bg-orange-500/10',
        desc: 'AI generates a fully IRCC-compliant reference letter with all 7 required fields: duties, hours, salary, NOC match, supervisor block.',
        why: 'IRCC rejects work letters that are missing required fields. AI ensures yours meets the standard.',
        page: '/immigration-tools',
        param: 'work-letter',
        external: true,
      },
      {
        id: 'letters',
        label: 'Explanation Letters',
        icon: FileText,
        color: 'text-pink-400',
        bg: 'bg-pink-500/10',
        border: 'border-pink-500/30',
        impact: 'Document',
        impactColor: 'text-pink-400 bg-pink-500/10',
        desc: 'AI-drafted explanation or cover letters for IRCC submissions — gaps in employment, travel history, name changes, and more.',
        why: 'IRCC often requests explanation letters. A well-written one can prevent a refusal.',
        page: '/tools',
        param: 'letters',
      },
    ],
  },
  {
    id: 'ircc',
    label: '🇨🇦 IRCC Application Assistant',
    subtitle: 'Stop re-typing the same data twice',
    accent: 'maple',
    tools: [
      {
        id: 'copy-sheet',
        label: 'Smart Copy Sheet',
        icon: ClipboardCopy,
        color: 'text-maple-400',
        bg: 'bg-maple-500/10',
        border: 'border-maple-500/30',
        impact: 'Time saver',
        impactColor: 'text-maple-400 bg-maple-500/10',
        desc: 'Your profile data formatted exactly as IRCC asks — field by field, in IRCC\'s order. Open IRCC in one tab, this in another, and read across.',
        why: 'Every field is pre-formatted: DOB as YYYY-MM-DD, CLB scores alongside raw scores, NOC codes, work dates — no reformatting.',
        page: '/ircc-assist',
      },
      {
        id: 'tracker',
        label: 'Application Progress Tracker',
        icon: ListChecks,
        color: 'text-teal-400',
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/30',
        impact: 'Stay on track',
        impactColor: 'text-teal-400 bg-teal-500/10',
        desc: 'Section-by-section checklist for both IRCC applications — Express Entry profile and post-ITA eAPR. Tracks what\'s done, in-progress, and blocked.',
        why: 'The eAPR has 8+ sections and a 60-day deadline. Knowing exactly what\'s left prevents last-minute scrambles.',
        page: '/ircc-assist',
      },
      {
        id: 'validator',
        label: 'AI Field Validator',
        icon: ShieldCheck,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        impact: 'Prevent rejection',
        impactColor: 'text-emerald-400 bg-emerald-500/10',
        desc: 'Runs 11 checks on your profile: language test expiry, CLB minimums, missing ECA, NOC codes, hours/week, name matching passport, and more.',
        why: 'IRCC rejections can cost months and fees. Most are avoidable — missing registration numbers, expired tests, part-time hours.',
        page: '/ircc-assist',
      },
    ],
  },
]

// ── Tool Card ─────────────────────────────────────────────────
function ToolCard({ tool, index }) {
  const Icon = tool.icon
  const [hovered, setHovered] = useState(false)
  const navigate = useNavigate()

  const handleClick = () => {
    if (tool.page === '/tools' && tool.param) {
      navigate(`/tools?tool=${tool.param}`)
    } else if (tool.page === '/immigration-tools' && tool.param) {
      navigate(`/immigration-tools?tab=${tool.param}`)
    } else {
      navigate(tool.page)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      className={clsx(
        'card cursor-pointer transition-all duration-200 border',
        hovered ? `${tool.border}` : 'border-slate-700/50'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', tool.bg)}>
          <Icon size={18} className={tool.color} />
        </div>
        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', tool.impactColor)}>
          {tool.impact}
        </span>
      </div>

      <h3 className="font-semibold text-white text-sm mb-1">{tool.label}</h3>
      <p className="text-xs text-slate-400 leading-relaxed mb-3">{tool.desc}</p>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 border-t border-slate-700/50 mb-3">
              <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                <Zap size={10} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <span><span className="text-amber-400 font-semibold">Why it matters: </span>{tool.why}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={clsx('flex items-center gap-1 text-xs font-semibold transition-colors', tool.color)}>
        Open tool <ArrowUpRight size={12} />
      </div>
    </motion.div>
  )
}

// ── Main ToolsHub ─────────────────────────────────────────────
export default function ToolsHub() {
  const [activeGroup, setActiveGroup] = useState(null)

  const visibleGroups = activeGroup
    ? TOOL_GROUPS.filter(g => g.id === activeGroup)
    : TOOL_GROUPS

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="section-title">Tools</h1>
          <p className="text-slate-400 text-sm mt-1">
            Everything you need to maximize your CRS score and get your ITA — ordered by impact
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-800/60 rounded-xl p-1 flex-wrap">
          <button
            onClick={() => setActiveGroup(null)}
            className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium transition-all',
              !activeGroup ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
            )}
          >All</button>
          {TOOL_GROUPS.map(g => (
            <button key={g.id}
              onClick={() => setActiveGroup(activeGroup === g.id ? null : g.id)}
              className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap',
                activeGroup === g.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              )}
            >{g.label.split(' ')[0]} {g.label.split(' ').slice(1).join(' ')}</button>
          ))}
        </div>
      </div>

      {/* "Start here" banner for first-time users */}
      <div className="rounded-2xl border border-maple-500/20 bg-gradient-to-r from-maple-500/5 to-transparent p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-maple-500/15 flex items-center justify-center flex-shrink-0">
          <Star size={18} className="text-maple-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">New here? Start with Score Simulator + Eligibility Check</p>
          <p className="text-xs text-slate-400 mt-0.5">These two tools will show you exactly where you stand and what to do first — takes 5 minutes.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link to="/tools?tool=simulator" className="btn-primary text-xs py-1.5 px-3">Score Simulator</Link>
          <Link to="/immigration-tools" className="btn-secondary text-xs py-1.5 px-3">Eligibility Check</Link>
        </div>
      </div>

      {/* Tool groups */}
      <AnimatePresence mode="wait">
        {visibleGroups.map((group, gi) => (
          <motion.section
            key={group.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: gi * 0.05 }}
          >
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="font-bold text-white">{group.label}</h2>
              <p className="text-xs text-slate-500">{group.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.tools.map((tool, ti) => (
                <ToolCard key={tool.id} tool={tool} index={gi * 3 + ti} />
              ))}
            </div>
          </motion.section>
        ))}
      </AnimatePresence>

    </div>
  )
}

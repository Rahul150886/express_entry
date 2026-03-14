import React from 'react'
// src/pages/DocumentsGenerator.jsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from 'react-query'
import {
  ShieldCheck, FileText, Briefcase, CheckCircle2, XCircle,
  AlertCircle, ChevronDown, ChevronRight, Loader2, Download,
  Copy, Check, RefreshCw, GraduationCap, Star, Clock, Zap
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { eligibilityAPI, documentsGeneratorAPI } from '../services/api'
import { useProfile } from '../hooks'

// ── Tab definitions ─────────────────────────
const TABS = [
  { id: 'eligibility',  label: 'Eligibility Check',       icon: ShieldCheck   },
  { id: 'transcript',   label: 'Academic Transcript',      icon: GraduationCap },
  { id: 'work-letter',  label: 'Work Experience Letter',   icon: Briefcase     },
]

// ── Shared helpers ──────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500">
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function LoadingCard({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-maple-500/20 border-t-maple-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={20} className="text-maple-400 animate-spin" style={{ animationDuration: '1.5s' }} />
        </div>
      </div>
      <p className="text-slate-400 text-sm">{message}</p>
    </div>
  )
}

// ══════════════════════════════════════════════
// 1. ELIGIBILITY CHECK
// ══════════════════════════════════════════════
function EligibilityCheck() {
  const [expanded, setExpanded] = useState({})

  const { data, isLoading, refetch, isFetching } = useQuery(
    'eligibility-check',
    () => eligibilityAPI.check().then(r => r.data),
    { staleTime: 5 * 60 * 1000, retry: 1 }
  )

  const toggle = (key) => setExpanded(s => ({ ...s, [key]: !s[key] }))

  const STATUS_CONFIG = {
    eligible: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Eligible' },
    not_yet_eligible: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Not Yet Eligible' },
  }

  const PROGRAM_INFO = {
    FSW: { full: 'Federal Skilled Worker', icon: '🌍', color: 'blue' },
    CEC: { full: 'Canadian Experience Class', icon: '🍁', color: 'teal' },
    FST: { full: 'Federal Skilled Trades', icon: '🔧', color: 'orange' },
  }

  if (isLoading || isFetching) return <LoadingCard message="Checking eligibility across all programs…" />

  if (!data) return (
    <div className="text-center py-16 space-y-3">
      <ShieldCheck size={40} className="mx-auto text-slate-600" />
      <p className="text-slate-400">Could not load eligibility data</p>
      <button onClick={refetch} className="btn-secondary text-sm">Try Again</button>
    </div>
  )

  const { programs, eligible_for, summary, roadmap, profile_snapshot } = data
  const overall = summary?.overall_status || 'not_yet_eligible'
  const statusCfg = STATUS_CONFIG[overall] || STATUS_CONFIG.not_yet_eligible
  const StatusIcon = statusCfg.icon

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Express Entry Eligibility</h2>
          <p className="text-slate-400 text-sm mt-1">Based on your current profile — update your profile to recalculate</p>
        </div>
        <button onClick={refetch} disabled={isFetching} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Recalculate
        </button>
      </div>

      {/* Overall status banner */}
      <div className={clsx('flex items-center gap-4 p-5 rounded-2xl border', statusCfg.bg)}>
        <StatusIcon size={36} className={statusCfg.color} />
        <div className="flex-1">
          <p className={clsx('text-xl font-bold', statusCfg.color)}>{statusCfg.label}</p>
          <p className="text-slate-300 text-sm mt-0.5">
            {eligible_for?.length > 0
              ? `Eligible for: ${eligible_for.join(', ')}`
              : 'You do not yet meet the minimum requirements for any Express Entry stream'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{summary?.passed}/{summary?.total_checks}</p>
          <p className="text-xs text-slate-500">criteria met</p>
        </div>
      </div>

      {/* Program cards */}
      <div className="space-y-3">
        {Object.entries(programs || {}).map(([code, prog]) => {
          const info = PROGRAM_INFO[code] || { full: code, icon: '📋', color: 'slate' }
          const isEligible = prog.eligible
          const passedCount = prog.checks.filter(c => c.met).length
          const isOpen = expanded[code]

          return (
            <div key={code} className={clsx('rounded-2xl border overflow-hidden',
              isEligible ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'
            )}>
              <button
                onClick={() => toggle(code)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-2xl">{info.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{code}</span>
                    <span className="text-xs text-slate-400">— {info.full}</span>
                    {isEligible
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">✓ Eligible</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">✗ Not Yet</span>
                    }
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {passedCount}/{prog.checks.length} requirements met
                    {code === 'FSW' && prog.selection_points !== undefined && (
                      <span className={clsx('ml-2 font-semibold', prog.selection_points >= 67 ? 'text-emerald-400' : 'text-red-400')}>
                        · {prog.selection_points}/100 selection pts {prog.selection_points >= 67 ? '✓' : `(need ${prog.selection_points_gap} more)`}
                      </span>
                    )}
                  </p>
                </div>
                {/* mini progress bar */}
                <div className="w-24 hidden sm:block">
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', isEligible ? 'bg-emerald-500' : 'bg-maple-500')}
                      style={{ width: `${(passedCount / prog.checks.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1 text-right">{Math.round((passedCount / prog.checks.length) * 100)}%</p>
                </div>
                {isOpen ? <ChevronDown size={16} className="text-slate-500 flex-shrink-0" /> : <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="border-t border-slate-700 overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      <p className="text-xs text-slate-500 mb-3">{prog.description}</p>
                      {prog.checks.map((c, i) => (
                        <div key={i} className={clsx('flex items-start gap-3 p-3 rounded-xl',
                          c.met ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-red-500/5 border border-red-500/20'
                        )}>
                          {c.met
                            ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                            : <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">{c.criterion}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold',
                                c.met ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                              )}>
                                You: {c.your_value}
                              </span>
                              <span className="text-xs text-slate-500">Required: {c.required}</span>
                            </div>

                            {/* FSW 67-point breakdown table */}
                            {c.breakdown && (
                              <div className="mt-3 rounded-lg overflow-hidden border border-slate-700">
                                <div className="bg-slate-800/60 px-3 py-1.5">
                                  <p className="text-xs font-semibold text-slate-300">FSW Selection Grid Breakdown</p>
                                </div>
                                <div className="divide-y divide-slate-700/50">
                                  {Object.entries(c.breakdown).map(([factor, value]) => (
                                    <div key={factor} className={clsx(
                                      'flex justify-between items-center px-3 py-1.5',
                                      factor === 'TOTAL' ? 'bg-slate-700/40 font-semibold' : ''
                                    )}>
                                      <span className={clsx('text-xs', factor === 'TOTAL' ? 'text-white' : 'text-slate-400')}>{factor}</span>
                                      <span className={clsx('text-xs font-mono', factor === 'TOTAL'
                                        ? (c.met ? 'text-emerald-400' : 'text-red-400')
                                        : 'text-slate-300'
                                      )}>{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {c.fix && (
                              <p className="text-xs text-amber-400 mt-2 flex items-start gap-1">
                                <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {c.fix}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* AI Roadmap */}
      {roadmap && (
        <div className="card space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Zap size={18} className="text-amber-400" /> AI Action Roadmap
          </h3>

          {roadmap.overall_assessment && (
            <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-maple-500 pl-3">{roadmap.overall_assessment}</p>
          )}

          {roadmap.fastest_path && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs font-semibold text-blue-400 mb-1">🚀 Fastest Path</p>
              <p className="text-sm text-slate-300">{roadmap.fastest_path}</p>
            </div>
          )}

          {roadmap.actions?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Priority Actions</p>
              {roadmap.actions.map((action, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                  <div className="w-7 h-7 rounded-full bg-maple-500/20 text-maple-400 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {action.priority}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{action.action}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={10} /> {action.timeline}</span>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full',
                        action.difficulty === 'Easy' ? 'bg-emerald-500/15 text-emerald-400' :
                        action.difficulty === 'Medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
                      )}>{action.difficulty}</span>
                      <span className="text-xs text-blue-400">{action.program_unlocked}</span>
                    </div>
                    {action.impact && <p className="text-xs text-slate-500 mt-1">{action.impact}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {roadmap.alternative_programs?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Also Consider</p>
              {roadmap.alternative_programs.map((alt, i) => (
                <div key={i} className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <p className="text-sm font-medium text-purple-300">{alt.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{alt.why_consider}</p>
                  {alt.requirement && <p className="text-xs text-slate-500 mt-1">Requirement: {alt.requirement}</p>}
                </div>
              ))}
            </div>
          )}

          {roadmap.encouragement && (
            <p className="text-sm text-emerald-400 italic text-center">{roadmap.encouragement}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
// 2. ACADEMIC TRANSCRIPT
// ══════════════════════════════════════════════
function AcademicTranscript() {
  const { data: profile } = useProfile()
  const [extraContext, setExtraContext] = useState('')
  const [transcript, setTranscript] = useState(null)
  const [expandedSem, setExpandedSem] = useState(0)

  const generate = useMutation(
    () => documentsGeneratorAPI.generateTranscript(extraContext).then(r => r.data),
    {
      onSuccess: (data) => { setTranscript(data); toast.success('Transcript generated!') },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Generation failed')
    }
  )

  const edu = profile?.education
  if (!edu) return (
    <div className="text-center py-16 space-y-3">
      <GraduationCap size={40} className="mx-auto text-slate-600" />
      <p className="text-slate-300 font-medium">No education record found</p>
      <p className="text-slate-500 text-sm">Complete your education profile first</p>
    </div>
  )

  const gradeColor = (g) => {
    if (!g) return 'text-slate-400'
    const first = g[0]
    if (first === 'A') return 'text-emerald-400'
    if (first === 'B') return 'text-blue-400'
    return 'text-amber-400'
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Academic Transcript Generator</h2>
        <p className="text-slate-400 text-sm mt-1">Generates a formal academic transcript from your education profile for IRCC/ECA purposes</p>
      </div>

      {/* Education summary */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">From Your Profile</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Institution', value: edu.institution_name || '—' },
            { label: 'Field of Study', value: edu.field_of_study || '—' },
            { label: 'Level', value: edu.level?.replace(/_/g, ' ') || '—' },
            { label: 'Country', value: edu.country || '—' },
            { label: 'Completion', value: edu.completion_date || '—' },
            { label: 'Duration', value: edu.is_three_year_or_more ? '3+ years' : '< 3 years' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-xs text-slate-500">{f.label}</p>
              <p className="text-sm font-medium text-white capitalize">{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Optional context */}
      <div className="card space-y-2">
        <label className="text-sm font-medium text-white">Additional Context (optional)</label>
        <textarea
          className="input w-full h-20 text-sm resize-none"
          placeholder="e.g. Honours program, specialisation, thesis topic, GPA if known…"
          value={extraContext}
          onChange={e => setExtraContext(e.target.value)}
        />
      </div>

      <button
        onClick={() => generate.mutate()}
        disabled={generate.isLoading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {generate.isLoading
          ? <><Loader2 size={16} className="animate-spin" /> Generating Transcript…</>
          : <><GraduationCap size={16} /> Generate Academic Transcript</>
        }
      </button>

      {generate.isLoading && <LoadingCard message="AI is generating your academic transcript…" />}

      {/* Generated transcript */}
      {transcript && !generate.isLoading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Header */}
          <div className="card bg-slate-900 border-slate-600 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">{transcript.student?.institution}</h3>
                <p className="text-sm text-slate-400">Official Academic Transcript</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Transcript No.</p>
                <p className="text-sm font-mono text-maple-400">{transcript.transcript_number}</p>
              </div>
            </div>
            <div className="h-px bg-slate-700" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><p className="text-xs text-slate-500">Student Name</p><p className="text-sm font-bold text-white">{transcript.student?.name}</p></div>
              <div><p className="text-xs text-slate-500">Student ID</p><p className="text-sm font-mono text-white">{transcript.student?.student_id}</p></div>
              <div><p className="text-xs text-slate-500">Date of Birth</p><p className="text-sm text-white">{transcript.student?.date_of_birth}</p></div>
              <div><p className="text-xs text-slate-500">Program</p><p className="text-sm text-white">{transcript.student?.program}</p></div>
              <div><p className="text-xs text-slate-500">Degree</p><p className="text-sm text-white">{transcript.student?.degree}</p></div>
              <div><p className="text-xs text-slate-500">Status</p><p className="text-sm text-emerald-400 font-medium">{transcript.student?.status}</p></div>
              <div><p className="text-xs text-slate-500">Enrollment</p><p className="text-sm text-white">{transcript.student?.enrollment_start} — {transcript.student?.enrollment_end}</p></div>
              <div><p className="text-xs text-slate-500">Country</p><p className="text-sm text-white">{transcript.student?.country}</p></div>
              <div><p className="text-xs text-slate-500">Issue Date</p><p className="text-sm text-white">{transcript.issue_date}</p></div>
            </div>
          </div>

          {/* Semesters */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Course History</p>
            {(transcript.semesters || []).map((sem, si) => (
              <div key={si} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedSem(expandedSem === si ? -1 : si)}
                  className="w-full flex items-center justify-between p-0 pb-0 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">{sem.name}</span>
                    <span className="text-xs text-slate-500">{sem.courses?.length} courses • {sem.credits_earned} credits</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx('text-sm font-bold', sem.gpa >= 3.5 ? 'text-emerald-400' : sem.gpa >= 3.0 ? 'text-blue-400' : 'text-amber-400')}>
                      GPA {sem.gpa?.toFixed(2)}
                    </span>
                    {expandedSem === si ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                  </div>
                </button>
                <AnimatePresence>
                  {expandedSem === si && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden mt-3"
                    >
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left text-slate-500 pb-1.5 font-medium">Code</th>
                            <th className="text-left text-slate-500 pb-1.5 font-medium">Course Title</th>
                            <th className="text-right text-slate-500 pb-1.5 font-medium">Credits</th>
                            <th className="text-right text-slate-500 pb-1.5 font-medium">Grade</th>
                            <th className="text-right text-slate-500 pb-1.5 font-medium">Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sem.courses?.map((c, ci) => (
                            <tr key={ci} className="border-b border-slate-800">
                              <td className="py-1.5 font-mono text-slate-400">{c.code}</td>
                              <td className="py-1.5 text-white">{c.title}</td>
                              <td className="py-1.5 text-right text-slate-400">{c.credits}</td>
                              <td className={clsx('py-1.5 text-right font-bold', gradeColor(c.grade))}>{c.grade}</td>
                              <td className="py-1.5 text-right text-slate-400">{c.grade_points?.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Summary */}
          {transcript.summary && (
            <div className="card bg-slate-900 space-y-3">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Academic Summary</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-xl bg-slate-800">
                  <p className="text-2xl font-bold text-emerald-400">{transcript.summary.cumulative_gpa?.toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">Cumulative GPA</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-slate-800">
                  <p className="text-2xl font-bold text-blue-400">{transcript.summary.total_credits}</p>
                  <p className="text-xs text-slate-500 mt-1">Total Credits</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-slate-800 col-span-2 sm:col-span-1">
                  <p className="text-sm font-bold text-maple-400">{transcript.summary.class_standing}</p>
                  <p className="text-xs text-slate-500 mt-1">Class Standing</p>
                </div>
              </div>
              {transcript.summary.honours && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Star size={16} className="text-amber-400" />
                  <p className="text-sm text-amber-300 font-medium">{transcript.summary.honours}</p>
                </div>
              )}
              <div className="text-xs text-slate-500 space-y-1">
                <p>Degree Awarded: <span className="text-slate-300">{transcript.summary.degree_awarded}</span></p>
                <p>Date Awarded: <span className="text-slate-300">{transcript.summary.date_awarded}</span></p>
                <p>Grading Scale: <span className="text-slate-300">{transcript.summary.grading_scale}</span></p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="card bg-blue-500/5 border-blue-500/20 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-blue-400 font-medium">Verification Code</p>
                <p className="text-sm font-mono text-white">{transcript.verification_code}</p>
              </div>
              <CopyButton text={JSON.stringify(transcript, null, 2)} />
            </div>
            <p className="text-xs text-slate-500">{transcript.registrar_note}</p>
            <p className="text-xs text-amber-400">⚠ This is an AI-generated transcript for reference and preparation purposes. For official immigration applications, obtain an official transcript directly from your institution.</p>
          </div>

          {/* Regenerate */}
          <button onClick={() => generate.mutate()} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
            <RefreshCw size={14} /> Regenerate
          </button>
        </motion.div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
// 3. WORK EXPERIENCE LETTER
// ══════════════════════════════════════════════
function WorkExperienceLetter() {
  const { data: profile } = useProfile()
  const [selectedWork, setSelectedWork] = useState(null)
  const [extraContext, setExtraContext] = useState('')
  const [letter, setLetter] = useState(null)

  const works = profile?.work_experiences || []

  const generate = useMutation(
    () => documentsGeneratorAPI.generateWorkLetter(selectedWork, extraContext).then(r => r.data),
    {
      onSuccess: (data) => { setLetter(data); toast.success('Letter generated!') },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Generation failed')
    }
  )

  const TEER_COLORS = { '0': 'blue', '1': 'teal', '2': 'green', '3': 'amber', '4': 'orange', '5': 'red' }
  const EXP_BADGE = { canadian: 'bg-maple-500/20 text-maple-400', foreign: 'bg-blue-500/20 text-blue-400' }

  if (works.length === 0) return (
    <div className="text-center py-16 space-y-3">
      <Briefcase size={40} className="mx-auto text-slate-600" />
      <p className="text-slate-300 font-medium">No work experience found</p>
      <p className="text-slate-500 text-sm">Add work experience in your Profile first</p>
    </div>
  )

  const formatDate = (d) => {
    if (!d) return 'Present'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const selectedWorkData = works.find(w => w.id === selectedWork)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Work Experience Letter Generator</h2>
        <p className="text-slate-400 text-sm mt-1">Generates an IRCC-compliant employment reference letter with all required fields</p>
      </div>

      {/* Work selection */}
      <div className="card space-y-3">
        <p className="text-sm font-medium text-white">Select Work Experience</p>
        <div className="space-y-2">
          {works.map(w => (
            <button
              key={w.id}
              onClick={() => { setSelectedWork(w.id); setLetter(null) }}
              className={clsx('w-full text-left p-4 rounded-xl border transition-all',
                selectedWork === w.id
                  ? 'border-maple-500 bg-maple-500/10'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-white">{w.job_title || 'Unknown Role'}</p>
                  <p className="text-sm text-slate-400">{w.employer_name}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full', EXP_BADGE[w.experience_type] || 'bg-slate-700 text-slate-400')}>
                      {w.experience_type?.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500">NOC {w.noc_code}</span>
                    <span className="text-xs text-slate-500">TEER {w.teer_level}</span>
                    <span className="text-xs text-slate-500">{formatDate(w.start_date)} — {w.is_current ? 'Present' : formatDate(w.end_date)}</span>
                  </div>
                </div>
                {selectedWork === w.id && <CheckCircle2 size={20} className="text-maple-400 flex-shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Extra context */}
      <div className="card space-y-2">
        <label className="text-sm font-medium text-white">Additional Context (optional)</label>
        <textarea
          className="input w-full h-20 text-sm resize-none"
          placeholder="e.g. supervisor name, salary, specific duties, promotion history, reason for leaving…"
          value={extraContext}
          onChange={e => setExtraContext(e.target.value)}
        />
      </div>

      <button
        onClick={() => generate.mutate()}
        disabled={!selectedWork || generate.isLoading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {generate.isLoading
          ? <><Loader2 size={16} className="animate-spin" /> Generating Letter…</>
          : <><FileText size={16} /> Generate Work Experience Letter</>
        }
      </button>

      {generate.isLoading && <LoadingCard message="AI is generating your employment reference letter…" />}

      {/* Generated letter */}
      {letter && !generate.isLoading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Letterhead */}
          <div className="card bg-slate-900 border-slate-600 space-y-4">
            {/* Company header */}
            <div className="border-b-2 border-slate-600 pb-4">
              <p className="text-lg font-bold text-white">{letter.company?.name}</p>
              <p className="text-sm text-slate-400">{letter.company?.address}</p>
              <p className="text-sm text-slate-400">{letter.company?.city_province} {letter.company?.postal_code}</p>
              <div className="flex gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                <span>📞 {letter.company?.phone}</span>
                <span>✉ {letter.company?.email}</span>
                <span>🌐 {letter.company?.website}</span>
              </div>
            </div>

            {/* Date + subject */}
            <div>
              <p className="text-sm text-slate-400">{letter.letter_date}</p>
              <p className="text-sm font-bold text-white mt-2">{letter.subject}</p>
            </div>

            <p className="text-sm text-slate-300">{letter.salutation}</p>
            <p className="text-sm text-slate-300 leading-relaxed">{letter.opening_paragraph}</p>

            {/* Employment details table */}
            {letter.employment_details && (
              <div className="p-4 rounded-xl bg-slate-800 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Employment Details</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {Object.entries({
                    'Employee Name': letter.employment_details.employee_name,
                    'Job Title': letter.employment_details.job_title,
                    'Department': letter.employment_details.department,
                    'Employment Type': letter.employment_details.employment_type,
                    'Start Date': letter.employment_details.start_date,
                    'End Date': letter.employment_details.end_date,
                    'Hours per Week': `${letter.employment_details.hours_per_week} hours`,
                    'Annual Salary': `${letter.employment_details.annual_salary} ${letter.employment_details.currency || ''}`,
                  }).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-slate-500">{k}: </span>
                      <span className="text-white font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duties */}
            {letter.duties?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-white mb-2">Primary Duties and Responsibilities:</p>
                <ul className="space-y-1.5">
                  {letter.duties.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-maple-400 font-bold flex-shrink-0">•</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-slate-300 leading-relaxed">{letter.closing_paragraph}</p>

            {/* Signature block */}
            {letter.supervisor && (
              <div className="border-t border-slate-700 pt-4 space-y-1">
                <p className="text-sm font-bold text-white">{letter.supervisor.name}</p>
                <p className="text-sm text-slate-400">{letter.supervisor.title}</p>
                <p className="text-sm text-slate-400">{letter.company?.name}</p>
                <p className="text-xs text-slate-500 mt-1">{letter.supervisor.phone} • {letter.supervisor.email}</p>
                <div className="mt-3 w-32 h-8 border-b border-slate-600" />
                <p className="text-xs text-slate-500">Signature</p>
              </div>
            )}
          </div>

          {/* IRCC compliance notes */}
          <div className="card bg-emerald-500/5 border-emerald-500/20 space-y-2">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">IRCC Compliance</p>
            {letter.ircc_note && <p className="text-xs text-slate-400">{letter.ircc_note}</p>}
            {letter.noc_confirmation && <p className="text-xs text-slate-400">{letter.noc_confirmation}</p>}
            <div className="flex gap-2 pt-1">
              <CopyButton text={[
                letter.company?.name, letter.company?.address,
                letter.letter_date, letter.subject, letter.salutation,
                letter.opening_paragraph,
                Object.entries(letter.employment_details || {}).map(([k,v]) => `${k}: ${v}`).join('\n'),
                'Duties:\n' + letter.duties?.map(d => `• ${d}`).join('\n'),
                letter.closing_paragraph,
                letter.supervisor?.name, letter.supervisor?.title,
              ].filter(Boolean).join('\n\n')} />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400">⚠ This letter is AI-generated for reference purposes. For actual IRCC submission, have your employer issue an official letter on company letterhead with a real signature and stamp.</p>
          </div>

          <button onClick={() => { generate.mutate() }} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
            <RefreshCw size={14} /> Regenerate Letter
          </button>
        </motion.div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════
export default function DocumentsGenerator() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'eligibility'
  const [activeTab, setActiveTab] = useState(initialTab)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Immigration Tools</h1>
        <p className="text-slate-400 text-sm mt-1">Eligibility check, document generation, and application prep</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 p-1 rounded-2xl bg-slate-800/60 border border-slate-700">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all',
                active ? 'bg-maple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'
              )}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}
        >
          {activeTab === 'eligibility'  && <EligibilityCheck />}
          {activeTab === 'transcript'   && <AcademicTranscript />}
          {activeTab === 'work-letter'  && <WorkExperienceLetter />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

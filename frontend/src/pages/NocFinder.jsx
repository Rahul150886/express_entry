import React from 'react'
// src/pages/NocFinder.jsx

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useMutation } from 'react-query'
import { aiAPI } from '../services/api'
import log from '../services/logger'
import clsx from 'clsx'

const TEER_COLORS = { 0: 'badge-maple', 1: 'badge-blue', 2: 'badge-green', 3: 'badge-yellow', 4: 'badge-slate', 5: 'badge-slate' }
const TEER_LABELS = { 0: 'Management', 1: 'University', 2: 'College/Apprenticeship', 3: 'College/Training', 4: 'HS/OJT', 5: 'Little/No Formal Training' }

function NocCard({ suggestion, rank }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={clsx('card border', rank === 0 ? 'border-maple-500/40' : 'border-slate-700')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0', rank === 0 ? 'bg-maple-500 text-white' : 'bg-slate-700 text-slate-300')}>
            {rank + 1}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-maple-400 font-bold text-sm">{suggestion.noc_code}</span>
              <span className={TEER_COLORS[suggestion.teer_level]}>TEER {suggestion.teer_level}</span>
              {suggestion.eligible_for_express_entry
                ? <span className="badge-green"><CheckCircle2 size={11} /> Express Entry Eligible</span>
                : <span className="badge-slate"><XCircle size={11} /> Not EE Eligible</span>
              }
            </div>
            <h3 className="font-semibold text-white mt-1">{suggestion.noc_title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{TEER_LABELS[suggestion.teer_level]}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-2xl font-display font-bold text-white">{Math.round(suggestion.match_confidence * 100)}%</p>
            <p className="text-xs text-slate-500">match</p>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="btn-ghost text-xs px-2 py-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Details
          </button>
        </div>
      </div>

      <div className="progress-bar mt-3">
        <div className="progress-fill" style={{ width: `${suggestion.match_confidence * 100}%` }} />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">Why this NOC fits:</p>
                <p className="text-sm text-slate-300">{suggestion.explanation}</p>
              </div>
              {suggestion.key_duties_matched?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-1">Matched duties:</p>
                  <ul className="space-y-1">
                    {suggestion.key_duties_matched.map((duty, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-1">
                        <span className="text-emerald-400 mt-0.5">✓</span> {duty}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {suggestion.eligible_program && (
                <div className="flex gap-2">
                  <span className="text-xs text-slate-400">Eligible program:</span>
                  <span className="text-xs text-maple-400 font-medium">{suggestion.eligible_program}</span>
                </div>
              )}
              {suggestion.typical_clb_required && (
                <div className="flex gap-2">
                  <span className="text-xs text-slate-400">Min CLB required:</span>
                  <span className="text-xs text-white font-medium">CLB {suggestion.typical_clb_required}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function NocFinder() {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm()

  const findNoc = useMutation(data => aiAPI.findNoc(data).then(r => r.data))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Sparkles size={24} className="text-maple-400" /> NOC Code Finder
        </h1>
        <p className="text-slate-400 text-sm mt-1">AI matches your job to Canadian NOC 2021 codes for Express Entry eligibility</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit(d => findNoc.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Job Title</label>
              <input className="input" placeholder="e.g. Software Developer" {...register('job_title', { required: true })} />
            </div>
            <div>
              <label className="label">Country (Optional)</label>
              <input className="input" placeholder="e.g. India" {...register('country')} />
            </div>
          </div>
          <div>
            <label className="label">Job Duties (be specific — the more detail, the better the match)</label>
            <textarea
              className="input min-h-[120px] resize-y"
              placeholder="Describe your main job responsibilities, tools used, and typical tasks. Example: Design and develop web applications using React and Node.js, conduct code reviews, mentor junior developers, participate in agile ceremonies..."
              {...register('job_duties', { required: true })}
            />
          </div>
          <button type="submit" disabled={findNoc.isLoading} className="btn-primary">
            {findNoc.isLoading ? <><Loader2 size={18} className="animate-spin" /> Analyzing...</> : <><Search size={18} /> Find NOC Codes</>}
          </button>
        </form>
      </div>

      {/* Results */}
      {findNoc.isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 shimmer rounded-2xl" />)}
        </div>
      )}

      {findNoc.data?.suggestions?.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-white">Top NOC Matches</h3>
          {findNoc.data.suggestions.map((s, i) => <NocCard key={s.noc_code} suggestion={s} rank={i} />)}
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
            <strong className="text-white">Important:</strong> Always verify your NOC code on the official{' '}
            <a href="https://noc.esdc.gc.ca" target="_blank" rel="noopener noreferrer" className="text-maple-400 hover:underline">ESDC NOC website</a>.
            Using the wrong NOC can result in application refusal.
          </div>
        </div>
      )}
    </div>
  )
}

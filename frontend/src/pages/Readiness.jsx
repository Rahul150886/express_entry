import React from 'react'
// src/pages/Readiness.jsx
// Application Readiness Report — consolidates CRS, eligibility, documents
// The "can I apply?" answer in one screen

import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronRight,
  Upload, Chrome, ExternalLink, Bot, Zap, ShieldCheck,
  FileText, TrendingUp, Loader2, RefreshCw, Sparkles
} from 'lucide-react'
import { useQuery } from 'react-query'
import { useProfile, useCrs, useDraws } from '../hooks'
import { eligibilityAPI, documentsAPI } from '../services/api'
import clsx from 'clsx'

const DOC_REQUIREMENTS = [
  { type: 'passport',             label: 'Passport',                required: true  },
  { type: 'language_test_result', label: 'Language Test Result',   required: true  },
  { type: 'education_credential', label: 'Education Certificate',  required: true  },
  { type: 'employment_letter',    label: 'Employment Letter',       required: true  },
  { type: 'eca_report',           label: 'ECA Report',             required: true  },
  { type: 'police_certificate',   label: 'Police Certificate',     required: false },
  { type: 'medical_exam',         label: 'Medical Exam',           required: false },
]

function StatusIcon({ status }) {
  if (status === 'ok')      return <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
  if (status === 'warning') return <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
  if (status === 'error')   return <XCircle size={16} className="text-red-400 flex-shrink-0" />
  return <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex-shrink-0" />
}

function CheckRow({ label, status, detail, link, linkLabel }) {
  return (
    <div className={clsx(
      'flex items-start gap-3 p-3 rounded-xl border transition-colors',
      status === 'ok'      && 'border-emerald-500/20 bg-emerald-500/5',
      status === 'warning' && 'border-amber-500/20 bg-amber-500/5',
      status === 'error'   && 'border-red-500/20 bg-red-500/5',
      !status              && 'border-slate-800 bg-slate-800/20',
    )}>
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        {detail && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{detail}</p>}
      </div>
      {link && (
        <Link to={link} className="text-xs text-maple-400 hover:text-maple-300 flex items-center gap-1 flex-shrink-0 transition-colors">
          {linkLabel || 'Fix'} <ChevronRight size={10} />
        </Link>
      )}
    </div>
  )
}

export default function Readiness() {
  const { data: profile, isLoading: loadingProfile } = useProfile()
  const { crsScore, isLoading: loadingCrs } = useCrs()
  const { data: draws } = useDraws()

  const { data: eligibility, isLoading: loadingElig } = useQuery(
    'eligibility',
    () => eligibilityAPI.check().then(r => r.data),
    { enabled: !!profile, staleTime: 5 * 60 * 1000 }
  )

  const { data: documents = [], isLoading: loadingDocs } = useQuery(
    'documents',
    () => documentsAPI.list().then(r => r.data),
    { staleTime: 60 * 1000 }
  )

  const isLoading = loadingProfile || loadingCrs || loadingElig || loadingDocs

  // Computed states
  const score = crsScore || profile?.crs_score_json?.total || 0
  const latestDraw = draws?.[0]
  const gapToDraw = latestDraw ? latestDraw.minimum_crs - score : null

  // API returns {FSW: {...}, CEC: {...}, FST: {...}} at top level
  const programs = eligibility?.programs || {
    FSW: eligibility?.FSW,
    CEC: eligibility?.CEC,
    FST: eligibility?.FST,
  }
  const cleanPrograms = Object.fromEntries(Object.entries(programs).filter(([,v]) => v !== undefined))
  const isEligible    = Object.values(cleanPrograms).some(p => p?.eligible)
  const fswEligible   = cleanPrograms?.FSW?.eligible
  const cecEligible   = cleanPrograms?.CEC?.eligible

  // Document analysis
  const uploadedTypes = new Set(documents.map(d => d.document_type))
  const docIssues = documents.filter(d => (d.ai_issues || []).length > 0 || d.status === 'rejected')
  const aiProcessed = documents.filter(d => ['ai_reviewed', 'verified', 'rejected'].includes(d.status))
  const allAiDone = documents.length > 0 && aiProcessed.length === documents.length

  // Overall readiness verdict
  const profileOk   = !!(profile?.full_name && score > 0)
  const eligibleOk  = isEligible
  const docsOk      = DOC_REQUIREMENTS.filter(d => d.required).every(d => uploadedTypes.has(d.type))
  const aiOk        = allAiDone && docIssues.length === 0
  const readyToApply = profileOk && eligibleOk && docsOk && aiOk

  const readinessScore = [profileOk, eligibleOk, docsOk, aiOk].filter(Boolean).length

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-64">
      <Loader2 size={24} className="animate-spin text-maple-400" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="section-title">Application Readiness</h1>
        <p className="text-slate-400 text-sm mt-1">
          Your complete readiness check — everything you need before starting your IRCC application.
        </p>
      </div>

      {/* Verdict card */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className={clsx(
          'p-6 rounded-2xl border',
          readyToApply
            ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent'
            : readinessScore >= 3
            ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent'
            : 'border-slate-700 bg-slate-800/30'
        )}
      >
        <div className="flex items-start gap-4">
          <div className={clsx(
            'w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl',
            readyToApply ? 'bg-emerald-500/20' : readinessScore >= 3 ? 'bg-amber-500/10' : 'bg-slate-700'
          )}>
            {readyToApply ? '✅' : readinessScore >= 3 ? '⚡' : '📋'}
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold text-white">
              {readyToApply
                ? 'Ready to Apply!'
                : readinessScore >= 3
                ? 'Almost Ready'
                : 'Not Ready Yet'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {readyToApply
                ? 'All checks passed. You can start your IRCC application now.'
                : `${readinessScore}/4 requirements met. Complete the remaining steps below.`}
            </p>
          </div>
          {/* Readiness meter */}
          <div className="text-center flex-shrink-0">
            <p className={clsx('text-3xl font-black', readyToApply ? 'text-emerald-400' : 'text-white')}>
              {readinessScore}<span className="text-slate-500 text-lg">/4</span>
            </p>
            <p className="text-[10px] text-slate-500">checks done</p>
          </div>
        </div>

        {readyToApply && (
          <div className="flex gap-3 mt-5">
            <a
              href="https://onlineservices-servicesenligne.cic.gc.ca/eapp/eapp?modifyCaller=PAQ"
              target="_blank" rel="noopener noreferrer"
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <ExternalLink size={14} /> Start IRCC Application
            </a>
            <Link to="/application" className="btn-secondary flex items-center gap-2 text-sm">
              <Chrome size={14} /> Extension Setup Guide
            </Link>
          </div>
        )}
      </motion.div>

      {/* ── Check 1: Profile & CRS ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            profileOk ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
          )}>
            {profileOk ? <Check size={12} /> : '1'}
          </div>
          <p className="font-bold text-white">Profile & CRS Score</p>
        </div>

        <CheckRow
          label="Profile complete"
          status={profile?.full_name ? 'ok' : 'error'}
          detail={profile?.full_name ? `${profile.full_name} — all basic info saved` : 'Complete your profile with name, DOB, citizenship'}
          link={!profile?.full_name ? '/profile' : undefined}
          linkLabel="Complete"
        />
        <CheckRow
          label="CRS Score calculated"
          status={score > 0 ? 'ok' : 'error'}
          detail={score > 0 ? `Your score: ${score} CRS points` : 'Calculate your CRS score to proceed'}
          link={score === 0 ? '/profile' : undefined}
          linkLabel="Calculate"
        />
        {score > 0 && latestDraw && (
          <CheckRow
            label="Score vs latest draw cutoff"
            status={gapToDraw <= 0 ? 'ok' : gapToDraw <= 20 ? 'warning' : 'error'}
            detail={gapToDraw <= 0
              ? `✓ ${Math.abs(gapToDraw)} pts above the latest draw cutoff (${latestDraw.minimum_crs})`
              : `${gapToDraw} pts below cutoff — consider PNP nomination or score improvements`}
            link={gapToDraw > 0 ? '/tools' : undefined}
            linkLabel="Boost Score"
          />
        )}
      </div>

      {/* ── Check 2: Eligibility ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            eligibleOk ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
          )}>
            {eligibleOk ? <Check size={12} /> : '2'}
          </div>
          <p className="font-bold text-white">Eligibility</p>
        </div>

        {Object.entries(cleanPrograms).map(([code, prog]) => (
          <CheckRow
            key={code}
            label={prog.name || code.replace(/_/g, ' ').toUpperCase()}
            status={prog.eligible ? 'ok' : 'error'}
            detail={prog.eligible
              ? `Eligible — ${prog.reason || 'meets all requirements'}`
              : prog.reason || 'Does not meet minimum requirements'}
            link={!prog.eligible ? '/immigration-tools' : undefined}
            linkLabel="Details"
          />
        ))}
        {Object.keys(cleanPrograms).length === 0 && (
          <CheckRow
            label="Eligibility not checked"
            status="error"
            detail="Run the eligibility check to see which programs you qualify for"
            link="/immigration-tools"
            linkLabel="Check Now"
          />
        )}
      </div>

      {/* ── Check 3: Documents ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            docsOk ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
          )}>
            {docsOk ? <Check size={12} /> : '3'}
          </div>
          <p className="font-bold text-white">Required Documents</p>
        </div>

        {DOC_REQUIREMENTS.map(req => {
          const uploaded = uploadedTypes.has(req.type)
          const doc = documents.find(d => d.document_type === req.type)
          const hasIssues = doc && (doc.ai_issues || []).length > 0
          return (
            <CheckRow
              key={req.type}
              label={req.label}
              status={uploaded ? (hasIssues ? 'warning' : 'ok') : req.required ? 'error' : null}
              detail={uploaded
                ? hasIssues
                  ? `⚠ ${doc.ai_issues.length} AI-detected issue${doc.ai_issues.length > 1 ? 's' : ''} — review before applying`
                  : 'Uploaded and verified'
                : req.required ? 'Required — upload in Documents' : 'Optional'}
              link={!uploaded ? '/documents' : hasIssues ? '/documents' : undefined}
              linkLabel={!uploaded ? 'Upload' : 'Review'}
            />
          )
        })}
      </div>

      {/* ── Check 4: AI Document Check ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            aiOk ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
          )}>
            {aiOk ? <Check size={12} /> : '4'}
          </div>
          <div className="flex items-center gap-2">
            <p className="font-bold text-white">AI Document Analysis</p>
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-maple-500/10 text-maple-400 border border-maple-500/20">
              <Sparkles size={8} /> AI Powered
            </span>
          </div>
        </div>

        <CheckRow
          label="AI analysis complete"
          status={documents.length === 0 ? 'error' : allAiDone ? 'ok' : 'warning'}
          detail={documents.length === 0
            ? 'Upload documents first — AI analysis runs automatically'
            : allAiDone
            ? `All ${documents.length} documents analysed by Azure Document Intelligence`
            : `${documents.length - aiProcessed.length} document${documents.length - aiProcessed.length !== 1 ? 's' : ''} still processing — check back shortly`}
          link={documents.length === 0 ? '/documents' : undefined}
          linkLabel="Upload"
        />

        {docIssues.length > 0 && (
          <CheckRow
            label={`${docIssues.length} document${docIssues.length > 1 ? 's' : ''} with issues`}
            status="warning"
            detail={`AI found potential issues in: ${docIssues.map(d => d.document_type?.replace(/_/g, ' ')).join(', ')}. Review before submitting.`}
            link="/documents"
            linkLabel="Review"
          />
        )}

        {allAiDone && docIssues.length === 0 && documents.length > 0 && (
          <CheckRow
            label="All documents verified"
            status="ok"
            detail="No issues detected by AI — documents look good"
          />
        )}
      </div>

      {/* Next action */}
      {!readyToApply && (
        <div className="p-4 rounded-2xl border border-maple-500/20 bg-maple-500/5">
          <p className="text-sm font-semibold text-white mb-1">Your next action</p>
          <p className="text-xs text-slate-400">
            {!profileOk ? 'Complete your profile and calculate your CRS score.' :
             !eligibleOk ? 'You are not yet eligible. Use the Score Simulator to find the fastest path.' :
             !docsOk ? 'Upload your missing required documents.' :
             !aiOk ? 'Wait for AI analysis to complete, then fix any flagged issues.' :
             'All done — start your IRCC application!'}
          </p>
          <Link
            to={!profileOk ? '/profile' : !eligibleOk ? '/tools' : !docsOk || !aiOk ? '/documents' : '/application'}
            className="btn-primary text-xs mt-3 inline-flex items-center gap-1.5"
          >
            Take action <ChevronRight size={12} />
          </Link>
        </div>
      )}
    </div>
  )
}

// Tiny check icon helper
function Check({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
import React from 'react'
// src/components/ApplicationWorkflow.jsx
// Form 1 "Start My Application" wizard — embedded in Documents page
// Steps: Check → Upload Missing → Validate → Download PDF

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useDropzone } from 'react-dropzone'
import {
  Rocket, CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  Upload, Loader2, FileDown, Bot, ShieldCheck, RefreshCw,
  User, FileText, ChevronDown, ChevronUp, Eye, Sparkles,
  ExternalLink, ListChecks, Clock, ArrowRight, Info, Check,
  AlertCircle
} from 'lucide-react'
import { applicationAPI, documentsAPI, irccPdfAPI } from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Step definitions ──────────────────────────────────────────
const STEPS = [
  { id: 'check',    label: 'Readiness Check',    icon: ShieldCheck },
  { id: 'upload',   label: 'Upload Missing Docs', icon: Upload      },
  { id: 'validate', label: 'Validate Documents',  icon: Bot         },
  { id: 'download', label: 'Download PDF',        icon: FileDown    },
]

// ── Tiny helpers ──────────────────────────────────────────────
const Pill = ({ ok, warn, children }) => (
  <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',
    ok   ? 'bg-emerald-500/15 text-emerald-400' :
    warn ? 'bg-amber-500/15 text-amber-400' :
           'bg-red-500/15 text-red-400'
  )}>{children}</span>
)

function StepBar({ current }) {
  const currentIdx = STEPS.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const done   = i < currentIdx
        const active = i === currentIdx
        const Icon   = step.icon
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                done   ? 'bg-emerald-500 border-emerald-500'   :
                active ? 'bg-maple-500 border-maple-500 shadow-lg shadow-maple-500/30' :
                         'bg-slate-800 border-slate-700'
              )}>
                {done
                  ? <Check size={14} className="text-white" />
                  : <Icon size={14} className={active ? 'text-white' : 'text-slate-500'} />
                }
              </div>
              <p className={clsx('text-[10px] font-semibold whitespace-nowrap hidden sm:block',
                active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-600'
              )}>{step.label}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mx-1 mb-4', done ? 'bg-emerald-500' : 'bg-slate-800')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Readiness Check ───────────────────────────────────
function ProfileCheck({ item }) {
  return (
    <div className={clsx('flex items-start gap-3 p-3 rounded-xl border',
      item.ok
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : 'border-red-500/20 bg-red-500/5'
    )}>
      {item.ok
        ? <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
        : <XCircle      size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{item.field}</p>
        {item.fix && <p className="text-xs text-red-300 mt-0.5">{item.fix}</p>}
      </div>
    </div>
  )
}

function DocPresenceRow({ doc }) {
  return (
    <div className={clsx('flex items-center gap-3 p-3 rounded-xl border',
      doc.uploaded
        ? doc.has_errors
          ? 'border-amber-500/20 bg-amber-500/5'
          : 'border-emerald-500/20 bg-emerald-500/5'
        : 'border-red-500/20 bg-red-500/5'
    )}>
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        doc.uploaded ? doc.has_errors ? 'bg-amber-500/15' : 'bg-emerald-500/15' : 'bg-red-500/15'
      )}>
        {doc.uploaded
          ? doc.has_errors
            ? <AlertTriangle size={14} className="text-amber-400" />
            : <CheckCircle2 size={14} className="text-emerald-400" />
          : <XCircle size={14} className="text-red-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{doc.label}</p>
        <p className="text-xs text-slate-400">{doc.description}</p>
        {doc.has_errors && doc.ai_issues.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {doc.ai_issues.slice(0, 2).map((issue, i) => (
              <p key={i} className="text-[11px] text-amber-300">⚠ {issue}</p>
            ))}
          </div>
        )}
      </div>
      <Pill ok={doc.uploaded && !doc.has_errors} warn={doc.uploaded && doc.has_errors}>
        {doc.uploaded ? doc.has_errors ? 'Issues' : 'Uploaded' : 'Missing'}
      </Pill>
    </div>
  )
}

function StepCheck({ readiness, onNext, onRecheck }) {
  const summary = readiness.summary
  const allGood = readiness.ready_to_download

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Profile Issues',  val: summary.profile_issues,  ok: summary.profile_issues === 0,  color: 'red'   },
          { label: 'Missing Docs',    val: summary.missing_docs,    ok: summary.missing_docs === 0,    color: 'red'   },
          { label: 'Doc Errors',      val: summary.doc_errors,      ok: summary.doc_errors === 0,      color: 'amber' },
        ].map(s => (
          <div key={s.label} className={clsx('p-3 rounded-xl border text-center',
            s.ok ? 'border-emerald-500/20 bg-emerald-500/5' : `border-${s.color}-500/20 bg-${s.color}-500/5`
          )}>
            <p className={clsx('text-2xl font-bold', s.ok ? 'text-emerald-400' : `text-${s.color}-400`)}>{s.val}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {allGood && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-white text-sm">Everything looks good!</p>
            <p className="text-xs text-slate-400 mt-0.5">Profile is complete, all docs are uploaded and validated.</p>
          </div>
        </div>
      )}

      {/* Profile checks */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Profile Data</p>
        <div className="space-y-2">
          {readiness.profile_checks.map((item, i) => <ProfileCheck key={i} item={item} />)}
        </div>
      </div>

      {/* Document presence */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Required Documents</p>
        <div className="space-y-2">
          {readiness.doc_status.map(doc => <DocPresenceRow key={doc.type} doc={doc} />)}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onRecheck} className="btn-secondary gap-2">
          <RefreshCw size={14} /> Recheck
        </button>
        <button
          onClick={onNext}
          disabled={!readiness.profile_complete}
          className="btn-primary flex-1 gap-2 justify-center"
        >
          {readiness.all_docs_uploaded
            ? <>Next: Validate Documents <ChevronRight size={15} /></>
            : <>Next: Upload Missing Docs ({summary.missing_docs}) <ChevronRight size={15} /></>
          }
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Upload Missing Docs ───────────────────────────────
const DOC_TYPE_ICONS = {
  passport: '🛂', language_test_result: '🗣️', education_credential: '🎓',
  eca_report: '📋', employment_letter: '💼', photo: '📷',
}

function MiniDropzone({ docType, onUploaded }) {
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)

  const upload = useMutation(
    ({ file }) => documentsAPI.upload(file, docType.type, 'applicant', ''),
    {
      onSuccess: () => {
        qc.invalidateQueries('documents')
        qc.invalidateQueries('form1-readiness')
        toast.success(`${docType.label} uploaded!`)
        onUploaded()
      },
      onError: () => toast.error('Upload failed — try again')
    }
  )

  const onDrop = useCallback(files => {
    if (files[0]) upload.mutate({ file: files[0] })
  }, [upload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
        isDragActive ? 'border-maple-400 bg-maple-500/10' : 'border-slate-700 hover:border-slate-500',
        upload.isLoading && 'opacity-50 pointer-events-none'
      )}
    >
      <input {...getInputProps()} />
      {upload.isLoading
        ? <Loader2 size={18} className="mx-auto animate-spin text-maple-400" />
        : <Upload size={18} className={clsx('mx-auto', isDragActive ? 'text-maple-400' : 'text-slate-500')} />
      }
      <p className="text-xs text-slate-400 mt-1">
        {upload.isLoading ? 'Uploading...' : isDragActive ? 'Drop here' : 'Drop or click'}
      </p>
    </div>
  )
}

function StepUpload({ readiness, onNext, onRecheck }) {
  const missing = readiness.doc_status.filter(d => !d.uploaded)
  const uploaded = readiness.doc_status.filter(d => d.uploaded)
  const [uploadedNow, setUploadedNow] = useState(new Set())

  const markUploaded = (type) => setUploadedNow(s => new Set([...s, type]))

  return (
    <div className="space-y-5">
      {missing.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-white text-sm">All documents uploaded!</p>
            <p className="text-xs text-slate-400 mt-0.5">Proceed to validate them against your profile.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
            <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <span>
              <span className="text-white font-semibold">{missing.length} document{missing.length > 1 ? 's' : ''} missing.</span>
              {' '}Drop each file directly into its box below. PDF, JPG, or PNG, max 10MB each.
            </span>
          </div>

          <div className="space-y-3">
            {missing.map(doc => (
              <div key={doc.type} className={clsx(
                'p-4 rounded-2xl border transition-all',
                uploadedNow.has(doc.type)
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-slate-700 bg-slate-800/30'
              )}>
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{DOC_TYPE_ICONS[doc.type] || '📄'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm">{doc.label}</p>
                      {uploadedNow.has(doc.type) && (
                        <CheckCircle2 size={13} className="text-emerald-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{doc.description}</p>
                  </div>
                </div>
                {!uploadedNow.has(doc.type) && (
                  <MiniDropzone docType={doc} onUploaded={() => markUploaded(doc.type)} />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {uploaded.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Already uploaded</p>
          <div className="space-y-1.5">
            {uploaded.map(doc => (
              <div key={doc.type} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">{DOC_TYPE_ICONS[doc.type]} {doc.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onRecheck} className="btn-secondary gap-2">
          <RefreshCw size={14} /> Recheck
        </button>
        <button
          onClick={onNext}
          disabled={missing.length > 0 && uploadedNow.size < missing.length}
          className="btn-primary flex-1 gap-2 justify-center"
        >
          Next: Validate Documents <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Validate Documents ────────────────────────────────
function DocValidationCard({ doc, onDeepCheck }) {
  const [expanded, setExpanded] = useState(false)
  const [deepResult, setDeepResult] = useState(null)
  const [deepLoading, setDeepLoading] = useState(false)

  const runDeepCheck = async (docId) => {
    setDeepLoading(true)
    try {
      const res = await applicationAPI.validateDocumentDeep(docId)
      setDeepResult(res.data)
    } catch {
      toast.error('AI validation failed — try again')
    }
    setDeepLoading(false)
  }

  const hasIssues = doc.has_errors && doc.ai_issues?.length > 0
  const docId = doc.doc_ids?.[0]

  return (
    <div className={clsx('rounded-2xl border overflow-hidden transition-all',
      hasIssues ? 'border-amber-500/30' :
      doc.uploaded ? 'border-emerald-500/25' : 'border-red-500/25'
    )}>
      {/* Header row */}
      <div
        className={clsx('flex items-center gap-3 p-4 cursor-pointer',
          hasIssues ? 'bg-amber-500/5' :
          doc.uploaded ? 'bg-emerald-500/5' : 'bg-red-500/5'
        )}
        onClick={() => doc.uploaded && setExpanded(!expanded)}
      >
        <span className="text-xl flex-shrink-0">{DOC_TYPE_ICONS[doc.type] || '📄'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">{doc.label}</p>
          {hasIssues && (
            <p className="text-xs text-amber-300 mt-0.5">
              {doc.ai_issues.length} issue{doc.ai_issues.length > 1 ? 's' : ''} found by AI
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Pill ok={doc.uploaded && !hasIssues} warn={hasIssues}>
            {!doc.uploaded ? 'Missing' : hasIssues ? `${doc.ai_issues.length} Issues` : 'OK'}
          </Pill>
          {doc.uploaded && (
            <ChevronDown size={14} className={clsx('text-slate-500 transition-transform', expanded && 'rotate-180')} />
          )}
        </div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && doc.uploaded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-800"
          >
            <div className="p-4 space-y-4">
              {/* AI issues from initial upload review */}
              {hasIssues && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Issues found on upload</p>
                  {doc.ai_issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-300 py-1">
                      <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}

              {/* Deep check results */}
              {deepResult && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    AI Cross-Check Results
                  </p>
                  <div className="space-y-2">
                    {deepResult.cross_checks?.map((check, i) => (
                      <div key={i} className={clsx('flex items-start gap-3 p-2.5 rounded-lg text-xs',
                        check.status === 'pass' ? 'bg-emerald-500/5 border border-emerald-500/15' :
                        check.status === 'fail' ? 'bg-red-500/5 border border-red-500/20' :
                        check.status === 'warn' ? 'bg-amber-500/5 border border-amber-500/15' :
                        'bg-slate-800/40 border border-slate-700'
                      )}>
                        {check.status === 'pass' ? <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /> :
                         check.status === 'fail' ? <XCircle       size={12} className="text-red-400 mt-0.5 flex-shrink-0" /> :
                         check.status === 'warn' ? <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" /> :
                         <AlertCircle size={12} className="text-slate-500 mt-0.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white">{check.field}</p>
                          <div className="flex gap-3 mt-0.5 flex-wrap">
                            <span className="text-slate-500">Profile: <span className="text-slate-300">{check.profile_value || '—'}</span></span>
                            <span className="text-slate-500">Document: <span className="text-slate-300">{check.document_value || '—'}</span></span>
                          </div>
                          {check.note && <p className="text-amber-300 mt-0.5">{check.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {deepResult.critical_mismatches?.length > 0 && (
                    <div className="mt-3 p-3 rounded-xl border border-red-500/30 bg-red-500/5">
                      <p className="text-xs font-bold text-red-400 mb-1">Critical mismatches — fix before submitting</p>
                      {deepResult.critical_mismatches.map((m, i) => (
                        <p key={i} className="text-xs text-red-300">• {m}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Deep check button */}
              {docId && !deepResult && (
                <button
                  onClick={() => runDeepCheck(docId)}
                  disabled={deepLoading}
                  className="flex items-center gap-2 text-xs btn-secondary w-full justify-center"
                >
                  {deepLoading
                    ? <><Loader2 size={12} className="animate-spin" /> AI is reading your document...</>
                    : <><Sparkles size={12} /> Run AI Deep-Check (cross-validates vs your profile)</>
                  }
                </button>
              )}
              {deepResult && (
                <button
                  onClick={() => { setDeepResult(null); runDeepCheck(docId) }}
                  disabled={deepLoading}
                  className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <RefreshCw size={11} /> Re-run deep check
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepValidate({ readiness, onNext }) {
  const criticalErrors = readiness.doc_status.filter(d => d.has_errors)
  const allClean = readiness.all_docs_uploaded && criticalErrors.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
        <Bot size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <span>
          <span className="text-white font-semibold">Presence check is automatic.</span>
          {' '}Expand any document to run the AI Deep-Check — it reads the document and cross-validates every field against your profile data.
        </span>
      </div>

      <div className="space-y-3">
        {readiness.doc_status.map(doc => (
          <DocValidationCard key={doc.type} doc={doc} />
        ))}
      </div>

      {allClean && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-white text-sm">Documents look good!</p>
            <p className="text-xs text-slate-400">No critical issues detected. Ready to generate your PDF.</p>
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!readiness.all_docs_uploaded}
        className="btn-primary w-full gap-2 justify-center"
      >
        {criticalErrors.length > 0
          ? <>Continue Anyway (with {criticalErrors.length} warning{criticalErrors.length > 1 ? 's' : ''}) <ChevronRight size={15} /></>
          : <>Generate PDF <ChevronRight size={15} /></>
        }
      </button>
      {criticalErrors.length > 0 && (
        <p className="text-xs text-amber-400 text-center">
          ⚠ You can still download the PDF, but fix the issues above before submitting to IRCC.
        </p>
      )}
    </div>
  )
}

// ── Step 4: Download PDF ──────────────────────────────────────
function StepDownload({ readiness }) {
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const qc = useQueryClient()

  const download = async () => {
    setDownloading(true)
    try {
      const res = await irccPdfAPI.downloadForm1()
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href  = url
      link.download = 'IRCC_Form1_Express_Entry_Profile.pdf'
      link.click()
      window.URL.revokeObjectURL(url)
      setDownloaded(true)

      // Mark Form 1 sections as in-progress in the tracker
      const tracker = JSON.parse(localStorage.getItem('ircc_tracker_v1') || '{}')
      ;['f1_personal','f1_language','f1_education','f1_work','f1_adaptability'].forEach(id => {
        if (tracker[id] !== 'done') tracker[id] = 'in_progress'
      })
      localStorage.setItem('ircc_tracker_v1', JSON.stringify(tracker))

      toast.success('PDF downloaded! Application tracker updated.')
    } catch {
      toast.error('PDF generation failed — make sure your profile has data')
    }
    setDownloading(false)
  }

  const warnings = readiness.doc_status.filter(d => d.has_errors)

  return (
    <div className="space-y-5">
      {/* What's in the PDF */}
      <div className="p-4 rounded-2xl border border-slate-700 bg-slate-800/30">
        <p className="text-sm font-semibold text-white mb-3">Your PDF includes:</p>
        <div className="space-y-2">
          {[
            { icon: '👤', text: 'Personal info formatted exactly as IRCC asks (name, DOB, citizenship)' },
            { icon: '🗣️', text: 'Language scores with raw bands + CLB equivalents side by side' },
            { icon: '🎓', text: 'Education details with ECA reference numbers' },
            { icon: '💼', text: 'All work history entries with NOC codes and exact date ranges' },
            { icon: '✅', text: 'Pre-submission checklist with all 13 items' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
              <span>{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <p className="text-xs font-semibold text-amber-300">
              {warnings.length} document issue{warnings.length > 1 ? 's' : ''} — fix before submitting to IRCC
            </p>
          </div>
          {warnings.map(w => (
            <p key={w.type} className="text-xs text-slate-400 ml-5">• {w.label}: {w.ai_issues[0]}</p>
          ))}
        </div>
      )}

      {/* Download button */}
      {!downloaded ? (
        <button onClick={download} disabled={downloading} className="btn-primary w-full gap-2 justify-center py-3 text-base">
          {downloading
            ? <><Loader2 size={16} className="animate-spin" /> Generating PDF...</>
            : <><FileDown size={16} /> Download Form 1 PDF</>
          }
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
            <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-white text-sm">PDF Downloaded!</p>
              <p className="text-xs text-slate-400">Application tracker has been updated to "in progress".</p>
            </div>
          </div>

          {/* Next steps */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Next Steps on IRCC Portal</p>
            {[
              { step: '1', text: 'Go to canada.ca/express-entry and sign in to your GCKey account' },
              { step: '2', text: 'Click "Create an Express Entry Profile" or update your existing profile' },
              { step: '3', text: 'Open your PDF in one tab — use it as your reference while filling each section' },
              { step: '4', text: 'Enter personal info exactly as shown — name must match passport character by character' },
              { step: '5', text: 'Enter language scores using both the raw score AND the CLB (IRCC asks for both)' },
              { step: '6', text: 'Review the pre-submission checklist on page 2 before clicking Submit' },
              { step: '7', text: 'After submitting, note your profile number — you\'ll need it when you receive an ITA' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-3 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">
                  {item.step}
                </span>
                {item.text}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <a
              href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/works.html"
              target="_blank" rel="noreferrer"
              className="btn-secondary flex-1 gap-2 justify-center text-sm"
            >
              Open IRCC Portal <ExternalLink size={13} />
            </a>
            <button onClick={download} className="btn-ghost gap-2 text-xs">
              <FileDown size={13} /> Re-download
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main workflow component ───────────────────────────────────
export default function ApplicationWorkflow({ onClose }) {
  const [step, setStep] = useState('check')
  const [open, setOpen] = useState(false)

  const { data: readinessData, isLoading, refetch, isFetching } = useQuery(
    'form1-readiness',
    () => applicationAPI.getForm1Readiness().then(r => r.data),
    { enabled: open, staleTime: 30 * 1000 }
  )

  const handleOpen = () => {
    setOpen(true)
    setStep('check')
  }

  const recheck = async () => {
    await refetch()
    setStep('check')
  }

  const nextStep = (current) => {
    const order = ['check', 'upload', 'validate', 'download']
    const i = order.indexOf(current)
    if (current === 'check') {
      // Skip upload step if all docs are already uploaded
      setStep(readinessData?.all_docs_uploaded ? 'validate' : 'upload')
    } else {
      setStep(order[i + 1] || 'download')
    }
  }

  return (
    <>
      {/* Entry point button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleOpen}
        className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-maple-500/40 bg-gradient-to-r from-maple-500/10 to-slate-800/40 hover:border-maple-500/70 transition-all group"
      >
        <div className="w-12 h-12 rounded-xl bg-maple-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-maple-500/30 group-hover:shadow-maple-500/50 transition-shadow">
          <Rocket size={22} className="text-white" />
        </div>
        <div className="text-left flex-1">
          <p className="font-bold text-white text-base">Start My Application</p>
          <p className="text-slate-400 text-sm mt-0.5">
            Check readiness → Upload missing docs → Validate → Download pre-filled PDF
          </p>
        </div>
        <ChevronRight size={20} className="text-slate-500 group-hover:text-maple-400 transition-colors" />
      </motion.button>

      {/* Workflow panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Rocket size={16} className="text-maple-400" />
                <p className="font-bold text-white text-sm">Form 1 — Express Entry Profile Application</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-xs transition-colors">
                Collapse ↑
              </button>
            </div>

            <div className="p-5">
              <StepBar current={step} />

              {isLoading || isFetching ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <Loader2 size={20} className="animate-spin text-maple-400" />
                  <p className="text-slate-400 text-sm">Checking your application readiness...</p>
                </div>
              ) : readinessData ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    {step === 'check'    && <StepCheck    readiness={readinessData} onNext={() => nextStep('check')} onRecheck={recheck} />}
                    {step === 'upload'   && <StepUpload   readiness={readinessData} onNext={() => nextStep('upload')} onRecheck={recheck} />}
                    {step === 'validate' && <StepValidate readiness={readinessData} onNext={() => nextStep('validate')} />}
                    {step === 'download' && <StepDownload readiness={readinessData} />}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">Could not load readiness data — try again</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

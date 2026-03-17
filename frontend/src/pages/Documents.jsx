import React from 'react'
// src/pages/Documents.jsx

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw,
  Eye, Trash2, Bot, User, Users, Baby, ChevronDown, X,
  ShieldAlert, Info, FileCheck, Calendar, HardDrive, Fingerprint,
  Sparkles, Brain, ExternalLink, XCircle
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { documentsAPI } from '../services/api'
import { useProfile } from '../hooks'
import log from '../services/logger'
import clsx from 'clsx'
import ApplicationWorkflow from '../components/ApplicationWorkflow'
import EaprWorkflow from '../components/EaprWorkflow'

const DOC_TYPES = [
  { value: 'passport',             label: 'Passport',                     icon: '🛂', required: true,  description: 'All pages of current valid passport',              validFor: '5+ years from travel date' },
  { value: 'language_test_result', label: 'Language Test (IELTS/CELPIP)', icon: '🗣️', required: true,  description: 'IELTS TRF or CELPIP Score Report',                  validFor: '2 years from test date' },
  { value: 'education_credential', label: 'Education Certificate',        icon: '🎓', required: true,  description: 'Degree certificate or transcripts',                 validFor: 'Permanent' },
  { value: 'eca_report',           label: 'ECA Report',                   icon: '📋', required: true,  description: 'WES or other recognized ECA report',               validFor: '5 years from issue' },
  { value: 'employment_letter',    label: 'Employment Letter',            icon: '💼', required: true,  description: 'On letterhead with all required details',          validFor: 'Must be recent (within 6 months)' },
  { value: 'police_certificate',   label: 'Police Certificate',           icon: '👮', required: true,  description: 'From each country you lived in 6+ months',        validFor: '1 year from issue' },
  { value: 'medical_exam',         label: 'Medical Exam',                 icon: '🏥', required: true,  description: 'By IRCC designated physician',                     validFor: '1 year from exam date' },
  { value: 'birth_certificate',    label: 'Birth Certificate',            icon: '📄', required: false, description: 'Required if name changed or for children',         validFor: 'Permanent' },
  { value: 'marriage_certificate', label: 'Marriage Certificate',         icon: '💍', required: false, description: 'If married or common-law',                         validFor: 'Permanent' },
  { value: 'photo',                label: 'Photo',                        icon: '📷', required: true,  description: 'IRCC specification photo (45mm x 35mm)',           validFor: 'Must be recent (within 6 months)' },
]

const PERSON_OPTIONS = [
  { value: 'applicant', label: 'Applicant (Me)',   icon: User,  color: 'text-blue-400'   },
  { value: 'spouse',    label: 'Spouse / Partner', icon: Users, color: 'text-purple-400' },
  { value: 'child_1',  label: 'Child 1',           icon: Baby,  color: 'text-green-400'  },
  { value: 'child_2',  label: 'Child 2',           icon: Baby,  color: 'text-green-400'  },
  { value: 'child_3',  label: 'Child 3',           icon: Baby,  color: 'text-green-400'  },
]

const PERSON_BADGE = {
  applicant: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  spouse:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
  child_1:   'bg-green-500/15 text-green-400 border-green-500/30',
  child_2:   'bg-green-500/15 text-green-400 border-green-500/30',
  child_3:   'bg-green-500/15 text-green-400 border-green-500/30',
}

function resolveStatus(doc) {
  if (doc.status === 'ai_processing' && doc.uploaded_at) {
    const age = Date.now() - new Date(doc.uploaded_at).getTime()
    if (age > 5 * 60 * 1000) return 'pending'
  }
  return doc.status
}

const STATUS_CONFIG = {
  pending:       { label: 'Pending',           color: 'text-slate-400  bg-slate-800   border-slate-700',    icon: Clock,         spin: false },
  ai_processing: { label: 'AI Reviewing',      color: 'text-blue-400   bg-blue-900/30 border-blue-700/40',  icon: Loader2,       spin: true  },
  ai_reviewed:   { label: 'AI Reviewed',       color: 'text-amber-400  bg-amber-900/20 border-amber-700/30',icon: Bot,           spin: false },
  verified:      { label: 'Verified',          color: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30', icon: CheckCircle2, spin: false },
  rejected:      { label: 'Issues Found',      color: 'text-red-400    bg-red-900/20  border-red-700/30',   icon: AlertTriangle, spin: false },
  expired:       { label: 'Expired',           color: 'text-red-400    bg-red-900/20  border-red-700/30',   icon: AlertTriangle, spin: false },
}

const SEVERITY_STYLE = {
  critical: { cls: 'text-red-400',    Icon: ShieldAlert },
  warning:  { cls: 'text-amber-400',  Icon: AlertTriangle },
  info:     { cls: 'text-blue-400',   Icon: Info },
}

function IssuePill({ issue }) {
  const sev = issue.severity ? (SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.info) : SEVERITY_STYLE.warning
  const IssueIcon = sev.Icon
  return (
    <div className={clsx('flex items-start gap-1.5 text-xs py-1', sev.cls)}>
      <IssueIcon size={11} className="mt-0.5 flex-shrink-0" />
      <span>{typeof issue === 'object' ? issue.message : issue}</span>
    </div>
  )
}

function PersonPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const selected = PERSON_OPTIONS.find(p => p.value === value) || PERSON_OPTIONS[0]
  const Icon = selected.icon
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 input text-sm justify-between"
      >
        <span className="flex items-center gap-2"><Icon size={15} className={selected.color} /><span>{selected.label}</span></span>
        <ChevronDown size={14} className={clsx('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-xl"
          >
            {PERSON_OPTIONS.map(opt => {
              const Ico = opt.icon
              return (
                <button key={opt.value} type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={clsx('w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-800 transition-colors', value === opt.value && 'bg-slate-800')}
                >
                  <Ico size={14} className={opt.color} />
                  <span className="text-slate-200">{opt.label}</span>
                  {value === opt.value && <CheckCircle2 size={13} className="ml-auto text-maple-400" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DropZone({ selectedType, personLabel, uploading, onUpload }) {
  const onDrop = useCallback(files => { if (files[0]) onUpload(files[0]) }, [onUpload])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.tiff'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false
  })
  const docType = DOC_TYPES.find(t => t.value === selectedType)
  const person  = PERSON_OPTIONS.find(p => p.value === personLabel)
  return (
    <div {...getRootProps()} className={clsx(
      'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300',
      isDragActive ? 'border-maple-400 bg-maple-500/10' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50',
      uploading && 'opacity-50 pointer-events-none'
    )}>
      <input {...getInputProps()} />
      {uploading ? (
        <><Loader2 size={36} className="mx-auto mb-3 text-maple-400 animate-spin" /><p className="text-white font-medium">Uploading & running validation...</p></>
      ) : (
        <>
          <Upload size={36} className={clsx('mx-auto mb-3 transition-colors', isDragActive ? 'text-maple-400' : 'text-slate-500')} />
          <p className="text-white font-semibold">{isDragActive ? 'Drop it here!' : 'Drop your document here'}</p>
          <p className="text-slate-400 text-sm mt-1">or click to browse · PDF, JPG, PNG, TIFF · max 10MB</p>
          {selectedType && (
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-300">{docType?.icon} {docType?.label}</span>
              {person && <span className={clsx('text-xs px-2 py-1 rounded-full border', PERSON_BADGE[person.value])}>{person.label}</span>}
              {docType?.validFor && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-900/30 text-amber-400 border border-amber-700/30 flex items-center gap-1">
                  <Calendar size={10} /> Valid: {docType.validFor}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DocThumbnail({ doc, docType }) {
  const [previewUrl, setPreviewUrl] = React.useState(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const isImage = doc.mime_type?.startsWith('image/')
    const isPdf = doc.mime_type === 'application/pdf'
    if (!isImage && !isPdf) return
    let cancelled = false
    let objectUrl = null
    setLoading(true)

    import('../services/api').then(({ documentsAPI }) =>
      documentsAPI.getPreview(doc.id)
        .then(r => {
          if (cancelled) return
          const blob = new Blob([r.data], { type: doc.mime_type })
          objectUrl = URL.createObjectURL(blob)
          setPreviewUrl(objectUrl)
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false) })
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc.id, doc.mime_type])

  const isImage = doc.mime_type?.startsWith('image/')
  const isPdf = doc.mime_type === 'application/pdf'

  if (loading) return (
    <div className="w-16 h-20 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0 border border-slate-700">
      <Loader2 size={14} className="text-slate-600 animate-spin" />
    </div>
  )

  if (isImage && previewUrl) return (
    <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-slate-700">
      <img src={previewUrl} alt="" className="w-full h-full object-cover" />
    </div>
  )

  if (isPdf && previewUrl) return (
    <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-slate-700 bg-slate-800 relative">
      <object
        data={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1`}
        type="application/pdf"
        style={{ width: '200%', height: '200%', transform: 'scale(0.5)', transformOrigin: 'top left', pointerEvents: 'none' }}
      >
        <span className="text-2xl absolute inset-0 flex items-center justify-center">{docType?.icon || '📄'}</span>
      </object>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent py-0.5 flex justify-center">
        <span className="text-[8px] text-red-400 font-bold">PDF</span>
      </div>
    </div>
  )

  return (
    <div className="w-16 h-20 bg-slate-800 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border border-slate-700 gap-1">
      <span className="text-2xl">{docType?.icon || '📄'}</span>
      <span className="text-[8px] text-slate-600 uppercase tracking-wide">{isPdf ? 'PDF' : isImage ? 'IMG' : 'DOC'}</span>
    </div>
  )
}

function DocumentCard({ doc, onViewDetails, onDelete }) {
  const status  = resolveStatus(doc)
  const cfg     = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const StatusIcon = cfg.icon
  const docType = DOC_TYPES.find(t => t.value === doc.document_type)
  const person  = PERSON_OPTIONS.find(p => p.value === (doc.person_label || 'applicant')) || PERSON_OPTIONS[0]
  const PersonIcon = person.icon
  const hasIssues = (doc.ai_issues || []).length > 0
  const criticalCount = (doc.ai_issues || []).filter(i => (typeof i === 'object' ? i.severity : null) === 'critical').length
  const mismatches = doc.ai_extracted_fields?._profile_mismatches || []

  const uploadedAt = doc.uploaded_at
    ? new Date(doc.uploaded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  // Key info preview — most important fields per doc type
  const KEY_FIELDS = {
    passport:             ['first_name', 'last_name', 'document_number', 'date_of_expiry'],
    language_test_result: ['test_type', 'listening', 'reading', 'writing', 'speaking'],
    education_credential: ['degree_name', 'institution', 'graduation_date'],
    eca_report:           ['organization', 'canadian_equivalency', 'reference_number'],
    employment_letter:    ['employer_name', 'job_title', 'start_date'],
    police_certificate:   ['issuing_authority', 'issue_date'],
    medical_exam:         ['physician', 'exam_date'],
  }
  const FIELD_LABELS = {
    first_name:'First Name', last_name:'Last Name', document_number:'Passport No',
    date_of_expiry:'Expires', test_type:'Test', listening:'L', reading:'R',
    writing:'W', speaking:'S', degree_name:'Degree', institution:'Institution',
    graduation_date:'Graduated', organization:'ECA Org', canadian_equivalency:'CA Equivalent',
    reference_number:'Ref #', employer_name:'Employer', job_title:'Title',
    start_date:'Start', issuing_authority:'Authority', issue_date:'Issued',
    physician:'Physician', exam_date:'Exam Date',
  }

  const keyFields = KEY_FIELDS[doc.document_type] || []
  const extracted = doc.ai_extracted_fields || {}
  const keyInfo = keyFields
    .filter(k => extracted[k] && !String(extracted[k]).startsWith('_'))
    .map(k => ({ label: FIELD_LABELS[k] || k, value: String(extracted[k]) }))

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={clsx('card transition-all hover:border-slate-600 cursor-pointer group', criticalCount > 0 && 'border-red-700/40 bg-red-950/10')}
      onClick={() => onViewDetails(doc)}
    >
      <div className="flex items-start gap-4">
        <DocThumbnail doc={doc} docType={docType} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white text-sm truncate max-w-xs">{doc.file_name}</p>
            <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', cfg.color)}>
              <StatusIcon size={10} className={cfg.spin && status === 'ai_processing' ? 'animate-spin' : ''} />
              {status === 'pending' && doc.status === 'ai_processing' ? 'Pending (AI unavailable)' : cfg.label}
            </span>
            <span className={clsx('text-xs px-2 py-0.5 rounded-full border flex items-center gap-1', PERSON_BADGE[person.value] || PERSON_BADGE.applicant)}>
              <PersonIcon size={10} /> {person.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1"><FileText size={10} />{docType?.label || doc.document_type}</span>
            <span className="flex items-center gap-1"><HardDrive size={10} />{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
            {uploadedAt && <span className="flex items-center gap-1"><Clock size={10} />{uploadedAt}</span>}
            {doc.person_note && <span className="italic text-slate-600">"{doc.person_note}"</span>}
          </p>

          {/* Key info preview — shown when AI has extracted data */}
          {keyInfo.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {keyInfo.map(({ label, value }) => (
                <div key={label} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</span>
                  <span className="text-[11px] font-semibold text-white">{value}</span>
                </div>
              ))}
              {mismatches.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25">
                  <AlertTriangle size={9} className="text-amber-400" />
                  <span className="text-[11px] font-semibold text-amber-400">{mismatches.length} mismatch{mismatches.length > 1 ? 'es' : ''}</span>
                </div>
              )}
            </div>
          )}

          {doc.ai_confidence != null && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-400">AI Confidence</span>
              <div className="h-1 rounded-full bg-slate-800 w-16 overflow-hidden">
                <div className={clsx('h-full rounded-full', doc.ai_confidence >= 0.7 ? 'bg-emerald-500' : doc.ai_confidence >= 0.4 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${doc.ai_confidence * 100}%` }} />
              </div>
              <span className="text-xs font-mono text-slate-400">{(doc.ai_confidence * 100).toFixed(0)}%</span>
            </div>
          )}
          {hasIssues && (
            <div className="mt-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
              {(doc.ai_issues || []).slice(0, 2).map((issue, i) => <IssuePill key={i} issue={issue} />)}
              {(doc.ai_issues || []).length > 2 && (
                <p className="text-xs text-slate-500 mt-1">+{doc.ai_issues.length - 2} more — click to view</p>
              )}
            </div>
          )}
          {!hasIssues && doc.status === 'ai_reviewed' && (
            <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1"><CheckCircle2 size={10} /> No issues detected</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
          <button onClick={() => onViewDetails(doc)}
            className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 text-maple-400 hover:text-maple-300 border border-maple-500/20 hover:border-maple-500/40 rounded-lg transition-colors">
            <Eye size={13} /> View
          </button>
          <button onClick={() => onDelete(doc.id)} className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 text-slate-600 hover:text-red-400">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function DocumentDetailModal({ doc, profile, onClose }) {
  const qc = useQueryClient()
  const reReview = useMutation(
    () => documentsAPI.reReview(doc?.id),
    {
      onSuccess: () => {
        toast.success('Re-analysis started — results in ~30 seconds')
        qc.invalidateQueries('documents')
        onClose()
      },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Re-review failed')
    }
  )

  if (!doc) return null
  const docType  = DOC_TYPES.find(t => t.value === doc.document_type)
  const status   = resolveStatus(doc)
  const cfg      = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const StatusIcon = cfg.icon
  const uploadedAt = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString('en-CA') : 'Unknown'

  // Score cross-validation
  const scoreMismatches = []
  if (doc.document_type === 'language_test_result' && doc.ai_extracted_fields && profile?.language_tests?.length) {
    const extracted = doc.ai_extracted_fields
    const profileTest = profile.language_tests[0]
    ;['reading', 'writing', 'speaking', 'listening'].forEach(f => {
      const docVal  = parseFloat(extracted[f] || extracted[`${f}_score`])
      const profVal = parseFloat(profileTest[f])
      if (!isNaN(docVal) && !isNaN(profVal) && Math.abs(docVal - profVal) > 0.1) {
        scoreMismatches.push({ field: f, inDoc: docVal, inProfile: profVal, severity: Math.abs(docVal - profVal) >= 1 ? 'critical' : 'warning' })
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-slate-900 rounded-2xl border border-slate-700 max-w-xl w-full max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{docType?.icon || '📄'}</span>
            <div>
              <p className="font-semibold text-white text-sm">{doc.file_name}</p>
              <p className="text-xs text-slate-400">{docType?.label || doc.document_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(doc.ai_issues?.length > 0 || doc.ai_extracted_fields?._must_fix?.length > 0) && (
              <button
                onClick={() => reReview.mutate()}
                disabled={reReview.isLoading || status === 'ai_processing'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition-all disabled:opacity-50"
                title="Re-run AI analysis after fixing profile issues"
              >
                {reReview.isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Re-review
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: HardDrive,    label: 'Size',     val: `${(doc.file_size_bytes / 1024).toFixed(1)} KB` },
              { icon: Clock,        label: 'Uploaded', val: uploadedAt },
              { icon: FileCheck,    label: 'Format',   val: doc.mime_type || '—' },
              { icon: Fingerprint,  label: 'Status',   val: cfg.label },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1"><Icon size={9} />{label}</p>
                <p className="text-xs text-white font-medium truncate">{val}</p>
              </div>
            ))}
          </div>

          {/* Extracted fields — rich per-document display */}
          {(() => {
            const fields = doc.ai_extracted_fields
            if (!fields) return null
            const clean = Object.fromEntries(
              Object.entries(fields).filter(([k, v]) => !k.startsWith('_') && v !== null && v !== undefined && v !== '')
            )
            if (Object.keys(clean).length === 0) return null

            // Per-document-type field configs: label, icon char, highlight (shows in accent colour)
            const FIELD_CONFIGS = {
              passport: [
                { key: 'first_name',      label: 'First Name',         icon: '👤', highlight: true  },
                { key: 'last_name',       label: 'Last Name',          icon: '👤', highlight: true  },
                { key: 'document_number', label: 'Passport Number',    icon: '🔢', highlight: true  },
                { key: 'date_of_birth',   label: 'Date of Birth',      icon: '🎂', highlight: false },
                { key: 'date_of_expiry',  label: 'Expiry Date',        icon: '📅', highlight: true  },
                { key: 'nationality',     label: 'Nationality',        icon: '🌍', highlight: false },
                { key: 'sex',             label: 'Gender',             icon: '—',  highlight: false },
                { key: 'country_of_issue',label: 'Issuing Country',    icon: '🏛️', highlight: false },
              ],
              language_test_result: [
                { key: 'test_type',       label: 'Test Type',          icon: '📝', highlight: true  },
                { key: 'candidate_name',  label: 'Candidate Name',     icon: '👤', highlight: true  },
                { key: 'test_date',       label: 'Test Date',          icon: '📅', highlight: true  },
                { key: 'listening',       label: 'Listening',          icon: '👂', highlight: true  },
                { key: 'reading',         label: 'Reading',            icon: '📖', highlight: true  },
                { key: 'writing',         label: 'Writing',            icon: '✍️', highlight: true  },
                { key: 'speaking',        label: 'Speaking',           icon: '🗣️', highlight: true  },
                { key: 'registration_number', label: 'TRF / Reg #',   icon: '🔢', highlight: false },
                { key: 'overall_band',    label: 'Overall Band',       icon: '⭐', highlight: true  },
              ],
              education_credential: [
                { key: 'student_name',    label: 'Student Name',       icon: '👤', highlight: true  },
                { key: 'degree_name',     label: 'Degree / Programme', icon: '🎓', highlight: true  },
                { key: 'institution',     label: 'Institution',        icon: '🏫', highlight: true  },
                { key: 'graduation_date', label: 'Graduation Date',    icon: '📅', highlight: false },
                { key: 'field_of_study',  label: 'Field of Study',     icon: '📚', highlight: false },
                { key: 'grade',           label: 'Grade / CGPA',       icon: '⭐', highlight: false },
              ],
              eca_report: [
                { key: 'applicant_name',  label: 'Applicant Name',     icon: '👤', highlight: true  },
                { key: 'organization',    label: 'ECA Organization',   icon: '🏛️', highlight: true  },
                { key: 'reference_number',label: 'Reference Number',   icon: '🔢', highlight: true  },
                { key: 'canadian_equivalency', label: 'Canadian Equivalent', icon: '🍁', highlight: true },
                { key: 'issue_date',      label: 'Issue Date',         icon: '📅', highlight: false },
              ],
              employment_letter: [
                { key: 'employee_name',   label: 'Employee Name',      icon: '👤', highlight: true  },
                { key: 'employer_name',   label: 'Employer / Company', icon: '🏢', highlight: true  },
                { key: 'job_title',       label: 'Job Title',          icon: '💼', highlight: true  },
                { key: 'start_date',      label: 'Start Date',         icon: '📅', highlight: false },
                { key: 'end_date',        label: 'End Date',           icon: '📅', highlight: false },
                { key: 'salary',          label: 'Salary',             icon: '💰', highlight: false },
                { key: 'hours_per_week',  label: 'Hours / Week',       icon: '⏰', highlight: false },
              ],
              police_certificate: [
                { key: 'applicant_name',  label: 'Applicant Name',     icon: '👤', highlight: true  },
                { key: 'issue_date',      label: 'Issue Date',         icon: '📅', highlight: true  },
                { key: 'issuing_authority', label: 'Issuing Authority',icon: '🏛️', highlight: false },
                { key: 'country',         label: 'Country',            icon: '🌍', highlight: false },
              ],
              medical_exam: [
                { key: 'patient_name',    label: 'Patient Name',       icon: '👤', highlight: true  },
                { key: 'exam_date',       label: 'Exam Date',          icon: '📅', highlight: true  },
                { key: 'physician',       label: 'Physician',          icon: '👨‍⚕️', highlight: false },
              ],
            }

            const configs = FIELD_CONFIGS[doc.document_type] || []
            // Build ordered rows: configured fields first, then any remaining unknown fields
            const configuredKeys = new Set(configs.map(c => c.key))
            const orderedFields = [
              ...configs.filter(c => clean[c.key] !== undefined),
              ...Object.keys(clean)
                .filter(k => !configuredKeys.has(k))
                .map(k => ({ key: k, label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), icon: '—', highlight: false }))
            ].filter(c => clean[c.key] !== undefined && clean[c.key] !== '')

            if (orderedFields.length === 0) return null

            return (
              <div>
                <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-3">
                  <FileCheck size={12} className="text-emerald-400" />
                  Document Information
                  <span className="ml-auto text-[10px] text-slate-600 font-normal">Extracted by Azure AI</span>
                </p>
                <div className="space-y-1.5">
                  {orderedFields.map(({ key, label, icon, highlight }) => {
                    const val = String(clean[key])
                    // Check if this field has a mismatch
                    const mismatches = doc.ai_extracted_fields?._profile_mismatches || []
                    const hasMismatch = mismatches.some(m =>
                      m.field?.toLowerCase().includes(label.toLowerCase()) ||
                      m.field?.toLowerCase().includes(key.replace(/_/g,' '))
                    )
                    return (
                      <div key={key} className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                        hasMismatch
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : highlight
                          ? 'border-slate-700 bg-slate-800/60'
                          : 'border-slate-800 bg-slate-800/30'
                      )}>
                        <span className="text-base flex-shrink-0 w-5 text-center">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
                          <p className={clsx(
                            'text-sm font-semibold truncate',
                            hasMismatch ? 'text-amber-300' : highlight ? 'text-white' : 'text-slate-300'
                          )}>
                            {val}
                          </p>
                        </div>
                        {hasMismatch && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            ≠ Profile
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Profile mismatches — shown separately and prominently */}
          {(() => {
            const mismatches = doc.ai_extracted_fields?._profile_mismatches || []
            const mustFix = doc.ai_extracted_fields?._must_fix || []
            if (mismatches.length === 0 && mustFix.length === 0) return null
            return (
              <div className="space-y-3">
                {mustFix.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-red-400 flex items-center gap-1.5 mb-2">
                      <ShieldAlert size={12} /> Critical — Will Cause IRCC Rejection ({mustFix.length})
                    </p>
                    <div className="space-y-1.5">
                      {mustFix.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-900/20 border border-red-700/30">
                          <XCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300">{issue}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mismatches.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-2">
                      <AlertTriangle size={12} /> Profile Mismatches ({mismatches.length})
                    </p>
                    <div className="space-y-2">
                      {mismatches.map((m, i) => (
                        <div key={i} className={clsx(
                          'p-3 rounded-xl border',
                          m.severity === 'critical'
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'border-amber-500/30 bg-amber-500/5'
                        )}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-white">{m.field}</p>
                            <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',
                              m.severity === 'critical'
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-amber-500/15 text-amber-400'
                            )}>
                              {m.severity === 'critical' ? '⚠ Critical' : 'Warning'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700">
                              <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Profile says</p>
                              <p className="text-xs text-white font-mono">{m.profile_value}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700">
                              <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Document shows</p>
                              <p className="text-xs text-white font-mono">{m.document_value}</p>
                            </div>
                          </div>
                          {m.note && <p className="text-[10px] text-slate-500 mt-1.5">{m.note}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Re-review banner — shown when there are issues and user may have fixed profile */}
          {((doc.ai_extracted_fields?._must_fix?.length > 0) || (doc.ai_issues?.length > 0)) && status === 'ai_reviewed' && (
            <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <RefreshCw size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-emerald-400">Fixed your profile?</p>
                  <p className="text-xs text-slate-400 mt-0.5">After updating your profile to match this document, click Re-review to clear resolved issues.</p>
                </div>
              </div>
              <button
                onClick={() => reReview.mutate()}
                disabled={reReview.isLoading}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
              >
                {reReview.isLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Re-review
              </button>
            </div>
          )}

          {/* Issues list */}
          {(doc.ai_issues || []).length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1 mb-2">
                <AlertTriangle size={11} /> Issues Found ({doc.ai_issues.length})
              </p>
              <div className="space-y-1.5">
                {doc.ai_issues.map((issue, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-slate-800 border border-slate-700">
                    <IssuePill issue={issue} />
                  </div>
                ))}
              </div>
            </div>
          ) : doc.status === 'ai_reviewed' ? (
            <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
              <p className="text-sm text-emerald-400 flex items-center gap-2"><CheckCircle2 size={14} /> Passed — no issues found</p>
            </div>
          ) : null}

          {/* AI summary */}
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-2"><Bot size={11} /> AI Review Summary</p>
            <p className="text-sm text-white leading-relaxed">
              {doc.ai_review_notes || (status === 'ai_processing'
                ? 'AI is currently reviewing this document...'
                : 'No AI review available. Full analysis requires Celery + Azure Document Intelligence.'
              )}
            </p>
          </div>

          {/* Validity reminder */}
          {docType?.validFor && (
            <div className="p-3 rounded-xl bg-blue-900/20 border border-blue-700/30 flex items-start gap-2">
              <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-400">Validity Reminder</p>
                <p className="text-xs text-slate-400 mt-0.5">{docType.label} must be valid: <strong className="text-white">{docType.validFor}</strong></p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default function Documents() {
  const [selectedType, setSelectedType] = useState('passport')
  const [personLabel,  setPersonLabel]  = useState('applicant')
  const [personNote,   setPersonNote]   = useState('')
  const [filterPerson, setFilterPerson] = useState('all')
  const [detailDoc,    setDetailDoc]    = useState(null)
  const qc = useQueryClient()

  const { data: profile } = useProfile()

  const { data: documents = [], isLoading } = useQuery(
    'documents',
    () => documentsAPI.getAll().then(r => r.data),
    { refetchInterval: 15000, onSuccess: data => log.info('Documents', `loaded: ${data.length} docs`) }
  )

  const upload = useMutation(
    ({ file, type, person, note }) => {
      log.info('Documents', `upload: file="${file.name}"  type=${type}  person=${person}`)
      return documentsAPI.upload(file, type, person, note).then(r => r.data)
    },
    {
      onSuccess: () => { toast.success('Uploaded! Validation running...'); qc.invalidateQueries('documents') },
      onError: err => toast.error(err?.response?.data?.detail || 'Upload failed'),
    }
  )

  const deleteDoc = useMutation(
    id => documentsAPI.delete(id),
    { onSuccess: () => { toast.success('Document removed'); qc.invalidateQueries('documents') } }
  )

  const allPersonsInDocs = [...new Set(documents.map(d => d.person_label || 'applicant'))]
  const filteredDocs = filterPerson === 'all'
    ? documents
    : documents.filter(d => (d.person_label || 'applicant') === filterPerson)

  const uploadedApplicantTypes = new Set(
    documents.filter(d => !d.person_label || d.person_label === 'applicant').map(d => d.document_type)
  )
  const requiredCount  = DOC_TYPES.filter(t => t.required).length
  const uploadedCount  = DOC_TYPES.filter(t => t.required && uploadedApplicantTypes.has(t.value)).length
  const criticalDocs   = documents.filter(d => (d.ai_issues || []).some(i => (typeof i === 'object' ? i.severity : null) === 'critical'))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* AI Document Intelligence Summary */}
      {documents.length > 0 && (() => {
        const verified  = documents.filter(d => d.status === 'verified').length
        const issues    = documents.filter(d => d.status === 'rejected' || (d.ai_issues || []).length > 0).length
        const reviewing = documents.filter(d => d.status === 'ai_processing').length
        const total     = documents.length
        const allGood   = issues === 0 && verified > 0 && reviewing === 0
        return (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className={clsx(
              'flex items-center gap-4 p-4 rounded-2xl border',
              allGood   ? 'border-emerald-500/30 bg-emerald-500/5' :
              issues > 0 ? 'border-amber-500/30 bg-amber-500/5' :
                          'border-blue-500/30 bg-blue-500/5'
            )}
          >
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              allGood ? 'bg-emerald-500/15' : issues > 0 ? 'bg-amber-500/15' : 'bg-blue-500/15'
            )}>
              <Brain size={18} className={allGood ? 'text-emerald-400' : issues > 0 ? 'text-amber-400' : 'text-blue-400'} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-white">
                  {allGood   ? 'AI Document Check: All Clear ✓' :
                   issues > 0 ? `AI Found ${issues} Issue${issues !== 1 ? 's' : ''} — Review Required` :
                   reviewing > 0 ? 'AI is Reviewing Your Documents...' :
                   'AI Document Analysis Ready'}
                </p>
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-maple-500/10 text-maple-400">
                  <Sparkles size={8} /> AI Powered
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {verified} verified · {issues} with issues · {reviewing} processing · {total} total
              </p>
            </div>
            {issues > 0 && (
              <div className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 flex-shrink-0">
                ⚠ Fix issues before applying
              </div>
            )}
          </motion.div>
        )
      })()}

      <div>
        <h1 className="section-title">Documents</h1>
        <p className="text-slate-400 text-sm mt-1">Upload documents for yourself, spouse, and dependants — each is validated automatically</p>
      </div>

      {criticalDocs.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="p-4 rounded-xl bg-red-950/30 border border-red-700/40 flex items-start gap-3"
        >
          <ShieldAlert size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">{criticalDocs.length} document{criticalDocs.length !== 1 ? 's' : ''} need attention</p>
            <p className="text-xs text-slate-400 mt-1">
              {criticalDocs.map(d => DOC_TYPES.find(t => t.value === d.document_type)?.label || d.document_type).join(', ')} — click View to see details
            </p>
          </div>
        </motion.div>
      )}

      <ApplicationWorkflow />
      <EaprWorkflow />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h3 className="font-semibold text-white mb-3">1. Select Document Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {DOC_TYPES.map(type => {
                const count = documents.filter(d => d.document_type === type.value).length
                const hasCritical = documents.some(d =>
                  d.document_type === type.value &&
                  (d.ai_issues || []).some(i => (typeof i === 'object' ? i.severity : null) === 'critical')
                )
                return (
                  <button key={type.value} onClick={() => setSelectedType(type.value)}
                    className={clsx('text-left p-3 rounded-xl border transition-all text-sm',
                      selectedType === type.value ? 'border-maple-500 bg-maple-500/10 text-white'
                        : hasCritical ? 'border-red-700/40 bg-red-950/10 text-slate-300 hover:border-red-600/60'
                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    <span className="text-lg">{type.icon}</span>
                    <p className="font-medium mt-1 text-xs">{type.label}</p>
                    {count > 0 && !hasCritical && <span className="text-emerald-400 text-xs">✓ {count} uploaded</span>}
                    {hasCritical && <span className="text-red-400 text-xs">⚠ Needs review</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="card space-y-3">
            <h3 className="font-semibold text-white">2. Who is this document for?</h3>
            <PersonPicker value={personLabel} onChange={setPersonLabel} />
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Note (optional) — e.g. "Rahul Kumar", "Eldest child"</label>
              <input className="input text-sm" placeholder="Add a name or note..."
                value={personNote} onChange={e => setPersonNote(e.target.value)} />
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-white mb-3">3. Upload File</h3>
            <DropZone
              selectedType={selectedType}
              personLabel={personLabel}
              uploading={upload.isLoading}
              onUpload={file => upload.mutate({ file, type: selectedType, person: personLabel, note: personNote })}
            />
          </div>
        </div>

        {/* Checklist */}
        <div className="card self-start">
          <h3 className="font-semibold text-white mb-3">Applicant Checklist</h3>
          <div className="space-y-1.5">
            {DOC_TYPES.filter(t => t.required).map(type => {
              const uploaded = uploadedApplicantTypes.has(type.value)
              const doc = documents.find(d => d.document_type === type.value && (!d.person_label || d.person_label === 'applicant'))
              const hasProblem = doc && (doc.ai_issues || []).length > 0
              return (
                <div key={type.value}
                  className={clsx('flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                    uploaded ? hasProblem ? 'bg-amber-900/20 hover:bg-amber-900/30' : 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'bg-slate-900 hover:bg-slate-800'
                  )}
                  onClick={() => doc && setDetailDoc(doc)}
                >
                  <span className="text-base">{type.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{type.label}</p>
                    {doc && <p className={clsx('text-xs', hasProblem ? 'text-amber-400' : 'text-slate-500')}>
                      {hasProblem ? `⚠ ${doc.ai_issues.length} issue${doc.ai_issues.length !== 1 ? 's' : ''}` : STATUS_CONFIG[resolveStatus(doc)]?.label}
                    </p>}
                  </div>
                  {uploaded
                    ? <CheckCircle2 size={14} className={hasProblem ? 'text-amber-400' : 'text-emerald-400'} />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-600" />
                  }
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Applicant docs</span>
              <span className="text-white font-mono">{uploadedCount}/{requiredCount}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-maple-500 rounded-full transition-all" style={{ width: `${(uploadedCount / requiredCount) * 100}%` }} />
            </div>
          </div>
          {documents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-1">
              <p className="text-xs text-slate-400 mb-2">All uploaded ({documents.length})</p>
              {allPersonsInDocs.map(p => {
                const person = PERSON_OPTIONS.find(o => o.value === p)
                const count  = documents.filter(d => (d.person_label || 'applicant') === p).length
                return (
                  <div key={p} className="flex items-center justify-between text-xs">
                    <span className={clsx('flex items-center gap-1', PERSON_BADGE[p]?.split(' ')[1] || 'text-slate-400')}>{person?.label || p}</span>
                    <span className="font-mono text-slate-300">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {documents.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-semibold text-white">All Documents ({documents.length})</h3>
            <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
              <button onClick={() => setFilterPerson('all')}
                className={clsx('px-3 py-1 rounded-lg text-xs font-medium transition-all', filterPerson === 'all' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white')}
              >All</button>
              {allPersonsInDocs.map(p => {
                const person = PERSON_OPTIONS.find(o => o.value === p)
                return (
                  <button key={p} onClick={() => setFilterPerson(p)}
                    className={clsx('px-3 py-1 rounded-lg text-xs font-medium transition-all', filterPerson === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white')}
                  >{person?.label || p}</button>
                )
              })}
            </div>
          </div>
          {isLoading
            ? [1,2,3].map(i => <div key={i} className="h-24 shimmer rounded-2xl" />)
            : filteredDocs.map(doc => (
                <DocumentCard key={doc.id} doc={doc} onViewDetails={setDetailDoc} onDelete={id => deleteDoc.mutate(id)} />
              ))
          }
        </div>
      )}

      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
        <p className="text-xs text-slate-400 flex items-start gap-2">
          <Bot size={12} className="mt-0.5 flex-shrink-0" />
          <span>Validation checks expiry reminders, score consistency, and required fields. Full AI analysis requires Celery + Azure Document Intelligence. Always review AI findings — guidance only, not legal advice.</span>
        </p>
      </div>

      <AnimatePresence>
        {detailDoc && <DocumentDetailModal doc={detailDoc} profile={profile} onClose={() => setDetailDoc(null)} />}
      </AnimatePresence>
    </div>
  )
}
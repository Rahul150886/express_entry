import React from 'react'
// src/pages/Onboarding.jsx
// Full profile wizard + eligibility result screen
// Steps: Personal → Language → Work → Education → Other → CRS + Eligibility Result

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Languages, Briefcase, GraduationCap, Award,
  Check, Loader2, Leaf, Plus, Trash2, ChevronRight,
  ArrowRight, Upload, Chrome, TrendingUp,
  CheckCircle2, XCircle, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { profileAPI, crsAPI, eligibilityAPI } from '../services/api'
import clsx from 'clsx'

const STEPS = [
  { id: 'personal',  icon: User,          label: 'Personal',   desc: 'Basic info & citizenship'   },
  { id: 'language',  icon: Languages,     label: 'Language',   desc: 'IELTS / CELPIP scores'      },
  { id: 'work',      icon: Briefcase,     label: 'Work',       desc: 'Work experience & NOC'      },
  { id: 'education', icon: GraduationCap, label: 'Education',  desc: 'Highest credential & ECA'   },
  { id: 'other',     icon: Award,         label: 'Other',      desc: 'Job offer & adaptability'   },
]

function StepDots({ currentIndex }) {
  return (
    <div className="flex items-center mb-6">
      {STEPS.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        const Icon = step.icon
        return (
          <div key={step.id} className="flex items-center">
            <div className={clsx(
              'w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all',
              done   ? 'bg-emerald-500 border-emerald-500 text-white' :
              active ? 'bg-maple-600 border-maple-500 text-white' :
                       'bg-slate-800 border-slate-700 text-slate-600'
            )}>
              {done ? <Check size={13} /> : <Icon size={13} />}
            </div>
            <div className="hidden sm:flex flex-col ml-1.5 mr-3">
              <span className={clsx('text-[11px] font-semibold leading-tight',
                active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-600'
              )}>{step.label}</span>
              <span className="text-[9px] text-slate-600 leading-tight">{step.desc}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={clsx('h-px w-4 sm:w-6 mr-1 sm:mr-0', done ? 'bg-emerald-500' : 'bg-slate-800')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors">
      ← Back
    </button>
  )
}

function errMsg(err) {
  const d = err?.response?.data?.detail
  return Array.isArray(d) ? d.map(e => e.msg).join(', ') : (typeof d === 'string' ? d : 'Could not save')
}

// ── Step 1: Personal ─────────────────────────────────────────────
function PersonalStep({ profile, onNext }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: {
      full_name: profile?.full_name || '',
      date_of_birth: profile?.date_of_birth || '',
      nationality: profile?.nationality || '',
      country_of_residence: profile?.country_of_residence || '',
      marital_status: profile?.marital_status || 'single',
      has_spouse: profile?.has_spouse || false,
      has_provincial_nomination: profile?.has_provincial_nomination || false,
      has_sibling_in_canada: profile?.has_sibling_in_canada || false,
      has_certificate_of_qualification: profile?.has_certificate_of_qualification || false,
    }
  })
  const qc = useQueryClient()
  const marital = watch('marital_status')

  const onSubmit = async (data) => {
    try {
      const payload = { ...data, has_spouse: ['married','common_law'].includes(data.marital_status) ? !!data.has_spouse : false }
      if (profile) await profileAPI.update(payload)
      else await profileAPI.create(payload)
      await qc.invalidateQueries('profile')
      onNext()
    } catch (err) { toast.error(errMsg(err)) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full Name">
          <input className="input" placeholder="John Smith" {...register('full_name', { required: true })} />
        </Field>
        <Field label="Date of Birth">
          <input type="date" className="input" {...register('date_of_birth', { required: true })} />
        </Field>
        <Field label="Nationality / Country of Birth">
          <input className="input" placeholder="India" {...register('nationality', { required: true })} />
        </Field>
        <Field label="Country of Residence">
          <input className="input" placeholder="India" {...register('country_of_residence')} />
        </Field>
        <Field label="Marital Status">
          <select className="select" {...register('marital_status')}>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="common_law">Common-Law</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="separated">Separated</option>
          </select>
        </Field>
      </div>
      <div className="space-y-2.5 pt-1">
        {['married','common_law'].includes(marital) && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" {...register('has_spouse')} className="mt-0.5 accent-maple-500" />
            <span className="text-sm text-slate-300">Include spouse/partner in application</span>
          </label>
        )}
        {[
          { name: 'has_provincial_nomination',       label: 'Provincial Nomination (PNP) — +600 CRS pts' },
          { name: 'has_sibling_in_canada',            label: 'Sibling in Canada (citizen or PR) — +15 CRS pts' },
          { name: 'has_certificate_of_qualification', label: 'Canadian certificate of qualification in a skilled trade' },
        ].map(({ name, label }) => (
          <label key={name} className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" {...register(name)} className="mt-0.5 accent-maple-500" />
            <span className="text-sm text-slate-300">{label}</span>
          </label>
        ))}
      </div>
      <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-maple-600 hover:bg-maple-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
        {isSubmitting ? <><Loader2 size={15} className="animate-spin" />Saving...</> : <>Save & Continue <ChevronRight size={15} /></>}
      </button>
    </form>
  )
}

// ── Step 2: Language ─────────────────────────────────────────────
function LanguageFields({ register }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Field label="Test Type">
        <select className="select" {...register('test_type', { required: true })}>
          <option value="ielts">IELTS General Training</option>
          <option value="celpip">CELPIP General</option>
          <option value="tef">TEF Canada</option>
          <option value="tcf">TCF Canada</option>
        </select>
      </Field>
      <Field label="Role">
        <select className="select" {...register('role')}>
          <option value="first">1st Language</option>
          <option value="second">2nd Language</option>
        </select>
      </Field>
      <Field label="Language">
        <select className="select" {...register('language')}>
          <option value="english">English</option>
          <option value="french">French</option>
        </select>
      </Field>
      {['listening','reading','writing','speaking'].map(s => (
        <Field key={s} label={s.charAt(0).toUpperCase() + s.slice(1)}>
          <input type="number" step="0.5" className="input" placeholder="7.5"
            {...register(s, { required: true, valueAsNumber: true })} />
        </Field>
      ))}
      <Field label="Test Date">
        <input type="date" className="input" {...register('test_date', { required: true })} />
      </Field>
      <Field label="TRF / Reg #">
        <input className="input" placeholder="Optional" {...register('registration_number')} />
      </Field>
    </div>
  )
}

function LanguageStep({ profile, onNext, onBack }) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const { register, handleSubmit, reset, setValue } = useForm()
  const qc = useQueryClient()

  const save = (data) => ({ ...data, test_type: data.test_type.toLowerCase(), language: data.language || 'english' })

  const addTest    = useMutation((d) => profileAPI.addLanguageTest(save(d)).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Language test added!'); reset(); setAdding(false) } })
  const updateTest = useMutation(({ id, data }) => profileAPI.updateLanguageTest(id, save(data)).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Updated!'); reset(); setEditingId(null) } })
  const deleteTest = useMutation((id) => profileAPI.deleteLanguageTest(id),
    { onSuccess: () => qc.invalidateQueries('profile') })

  const tests = profile?.language_tests || []

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
        <p><span className="text-white font-medium">1st Language</span> — Primary test. Up to <span className="text-emerald-400">136 CRS pts</span></p>
        <p className="mt-0.5"><span className="text-white font-medium">2nd Language</span> — Bilingual bonus. Up to <span className="text-emerald-400">24 CRS pts</span></p>
      </div>

      {tests.map(test => (
        <div key={test.id}>
          {editingId === test.id ? (
            <form onSubmit={handleSubmit(d => updateTest.mutate({ id: editingId, data: d }))}
              className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-4">
              <p className="font-semibold text-white text-sm">Edit {test.test_type?.toUpperCase()}</p>
              <LanguageFields register={register} />
              <div className="flex gap-2">
                <button type="submit" disabled={updateTest.isLoading} className="btn-primary text-sm">
                  {updateTest.isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                </button>
                <button type="button" onClick={() => { setEditingId(null); reset() }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="flex gap-2 mb-2">
                    <span className="badge-blue text-xs">{test.test_type?.toUpperCase()}</span>
                    <span className="badge-slate text-xs">{test.role === 'first' ? '1st' : '2nd'} Language</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {['listening','reading','writing','speaking'].map(s => (
                      <div key={s}>
                        <p className="text-[10px] text-slate-500 capitalize">{s}</p>
                        <p className="text-base font-bold text-white">{test[s]}</p>
                        {test[`clb_${s}`] && <p className="text-[10px] text-maple-400">CLB {test[`clb_${s}`]}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{test.test_date}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(test.id); setAdding(false); Object.entries(test).forEach(([k,v]) => setValue(k,v)) }}
                    className="btn-ghost text-xs px-2 py-1 text-blue-400">✏️</button>
                  <button onClick={() => deleteTest.mutate(test.id)} className="btn-ghost text-xs px-2 py-1 text-slate-500 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding && (
        <form onSubmit={handleSubmit(d => addTest.mutate(d))}
          className="p-4 rounded-xl border border-maple-500/30 bg-maple-500/5 space-y-4">
          <p className="font-semibold text-white">Add Language Test</p>
          <LanguageFields register={register} />
          <div className="flex gap-2">
            <button type="submit" disabled={addTest.isLoading} className="btn-primary text-sm">
              {addTest.isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Add Test'}
            </button>
            <button type="button" onClick={() => { setAdding(false); reset() }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}

      {!adding && !editingId && (
        <button onClick={() => { setAdding(true); reset() }} className="btn-secondary w-full text-sm">
          <Plus size={14} /> Add Language Test
        </button>
      )}

      <div className="flex gap-3 pt-2">
        <BackBtn onClick={onBack} />
        <button type="button" onClick={onNext} disabled={tests.length === 0}
          className="flex-1 py-2.5 bg-maple-600 hover:bg-maple-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
          Continue <ChevronRight size={15} />
        </button>
      </div>
      {tests.length === 0 && <p className="text-xs text-center text-amber-400">Add at least one language test to continue</p>}
    </div>
  )
}

// ── Step 3: Work ─────────────────────────────────────────────────
function WorkStep({ profile, onNext, onBack }) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const { register, handleSubmit, reset, setValue, watch } = useForm({ defaultValues: { is_current: false, hours_per_week: 40 } })
  const qc = useQueryClient()
  const isCurrent = watch('is_current')

  const buildPayload = (data) => ({
    ...data,
    experience_type: (data.country||'').toLowerCase().includes('canada') ? 'canadian' : 'foreign',
    end_date: data.is_current ? null : data.end_date,
    teer_level: String(data.teer_level || '1'),
    noc_title: data.job_title || '',
  })

  const addWork    = useMutation((d) => profileAPI.addWorkExperience(buildPayload(d)).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Work experience added!'); reset({ is_current: false, hours_per_week: 40 }); setAdding(false) } })
  const updateWork = useMutation(({ id, data }) => profileAPI.updateWorkExperience(id, buildPayload(data)).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Updated!'); reset(); setEditingId(null) } })
  const deleteWork = useMutation((id) => profileAPI.deleteWorkExperience(id),
    { onSuccess: () => qc.invalidateQueries('profile') })

  const jobs = profile?.work_experiences || []

  const WorkFields = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Job Title"><input className="input" placeholder="Software Engineer" {...register('job_title', { required: true })} /></Field>
      <Field label="Employer Name"><input className="input" placeholder="Acme Corp" {...register('employer_name', { required: true })} /></Field>
      <Field label="NOC Code" hint="5-digit code"><input className="input" placeholder="21232" {...register('noc_code', { required: true })} /></Field>
      <Field label="TEER Level">
        <select className="select" {...register('teer_level')}>
          {['0','1','2','3','4','5'].map(t => <option key={t} value={t}>TEER {t}</option>)}
        </select>
      </Field>
      <Field label="Country"><input className="input" placeholder="Canada / India" {...register('country')} /></Field>
      <Field label="Hours/Week"><input type="number" className="input" placeholder="40" {...register('hours_per_week', { valueAsNumber: true })} /></Field>
      <Field label="Start Date"><input type="date" className="input" {...register('start_date', { required: true })} /></Field>
      <div className="flex items-center mt-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...register('is_current')} className="accent-maple-500" />
          <span className="text-sm text-slate-300">Currently working here</span>
        </label>
      </div>
      {!isCurrent && <Field label="End Date"><input type="date" className="input" {...register('end_date')} /></Field>}
    </div>
  )

  return (
    <div className="space-y-4">
      {jobs.map(job => (
        <div key={job.id}>
          {editingId === job.id ? (
            <form onSubmit={handleSubmit(d => updateWork.mutate({ id: editingId, data: d }))}
              className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-4">
              <p className="font-semibold text-white text-sm">Edit: {job.job_title}</p>
              <WorkFields />
              <div className="flex gap-2">
                <button type="submit" disabled={updateWork.isLoading} className="btn-primary text-sm">
                  {updateWork.isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                </button>
                <button type="button" onClick={() => { setEditingId(null); reset() }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-white text-sm">{job.job_title}</p>
                  <p className="text-xs text-slate-400">{job.employer_name} · {job.country} · NOC {job.noc_code}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{job.start_date} → {job.is_current ? 'Present' : (job.end_date||'?')} · {job.hours_per_week}h/week</p>
                  <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block',
                    job.experience_type === 'canadian' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'
                  )}>
                    {job.experience_type === 'canadian' ? '🍁 Canadian' : '🌍 Foreign'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(job.id); setAdding(false); Object.entries(job).forEach(([k,v]) => setValue(k,v)) }}
                    className="btn-ghost text-xs px-2 py-1 text-blue-400">✏️</button>
                  <button onClick={() => deleteWork.mutate(job.id)} className="btn-ghost text-xs px-2 py-1 text-slate-500 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding && (
        <form onSubmit={handleSubmit(d => addWork.mutate(d))}
          className="p-4 rounded-xl border border-maple-500/30 bg-maple-500/5 space-y-4">
          <p className="font-semibold text-white">Add Work Experience</p>
          <WorkFields />
          <div className="flex gap-2">
            <button type="submit" disabled={addWork.isLoading} className="btn-primary text-sm">
              {addWork.isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
            </button>
            <button type="button" onClick={() => { setAdding(false); reset({ is_current: false, hours_per_week: 40 }) }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}

      {!adding && !editingId && (
        <button onClick={() => { setAdding(true); reset({ is_current: false, hours_per_week: 40 }) }} className="btn-secondary w-full text-sm">
          <Plus size={14} /> Add Work Experience
        </button>
      )}

      <div className="flex gap-3 pt-2">
        <BackBtn onClick={onBack} />
        <button type="button" onClick={onNext}
          className="flex-1 py-2.5 bg-maple-600 hover:bg-maple-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
          Continue <ChevronRight size={15} />
        </button>
      </div>
      <p className="text-xs text-center text-slate-600">Work experience is optional — skip if none</p>
    </div>
  )
}

// ── Step 4: Education ────────────────────────────────────────────
function EducationStep({ profile, onNext, onBack }) {
  const edu = profile?.education
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      level: edu?.level || '',
      field_of_study: edu?.field_of_study || '',
      institution_name: edu?.institution_name || '',
      country: edu?.country || '',
      is_canadian: edu?.is_canadian || false,
      eca_organization: edu?.eca_organization || '',
      eca_reference_number: edu?.eca_reference_number || '',
    }
  })
  const qc = useQueryClient()

  const onSubmit = async (data) => {
    try {
      await profileAPI.setEducation({
        ...data,
        is_three_year_or_more: ['bachelors','masters','doctoral','two_or_more_degrees'].includes(data.level),
        completion_date: null,
      })
      await qc.invalidateQueries('profile')
      toast.success('Education saved!')
      onNext()
    } catch (err) { toast.error(errMsg(err)) }
  }

  const LEVELS = [
    { value: 'doctoral',                label: 'PhD / Doctorate',               pts: 25 },
    { value: 'masters',                 label: "Master's Degree",               pts: 23 },
    { value: 'two_or_more_degrees',     label: '2+ Post-Secondary Degrees',     pts: 22 },
    { value: 'bachelors',               label: "Bachelor's Degree (3+ years)",  pts: 21 },
    { value: 'two_year_post_secondary', label: '2-Year Diploma / College',      pts: 19 },
    { value: 'one_year_post_secondary', label: '1-Year Certificate',            pts: 15 },
    { value: 'secondary',               label: 'Secondary School',              pts:  5 },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Highest Level of Education</label>
        <div className="space-y-1.5">
          {LEVELS.map(l => (
            <label key={l.value} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer has-[:checked]:border-maple-500 has-[:checked]:bg-maple-500/5 transition-all">
              <div className="flex items-center gap-3">
                <input type="radio" value={l.value} className="accent-maple-500" {...register('level', { required: true })} />
                <span className="text-sm text-slate-300">{l.label}</span>
              </div>
              <span className="text-[10px] text-slate-600 font-mono">{l.pts} pts</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Field of Study"><input className="input" placeholder="Computer Science" {...register('field_of_study')} /></Field>
        <Field label="Institution Name"><input className="input" placeholder="University of Toronto" {...register('institution_name')} /></Field>
        <Field label="Country of Study"><input className="input" placeholder="India" {...register('country')} /></Field>
        <div className="pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('is_canadian')} className="accent-maple-500" />
            <span className="text-sm text-slate-300">Canadian institution (+bonus CRS pts)</span>
          </label>
        </div>
        <Field label="ECA Organization" hint="e.g. WES — required for foreign degrees">
          <input className="input" placeholder="WES" {...register('eca_organization')} />
        </Field>
        <Field label="ECA Reference Number"><input className="input" placeholder="Optional" {...register('eca_reference_number')} /></Field>
      </div>
      <div className="flex gap-3">
        <BackBtn onClick={onBack} />
        <button type="submit" disabled={isSubmitting}
          className="flex-1 py-2.5 bg-maple-600 hover:bg-maple-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
          {isSubmitting ? <><Loader2 size={15} className="animate-spin" />Saving...</> : <>Save & Continue <ChevronRight size={15} /></>}
        </button>
      </div>
    </form>
  )
}

// ── Step 5: Other ────────────────────────────────────────────────
function OtherStep({ profile, onNext, onBack }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      employer_name: profile?.job_offer?.employer_name || '',
      noc_code: profile?.job_offer?.noc_code || '',
      teer_level: profile?.job_offer?.teer_level || '1',
      annual_salary: profile?.job_offer?.annual_salary || '',
      is_lmia_exempt: profile?.job_offer?.is_lmia_exempt || false,
    }
  })
  const qc = useQueryClient()

  const onSubmit = async (data) => {
    try {
      if (data.employer_name && data.noc_code) {
        await profileAPI.setJobOffer(data)
        await qc.invalidateQueries('profile')
        toast.success('Job offer saved!')
      }
      onNext()
    } catch (err) { toast.error(errMsg(err)) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-400 space-y-1">
        <p className="text-white font-semibold text-sm mb-2">Adaptability factors (from Personal step)</p>
        <p>• Provincial Nomination: {profile?.has_provincial_nomination ? '✅ Yes (+600 pts)' : '❌ No'}</p>
        <p>• Sibling in Canada: {profile?.has_sibling_in_canada ? '✅ Yes (+15 pts)' : '❌ No'}</p>
        <p>• Certificate of Qualification: {profile?.has_certificate_of_qualification ? '✅ Yes' : '❌ No'}</p>
      </div>
      <div className="card border border-slate-700">
        <p className="font-semibold text-white mb-3">Valid Job Offer <span className="text-slate-500 font-normal text-sm">(optional — adds 50–200 pts)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Employer Name"><input className="input" placeholder="Company name" {...register('employer_name')} /></Field>
          <Field label="NOC Code"><input className="input" placeholder="10010" {...register('noc_code')} /></Field>
          <Field label="TEER Level">
            <select className="select" {...register('teer_level')}>
              {['0','1','2','3'].map(t => <option key={t} value={t}>TEER {t}</option>)}
            </select>
          </Field>
          <Field label="Annual Salary (CAD)">
            <input type="number" className="input" placeholder="80000" {...register('annual_salary', { valueAsNumber: true })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input type="checkbox" {...register('is_lmia_exempt')} className="accent-maple-500" />
          <span className="text-sm text-slate-300">LMIA-exempt position</span>
        </label>
      </div>
      <div className="flex gap-3">
        <BackBtn onClick={onBack} />
        <button type="submit" disabled={isSubmitting}
          className="flex-1 py-2.5 bg-maple-600 hover:bg-maple-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
          {isSubmitting ? <><Loader2 size={15} className="animate-spin" />Saving...</> : <><Sparkles size={15} /> Calculate My Score</>}
        </button>
      </div>
    </form>
  )
}

// ── Eligibility Result ───────────────────────────────────────────
function EligibilityResult({ crsScore, eligibility, onContinue }) {
  // API returns {FSW: {...}, CEC: {...}, FST: {...}} at top level
  const fsw         = eligibility?.FSW || eligibility?.programs?.FSW
  const cec         = eligibility?.CEC || eligibility?.programs?.CEC
  const fst         = eligibility?.FST || eligibility?.programs?.FST
  const anyEligible = !!(fsw?.eligible || cec?.eligible || fst?.eligible)
  const programs    = { FSW: fsw, CEC: cec, FST: fst }

  // Breakdown is inside checks array, not a direct property
  const fswBreakdown = fsw?.checks?.find(c => c.criterion === 'FSW 67-point selection grid')?.breakdown || {}
  const fswTotal = fsw?.selection_points || Object.values(fswBreakdown).reduce((sum, v) => {
    return sum + parseInt(String(v).match(/^(\d+)/)?.[1] || '0')
  }, 0)

  const nextSteps = anyEligible ? [
    { icon: Upload,  label: 'Upload your documents',        desc: 'Passport, IELTS, degree, employment letters' },
    { icon: '🤖',    label: 'Run AI document checker',      desc: 'We verify everything matches your profile'   },
    { icon: Chrome,  label: 'Install Chrome extension',     desc: 'Auto-fill your IRCC application in minutes'  },
  ] : [
    { icon: TrendingUp, label: 'Use the Score Simulator',   desc: 'Find the fastest path to improve your score' },
    { icon: '🎓',       label: 'Improve language scores',   desc: 'CLB 9 across all 4 skills is worth ~40 pts extra' },
    { icon: Upload,     label: 'Start gathering documents', desc: 'Begin document preparation early'            },
  ]

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">

      {/* CRS Score card */}
      <div className="card text-center border border-slate-700 relative overflow-hidden">
        <div className={clsx('absolute inset-0 opacity-5 pointer-events-none', anyEligible ? 'bg-emerald-500' : 'bg-amber-500')}
          style={{ filter: 'blur(40px)' }} />
        <div className="relative z-10">
          <div className={clsx('inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold mb-3',
            anyEligible ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          )}>
            {anyEligible ? '✅ Eligible for Express Entry' : '⚡ Not yet eligible'}
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Your CRS Score</p>
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={clsx('text-7xl font-black tabular-nums block', anyEligible ? 'text-emerald-400' : 'text-amber-400')}>
            {crsScore || '—'}
          </motion.span>
          <div className="mt-3 h-2 bg-slate-800 rounded-full overflow-hidden max-w-xs mx-auto">
            <motion.div className={clsx('h-full rounded-full', anyEligible ? 'bg-emerald-500' : 'bg-amber-500')}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, ((crsScore||0)/600)*100)}%` }}
              transition={{ delay: 0.3, duration: 0.8 }} />
          </div>
          <p className="text-xs text-slate-600 mt-1">out of 600 · typical draw cutoff ~480</p>
        </div>
      </div>

      {/* FSW 67-point grid */}
      <div className="card border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-white">FSW 67-Point Selection Grid</p>
          <span className={clsx('text-sm font-bold px-3 py-1 rounded-full',
            (fswTotal >= 67 || fsw?.eligible) ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          )}>
            {fswTotal || (fsw?.eligible ? '67+' : '<67')} / 67 pts
          </span>
        </div>
        {Object.keys(fswBreakdown).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(fswBreakdown).map(([factor, value]) => {
              const pts = parseInt(String(value).match(/^(\d+)/)?.[1] || '0')
              const maxMap = { age:12, education:25, language:28, experience:15, arranged_employment:10, adaptability:10 }
              const max = maxMap[factor.toLowerCase().replace(/ /g,'_')] || 25
              const pct = Math.min(100, (pts/max)*100)
              return (
                <div key={factor}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 capitalize">{factor.replace(/_/g,' ')}</span>
                    <span className="font-mono text-white">{pts}<span className="text-slate-600">/{max}</span></span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full', pts >= max ? 'bg-emerald-500' : 'bg-maple-500')}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5">{String(value).replace(/^\d+\s*pts?\s*/i,'')}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Complete your full profile for the 67-point breakdown</p>
        )}
      </div>

      {/* Program eligibility */}
      <div className="card border border-slate-700">
        <p className="font-bold text-white mb-3">Express Entry Programs</p>
        <div className="space-y-2">
          {[
            { prog: fsw, label: 'Federal Skilled Worker (FSW)', desc: '67/100 pts on grid + CLB 7 minimum' },
            { prog: cec, label: 'Canadian Experience Class (CEC)', desc: '1+ year Canadian work experience' },
            { prog: fst, label: 'Federal Skilled Trades (FST)', desc: '2+ years qualifying trades experience' },
          ].filter(({ prog }) => prog !== undefined).map(({ prog, label, desc }) => (
            <div key={label} className={clsx('flex items-start gap-3 p-3 rounded-xl border',
              prog?.eligible ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-800 bg-slate-800/20'
            )}>
              {prog?.eligible
                ? <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                : <XCircle     size={16} className="text-slate-600 flex-shrink-0 mt-0.5" />}
              <div>
                <p className={clsx('text-sm font-semibold', prog?.eligible ? 'text-white' : 'text-slate-500')}>{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{prog?.reason || desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next steps */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Your next steps</p>
        {nextSteps.map((s, i) => (
          <motion.div key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.4+i*0.1 }}
            className="flex items-start gap-3 p-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-maple-500/10 flex items-center justify-center flex-shrink-0 text-base">
              {typeof s.icon === 'string' ? s.icon : <s.icon size={15} className="text-maple-400" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{s.label}</p>
              <p className="text-xs text-slate-500">{s.desc}</p>
            </div>
            <span className="text-xs font-bold text-slate-700 mt-1">{i+1}</span>
          </motion.div>
        ))}
      </div>

      <button onClick={onContinue}
        className="w-full py-4 bg-maple-600 hover:bg-maple-700 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2">
        Go to Dashboard <ArrowRight size={16} />
      </button>
    </motion.div>
  )
}

// ── Main Onboarding ──────────────────────────────────────────────
export default function Onboarding() {
  const [stepIndex,   setStepIndex]   = useState(0)
  const [phase,       setPhase]       = useState('wizard')
  const [crsScore,    setCrsScore]    = useState(null)
  const [eligibility, setEligibility] = useState(null)
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const { data: profile, isLoading } = useQuery(
    'profile',
    () => profileAPI.get().then(r => r.data),
    { retry: false, onError: () => {} }
  )

  const next = () => stepIndex < STEPS.length - 1 ? setStepIndex(i => i+1) : finishWizard()
  const back = () => setStepIndex(i => Math.max(0, i-1))

  const finishWizard = async () => {
    setPhase('calculating')
    try {
      const [crsRes, eligRes] = await Promise.all([
        crsAPI.calculate().then(r => r.data),
        eligibilityAPI.check().then(r => r.data).catch(() => null),
      ])
      setCrsScore(crsRes?.total || crsRes?.score?.total || null)
      setEligibility(eligRes)
    } catch { setCrsScore(null) }
    setPhase('result')
  }

  const goToDashboard = () => {
    localStorage.setItem('onboarding_complete', 'true')
    qc.invalidateQueries('profile')
    qc.invalidateQueries('crs-score')
    toast.success('Profile complete! Welcome.')
    navigate('/dashboard')
  }

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-maple-400" />
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-maple-600/5 blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-64 h-64 rounded-full bg-maple-600/3 blur-3xl" />
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pt-2">
          <div className="w-9 h-9 bg-maple-600 rounded-xl flex items-center justify-center">
            <Leaf size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white leading-tight">Express Entry PR</p>
            <p className="text-slate-500 text-xs">Complete your profile to get your CRS score & eligibility</p>
          </div>
          {phase === 'wizard' && (
            <button onClick={() => { localStorage.setItem('onboarding_complete','true'); navigate('/dashboard') }}
              className="ml-auto text-xs text-slate-700 hover:text-slate-500 transition-colors">
              Skip for now
            </button>
          )}
        </div>

        {/* Result */}
        {phase === 'result' && (
          <EligibilityResult crsScore={crsScore} eligibility={eligibility} onContinue={goToDashboard} />
        )}

        {/* Calculating */}
        {phase === 'calculating' && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-maple-500/10 border border-maple-500/20 flex items-center justify-center">
              <Sparkles size={28} className="text-maple-400 animate-pulse" />
            </div>
            <p className="text-white font-bold text-lg">Calculating your scores...</p>
            <p className="text-slate-500 text-sm">Analysing all factors against IRCC rules</p>
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <motion.div key={i} className="w-2 h-2 rounded-full bg-maple-500"
                  animate={{ scale:[1,1.4,1], opacity:[0.5,1,0.5] }}
                  transition={{ repeat:Infinity, duration:1, delay:i*0.2 }} />
              ))}
            </div>
          </div>
        )}

        {/* Wizard */}
        {phase === 'wizard' && (
          <>
            <StepDots currentIndex={stepIndex} />
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <AnimatePresence mode="wait">
                <motion.div key={stepIndex}
                  initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-16 }}
                  transition={{ duration:0.2 }}>
                  <div className="flex items-center gap-3 mb-5">
                    {(() => { const Icon = STEPS[stepIndex].icon; return (
                      <div className="w-9 h-9 rounded-xl bg-maple-500/10 border border-maple-500/20 flex items-center justify-center">
                        <Icon size={17} className="text-maple-400" />
                      </div>
                    )})()}
                    <div>
                      <h2 className="font-bold text-white">{STEPS[stepIndex].label}</h2>
                      <p className="text-xs text-slate-500">{STEPS[stepIndex].desc}</p>
                    </div>
                    <span className="ml-auto text-xs text-slate-700">{stepIndex+1}/{STEPS.length}</span>
                  </div>
                  {stepIndex === 0 && <PersonalStep  profile={profile} onNext={next} />}
                  {stepIndex === 1 && <LanguageStep  profile={profile} onNext={next} onBack={back} />}
                  {stepIndex === 2 && <WorkStep      profile={profile} onNext={next} onBack={back} />}
                  {stepIndex === 3 && <EducationStep profile={profile} onNext={next} onBack={back} />}
                  {stepIndex === 4 && <OtherStep     profile={profile} onNext={next} onBack={back} />}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
              <motion.div className="h-full bg-maple-500 rounded-full"
                animate={{ width:`${((stepIndex+1)/STEPS.length)*100}%` }} transition={{ duration:0.4 }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-700">Profile setup</span>
              <span className="text-[10px] text-slate-700">{Math.round(((stepIndex+1)/STEPS.length)*100)}% complete</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
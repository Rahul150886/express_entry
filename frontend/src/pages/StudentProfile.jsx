import React from 'react'
// src/pages/StudentProfile.jsx
// Student visa profile onboarding — 4-step wizard

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, User, Globe, DollarSign, Check, ChevronRight,
  ChevronLeft, Loader2, BookOpen, Languages, Briefcase, AlertCircle
} from 'lucide-react'
import { studentAPI } from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STEPS = [
  { id: 'personal',   label: 'Background',  icon: User         },
  { id: 'academic',   label: 'Academic',    icon: GraduationCap},
  { id: 'language',   label: 'Language',    icon: Languages    },
  { id: 'goals',      label: 'Goals',       icon: Globe        },
  { id: 'financial',  label: 'Financial',   icon: DollarSign   },
]

const COUNTRIES = [
  { id: 'canada',    label: 'Canada',    flag: '🍁', desc: 'PGWP + Express Entry pathway' },
  { id: 'uk',        label: 'UK',        flag: '🇬🇧', desc: 'PSW visa + Graduate Route' },
  { id: 'australia', label: 'Australia', flag: '🇦🇺', desc: 'Post-study work rights'      },
  { id: 'usa',       label: 'USA',       flag: '🇺🇸', desc: 'OPT/STEM OPT extension'     },
  { id: 'germany',   label: 'Germany',   flag: '🇩🇪', desc: '18-month job seeker visa'   },
]

const EDUCATION_LEVELS = [
  { id: 'high_school', label: 'High School / Secondary' },
  { id: 'diploma',     label: 'Diploma / Associate'     },
  { id: 'bachelors',   label: "Bachelor's Degree"       },
  { id: 'masters',     label: "Master's Degree"         },
  { id: 'phd',         label: 'PhD / Doctorate'         },
]

const TARGET_LEVELS = [
  { id: 'diploma',          label: 'Diploma / Certificate' },
  { id: 'bachelors',        label: "Bachelor's Degree"     },
  { id: 'masters',          label: "Master's Degree"       },
  { id: 'phd',              label: 'PhD / Doctorate'       },
  { id: 'language_course',  label: 'Language Course'       },
]

const LANGUAGE_TESTS = [
  { id: 'ielts',     label: 'IELTS Academic', scale: '0–9.0' },
  { id: 'pte',       label: 'PTE Academic',   scale: '10–90' },
  { id: 'toefl',     label: 'TOEFL iBT',      scale: '0–120' },
  { id: 'duolingo',  label: 'Duolingo',        scale: '10–160'},
  { id: 'not_taken', label: "Haven't taken yet", scale: ''   },
]

function StepBar({ current }) {
  const idx = STEPS.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done = i < idx; const active = i === idx
        const Icon = step.icon
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all',
                done   ? 'bg-emerald-500 border-emerald-500' :
                active ? 'bg-blue-500 border-blue-500 shadow-lg shadow-blue-500/30' :
                         'bg-slate-800 border-slate-700'
              )}>
                {done ? <Check size={15} className="text-white" />
                      : <Icon size={15} className={active ? 'text-white' : 'text-slate-500'} />}
              </div>
              <p className={clsx('text-[10px] font-semibold whitespace-nowrap hidden sm:block',
                active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-600'
              )}>{step.label}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mx-2 mb-4', done ? 'bg-emerald-500' : 'bg-slate-800')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FieldGroup({ label, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
      {children}
    </div>
  )
}

function SelectGrid({ options, value, onChange, multi = false }) {
  const selected = multi ? (value || []) : value
  const toggle = (id) => {
    if (multi) {
      const s = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
      onChange(s)
    } else {
      onChange(id)
    }
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(opt => {
        const active = multi ? selected.includes(opt.id) : selected === opt.id
        return (
          <button key={opt.id} type="button" onClick={() => toggle(opt.id)}
            className={clsx(
              'text-left p-3 rounded-xl border transition-all text-sm',
              active ? 'border-blue-500 bg-blue-500/10 text-white' :
                       'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
            )}
          >
            {opt.flag && <span className="text-lg mr-1">{opt.flag}</span>}
            <p className="font-semibold text-sm leading-tight">{opt.label}</p>
            {opt.desc && <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>}
            {opt.scale && <p className="text-[10px] text-slate-500">{opt.scale}</p>}
          </button>
        )
      })}
    </div>
  )
}

// ── Step components ──────────────────────────────────────────
function StepPersonal({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Tell us about yourself</h2>
        <p className="text-slate-400 text-sm mt-1">We use this to assess your visa eligibility per country</p>
      </div>
      <FieldGroup label="Nationality (passport country)">
        <input className="input w-full" placeholder="e.g. Indian, Nigerian, Brazilian"
          value={data.nationality || ''} onChange={e => onChange('nationality', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Country of Current Residence">
        <input className="input w-full" placeholder="Where are you living now?"
          value={data.current_country || ''} onChange={e => onChange('current_country', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Date of Birth">
        <input type="date" className="input w-full"
          value={data.dob || ''} onChange={e => onChange('dob', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Work Experience (optional)">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Years of experience</p>
            <input type="number" min="0" max="30" step="0.5" className="input w-full"
              placeholder="0" value={data.work_experience_years || ''}
              onChange={e => onChange('work_experience_years', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Field / industry</p>
            <input className="input w-full" placeholder="e.g. Software, Finance"
              value={data.work_field || ''} onChange={e => onChange('work_field', e.target.value)} />
          </div>
        </div>
      </FieldGroup>
      <FieldGroup label="Any Prior Visa Refusals?">
        <div className="flex gap-3">
          {[false, true].map(val => (
            <button key={String(val)} type="button"
              onClick={() => onChange('has_refusal', val)}
              className={clsx('flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                data.has_refusal === val
                  ? val ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              )}>
              {val ? 'Yes — I have refusals' : 'No refusals'}
            </button>
          ))}
        </div>
        {data.has_refusal && (
          <input className="input w-full mt-2" placeholder="Which countries refused? (e.g. Canada, UK)"
            value={data.refusal_countries?.join(', ') || ''}
            onChange={e => onChange('refusal_countries', e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))} />
        )}
      </FieldGroup>
    </div>
  )
}

function StepAcademic({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Academic Background</h2>
        <p className="text-slate-400 text-sm mt-1">Your highest completed qualification</p>
      </div>
      <FieldGroup label="Highest Education Level Completed">
        <SelectGrid options={EDUCATION_LEVELS} value={data.current_education_level}
          onChange={v => onChange('current_education_level', v)} />
      </FieldGroup>
      <FieldGroup label="Institution Name">
        <input className="input w-full" placeholder="University or college name"
          value={data.institution_name || ''} onChange={e => onChange('institution_name', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Field / Major">
        <input className="input w-full" placeholder="e.g. Computer Science, Business Administration"
          value={data.field_of_study || ''} onChange={e => onChange('field_of_study', e.target.value)} />
      </FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Graduation Year">
          <input type="number" min="1990" max="2030" className="input w-full"
            placeholder="e.g. 2022"
            value={data.graduation_year || ''} onChange={e => onChange('graduation_year', parseInt(e.target.value) || null)} />
        </FieldGroup>
        <FieldGroup label="GPA" hint="Leave blank if not applicable">
          <div className="flex gap-2">
            <input type="number" min="0" max="10" step="0.01" className="input flex-1"
              placeholder="e.g. 3.2"
              value={data.gpa || ''} onChange={e => onChange('gpa', parseFloat(e.target.value) || null)} />
            <input type="number" min="0" max="10" step="0.5" className="input w-20"
              placeholder="/ 4.0"
              value={data.gpa_scale || ''} onChange={e => onChange('gpa_scale', parseFloat(e.target.value) || null)} />
          </div>
        </FieldGroup>
      </div>
      <FieldGroup label="Any Study Gaps?">
        <div className="flex gap-3 mb-2">
          {[false, true].map(val => (
            <button key={String(val)} type="button"
              onClick={() => onChange('has_gaps', val)}
              className={clsx('flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                data.has_gaps === val
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              )}>
              {val ? 'Yes, I have gaps' : 'No gaps'}
            </button>
          ))}
        </div>
        {data.has_gaps && (
          <textarea rows={2} className="input w-full resize-none text-sm"
            placeholder="Briefly explain the gap (e.g. worked at family business 2020–2021, then resumed studies)"
            value={data.gap_explanation || ''} onChange={e => onChange('gap_explanation', e.target.value)} />
        )}
      </FieldGroup>
    </div>
  )
}

function StepLanguage({ data, onChange }) {
  const test = data.language_test
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Language Proficiency</h2>
        <p className="text-slate-400 text-sm mt-1">Your most recent official test result</p>
      </div>
      <FieldGroup label="Which test have you taken?">
        <SelectGrid options={LANGUAGE_TESTS} value={test}
          onChange={v => onChange('language_test', v)} />
      </FieldGroup>

      {test === 'ielts' && (
        <div className="space-y-3">
          <FieldGroup label="IELTS Overall Band">
            <input type="number" min="0" max="9" step="0.5" className="input w-full"
              placeholder="e.g. 6.5"
              value={data.ielts_overall || ''} onChange={e => onChange('ielts_overall', parseFloat(e.target.value) || null)} />
          </FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            {['listening', 'reading', 'writing', 'speaking'].map(skill => (
              <div key={skill}>
                <p className="text-xs text-slate-500 capitalize mb-1">{skill}</p>
                <input type="number" min="0" max="9" step="0.5" className="input w-full text-sm"
                  placeholder="0–9.0"
                  value={data[`ielts_${skill}`] || ''}
                  onChange={e => onChange(`ielts_${skill}`, parseFloat(e.target.value) || null)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {test === 'pte' && (
        <FieldGroup label="PTE Academic Overall Score (10–90)">
          <input type="number" min="10" max="90" className="input w-full"
            placeholder="e.g. 65"
            value={data.pte_overall || ''} onChange={e => onChange('pte_overall', parseInt(e.target.value) || null)} />
        </FieldGroup>
      )}

      {test === 'toefl' && (
        <FieldGroup label="TOEFL iBT Total Score (0–120)">
          <input type="number" min="0" max="120" className="input w-full"
            placeholder="e.g. 95"
            value={data.toefl_total || ''} onChange={e => onChange('toefl_total', parseInt(e.target.value) || null)} />
        </FieldGroup>
      )}

      {test === 'not_taken' && (
        <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-amber-300">
          <AlertCircle size={12} className="inline mr-1.5" />
          Most countries require an official language test for student visas. You can still check eligibility,
          but you'll need a test score before applying.
        </div>
      )}
    </div>
  )
}

function StepGoals({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Study Goals</h2>
        <p className="text-slate-400 text-sm mt-1">What are you looking to study and where?</p>
      </div>
      <FieldGroup label="Level You Want to Study">
        <SelectGrid options={TARGET_LEVELS} value={data.target_level}
          onChange={v => onChange('target_level', v)} />
      </FieldGroup>
      <FieldGroup label="Field You Want to Study">
        <input className="input w-full" placeholder="e.g. Data Science, MBA, Civil Engineering"
          value={data.target_field || ''} onChange={e => onChange('target_field', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Target Countries" hint="Select all you're considering — we'll rank them by fit">
        <SelectGrid options={COUNTRIES} value={data.target_countries || []}
          onChange={v => onChange('target_countries', v)} multi />
      </FieldGroup>
      <FieldGroup label="Preferred University (if any)">
        <input className="input w-full" placeholder="e.g. University of Toronto, Imperial College — leave blank if open"
          value={data.target_university || ''} onChange={e => onChange('target_university', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Target Intake">
        <div className="grid grid-cols-4 gap-2">
          {['Jan', 'May', 'Sep', 'Flexible'].map(m => (
            <button key={m} type="button"
              onClick={() => onChange('preferred_intake', m.toLowerCase())}
              className={clsx('py-2.5 rounded-xl border text-sm font-semibold transition-all',
                data.preferred_intake === m.toLowerCase()
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              )}>{m}</button>
          ))}
        </div>
      </FieldGroup>
    </div>
  )
}

function StepFinancial({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Financial Capacity</h2>
        <p className="text-slate-400 text-sm mt-1">Visa officers scrutinize finances carefully — be accurate</p>
      </div>
      <FieldGroup label="Annual Budget (USD) — tuition + living" hint="Rough total you can spend per year including all costs">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
          <input type="number" min="0" step="1000" className="input w-full pl-7"
            placeholder="e.g. 30000"
            value={data.annual_budget_usd || ''}
            onChange={e => onChange('annual_budget_usd', parseInt(e.target.value) || null)} />
        </div>
      </FieldGroup>
      <FieldGroup label="Personal Savings (USD)">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
          <input type="number" min="0" step="500" className="input w-full pl-7"
            placeholder="Amount currently in your bank accounts"
            value={data.savings_usd || ''}
            onChange={e => onChange('savings_usd', parseInt(e.target.value) || null)} />
        </div>
      </FieldGroup>
      <FieldGroup label="Will you have a financial sponsor?">
        <div className="flex gap-3 mb-2">
          {[false, true].map(val => (
            <button key={String(val)} type="button"
              onClick={() => onChange('has_sponsor', val)}
              className={clsx('flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                data.has_sponsor === val
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              )}>{val ? 'Yes — I have a sponsor' : 'Self-funded'}</button>
          ))}
        </div>
        {data.has_sponsor && (
          <div className="space-y-2">
            <input className="input w-full text-sm" placeholder="Sponsor relationship (e.g. Father, Employer)"
              value={data.sponsor_relationship || ''}
              onChange={e => onChange('sponsor_relationship', e.target.value)} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input type="number" min="0" step="1000" className="input w-full pl-7 text-sm"
                placeholder="Sponsor annual income (USD)"
                value={data.sponsor_annual_income_usd || ''}
                onChange={e => onChange('sponsor_annual_income_usd', parseInt(e.target.value) || null)} />
            </div>
          </div>
        )}
      </FieldGroup>
      <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-400">
        💡 This data is used only to assess your eligibility and generate financial letters — it is never shared with anyone.
      </div>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────
export default function StudentProfile() {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const [step, setStep] = useState(0)

  const { data: existingProfile } = useQuery(
    'student-profile',
    () => studentAPI.getProfile().then(r => r.data),
    { staleTime: 5 * 60 * 1000 }
  )

  const [form, setForm] = useState(() => existingProfile || {
    target_countries: [], has_refusal: false, has_gaps: false, has_sponsor: false, has_savings: false
  })

  // Sync form when profile loads
  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const save = useMutation(
    () => studentAPI.upsertProfile(form),
    {
      onSuccess: () => {
        qc.invalidateQueries('student-profile')
        toast.success('Profile saved!')
        navigate('/student')
      },
      onError: () => toast.error('Save failed — try again')
    }
  )

  const stepComponents = [
    <StepPersonal  key="personal"  data={form} onChange={update} />,
    <StepAcademic  key="academic"  data={form} onChange={update} />,
    <StepLanguage  key="language"  data={form} onChange={update} />,
    <StepGoals     key="goals"     data={form} onChange={update} />,
    <StepFinancial key="financial" data={form} onChange={update} />,
  ]

  const isLast = step === STEPS.length - 1

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2">
          <GraduationCap size={22} className="text-blue-400" />
          {existingProfile ? 'Edit Student Profile' : 'Student Profile Setup'}
        </h1>
        <p className="text-slate-400 text-sm mt-1">Takes 3–4 minutes — powers all eligibility and AI document features</p>
      </div>

      <div className="card">
        <StepBar current={STEPS[step].id} />

        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            {stepComponents[step]}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mt-8 pt-5 border-t border-slate-800">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : navigate('/student')}
            className="btn-secondary gap-2"
          >
            <ChevronLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {isLast ? (
            <button
              onClick={() => save.mutate()}
              disabled={save.isLoading}
              className="btn-primary flex-1 gap-2 justify-center"
            >
              {save.isLoading
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : <><Check size={14} /> Save Profile & Continue</>
              }
            </button>
          ) : (
            <button onClick={() => setStep(step + 1)} className="btn-primary flex-1 gap-2 justify-center">
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

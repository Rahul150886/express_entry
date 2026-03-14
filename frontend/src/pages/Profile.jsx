import React from 'react'
// src/pages/Profile.jsx

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Users, Languages, Briefcase, GraduationCap, Award, Check, Loader2, Plus, Trash2, ChevronRight, ChevronDown, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { profileAPI, aiAPI } from '../services/api'
import log from '../services/logger'
import { useProfile, useCrs } from '../hooks'
import clsx from 'clsx'

const BASE_STEPS = [
  { id: 'personal',  icon: User,          label: 'Personal'  },
  { id: 'language',  icon: Languages,     label: 'Language'  },
  { id: 'work',      icon: Briefcase,     label: 'Work'      },
  { id: 'education', icon: GraduationCap, label: 'Education' },
  { id: 'spouse',    icon: Users,         label: 'Spouse'    },
  { id: 'other',     icon: Award,         label: 'Other'     },
]

function getSteps(profile) {
  const hasSpouse = profile?.has_spouse &&
    ['married', 'common_law', 'common-law'].includes((profile?.marital_status || '').toLowerCase())
  return BASE_STEPS.filter(s => s.id !== 'spouse' || hasSpouse)
}
function StepIndicator({ current, steps }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, i) => {
        const Icon = step.icon
        const isActive = step.id === current
        const isDone = steps.findIndex(s => s.id === current) > i
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div className={clsx('step-dot', isActive && 'active', isDone && 'done', !isActive && !isDone && 'pending')}>
              {isDone ? <Check size={14} /> : <Icon size={14} />}
            </div>
            <span className={clsx('text-xs font-medium hidden sm:block', isActive ? 'text-white' : isDone ? 'text-emerald-400' : 'text-slate-500')}>
              {step.label}
            </span>
            {i < steps.length - 1 && <div className={clsx('w-8 h-px mx-1', isDone ? 'bg-emerald-500' : 'bg-slate-700')} />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Personal Info Form ──────────────────────
function PersonalForm({ profile, onNext }) {
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
    }
  })
  const qc = useQueryClient()

  const onSubmit = async (data) => {
    try {
      if (profile) {
        log.info('Profile:PersonalInfo', `update: name=${data.full_name}  age=${data.age}  nationality=${data.nationality}`)
        await profileAPI.update(data)
      } else {
        log.info('Profile:PersonalInfo', `create: name=${data.full_name}  age=${data.age}  nationality=${data.nationality}`)
        await profileAPI.create(data)
      }
      await qc.invalidateQueries('profile')
      log.info('Profile:PersonalInfo', 'save success')
      toast.success('Personal info saved!')
      onNext()
    } catch {}
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-display font-bold text-white">Personal Information</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" placeholder="John Smith" {...register('full_name', { required: true })} />
        </div>
        <div>
          <label className="label">Date of Birth</label>
          <input type="date" className="input" {...register('date_of_birth', { required: true })} />
        </div>
        <div>
          <label className="label">Nationality / Country of Birth</label>
          <input className="input" placeholder="e.g. India" {...register('nationality', { required: true })} />
        </div>
        <div>
          <label className="label">Country of Residence</label>
          <input className="input" placeholder="e.g. India" {...register('country_of_residence')} />
        </div>
        <div>
          <label className="label">Marital Status</label>
          <select className="select" {...register('marital_status')}>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="common_law">Common-Law</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="separated">Separated</option>
          </select>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        {['married', 'common_law'].includes(watch('marital_status')) && (
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" {...register('has_spouse')} className="mt-0.5 w-4 h-4 rounded accent-maple-500" />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
              I have a spouse or common-law partner who will be included
            </span>
          </label>
        )}
        {[
          { name: 'has_provincial_nomination', label: 'I have a Provincial Nomination (PNP) — adds 600 CRS points' },
          { name: 'has_sibling_in_canada', label: 'I have a sibling (or my spouse has) who is a Canadian citizen/PR — adds 15 CRS points' },
          { name: 'has_certificate_of_qualification', label: 'I have a Canadian certificate of qualification in a skilled trade' },
        ].map(({ name, label }) => (
          <label key={name} className="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" {...register(name)} className="mt-0.5 w-4 h-4 rounded accent-maple-500" />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{label}</span>
          </label>
        ))}
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <>Save & Continue <ChevronRight size={18} /></>}
      </button>
    </form>
  )
}

// ─── Spouse Language Test Form ───────────────
function SpouseLanguageTestForm({ profile }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const { data: existingTest } = useQuery(
    'spouse-language-test',
    () => profileAPI.getSpouseLanguageTest().then(r => r.data),
    { enabled: !!profile?.has_spouse }
  )

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { test_type: 'ielts', reading: '', writing: '', speaking: '', listening: '', test_date: '' }
  })

  const saveTest = useMutation(
    (data) => profileAPI.saveSpouseLanguageTest(data).then(r => r.data),
    {
      onSuccess: () => {
        qc.invalidateQueries('spouse-language-test')
        qc.invalidateQueries('profile')
        toast.success('Spouse language test saved!')
        setAdding(false)
        reset()
      },
      onError: () => toast.error('Failed to save spouse language test')
    }
  )

  const deleteTest = useMutation(
    () => profileAPI.deleteSpouseLanguageTest(),
    {
      onSuccess: () => {
        qc.invalidateQueries('spouse-language-test')
        qc.invalidateQueries('profile')
        toast.success('Spouse language test removed')
      }
    }
  )

  const TEST_LABELS = { ielts: 'IELTS', celpip: 'CELPIP', tef: 'TEF', tcf: 'TCF' }
  const SCORE_FIELDS = [
    { key: 'reading',   label: 'Reading',   hint: 'IELTS: 0-9, CELPIP: 1-12' },
    { key: 'writing',   label: 'Writing',   hint: 'IELTS: 0-9, CELPIP: 1-12' },
    { key: 'speaking',  label: 'Speaking',  hint: 'IELTS: 0-9, CELPIP: 1-12' },
    { key: 'listening', label: 'Listening', hint: 'IELTS: 0-9, CELPIP: 1-12' },
  ]

  return (
    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          🗣 Spouse Language Test
          <span className="text-xs text-emerald-400 font-normal">adds up to 20 CRS pts</span>
        </h3>
        {!existingTest && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-secondary text-xs px-3">
            <Plus size={12} /> Add Test
          </button>
        )}
      </div>

      {/* Existing test display */}
      {existingTest && !adding && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 text-center">
            {['reading', 'writing', 'speaking', 'listening'].map(skill => (
              <div key={skill} className="p-2 rounded-lg bg-slate-900">
                <p className="text-xs text-slate-500 capitalize">{skill}</p>
                <p className="font-bold text-white">{existingTest[skill]}</p>
                <p className="text-xs text-emerald-400">CLB {existingTest.clb?.[skill]}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(true)} className="btn-secondary text-xs px-3">Update</button>
            <button type="button" onClick={() => deleteTest.mutate()} className="btn-ghost text-xs px-3 text-red-400 hover:text-red-300">
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      )}

      {/* Add/edit form */}
      {adding && (
        <form onSubmit={handleSubmit(d => saveTest.mutate(d))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Test Type</label>
              <select className="input" {...register('test_type', { required: true })}>
                {Object.entries(TEST_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Test Date</label>
              <input className="input" type="date" {...register('test_date', { required: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SCORE_FIELDS.map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type="number" step="0.5" min="0" max="12"
                  placeholder="e.g. 7.5"
                  {...register(f.key, { required: true, min: 0, max: 12, valueAsNumber: true })}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary text-sm px-4">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Save Test'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost text-sm px-4">Cancel</button>
          </div>
        </form>
      )}

      {!existingTest && !adding && (
        <p className="text-xs text-slate-500">No spouse language test added yet. Adding it can add up to 20 CRS points.</p>
      )}
    </div>
  )
}

// ─── Spouse Profile Section ─────────────────
function SpouseSection({ profile }) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: {
      has_spouse:                 profile?.has_spouse || false,
      spouse_name:                profile?.spouse_name || '',
      spouse_dob:                 profile?.spouse_dob || '',
      spouse_nationality:         profile?.spouse_nationality || '',
      spouse_education_level:     profile?.spouse_education_level || '',
      spouse_canadian_work_years: profile?.spouse_canadian_work_years || 0,
      spouse_noc_code:            profile?.spouse_noc_code || '',
    }
  })

  const [nocResults, setNocResults] = useState([])
  const [nocSearching, setNocSearching] = useState(false)
  const [spouseJobTitle, setSpouseJobTitle] = useState('')

  const saveSpouse = useMutation(
    (data) => profileAPI.update({
      ...profile,
      date_of_birth: profile.date_of_birth,
      ...data
    }).then(r => r.data),
    {
      onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Spouse information saved!') },
      onError:   () => toast.error('Failed to save spouse information')
    }
  )

  const searchSpouseNoc = async () => {
    if (!spouseJobTitle.trim()) return
    setNocSearching(true)
    try {
      const res = await aiAPI.findNoc({ job_title: spouseJobTitle, country: profile?.nationality || '' })
      setNocResults(res.data?.suggestions || [])
    } catch { toast.error('NOC search failed') }
    finally { setNocSearching(false) }
  }

  return (
    <form onSubmit={handleSubmit(data => saveSpouse.mutate(data))} className="space-y-5">
      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-4">
        <h3 className="font-semibold text-white flex items-center gap-2">👫 Spouse / Common-Law Partner</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input" placeholder="Spouse's full legal name" {...register('spouse_name')} />
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input className="input" type="date" {...register('spouse_dob')} />
          </div>
          <div>
            <label className="label">Nationality</label>
            <input className="input" placeholder="e.g. Indian" {...register('spouse_nationality')} />
          </div>
          <div>
            <label className="label">Education Level</label>
            <select className="input" {...register('spouse_education_level')}>
              <option value="">Select level</option>
              <option value="less_than_secondary">Less than secondary</option>
              <option value="secondary">Secondary / high school</option>
              <option value="one_year_post_secondary">1-year post-secondary</option>
              <option value="two_year_post_secondary">2-year post-secondary</option>
              <option value="bachelors">Bachelor's degree</option>
              <option value="two_or_more_post_secondary">Two+ post-secondary programs</option>
              <option value="masters">Master's / professional degree</option>
              <option value="doctoral">Doctoral (PhD)</option>
            </select>
          </div>
          <div>
            <label className="label">Canadian Work Experience (years)</label>
            <input className="input" type="number" step="0.5" min="0" max="5" {...register('spouse_canadian_work_years')} />
          </div>
          <div>
            <label className="label">NOC Code (if Canadian work experience)</label>
            <input className="input" placeholder="e.g. 21311" {...register('spouse_noc_code')} />
          </div>
        </div>

        {/* NOC finder for spouse */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
          <p className="text-xs font-semibold text-slate-400">🔍 Find Spouse's NOC Code</p>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Enter spouse's job title..."
              value={spouseJobTitle}
              onChange={e => setSpouseJobTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchSpouseNoc())}
            />
            <button type="button" onClick={searchSpouseNoc} disabled={nocSearching} className="btn-secondary text-sm px-4">
              {nocSearching ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
            </button>
          </div>
          {nocResults.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {nocResults.map(s => (
                <button key={s.noc_code} type="button"
                  onClick={() => { setValue('spouse_noc_code', s.noc_code); setNocResults([]) }}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-800 border border-slate-700 transition-all"
                >
                  <span className="badge-blue text-xs mr-2">NOC {s.noc_code}</span>
                  <span className="text-sm text-white">{s.title}</span>
                  <span className="text-xs text-slate-500 ml-2">TEER {s.teer}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Spouse Language Test */}
      <SpouseLanguageTestForm profile={profile} />

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Save Spouse Information'}
      </button>
    </form>
  )
}
function LanguageForm({ profile, onNext }) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm()
  const qc = useQueryClient()

  const addTest = useMutation(
    (data) => profileAPI.addLanguageTest(data).then(r => r.data),
    {
      onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Language test added!'); reset(); setAdding(false) }
    }
  )

  const updateTest = useMutation(
    ({ id, data }) => profileAPI.updateLanguageTest(id, data).then(r => r.data),
    {
      onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Language test updated!'); reset(); setEditingId(null) }
    }
  )

  const deleteTest = useMutation(
    (id) => profileAPI.deleteLanguageTest(id),
    { onSuccess: () => qc.invalidateQueries('profile') }
  )

  const startEdit = (test) => {
    setEditingId(test.id)
    setAdding(false)
    setValue('test_type', test.test_type)
    setValue('role', test.role)
    setValue('language', test.language)
    setValue('listening', test.listening)
    setValue('reading', test.reading)
    setValue('writing', test.writing)
    setValue('speaking', test.speaking)
    setValue('test_date', test.test_date)
    setValue('registration_number', test.registration_number || '')
  }

  const cancelEdit = () => { setEditingId(null); setAdding(false); reset() }

  const onSubmit = (data) => {
    if (editingId) updateTest.mutate({ id: editingId, data })
    else addTest.mutate(data)
  }

  const tests = profile?.language_tests || []
  const isFormOpen = adding || !!editingId

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-white">Language Tests</h2>
        {!isFormOpen && (
          <button onClick={() => { setAdding(true); setEditingId(null); reset() }} className="btn-secondary text-sm">
            <Plus size={16} /> Add Test
          </button>
        )}
      </div>

      <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 space-y-1.5 text-xs text-slate-400">
        <p><span className="text-white font-medium">1st Language</span> — Primary English or French test. Up to <span className="text-emerald-400">136 CRS pts</span>.</p>
        <p><span className="text-white font-medium">2nd Language</span> — French/English bilingual bonus. Up to <span className="text-emerald-400">24 CRS pts</span>.</p>
      </div>

      {tests.map(test => (
        <div key={test.id}>
          {editingId === test.id ? (
            <motion.form
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onSubmit={handleSubmit(onSubmit)}
              className="p-4 rounded-xl border border-blue-500/40 bg-blue-500/5 space-y-4"
            >
              <h3 className="font-semibold text-white text-sm">✏️ Editing {test.test_type.toUpperCase()} Test</h3>
              <LanguageTestFields register={register} />
              <div className="flex gap-3">
                <button type="submit" disabled={updateTest.isLoading} className="btn-primary text-sm">
                  {updateTest.isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
                </button>
                <button type="button" onClick={cancelEdit} className="btn-secondary text-sm">Cancel</button>
              </div>
            </motion.form>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="badge-blue">{test.test_type.toUpperCase()}</span>
                    <span className="badge-slate">{test.role === 'first' ? '1st Language' : '2nd Language'}</span>
                    {test.is_expired && <span className="badge-maple">Expired</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    {['listening', 'reading', 'writing', 'speaking'].map(skill => (
                      <div key={skill}>
                        <p className="text-xs text-slate-500 capitalize">{skill}</p>
                        <p className="text-lg font-bold text-white">{test[skill]}</p>
                        {test[`clb_${skill}`] && <p className="text-xs text-maple-400">CLB {test[`clb_${skill}`]}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Test date: {test.test_date}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(test)} className="btn-ghost text-xs px-2 py-1.5 text-blue-400 hover:text-blue-300">
                    ✏️ Edit
                  </button>
                  <button onClick={() => deleteTest.mutate(test.id)} className="btn-ghost text-xs px-2 py-1.5 text-slate-600 hover:text-maple-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <AnimatePresence>
        {adding && (
          <motion.form
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit(onSubmit)}
            className="p-4 rounded-xl border border-maple-500/30 bg-maple-500/5 space-y-4 overflow-hidden"
          >
            <h3 className="font-semibold text-white">Add Language Test</h3>
            <LanguageTestFields register={register} />
            <div className="flex gap-3">
              <button type="submit" disabled={addTest.isLoading} className="btn-primary text-sm">
                {addTest.isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Add Test'}
              </button>
              <button type="button" onClick={cancelEdit} className="btn-secondary text-sm">Cancel</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {tests.length === 0 && !isFormOpen && (
        <div className="text-center py-10 text-slate-500">
          <Languages size={32} className="mx-auto mb-2 opacity-30" />
          <p>No language tests added yet</p>
        </div>
      )}

      <button onClick={onNext} className="btn-primary">Continue <ChevronRight size={18} /></button>
    </div>
  )
}

// Shared language test fields extracted to avoid duplication
function LanguageTestFields({ register }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div>
        <label className="label">Test Type</label>
        <select className="select" {...register('test_type', { required: true })}>
          <option value="ielts">IELTS General Training</option>
          <option value="celpip">CELPIP General</option>
          <option value="tef">TEF Canada</option>
          <option value="tcf">TCF Canada</option>
        </select>
      </div>
      <div>
        <label className="label">Language Role</label>
        <select className="select" {...register('role')}>
          <option value="first">1st Language (up to 136 pts)</option>
          <option value="second">2nd Language (up to 24 pts)</option>
        </select>
      </div>
      <div>
        <label className="label">Language</label>
        <select className="select" {...register('language')}>
          <option value="english">English</option>
          <option value="french">French</option>
        </select>
      </div>
      {['listening', 'reading', 'writing', 'speaking'].map(s => (
        <div key={s}>
          <label className="label capitalize">{s}</label>
          <input type="number" step="0.5" className="input" placeholder="0.0" {...register(s, { required: true, valueAsNumber: true })} />
        </div>
      ))}
      <div>
        <label className="label">Test Date</label>
        <input type="date" className="input" {...register('test_date', { required: true })} />
      </div>
      <div>
        <label className="label">Registration / TRF #</label>
        <input className="input" placeholder="Optional" {...register('registration_number')} />
      </div>
    </div>
  )
}

// ─── Work Experience Form ────────────────────
function WorkForm({ profile, onNext }) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [nocQuery, setNocQuery] = useState('')
  const [nocResults, setNocResults] = useState([])
  const [nocSearching, setNocSearching] = useState(false)
  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm({ defaultValues: { hours_per_week: 40, is_current: false } })
  const qc = useQueryClient()

  const searchNoc = async () => {
    if (!nocQuery.trim()) return
    setNocSearching(true)
    try {
      const res = await aiAPI.findNoc({ job_title: nocQuery, country: profile?.nationality || '' })
      setNocResults(res.data?.suggestions || [])
    } catch { toast.error('NOC search failed') }
    finally { setNocSearching(false) }
  }

  const addWork = useMutation(
    (data) => profileAPI.addWorkExperience(data).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Work experience added!'); reset(); setAdding(false) } }
  )

  const updateWork = useMutation(
    ({ id, data }) => profileAPI.updateWorkExperience(id, data).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('profile'); toast.success('Work experience updated!'); reset(); setEditingId(null) } }
  )

  const deleteWork = useMutation(
    (id) => profileAPI.deleteWorkExperience(id),
    { onSuccess: () => qc.invalidateQueries('profile') }
  )

  const startEdit = (exp) => {
    setEditingId(exp.id)
    setAdding(false)
    setValue('noc_code', exp.noc_code)
    setValue('noc_title', exp.noc_title || exp.job_title)
    setValue('teer_level', String(exp.teer_level))
    setValue('experience_type', exp.experience_type)
    setValue('employer_name', exp.employer_name)
    setValue('job_title', exp.job_title)
    setValue('start_date', exp.start_date)
    setValue('end_date', exp.end_date || '')
    setValue('hours_per_week', exp.hours_per_week)
    setValue('is_current', exp.is_current)
  }

  const cancelEdit = () => { setEditingId(null); setAdding(false); reset(); setNocResults([]) }

  const onSubmit = (data) => {
    if (editingId) updateWork.mutate({ id: editingId, data })
    else addWork.mutate(data)
  }

  const experiences = profile?.work_experiences || []
  const isFormOpen = adding || !!editingId

  const WorkFields = () => (
    <div className="space-y-4">
      {/* NOC Finder */}
      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 space-y-2">
        <p className="text-xs font-semibold text-slate-400">🔍 Find NOC Code</p>
        <div className="flex gap-2">
          <input className="input flex-1 text-sm" placeholder="e.g. Software Developer, Registered Nurse..."
            value={nocQuery} onChange={e => setNocQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchNoc())} />
          <button type="button" onClick={searchNoc} disabled={nocSearching} className="btn-secondary text-sm px-4">
            {nocSearching ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
          </button>
        </div>
        {nocResults.length > 0 && (
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {nocResults.map(s => (
              <button key={s.noc_code} type="button"
                onClick={() => { setValue('noc_code', s.noc_code); setValue('noc_title', s.title); setValue('teer_level', String(s.teer)); setNocResults([]); setNocQuery('') }}
                className="w-full text-left p-2 rounded-lg hover:bg-slate-800 border border-slate-700"
              >
                <span className="badge-blue text-xs mr-2">NOC {s.noc_code}</span>
                <span className="text-sm text-white">{s.title}</span>
                <span className="text-xs text-slate-500 ml-2">TEER {s.teer}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><label className="label">NOC Code</label><input className="input" placeholder="e.g. 21311" {...register('noc_code', { required: true })} /></div>
        <div><label className="label">NOC Title</label><input className="input" placeholder="e.g. Software Engineer" {...register('noc_title')} /></div>
        <div>
          <label className="label">TEER Level</label>
          <select className="select" {...register('teer_level', { required: true })}>
            {['0','1','2','3','4','5'].map(t => <option key={t} value={t}>TEER {t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Experience Type</label>
          <select className="select" {...register('experience_type', { required: true })}>
            <option value="canadian">Canadian</option>
            <option value="foreign">Foreign</option>
          </select>
        </div>
        <div><label className="label">Employer Name</label><input className="input" placeholder="Company" {...register('employer_name', { required: true })} /></div>
        <div><label className="label">Job Title</label><input className="input" placeholder="Your title" {...register('job_title')} /></div>
        <div><label className="label">Start Date</label><input type="date" className="input" {...register('start_date', { required: true })} /></div>
        <div><label className="label">End Date</label><input type="date" className="input" {...register('end_date')} /></div>
        <div><label className="label">Hours/Week</label><input type="number" className="input" {...register('hours_per_week', { valueAsNumber: true })} /></div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" {...register('is_current')} className="accent-maple-500" />
        <span className="text-sm text-slate-300">Currently working here</span>
      </label>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-white">Work Experience</h2>
        {!isFormOpen && (
          <button onClick={() => { setAdding(true); setEditingId(null); reset() }} className="btn-secondary text-sm">
            <Plus size={16} /> Add Job
          </button>
        )}
      </div>

      {experiences.map(exp => (
        <div key={exp.id}>
          {editingId === exp.id ? (
            <motion.form initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onSubmit={handleSubmit(onSubmit)}
              className="p-4 rounded-xl border border-blue-500/40 bg-blue-500/5 space-y-4"
            >
              <h3 className="font-semibold text-white text-sm">✏️ Editing: {exp.job_title} @ {exp.employer_name}</h3>
              <WorkFields />
              <div className="flex gap-3">
                <button type="submit" disabled={updateWork.isLoading} className="btn-primary text-sm">
                  {updateWork.isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
                </button>
                <button type="button" onClick={cancelEdit} className="btn-secondary text-sm">Cancel</button>
              </div>
            </motion.form>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-white">{exp.job_title || exp.noc_title}</span>
                    <span className="badge-blue">NOC {exp.noc_code}</span>
                    <span className={exp.experience_type === 'canadian' ? 'badge-green' : 'badge-slate'}>
                      {exp.experience_type === 'canadian' ? '🍁 Canadian' : 'Foreign'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">{exp.employer_name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {exp.start_date} → {exp.end_date || 'Present'} · {exp.hours_per_week}hrs/week · TEER {exp.teer_level}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(exp)} className="btn-ghost text-xs px-2 py-1.5 text-blue-400 hover:text-blue-300">
                    ✏️ Edit
                  </button>
                  <button onClick={() => deleteWork.mutate(exp.id)} className="btn-ghost text-xs px-2 py-1.5 text-slate-600 hover:text-maple-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <AnimatePresence>
        {adding && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit(onSubmit)}
            className="p-4 rounded-xl border border-maple-500/30 bg-maple-500/5 space-y-4 overflow-hidden"
          >
            <h3 className="font-semibold text-white">Add Work Experience</h3>
            <WorkFields />
            <div className="flex gap-3">
              <button type="submit" disabled={addWork.isLoading} className="btn-primary text-sm">
                {addWork.isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Add Experience'}
              </button>
              <button type="button" onClick={cancelEdit} className="btn-secondary text-sm">Cancel</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {experiences.length === 0 && !isFormOpen && (
        <div className="text-center py-10 text-slate-500">
          <Briefcase size={32} className="mx-auto mb-2 opacity-30" />
          <p>No work experience added yet</p>
        </div>
      )}

      <button onClick={onNext} className="btn-primary">Continue <ChevronRight size={18} /></button>
    </div>
  )
}

// ─── Education Form ──────────────────────────
function EducationForm({ profile, onNext }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      level: profile?.education?.level || 'bachelors',
      field_of_study: profile?.education?.field_of_study || '',
      institution_name: profile?.education?.institution_name || '',
      country: profile?.education?.country || '',
      is_canadian: profile?.education?.is_canadian || false,
      is_three_year_or_more: profile?.education?.is_three_year_or_more || false,
      eca_organization: profile?.education?.eca_organization || '',
      eca_reference_number: profile?.education?.eca_reference_number || '',
    }
  })
  const qc = useQueryClient()

  const onSubmit = async (data) => {
    try {
      await profileAPI.setEducation(data)
      qc.invalidateQueries('profile')
      log.info('Profile:Education', 'save success')
      toast.success('Education saved!')
      onNext()
    } catch {}
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-display font-bold text-white">Education</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Highest Level of Education</label>
          <select className="select" {...register('level', { required: true })}>
            <option value="less_than_secondary">Less than Secondary</option>
            <option value="secondary">Secondary / High School</option>
            <option value="one_year_post_secondary">1-Year Post-Secondary</option>
            <option value="two_year_post_secondary">2-Year Post-Secondary</option>
            <option value="bachelors">Bachelor's Degree</option>
            <option value="two_or_more_degrees">Two or More Degrees</option>
            <option value="masters">Master's Degree</option>
            <option value="phd">PhD / Doctorate</option>
          </select>
        </div>
        <div>
          <label className="label">Field of Study</label>
          <input className="input" placeholder="e.g. Computer Science" {...register('field_of_study')} />
        </div>
        <div>
          <label className="label">Institution Name</label>
          <input className="input" placeholder="University name" {...register('institution_name')} />
        </div>
        <div>
          <label className="label">Country of Study</label>
          <input className="input" placeholder="e.g. India" {...register('country')} />
        </div>
        <div className="sm:col-span-2 space-y-3">
          {[
            { name: 'is_canadian', label: 'This is a Canadian credential (earned from a Canadian institution)' },
            { name: 'is_three_year_or_more', label: 'Program was 3 years or longer' },
          ].map(({ name, label }) => (
            <label key={name} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" {...register(name)} className="accent-maple-500 w-4 h-4" />
              <span className="text-sm text-slate-300">{label}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="label">ECA Organization (for foreign credentials)</label>
          <select className="select" {...register('eca_organization')}>
            <option value="">Not applicable / Not yet done</option>
            <option value="wes">WES — World Education Services</option>
            <option value="ices">ICES</option>
            <option value="iqas">IQAS</option>
            <option value="nnas">NNAS</option>
            <option value="ces">CES</option>
          </select>
        </div>
        <div>
          <label className="label">ECA Reference Number</label>
          <input className="input" placeholder="Optional" {...register('eca_reference_number')} />
        </div>
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <>Save & Continue <ChevronRight size={18} /></>}
      </button>
    </form>
  )
}

// ─── Other Factors Form ──────────────────────
function OtherForm({ profile }) {
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
  const { calculate } = useCrs()

  const onSubmit = async (data) => {
    try {
      if (data.employer_name && data.noc_code) {
        log.info('Profile:JobOffer', `save: noc=${data.noc_code}  teer=${data.teer_level}  lmia=${data.lmia_approved}`)
        await profileAPI.setJobOffer(data)
        qc.invalidateQueries('profile')
        log.info('Profile:JobOffer', 'save success')
      toast.success('Job offer saved!')
      }
      await calculate.mutateAsync()
      toast.success('🎉 CRS Score calculated!')
    } catch {}
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-white mb-1">Additional Factors</h2>
        <p className="text-sm text-slate-400">Optional: Valid job offer (can add 50-200 CRS points)</p>
      </div>

      <div className="card border border-slate-700">
        <h3 className="font-semibold text-white mb-4">Job Offer (Optional)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Employer Name</label>
            <input className="input" placeholder="Company name" {...register('employer_name')} />
          </div>
          <div>
            <label className="label">NOC Code</label>
            <input className="input" placeholder="e.g. 10010" {...register('noc_code')} />
          </div>
          <div>
            <label className="label">TEER Level</label>
            <select className="select" {...register('teer_level')}>
              {['0','1','2','3'].map(t => <option key={t} value={t}>TEER {t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Annual Salary (CAD)</label>
            <input type="number" className="input" placeholder="e.g. 80000" {...register('annual_salary', { valueAsNumber: true })} />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input type="checkbox" {...register('is_lmia_exempt')} className="accent-maple-500" />
          <span className="text-sm text-slate-300">LMIA-exempt position</span>
        </label>
      </div>

      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <p className="text-sm text-emerald-400 font-semibold">✓ Other factors already saved in Personal tab:</p>
        <ul className="text-xs text-slate-400 mt-2 space-y-1">
          <li>• Provincial Nomination (PNP): {profile?.has_provincial_nomination ? '✅ Yes (+600 pts)' : '❌ No'}</li>
          <li>• Sibling in Canada: {profile?.has_sibling_in_canada ? '✅ Yes (+15 pts)' : '❌ No'}</li>
          <li>• Certificate of Qualification: {profile?.has_certificate_of_qualification ? '✅ Yes' : '❌ No'}</li>
        </ul>
      </div>

      <button type="submit" disabled={isSubmitting || calculate.isLoading} className="btn-primary w-full">
        {(isSubmitting || calculate.isLoading) ? <Loader2 size={18} className="animate-spin" /> : '🎯 Save & Calculate CRS Score'}
      </button>
    </form>
  )
}

// ─── Spouse Step Wrapper ─────────────────────
function SpouseStep({ profile, onNext }) {
  const hasSpouse = profile?.has_spouse
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
          <Users size={20} className="text-maple-400" /> Spouse / Partner Information
        </h2>
      </div>

      {!hasSpouse ? (
        <div className="text-center py-10 space-y-3">
          <div className="text-4xl">👫</div>
          <p className="text-slate-300 font-medium">No spouse included in your profile</p>
          <p className="text-slate-500 text-sm">If you have a spouse or common-law partner coming with you,<br />go back to Personal info and enable "I have a spouse or common-law partner".</p>
          <button onClick={onNext} className="btn-secondary mt-2">Skip this step →</button>
        </div>
      ) : (
        <>
          <SpouseSection profile={profile} />
          <div className="pt-2">
            <button onClick={onNext} className="btn-primary">
              Continue to Other Info <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Profile Page ───────────────────────
export default function Profile() {
  const [step, setStep] = useState('personal')
  const { data: profile, isLoading } = useProfile()

  const STEPS = getSteps(profile)
  const hasSpouse = STEPS.some(s => s.id === 'spouse')

  // Redirect away from spouse step if marital status changed to single
  useEffect(() => {
    if (step === 'spouse' && !hasSpouse) setStep('other')
  }, [hasSpouse, step])

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        {[1,2,3].map(i => <div key={i} className="h-24 shimmer rounded-2xl" />)}
      </div>
    )
  }

  // Smart next step — skip spouse if not applicable
  const nextStep = (current) => {
    const ids = STEPS.map(s => s.id)
    const idx = ids.indexOf(current)
    return ids[idx + 1] || current
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="section-title">My Profile</h1>
        <p className="text-slate-400 text-sm mt-1">Build your Express Entry profile to calculate your CRS score</p>
      </div>

      <StepIndicator current={step} steps={STEPS} />

      <div className="card">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {step === 'personal'  && <PersonalForm  profile={profile} onNext={() => setStep(nextStep('personal'))} />}
            {step === 'language'  && <LanguageForm  profile={profile} onNext={() => setStep(nextStep('language'))} />}
            {step === 'work'      && <WorkForm      profile={profile} onNext={() => setStep(nextStep('work'))} />}
            {step === 'education' && <EducationForm profile={profile} onNext={() => setStep(nextStep('education'))} />}
            {step === 'spouse'    && hasSpouse && <SpouseStep profile={profile} onNext={() => setStep(nextStep('spouse'))} />}
            {step === 'other'     && <OtherForm     profile={profile} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step navigation */}
      <div className="flex gap-2 flex-wrap">
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={clsx('btn-ghost text-xs', step === s.id && 'text-maple-400 bg-maple-500/10')}
          >
            <s.icon size={14} /> {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

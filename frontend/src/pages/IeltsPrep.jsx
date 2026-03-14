import React from 'react'
// src/pages/IeltsPrep.jsx — AI-powered IELTS Preparation Module

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery } from 'react-query'
import {
  BookOpen, Pen, Headphones, MessageSquare, Zap, ChevronRight,
  CheckCircle2, XCircle, Loader2, Trophy, Target, TrendingUp,
  ArrowRight, RefreshCw, Star, AlertCircle, BarChart2, Lightbulb
} from 'lucide-react'
import { ieltsAPI } from '../services/api'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────
const SKILLS = [
  { id: 'reading',    label: 'Reading',    icon: BookOpen,      color: 'blue',   desc: 'Comprehension & inference' },
  { id: 'writing',    label: 'Writing',    icon: Pen,           color: 'green',  desc: 'Grammar & structure' },
  { id: 'listening',  label: 'Listening',  icon: Headphones,    color: 'purple', desc: 'Detail & understanding' },
  { id: 'vocabulary', label: 'Vocabulary', icon: MessageSquare, color: 'amber',  desc: 'Words & collocations' },
]

const SKILL_COLORS = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30',   badge: 'bg-blue-500/20 text-blue-300' },
  green:  { bg: 'bg-emerald-500/10',text: 'text-emerald-400',border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30',  badge: 'bg-purple-500/20 text-purple-300' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30',   badge: 'bg-amber-500/20 text-amber-300' },
  maple:  { bg: 'bg-maple-500/10',  text: 'text-maple-400',  border: 'border-maple-500/30',   badge: 'bg-maple-500/20 text-maple-300' },
}

const LEVEL_CONFIG = {
  beginner:     { label: 'Beginner',     band: '4.0–5.0', color: 'amber',  icon: '🌱' },
  intermediate: { label: 'Intermediate', band: '5.5–6.5', color: 'blue',   icon: '📈' },
  advanced:     { label: 'Advanced',     band: '7.0–9.0', color: 'green',  icon: '🏆' },
}

// ─── Sub-components ──────────────────────────────────────

function BandGauge({ band }) {
  const min = 4, max = 9
  const pct = Math.min(Math.max((band - min) / (max - min), 0), 1)
  const color = band >= 7 ? '#10b981' : band >= 5.5 ? '#3b82f6' : '#f59e0b'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 238.76} 238.76`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{band?.toFixed(1)}</span>
          <span className="text-xs text-slate-400">Band</span>
        </div>
      </div>
    </div>
  )
}

function SkillBar({ label, score, total, level, color = 'blue' }) {
  const pct = total > 0 ? (score / total) * 100 : 0
  const c = SKILL_COLORS[color]
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={c.text + ' font-medium'}>{label}</span>
        <span className="text-slate-400">{score}/{total} · <span className="capitalize">{level}</span></span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${c.text.replace('text', 'bg')}`}
        />
      </div>
    </div>
  )
}

function QuestionCard({ question, selectedAnswer, onAnswer, showResult, index }) {
  const skill = SKILLS.find(s => s.id === question.skill) || SKILLS[0]
  const c = SKILL_COLORS[skill.color]
  const isCorrect = selectedAnswer === question.correct_answer

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={clsx('card border', showResult
        ? isCorrect ? 'border-emerald-500/40' : 'border-red-500/40'
        : selectedAnswer ? 'border-maple-500/30' : 'border-slate-700'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium capitalize', c.badge)}>
          {question.skill}
        </span>
        <span className="text-xs text-slate-500 capitalize">{question.type?.replace('_', ' ')}</span>
        <span className="ml-auto text-xs text-slate-500">Q{question.id}</span>
      </div>

      {/* Passage (for reading and listening) */}
      {question.passage && question.passage.trim() && (
        <div className="mb-3 p-3 bg-slate-900 rounded-xl border border-slate-700 text-sm text-slate-300 leading-relaxed">
          {question.skill === 'listening' && (
            <p className="text-xs text-purple-400 font-semibold mb-2 flex items-center gap-1">
              🎧 Listening Transcript
            </p>
          )}
          {question.skill === 'reading' && (
            <p className="text-xs text-blue-400 font-semibold mb-2">📖 Read the passage</p>
          )}
          <p className="whitespace-pre-wrap">{question.passage}</p>
        </div>
      )}

      {/* Sentence (for writing gap fill / correction) */}
      {question.sentence && question.sentence.trim() && (
        <div className="mb-3 p-3 bg-slate-800 rounded-xl border border-slate-600 text-sm">
          <p className="text-xs text-green-400 font-semibold mb-2">✏️ {question.instruction || 'Fill in the blank'}</p>
          <p className="text-white font-medium leading-relaxed">{question.sentence}</p>
        </div>
      )}

      {/* Question */}
      <p className="text-sm font-medium text-white mb-3">
        {question.question || question.instruction || (question.type === 'gap_fill' ? 'Choose the correct option:' : '')}
      </p>

      {/* Options */}
      <div className="space-y-2">
        {question.options?.map((opt) => {
          const letter = opt.split(')')[0].trim()
          const isSelected = selectedAnswer === letter
          const isRight = showResult && letter === question.correct_answer
          const isWrong = showResult && isSelected && !isRight

          return (
            <button
              key={opt}
              onClick={() => !showResult && onAnswer(String(question.id), letter)}
              disabled={showResult}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all',
                isRight   ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' :
                isWrong   ? 'border-red-500 bg-red-500/15 text-red-300' :
                isSelected? 'border-maple-500 bg-maple-500/15 text-maple-300' :
                            'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
              )}
            >
              <div className="flex items-center gap-2">
                {showResult && isRight  && <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />}
                {showResult && isWrong  && <XCircle size={14} className="text-red-400 flex-shrink-0" />}
                {(!showResult || (!isRight && !isWrong)) && (
                  <span className={clsx('w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0',
                    isSelected ? 'border-maple-400 text-maple-400' : 'border-slate-600 text-slate-500'
                  )}>{letter}</span>
                )}
                <span>{opt.includes(')') ? opt.split(')').slice(1).join(')').trim() : opt}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Explanation */}
      {showResult && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 p-3 bg-slate-900 rounded-xl border border-slate-700 space-y-1"
        >
          <p className="text-xs text-slate-400"><span className="font-semibold text-white">Why:</span> {question.explanation}</p>
          {question.tip && <p className="text-xs text-amber-400"><span className="font-semibold">💡 Tip:</span> {question.tip}</p>}
        </motion.div>
      )}
    </motion.div>
  )
}

function VocabCard({ word }) {
  return (
    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-white text-sm">{word.word}</span>
        <div className="flex gap-1">
          {word.synonyms?.slice(0, 2).map(s => (
            <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{s}</span>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-1">{word.meaning}</p>
      <p className="text-xs text-slate-500 italic">"{word.example}"</p>
    </div>
  )
}

// ─── Screens ─────────────────────────────────────────────

function WelcomeScreen({ onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto text-center space-y-8"
    >
      <div>
        <div className="w-20 h-20 rounded-2xl bg-maple-500/15 flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">🍁</span>
        </div>
        <h1 className="text-3xl font-display font-bold text-white mb-2">IELTS Preparation</h1>
        <p className="text-slate-400 text-lg">AI-powered coaching to improve your CLB score and boost your CRS points</p>
      </div>

      {/* CRS Impact Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-maple-500/10 to-blue-500/10 border border-maple-500/20">
        <p className="text-sm font-semibold text-maple-400 mb-2">💡 Why IELTS matters for Express Entry</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'CLB 9 all skills', points: '+31 CRS points', color: 'text-emerald-400' },
            { label: 'CLB 10 all skills', points: '+46 CRS points', color: 'text-blue-400' },
            { label: 'French + English', points: '+50 CRS points', color: 'text-purple-400' },
          ].map(item => (
            <div key={item.label} className="p-2 rounded-xl bg-slate-800/50">
              <p className={clsx('text-lg font-bold', item.color)}>{item.points}</p>
              <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Skills overview */}
      <div className="grid grid-cols-2 gap-3">
        {SKILLS.map(skill => {
          const c = SKILL_COLORS[skill.color]
          return (
            <div key={skill.id} className={clsx('flex items-center gap-3 p-4 rounded-xl border', c.border, c.bg)}>
              <skill.icon size={22} className={c.text} />
              <div className="text-left">
                <p className={clsx('font-semibold text-sm', c.text)}>{skill.label}</p>
                <p className="text-xs text-slate-500">{skill.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={onStart} className="btn-primary px-10 py-3 text-base mx-auto">
        <Zap size={18} /> Start Diagnostic Test
      </button>
      <p className="text-xs text-slate-500">10 questions · ~5 minutes · AI assessment</p>
    </motion.div>
  )
}

function DiagnosticScreen({ questions, answers, onAnswer, onSubmit, isSubmitting }) {
  const answeredCount = Object.keys(answers).length
  const total = questions.length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Diagnostic Test</h2>
          <p className="text-slate-400 text-sm">Answer all 10 questions to get your level assessment</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-maple-400">{answeredCount}/{total}</p>
          <p className="text-xs text-slate-500">answered</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-maple-500 rounded-full"
          animate={{ width: `${(answeredCount / total) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            selectedAnswer={answers[String(q.id)]}
            onAnswer={onAnswer}
            showResult={false}
          />
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={answeredCount < total || isSubmitting}
        className="btn-primary w-full py-3 text-base"
      >
        {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Analysing your level...</> : <><Zap size={18} /> Submit & Get My Level</>}
      </button>
      {answeredCount < total && (
        <p className="text-center text-xs text-slate-500">Answer all {total - answeredCount} remaining questions to submit</p>
      )}
    </div>
  )
}

function ResultsScreen({ assessment, questions, answers, onStartPractice }) {
  const level = LEVEL_CONFIG[assessment.overall_level] || LEVEL_CONFIG.intermediate
  const skillColors = { reading: 'blue', writing: 'green', listening: 'purple', vocabulary: 'amber' }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">
      {/* Level card */}
      <div className="card border border-maple-500/30 text-center space-y-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:text-left">
          <BandGauge band={assessment.estimated_band} />
          <div className="flex-1">
            <span className="text-4xl">{level.icon}</span>
            <h2 className="text-2xl font-bold text-white mt-1">
              {level.label} Level
            </h2>
            <p className="text-slate-400">Band {level.band} · CLB {assessment.clb_equivalent}</p>
            <div className="mt-2 p-2 rounded-xl bg-maple-500/10 border border-maple-500/20">
              <p className="text-xs text-maple-400 font-medium">🎯 {assessment.crs_impact}</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-white">{assessment.score}/{assessment.total}</p>
            <p className="text-slate-400 text-sm">Diagnostic score</p>
            <p className="text-2xl font-semibold text-maple-400 mt-1">{assessment.percentage}%</p>
          </div>
        </div>
      </div>

      {/* Per-skill breakdown */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-white flex items-center gap-2"><BarChart2 size={16} /> Skill Breakdown</h3>
        {Object.entries(assessment.skill_scores || {}).map(([skill, data]) => (
          <div key={skill}>
            <SkillBar
              label={skill.charAt(0).toUpperCase() + skill.slice(1)}
              score={data.score}
              total={data.total}
              level={data.level}
              color={skillColors[skill] || 'blue'}
            />
            <p className="text-xs text-slate-500 mt-0.5 ml-0.5">{data.feedback}</p>
          </div>
        ))}
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h3 className="font-semibold text-emerald-400 flex items-center gap-2"><CheckCircle2 size={14} /> Strengths</h3>
          {assessment.strengths?.map((s, i) => (
            <p key={i} className="text-sm text-slate-300 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span>{s}</p>
          ))}
        </div>
        <div className="card space-y-2">
          <h3 className="font-semibold text-amber-400 flex items-center gap-2"><Target size={14} /> Focus Areas</h3>
          {assessment.weaknesses?.map((w, i) => (
            <p key={i} className="text-sm text-slate-300 flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span>{w}</p>
          ))}
        </div>
      </div>

      {/* 4-week study plan */}
      {assessment.study_plan && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white flex items-center gap-2"><TrendingUp size={16} /> Your 4-Week Study Plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(assessment.study_plan).map(([week, plan], i) => (
              <div key={week} className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                <p className="text-xs font-bold text-maple-400 mb-1">Week {i + 1}: {plan.focus}</p>
                <ul className="space-y-0.5">
                  {plan.daily_tasks?.slice(0, 3).map((task, j) => (
                    <li key={j} className="text-xs text-slate-400 flex items-start gap-1.5">
                      <span className="text-slate-600 mt-0.5">•</span>{task}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => onStartPractice(assessment.recommended_next || 'reading', assessment.overall_level)}
          className="btn-primary flex-1 py-3 text-base"
        >
          <Zap size={16} /> Start {(assessment.recommended_next || 'reading').charAt(0).toUpperCase() + (assessment.recommended_next || 'reading').slice(1)} Practice
          <span className="text-xs ml-1 opacity-70">(recommended)</span>
        </button>
      </div>
    </motion.div>
  )
}

function PracticeScreen({ skill, level, questions, answers, onAnswer, onSubmit, onBack, isSubmitting, showResults, feedback, vocabulary }) {
  const skillObj = SKILLS.find(s => s.id === skill) || SKILLS[0]
  const c = SKILL_COLORS[skillObj.color]
  const answeredCount = Object.keys(answers).length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="btn-ghost text-sm px-3 py-1.5">← Back</button>
        <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-xl border', c.border, c.bg)}>
          <skillObj.icon size={16} className={c.text} />
          <span className={clsx('font-semibold text-sm capitalize', c.text)}>{skill}</span>
        </div>
        <span className="badge-slate capitalize">{level}</span>
        <div className="ml-auto text-right">
          <p className="text-lg font-bold text-white">{answeredCount}/{questions.length}</p>
          <p className="text-xs text-slate-500">answered</p>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${c.text.replace('text', 'bg')}`}
          animate={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {/* Feedback summary (after grading) */}
      {showResults && feedback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border border-maple-500/30 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-lg">Session Complete!</h3>
              <p className="text-slate-400 text-sm">{feedback.overall_feedback}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{feedback.score}/{feedback.total}</p>
              <p className="text-xs text-slate-500">Band ~{feedback.band_estimate}</p>
            </div>
          </div>
          {feedback.improvement_tips?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1"><Lightbulb size={12} /> Tips</p>
              {feedback.improvement_tips.slice(0, 3).map((tip, i) => (
                <p key={i} className="text-xs text-slate-400 flex items-start gap-1.5"><span className="text-amber-400">→</span>{tip}</p>
              ))}
            </div>
          )}
          {feedback.motivational_message && (
            <p className="text-sm text-emerald-400 font-medium">🌟 {feedback.motivational_message}</p>
          )}
        </motion.div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            selectedAnswer={answers[String(q.id)]}
            onAnswer={onAnswer}
            showResult={showResults}
          />
        ))}
      </div>

      {/* Vocabulary spotlight */}
      {vocabulary?.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white flex items-center gap-2"><Star size={14} className="text-amber-400" /> Vocabulary Spotlight</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {vocabulary.map((w, i) => <VocabCard key={i} word={w} />)}
          </div>
        </div>
      )}

      {/* Submit / Next */}
      {!showResults ? (
        <button
          onClick={onSubmit}
          disabled={answeredCount < questions.length || isSubmitting}
          className="btn-primary w-full py-3"
        >
          {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Grading...</> : <><CheckCircle2 size={16} /> Submit Answers</>}
        </button>
      ) : (
        <button onClick={onBack} className="btn-secondary w-full py-3">
          <RefreshCw size={16} /> Practice Another Skill
        </button>
      )}
    </div>
  )
}

function SkillSelector({ assessment, onSelect }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Choose a Skill to Practice</h2>
        <p className="text-slate-400 text-sm mt-1">AI generates fresh questions tailored to your level</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SKILLS.map(skill => {
          const c = SKILL_COLORS[skill.color]
          const skillScore = assessment?.skill_scores?.[skill.id]
          const recommended = assessment?.recommended_next === skill.id

          return (
            <motion.button
              key={skill.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(skill.id, assessment?.overall_level || 'intermediate')}
              className={clsx('card border text-left transition-all relative', c.border, 'hover:shadow-lg')}
            >
              {recommended && (
                <span className="absolute -top-2 -right-2 text-xs bg-maple-500 text-white px-2 py-0.5 rounded-full font-medium">Recommended</span>
              )}
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-3', c.bg)}>
                <skill.icon size={20} className={c.text} />
              </div>
              <h3 className={clsx('font-semibold text-base', c.text)}>{skill.label}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{skill.desc}</p>
              {skillScore && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <SkillBar
                    label=""
                    score={skillScore.score}
                    total={skillScore.total}
                    level={skillScore.level}
                    color={skill.color}
                  />
                </div>
              )}
              <div className="flex items-center gap-1 mt-3 text-xs text-slate-500">
                <span>8 questions</span>
                <span>·</span>
                <span>MCQ + gap fill</span>
                <ArrowRight size={12} className="ml-auto" />
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function SessionDetail({ sessionId, onBack }) {
  const { data: session, isLoading, error } = useQuery(
    ['ielts-session', sessionId],
    () => ieltsAPI.getSessionDetail(sessionId).then(r => r.data),
    { staleTime: Infinity }
  )

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
      <Loader2 size={32} className="animate-spin text-maple-400" />
      <p className="text-slate-400">Loading session...</p>
    </div>
  )

  if (error || !session) return (
    <div className="text-center py-12">
      <p className="text-red-400">Failed to load session.</p>
      <button onClick={onBack} className="btn-ghost mt-3 text-sm">← Back</button>
    </div>
  )

  const skillColors = { reading: 'blue', writing: 'green', listening: 'purple', vocabulary: 'amber', all: 'maple' }
  const correct = session.questions.filter(q => q.is_correct).length
  const total = session.questions.length
  const pct = total ? Math.round((correct / total) * 100) : 0

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost text-sm px-3 py-1.5">← Back</button>
        <div>
          <h2 className="font-bold text-white capitalize">
            {session.session_type === 'diagnostic' ? 'Diagnostic Test' : `${session.skill} Practice`}
          </h2>
          <p className="text-xs text-slate-500">
            {new Date(session.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
            {' · '}{session.level} · {session.session_type === 'diagnostic' ? 'All Skills' : session.skill}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className={clsx('text-2xl font-bold', pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400')}>
            {pct}%
          </p>
          <p className="text-xs text-slate-500">{correct}/{total} correct</p>
        </div>
      </div>

      {/* Overall feedback */}
      {session.overall_feedback && (
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-2">
          <p className="text-sm text-slate-300">{session.overall_feedback}</p>
          {session.motivational_message && (
            <p className="text-sm text-emerald-400 font-medium">🌟 {session.motivational_message}</p>
          )}
          {session.improvement_tips?.length > 0 && (
            <div className="pt-2 space-y-1">
              <p className="text-xs font-semibold text-amber-400">💡 Tips for improvement</p>
              {session.improvement_tips.map((tip, i) => (
                <p key={i} className="text-xs text-slate-400 flex gap-1.5"><span className="text-amber-500">→</span>{tip}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        <h3 className="font-semibold text-white">Questions & Answers</h3>
        {session.questions.map((q, i) => {
          const c = SKILL_COLORS[skillColors[q.skill] || 'blue']
          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={clsx('card border', q.is_correct ? 'border-emerald-500/30' : 'border-red-500/30')}
            >
              {/* Q header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium capitalize', c.badge)}>{q.skill}</span>
                <span className="text-xs text-slate-500 capitalize">{q.type?.replace('_', ' ')}</span>
                <span className="ml-auto">
                  {q.is_correct
                    ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={13} /> Correct</span>
                    : <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={13} /> Incorrect</span>
                  }
                </span>
              </div>

              {/* Passage */}
              {q.passage?.trim() && (
                <div className="mb-2 p-3 bg-slate-900 rounded-xl border border-slate-700 text-xs text-slate-300 leading-relaxed">
                  {q.skill === 'listening' && <p className="text-purple-400 font-semibold mb-1">🎧 Transcript</p>}
                  {q.skill === 'reading'   && <p className="text-blue-400 font-semibold mb-1">📖 Passage</p>}
                  <p className="whitespace-pre-wrap">{q.passage}</p>
                </div>
              )}

              {/* Sentence for writing */}
              {q.sentence?.trim() && (
                <div className="mb-2 p-2.5 bg-slate-800 rounded-xl border border-slate-600 text-xs">
                  <p className="text-green-400 font-semibold mb-1">✏️ {q.instruction || 'Fill in the blank'}</p>
                  <p className="text-white">{q.sentence}</p>
                </div>
              )}

              {/* Question */}
              <p className="text-sm font-medium text-white mb-2">{q.question || q.instruction || 'Choose the correct answer:'}</p>

              {/* Options */}
              <div className="space-y-1.5">
                {q.options?.map(opt => {
                  const letter = opt.split(')')[0].trim()
                  const isCorrect  = letter === q.correct_answer
                  const isUserPick = letter === q.user_answer
                  const isWrong    = isUserPick && !isCorrect
                  return (
                    <div key={opt} className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs',
                      isCorrect ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' :
                      isWrong   ? 'border-red-500 bg-red-500/10 text-red-300' :
                                  'border-slate-700 bg-slate-800/40 text-slate-400'
                    )}>
                      {isCorrect && <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />}
                      {isWrong   && <XCircle      size={13} className="text-red-400 flex-shrink-0" />}
                      {!isCorrect && !isWrong && <span className="w-4 flex-shrink-0" />}
                      <span>{opt.includes(')') ? opt.split(')').slice(1).join(')').trim() : opt}</span>
                      {isUserPick && !isCorrect && <span className="ml-auto text-red-400 font-medium">Your answer</span>}
                      {isCorrect  && isUserPick && <span className="ml-auto text-emerald-400 font-medium">Your answer ✓</span>}
                      {isCorrect  && !isUserPick && <span className="ml-auto text-emerald-400 font-medium">Correct answer</span>}
                    </div>
                  )
                })}
              </div>

              {/* Explanation */}
              {q.explanation && (
                <div className="mt-2 p-2.5 bg-slate-900 rounded-xl border border-slate-700 text-xs text-slate-400">
                  <span className="text-white font-semibold">Why: </span>{q.explanation}
                  {q.tip && <p className="text-amber-400 mt-1"><span className="font-semibold">💡 Tip: </span>{q.tip}</p>}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}


function HistoryScreen({ progress, onPractice, onViewSession }) {
  const skillColors = { reading: 'blue', writing: 'green', listening: 'purple', vocabulary: 'amber', all: 'maple' }
  const diagnostics = progress.filter(p => p.session_type === 'diagnostic')
  const practices   = progress.filter(p => p.session_type === 'practice')

  const avgBand = progress.filter(p => p.band_score).reduce((sum, p, _, arr) =>
    sum + p.band_score / arr.length, 0)

  const skillStats = ['reading', 'writing', 'listening', 'vocabulary'].map(skill => {
    const sessions = practices.filter(p => p.skill === skill)
    const avg = sessions.length
      ? sessions.reduce((s, p) => s + (p.score / (p.total || 1) * 100), 0) / sessions.length
      : null
    return { skill, sessions: sessions.length, avg }
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Sessions', value: progress.length, icon: '📊', color: 'text-maple-400' },
          { label: 'Diagnostics',    value: diagnostics.length, icon: '🎯', color: 'text-blue-400' },
          { label: 'Practice Sets',  value: practices.length, icon: '✏️', color: 'text-green-400' },
          { label: 'Avg Band',       value: avgBand ? avgBand.toFixed(1) : '—', icon: '⭐', color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Skill performance */}
      {practices.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white flex items-center gap-2"><BarChart2 size={15} /> Skill Performance</h3>
          {skillStats.map(({ skill, sessions, avg }) => {
            const c = SKILL_COLORS[skillColors[skill]]
            const skillObj = SKILLS.find(s => s.id === skill)
            return (
              <div key={skill} className="flex items-center gap-3">
                <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', c.bg)}>
                  {skillObj && <skillObj.icon size={14} className={c.text} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={clsx('font-medium capitalize', c.text)}>{skill}</span>
                    <span className="text-slate-400">{sessions} session{sessions !== 1 ? 's' : ''} · {avg !== null ? `${avg.toFixed(0)}% avg` : 'no data'}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${c.text.replace('text','bg')}`}
                      style={{ width: avg !== null ? `${avg}%` : '0%', opacity: 0.8 }} />
                  </div>
                </div>
                <button
                  onClick={() => onPractice(skill, 'intermediate')}
                  className="btn-ghost text-xs px-2 py-1 flex-shrink-0"
                >Practice →</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Session history */}
      {progress.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-slate-400">No sessions yet. Take the diagnostic test to get started!</p>
        </div>
      ) : (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white flex items-center gap-2"><Trophy size={15} className="text-amber-400" /> All Sessions</h3>
          <div className="space-y-2">
            {progress.map((session, i) => {
              const color = skillColors[session.skill] || 'maple'
              const c = SKILL_COLORS[color]
              const pct = session.total ? Math.round((session.score / session.total) * 100) : null
              const date = new Date(session.created_at)
              return (
                <div key={session.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700">
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold', c.bg, c.text)}>
                    {session.session_type === 'diagnostic' ? '🎯' : session.skill[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white capitalize">
                        {session.session_type === 'diagnostic' ? 'Diagnostic Test' : `${session.skill} Practice`}
                      </span>
                      <span className={clsx('text-xs px-1.5 py-0.5 rounded capitalize', c.badge)}>{session.level}</span>
                      {session.session_type === 'diagnostic' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">All Skills</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })} at {date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    {pct !== null && (
                      <p className={clsx('text-lg font-bold', pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400')}>
                        {pct}%
                      </p>
                    )}
                    {session.band_score && (
                      <p className="text-xs text-slate-400">Band {session.band_score}</p>
                    )}
                    {session.score !== null && session.total && (
                      <p className="text-xs text-slate-500">{session.score}/{session.total}</p>
                    )}
                    <button
                      onClick={() => onViewSession(session.id)}
                      className="text-xs text-maple-400 hover:text-maple-300 font-medium mt-0.5"
                    >
                      View →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}


// ─── Mock Test Components ─────────────────────────────────

const MOCK_SKILLS = [
  { id: 'reading',   label: 'Reading',   icon: BookOpen,   color: 'blue',   time: 60, questions: 40, sections: 4, desc: '4 sections · 10 questions each · Passages increase in difficulty' },
  { id: 'writing',   label: 'Writing',   icon: Pen,        color: 'green',  time: 60, questions: 40, sections: 4, desc: '4 sections · Articles, tenses, word form, sentence structure' },
  { id: 'listening', label: 'Listening', icon: Headphones, color: 'purple', time: 60, questions: 40, sections: 4, desc: '4 sections · Conversations, monologues, academic lectures' },
]

function MockSelector({ onStart, assessment }) {
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [selectedLevel, setSelectedLevel] = useState(assessment?.overall_level || 'intermediate')

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Mock Test</h2>
        <p className="text-slate-400 text-sm mt-1">Full IELTS-format timed test. 40 questions · 60 minutes · 4 sections with strict per-section timers.</p>
      </div>

      {/* Skill cards */}
      <div className="space-y-3">
        {MOCK_SKILLS.map(skill => {
          const c = SKILL_COLORS[skill.color]
          const isSelected = selectedSkill === skill.id
          return (
            <motion.button
              key={skill.id}
              whileTap={{ scale: 0.99 }}
              onClick={() => setSelectedSkill(skill.id)}
              className={clsx(
                'w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4',
                isSelected ? `${c.border} ${c.bg} shadow-lg` : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
              )}
            >
              <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', c.bg)}>
                <skill.icon size={22} className={c.text} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={clsx('font-semibold text-base', isSelected ? c.text : 'text-white')}>{skill.label}</h3>
                  <span className="text-xs text-slate-500">{skill.time} min · {skill.questions} questions · {skill.sections} sections</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{skill.desc}</p>
              </div>
              <div className={clsx('w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all',
                isSelected ? `${c.text.replace('text','border')} ${c.bg}` : 'border-slate-600'
              )}>
                {isSelected && <div className={clsx('w-full h-full rounded-full scale-50', c.text.replace('text','bg'))} />}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Level selector */}
      <div className="card space-y-2">
        <p className="text-sm font-medium text-white">Difficulty Level</p>
        <div className="flex gap-2">
          {Object.entries(LEVEL_CONFIG).map(([key, lvl]) => (
            <button
              key={key}
              onClick={() => setSelectedLevel(key)}
              className={clsx(
                'flex-1 py-2 rounded-xl border text-sm font-medium transition-all',
                selectedLevel === key
                  ? 'border-maple-500 bg-maple-500/15 text-maple-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              )}
            >
              {lvl.icon} {lvl.label}
              <p className="text-xs font-normal opacity-70">Band {lvl.band}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
        <p className="text-xs font-semibold text-amber-400">📋 Mock Test Rules — Full IELTS Format</p>
        {[
          '40 questions across 4 sections — 10 questions per section',
          'One global 60-minute countdown timer for the entire test',
          'Each section shows a recommended time — it\'s a pace guide, not a hard limit',
          'You can freely move between sections at any time',
          'Auto-submits when the 60-minute timer expires',
          'Full AI report + all answers with explanations after submission',
        ].map((rule, i) => (
          <p key={i} className="text-xs text-slate-400 flex items-start gap-1.5"><span className="text-amber-500 mt-0.5">•</span>{rule}</p>
        ))}
      </div>

      <button
        onClick={() => selectedSkill && onStart(selectedSkill, selectedLevel)}
        disabled={!selectedSkill}
        className="btn-primary w-full py-3 text-base"
      >
        {selectedSkill
          ? <><Zap size={18} /> Start {MOCK_SKILLS.find(s => s.id === selectedSkill)?.label} Mock Test</>
          : 'Select a skill to continue'
        }
      </button>
    </motion.div>
  )
}

function useTimer(totalSeconds, onExpire) {
  const [remaining, setRemaining] = useState(totalSeconds)
  const [running, setRunning] = useState(true)

  useEffect(() => {
    if (!running) return
    if (remaining <= 0) { onExpire(); return }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, running])

  const stop = () => setRunning(false)
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const pct = (remaining / totalSeconds) * 100
  const urgent = remaining < 120

  return { remaining, display: `${mm}:${ss}`, pct, urgent, stop }
}

function MockExam({ skill, level, questions, sections, answers, onAnswer, onSubmit, isSubmitting }) {
  const skillObj = MOCK_SKILLS.find(s => s.id === skill)
  const c = SKILL_COLORS[skillObj?.color || 'blue']
  const totalSeconds = 60 * 60  // one global 60-min timer

  const [currentSectionIdx, setCurrentSectionIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(totalSeconds)
  const [submitted, setSubmitted] = useState(false)

  const currentSection = sections?.[currentSectionIdx]

  // Global countdown
  useEffect(() => {
    if (submitted) return
    if (timeLeft <= 0) { handleSubmit(); return }
    const t = setTimeout(() => setTimeLeft(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, submitted])

  const handleSubmit = () => {
    if (submitted) return
    setSubmitted(true)
    onSubmit()
  }

  const handleNextSection = () => {
    if (currentSectionIdx < (sections?.length || 0) - 1) {
      setCurrentSectionIdx(i => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      handleSubmit()
    }
  }

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const ss = String(timeLeft % 60).padStart(2, '0')
  const urgent = timeLeft < 300  // red under 5 min
  const totalAnswered = Object.keys(answers).length

  // Recommended time remaining for current section (pace guide only)
  const elapsedSeconds = totalSeconds - timeLeft
  const currentSection_recommended = currentSection?.minutes * 60 || 0
  const sectionsBeforeCurrent = sections?.slice(0, currentSectionIdx) || []
  const timeUsedInPrevSections = sectionsBeforeCurrent.reduce((s, sec) => s + sec.minutes * 60, 0)
  const recommendedTimeLeft = Math.max(0, currentSection_recommended - Math.max(0, elapsedSeconds - timeUsedInPrevSections))
  const behindPace = elapsedSeconds > (timeUsedInPrevSections + currentSection_recommended)

  // Group questions in current section by passage
  const sectionQuestions = questions.filter(q => q.section_id === currentSection?.id)
  const passageGroups = sectionQuestions.reduce((acc, q) => {
    const g = q.passage_group || currentSection?.label || 'Questions'
    if (!acc[g]) acc[g] = []
    acc[g].push(q)
    return acc
  }, {})
  const answeredInSection = sectionQuestions.filter(q => answers[String(q.id)]).length

  if (submitted || isSubmitting) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <Loader2 size={40} className="animate-spin text-maple-400" />
      <p className="text-slate-300 text-lg font-medium">Grading your mock test...</p>
      <p className="text-slate-500 text-sm">AI is analysing all 40 answers and generating your full report</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Sticky exam header */}
      <div className="sticky top-0 z-10 bg-slate-900/98 backdrop-blur border border-slate-700 rounded-2xl px-4 py-3 shadow-xl space-y-2.5">

        {/* Row 1: skill label + section tabs + global timer */}
        <div className="flex items-center gap-3">
          <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-xl border flex-shrink-0', c.border, c.bg)}>
            {skillObj && <skillObj.icon size={15} className={c.text} />}
            <span className={clsx('font-semibold text-sm capitalize', c.text)}>{skill}</span>
          </div>

          {/* Section tabs */}
          <div className="flex gap-1 flex-1 overflow-x-auto hide-scrollbar">
            {sections?.map((sec, i) => {
              const secQs = questions.filter(q => q.section_id === sec.id)
              const secAns = secQs.filter(q => answers[String(q.id)]).length
              const done = i < currentSectionIdx
              const active = i === currentSectionIdx
              return (
                <button
                  key={sec.id}
                  onClick={() => setCurrentSectionIdx(i)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all',
                    active ? 'bg-maple-500 text-white shadow' :
                    done   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                             'bg-slate-800 text-slate-500 hover:text-slate-300'
                  )}
                >
                  {done ? '✓' : active ? '▶' : `S${i+1}`} {sec.label.replace('Section ', 'S')}
                  <span className="ml-1 opacity-60">({secAns}/{sec.questions})</span>
                </button>
              )
            })}
          </div>

          {/* Global timer */}
          <div className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-sm flex-shrink-0 border',
            urgent
              ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
              : 'bg-slate-800 border-slate-700 text-white'
          )}>
            ⏱ {mm}:{ss}
          </div>
        </div>

        {/* Row 2: section info + pace guide */}
        {currentSection && (
          <div className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">{currentSection.label}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">Questions {currentSection.start_q}–{currentSection.end_q}</span>
              <span className="text-slate-500">·</span>
              <span className={clsx('font-medium', behindPace ? 'text-amber-400' : 'text-slate-400')}>
                {behindPace
                  ? `⚠️ Recommended pace: move on`
                  : `Recommended time: ~${currentSection.minutes} min`}
              </span>
            </div>
            <span className={clsx('font-medium', answeredInSection === sectionQuestions.length ? 'text-emerald-400' : 'text-slate-500')}>
              {answeredInSection}/{sectionQuestions.length} answered
            </span>
          </div>
        )}

        {/* Row 3: global progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{totalAnswered}/40 total answered</span>
            <span>{Math.round((totalAnswered / 40) * 100)}% complete</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all duration-300', c.text.replace('text','bg'))}
              style={{ width: `${(totalAnswered / 40) * 100}%`, opacity: 0.8 }} />
          </div>
        </div>
      </div>

      {/* Section instructions banner */}
      <div className="p-3 rounded-xl border border-slate-700 bg-slate-800/40 text-xs text-slate-400">
        📋 {skill === 'listening'
          ? 'Read each transcript carefully as if you heard it spoken aloud. Answer based only on what is said.'
          : skill === 'reading'
          ? 'Read each passage carefully. Answer based only on the information given in the passage.'
          : 'Choose the best option to complete or correct each sentence. Focus on grammatical accuracy.'}
        {currentSection && <span className="text-slate-500 ml-2">Recommended time for this section: ~{currentSection.minutes} min</span>}
      </div>

      {/* Questions */}
      <div className="space-y-5">
        {Object.entries(passageGroups).map(([groupName, groupQs]) => {
          const sharedPassage = groupQs[0]?.passage
          return (
            <div key={groupName} className="space-y-3">
              {sharedPassage?.trim() && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-600">
                  <p className={clsx('text-xs font-bold mb-2 uppercase tracking-wide', c.text)}>{groupName}</p>
                  {skill === 'listening' && <p className="text-xs text-purple-400 font-semibold mb-2">🎧 Transcript — read as if you heard this</p>}
                  {skill === 'reading'   && <p className="text-xs text-blue-400 font-semibold mb-2">📖 Read carefully</p>}
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{sharedPassage}</p>
                </div>
              )}

              {groupQs.map((q, qi) => {
                const selected = answers[String(q.id)]
                return (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: qi * 0.03 }}
                    className={clsx('card border transition-all',
                      selected ? 'border-maple-500/50 shadow-sm' : 'border-slate-700'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                        selected ? 'bg-maple-500 text-white' : 'bg-slate-700 text-slate-400'
                      )}>{q.id}</span>
                      <span className="text-xs text-slate-600 capitalize">{q.type?.replace('_',' ')}</span>
                      {!selected && <span className="text-xs text-amber-500 ml-auto">Unanswered</span>}
                    </div>

                    {q.sentence?.trim() && (
                      <div className="mb-2 p-3 bg-slate-900 rounded-xl border border-slate-700 text-sm">
                        <p className="text-xs text-green-400 font-semibold mb-1">✏️ {q.instruction || 'Choose the correct option'}</p>
                        <p className="text-white font-medium">{q.sentence}</p>
                      </div>
                    )}

                    <p className="text-sm font-medium text-white mb-3">{q.question || q.instruction || 'Choose the correct answer:'}</p>

                    <div className="space-y-2">
                      {q.options?.map(opt => {
                        const letter = opt.split(')')[0].trim()
                        const optText = opt.includes(')') ? opt.split(')').slice(1).join(')').trim() : opt
                        const isSel = selected === letter
                        return (
                          <button key={opt} onClick={() => onAnswer(String(q.id), letter)}
                            className={clsx(
                              'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all',
                              isSel ? 'border-maple-500 bg-maple-500/15 text-maple-200'
                                    : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className={clsx('w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0',
                                isSel ? 'border-maple-400 bg-maple-500 text-white' : 'border-slate-600 text-slate-500'
                              )}>{letter}</span>
                              <span>{optText}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Section footer */}
      <div className="sticky bottom-4">
        <div className="card border border-slate-600 flex items-center gap-4">
          <div>
            <p className="text-sm font-medium text-white">Section {currentSectionIdx + 1} of {sections?.length}</p>
            <p className="text-xs text-slate-500">{answeredInSection}/{sectionQuestions.length} answered · {totalAnswered}/40 total</p>
          </div>
          <button onClick={handleNextSection} disabled={isSubmitting} className="btn-primary ml-auto gap-2">
            {currentSectionIdx < (sections?.length || 0) - 1
              ? <><ChevronRight size={16}/> Next Section</>
              : <><CheckCircle2 size={16}/> Submit Test</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}


function MockReport({ report, skill, questions = [], answers = {}, onBack, onRetake, onPractice }) {
  const skillObj = MOCK_SKILLS.find(s => s.id === skill)
  const c = SKILL_COLORS[skillObj?.color || 'blue']
  const band = report.band_score
  const pct = report.percentage
  const bandColor = band >= 7 ? '#10b981' : band >= 5.5 ? '#3b82f6' : '#f59e0b'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-5">

      <button onClick={onBack} className="btn-ghost text-sm px-3 py-1.5">← Back to Mock Tests</button>

      {/* Header result card */}
      <div className="card border border-maple-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <BandGauge band={band} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
              {skillObj && <skillObj.icon size={18} className={c.text} />}
              <h2 className={clsx('font-bold text-xl capitalize', c.text)}>{skill} Mock Test</h2>
            </div>
            <p className="text-3xl font-bold text-white">{report.score}/{report.total}
              <span className="text-slate-400 text-lg font-normal"> ({pct}%)</span>
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap justify-center sm:justify-start">
              <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold',
                pct >= 70 ? 'bg-emerald-500/20 text-emerald-300' : pct >= 50 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'
              )}>{report.performance_label || (pct >= 70 ? 'Good' : pct >= 50 ? 'Fair' : 'Needs Work')}</span>
              <span className="badge-slate capitalize">{report.level || 'intermediate'}</span>
            </div>
            {report.crs_impact && (
              <p className="text-xs text-maple-400 mt-2">🎯 {report.crs_impact}</p>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">Target Band</p>
            <p className="text-2xl font-bold" style={{ color: bandColor }}>{report.target_band}</p>
            <p className="text-xs text-slate-500">{report.weeks_to_target} weeks away</p>
          </div>
        </div>

        {/* Summary */}
        {report.summary && (
          <p className="text-sm text-slate-300 border-t border-slate-700 pt-3">{report.summary}</p>
        )}
      </div>

      {/* Detailed feedback */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} /> Strengths</h3>
          {report.strengths?.map((s, i) => (
            <p key={i} className="text-xs text-slate-300 flex gap-1.5"><span className="text-emerald-400">✓</span>{s}</p>
          ))}
        </div>
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1"><Target size={13} /> Areas to Improve</h3>
          {report.areas_for_improvement?.map((a, i) => (
            <p key={i} className="text-xs text-slate-300 flex gap-1.5"><span className="text-amber-400">→</span>{a}</p>
          ))}
        </div>
      </div>

      {/* Detailed feedback sections */}
      {report.detailed_feedback && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white flex items-center gap-2"><BarChart2 size={14} /> Detailed Analysis</h3>
          {Object.entries(report.detailed_feedback).map(([key, val]) => (
            <div key={key}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{key.replace(/_/g, ' ')}</p>
              <p className="text-sm text-slate-300">{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Next steps */}
      {report.next_steps?.length > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold text-white flex items-center gap-2"><TrendingUp size={14} /> Next Steps</h3>
          {report.next_steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-maple-500/20 text-maple-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-sm text-slate-300">{step}</p>
            </div>
          ))}
        </div>
      )}

      {/* Q&A Review — all questions with answers and explanations */}
      <div className="space-y-3">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <BookOpen size={15} className="text-slate-400" />
          Full Answer Review
          <span className="text-xs text-slate-500 font-normal">({questions.length} questions)</span>
        </h3>
        {questions.map((q, i) => {
          const userAns = answers[String(q.id)] || ''
          const correctAns = q.correct_answer || ''
          const isCorrect = userAns === correctAns
          const skillColor = SKILL_COLORS[{ reading: 'blue', writing: 'green', listening: 'purple', vocabulary: 'amber' }[q.skill] || 'blue']

          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className={clsx('rounded-2xl border p-4 space-y-2',
                isCorrect ? 'border-emerald-500/25 bg-emerald-500/5' :
                !userAns   ? 'border-slate-600 bg-slate-800/30' :
                             'border-red-500/25 bg-red-500/5'
              )}
            >
              {/* Question header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  isCorrect ? 'bg-emerald-500 text-white' : !userAns ? 'bg-slate-600 text-slate-300' : 'bg-red-500 text-white'
                )}>{q.id}</span>
                <span className={clsx('text-xs px-2 py-0.5 rounded-full capitalize font-medium', skillColor.badge)}>{q.skill}</span>
                <span className="text-xs text-slate-500 capitalize">{q.type?.replace('_', ' ')}</span>
                <span className="ml-auto text-xs font-semibold">
                  {isCorrect
                    ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> Correct</span>
                    : !userAns
                    ? <span className="text-slate-500">Not answered</span>
                    : <span className="text-red-400 flex items-center gap-1"><XCircle size={12} /> Incorrect</span>
                  }
                </span>
              </div>

              {/* Passage / Transcript */}
              {q.passage?.trim() && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 leading-relaxed">
                  {q.skill === 'listening' && <p className="text-purple-400 font-semibold mb-1">🎧 Transcript</p>}
                  {q.skill === 'reading'   && <p className="text-blue-400 font-semibold mb-1">📖 Passage</p>}
                  <p className="whitespace-pre-wrap">{q.passage}</p>
                </div>
              )}

              {/* Writing sentence */}
              {q.sentence?.trim() && (
                <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs">
                  <p className="text-green-400 font-semibold mb-1">✏️ {q.instruction || 'Fill in the blank'}</p>
                  <p className="text-white font-medium">{q.sentence}</p>
                </div>
              )}

              {/* Question text */}
              <p className="text-sm font-medium text-white">{q.question || q.instruction || 'Choose the correct answer:'}</p>

              {/* Options */}
              <div className="space-y-1.5">
                {q.options?.map(opt => {
                  const letter = opt.split(')')[0].trim()
                  const optText = opt.includes(')') ? opt.split(')').slice(1).join(')').trim() : opt
                  const isCorrectOpt = letter === correctAns
                  const isUserPick   = letter === userAns
                  const isWrong      = isUserPick && !isCorrectOpt
                  return (
                    <div key={opt} className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs',
                      isCorrectOpt ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200' :
                      isWrong      ? 'border-red-500 bg-red-500/10 text-red-300' :
                                     'border-slate-700 bg-slate-800/40 text-slate-500'
                    )}>
                      {isCorrectOpt && <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />}
                      {isWrong      && <XCircle      size={12} className="text-red-400 flex-shrink-0" />}
                      {!isCorrectOpt && !isWrong && <span className="w-3 flex-shrink-0" />}
                      <span className="font-medium mr-0.5">{letter})</span>
                      <span>{optText}</span>
                      <span className="ml-auto font-semibold flex-shrink-0">
                        {isCorrectOpt && isUserPick && <span className="text-emerald-400">✓ Your answer</span>}
                        {isCorrectOpt && !isUserPick && <span className="text-emerald-400">Correct answer</span>}
                        {isWrong && <span className="text-red-400">✗ Your answer</span>}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Explanation + Tip */}
              {q.explanation && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs space-y-1">
                  <p className="text-slate-300"><span className="text-white font-semibold">Explanation: </span>{q.explanation}</p>
                  {q.tip && <p className="text-amber-400"><span className="font-semibold">💡 IELTS Tip: </span>{q.tip}</p>}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* CTAs */}
      <div className="flex gap-3">
        <button onClick={onRetake} className="btn-secondary flex-1 py-2.5">
          <RefreshCw size={15} /> Retake Test
        </button>
        <button onClick={() => onPractice(skill, 'intermediate')} className="btn-primary flex-1 py-2.5">
          <Zap size={15} /> Targeted Practice
        </button>
      </div>
    </motion.div>
  )
}


// ─── Main Component ───────────────────────────────────────

const SCREENS = { welcome: 'welcome', diagnostic: 'diagnostic', results: 'results', skill_select: 'skill_select', practice: 'practice', history: 'history', session_detail: 'session_detail', mock_select: 'mock_select', mock_exam: 'mock_exam', mock_report: 'mock_report' }

export default function IeltsPrep() {
  const [screen, setScreen] = useState(SCREENS.welcome)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [diagnosticQuestions, setDiagnosticQuestions] = useState([])
  const [diagnosticAnswers, setDiagnosticAnswers] = useState({})
  const [assessment, setAssessment] = useState(null)
  const [practiceSkill, setPracticeSkill] = useState(null)
  const [practiceLevel, setPracticeLevel] = useState(null)
  const [practiceQuestions, setPracticeQuestions] = useState([])
  const [practiceAnswers, setPracticeAnswers] = useState({})
  const [practiceVocab, setPracticeVocab] = useState([])
  const [practiceShowResults, setPracticeShowResults] = useState(false)
  const [practiceFeedback, setPracticeFeedback] = useState(null)

  // Mock test state
  const [mockSkill, setMockSkill] = useState(null)
  const [mockLevel, setMockLevel] = useState('intermediate')
  const [mockQuestions, setMockQuestions] = useState([])
  const [mockAnswers, setMockAnswers] = useState({})
  const [mockReport, setMockReport] = useState(null)
  const [mockTimeMinutes, setMockTimeMinutes] = useState(60)
  const [mockSections, setMockSections] = useState([])
  const [mockStartTime, setMockStartTime] = useState(null)

  // Progress history
  const { data: progress } = useQuery('ielts-progress', () => ieltsAPI.getProgress().then(r => r.data), {
    retry: false, staleTime: 60000
  })

  // Get diagnostic
  const getDiagnostic = useMutation(() => ieltsAPI.getDiagnostic().then(r => r.data), {
    onSuccess: (data) => {
      setDiagnosticQuestions(data.questions || [])
      setDiagnosticAnswers({})
      setScreen(SCREENS.diagnostic)
    },
    onError: () => toast.error('Failed to load diagnostic. Please try again.')
  })

  // Assess level
  const assessLevel = useMutation(
    (data) => ieltsAPI.assessLevel(data).then(r => r.data),
    {
      onSuccess: (data) => {
        setAssessment(data)
        setScreen(SCREENS.results)
        toast.success(`Level assessed: ${data.overall_level} (Band ${data.estimated_band})`)
      },
      onError: () => toast.error('Assessment failed. Please try again.')
    }
  )

  // Get practice questions
  const getPractice = useMutation(
    (data) => ieltsAPI.getPractice(data).then(r => r.data),
    {
      onSuccess: (data) => {
        setPracticeQuestions(data.questions || [])
        setPracticeVocab(data.vocabulary_spotlight || [])
        setPracticeAnswers({})
        setPracticeShowResults(false)
        setPracticeFeedback(null)
        setScreen(SCREENS.practice)
      },
      onError: () => toast.error('Failed to load practice questions.')
    }
  )

  // Grade practice
  const gradePractice = useMutation(
    (data) => ieltsAPI.grade(data).then(r => r.data),
    {
      onSuccess: (data) => {
        setPracticeFeedback(data)
        setPracticeShowResults(true)
        toast.success(`Score: ${data.score}/${data.total} — Band ~${data.band_estimate}`)
      },
      onError: () => toast.error('Grading failed. Please try again.')
    }
  )

  const handleStartDiagnostic = () => getDiagnostic.mutate()

  const handleDiagnosticAnswer = (id, answer) => {
    setDiagnosticAnswers(prev => ({ ...prev, [id]: answer }))
  }

  const handleSubmitDiagnostic = () => {
    assessLevel.mutate({ questions: diagnosticQuestions, answers: diagnosticAnswers })
  }

  const handleStartPractice = (skill, level) => {
    setPracticeSkill(skill)
    setPracticeLevel(level)
    getPractice.mutate({ skill, level })
  }

  const handlePracticeAnswer = (id, answer) => {
    setPracticeAnswers(prev => ({ ...prev, [id]: answer }))
  }

  const handleSubmitPractice = () => {
    gradePractice.mutate({
      questions: practiceQuestions,
      answers: practiceAnswers,
      skill: practiceSkill,
      level: practiceLevel
    })
  }

  // Generate mock test
  const generateMock = useMutation(
    (data) => ieltsAPI.generateMock(data).then(r => r.data),
    {
      onSuccess: (data) => {
        setMockQuestions(data.questions || [])
        setMockAnswers({})
        setMockReport(null)
        setMockTimeMinutes(data.total_minutes || 60)
        setMockSections(data.sections || [])
        setMockStartTime(Date.now())
        setScreen(SCREENS.mock_exam)
        toast.success(`${data.questions?.length || 0} questions loaded — timer started!`)
      },
      onError: () => toast.error('Failed to generate mock test. Please try again.')
    }
  )

  // Grade mock test
  const gradeMock = useMutation(
    (data) => ieltsAPI.gradeMock(data).then(r => r.data),
    {
      onSuccess: (data) => {
        setMockReport(data)
        setScreen(SCREENS.mock_report)
        toast.success(`Mock test graded — Band ${data.band_score}!`)
      },
      onError: () => toast.error('Grading failed. Please try again.')
    }
  )

  const handleStartMock = (skill, level) => {
    setMockSkill(skill)
    setMockLevel(level)
    generateMock.mutate({ skill, level })
  }

  const handleMockAnswer = (id, answer) => {
    setMockAnswers(prev => ({ ...prev, [id]: answer }))
  }

  const handleSubmitMock = () => {
    const timeTaken = mockStartTime ? Math.round((Date.now() - mockStartTime) / 1000) : 0
    gradeMock.mutate({
      questions: mockQuestions,
      answers: mockAnswers,
      skill: mockSkill,
      level: mockLevel,
      time_taken_seconds: timeTaken
    })
  }

  // Loading overlay for practice loading
  if (getDiagnostic.isLoading || getPractice.isLoading || generateMock.isLoading) {
    const msg = getDiagnostic.isLoading
      ? 'Generating your diagnostic test...'
      : generateMock.isLoading
      ? `Building ${mockSkill} mock test (40 questions, 4 sections)...`
      : 'Generating practice questions...'
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="animate-spin text-maple-400" />
        <p className="text-slate-400 text-lg">{msg}</p>
        <p className="text-slate-500 text-sm">AI is personalising questions for you</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">IELTS Preparation</h1>
          <p className="text-slate-400 text-sm mt-1">AI-powered practice to boost your CLB score</p>
        </div>
        {assessment && (
          <span className="badge-maple">Current Band: {assessment.estimated_band} · {assessment.overall_level}</span>
        )}
      </div>

      {/* Top nav tabs — only show when not mid-test */}
      {![SCREENS.diagnostic, SCREENS.practice, SCREENS.session_detail, SCREENS.mock_exam, SCREENS.mock_report].includes(screen) && (
        <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl w-fit">
          {[
            { id: SCREENS.welcome,      label: 'Home' },
            { id: SCREENS.skill_select, label: 'Practice', disabled: !assessment },
            { id: SCREENS.mock_select,  label: '🎯 Mock Test' },
            { id: SCREENS.history,      label: `History${progress?.length ? ` (${progress.length})` : ''}` },
          ].map(tab => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && setScreen(tab.id)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                screen === tab.id
                  ? 'bg-maple-500 text-white shadow'
                  : tab.disabled
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Screen router */}
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

          {screen === SCREENS.welcome && (
            <WelcomeScreen onStart={handleStartDiagnostic} />
          )}

          {screen === SCREENS.diagnostic && (
            <DiagnosticScreen
              questions={diagnosticQuestions}
              answers={diagnosticAnswers}
              onAnswer={handleDiagnosticAnswer}
              onSubmit={handleSubmitDiagnostic}
              isSubmitting={assessLevel.isLoading}
            />
          )}

          {screen === SCREENS.results && assessment && (
            <ResultsScreen
              assessment={assessment}
              questions={diagnosticQuestions}
              answers={diagnosticAnswers}
              onStartPractice={(skill, level) => {
                setScreen(SCREENS.skill_select)
                // auto-start recommended
                handleStartPractice(skill, level)
              }}
            />
          )}

          {screen === SCREENS.history && (
            <HistoryScreen
              progress={progress || []}
              onPractice={handleStartPractice}
              onViewSession={(id) => { setSelectedSessionId(id); setScreen(SCREENS.session_detail) }}
            />
          )}

          {screen === SCREENS.session_detail && selectedSessionId && (
            <SessionDetail
              sessionId={selectedSessionId}
              onBack={() => setScreen(SCREENS.history)}
            />
          )}

          {screen === SCREENS.mock_select && (
            <MockSelector
              assessment={assessment}
              onStart={handleStartMock}
            />
          )}

          {screen === SCREENS.mock_exam && (
            <MockExam
              skill={mockSkill}
              level={mockLevel}
              questions={mockQuestions}
              timeMinutes={mockTimeMinutes}
              sections={mockSections}
              answers={mockAnswers}
              onAnswer={handleMockAnswer}
              onSubmit={handleSubmitMock}
              isSubmitting={gradeMock.isLoading}
            />
          )}

      {screen === SCREENS.mock_report && mockReport && (
            <MockReport
              report={mockReport}
              skill={mockSkill}
              questions={mockQuestions}
              answers={mockAnswers}
              onBack={() => setScreen(SCREENS.mock_select)}
              onRetake={() => handleStartMock(mockSkill, mockLevel)}
              onPractice={(skill, level) => handleStartPractice(skill, level)}
            />
          )}

          {screen === SCREENS.skill_select && (
            <SkillSelector
              assessment={assessment}
              onSelect={handleStartPractice}
            />
          )}

          {screen === SCREENS.practice && (
            <PracticeScreen
              skill={practiceSkill}
              level={practiceLevel}
              questions={practiceQuestions}
              answers={practiceAnswers}
              onAnswer={handlePracticeAnswer}
              onSubmit={handleSubmitPractice}
              onBack={() => setScreen(assessment ? SCREENS.skill_select : SCREENS.welcome)}
              isSubmitting={gradePractice.isLoading}
              showResults={practiceShowResults}
              feedback={practiceFeedback}
              vocabulary={practiceVocab}
            />
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  )
}

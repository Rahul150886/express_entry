// src/pages/Assistant.jsx

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Square, Bot, User, Trash2, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useAiChat, useProfile } from '../hooks'
import clsx from 'clsx'
import { v4 as uuidv4 } from 'uuid'

function getWelcomeMessage(profile) {
  if (!profile) return "Hi! I'm your Express Entry assistant 🍁 I can help you understand the process, improve your CRS score, and answer any questions about your application. What would you like to know?"

  const name = profile.full_name?.split(' ')[0] || 'there'
  const crs = profile.crs_score_json?.total
  const programs = profile.eligible_programs || []
  const hasLang = profile.language_tests?.length > 0
  const hasWork = profile.work_experiences?.length > 0
  const hasEdu = !!profile.education

  let intro = `Hi ${name}! I'm your Express Entry assistant 🍁`

  if (crs) {
    intro += ` Your current CRS score is **${crs} points**.`
    if (programs.length > 0) {
      intro += ` You're eligible for: **${programs.join(', ')}**.`
    }
  } else {
    intro += ` I can see your profile — let's work on getting your CRS score calculated.`
  }

  const missing = []
  if (!hasLang) missing.push('a language test')
  if (!hasWork) missing.push('work experience')
  if (!hasEdu) missing.push('education')

  if (missing.length > 0) {
    intro += ` To improve accuracy, consider adding ${missing.join(' and ')} to your profile.`
  }

  intro += ` What would you like to know?`
  return intro
}

function getQuickQuestions(profile) {
  const base = [
    "How can I improve my CRS score?",
    "What documents do I need after receiving an ITA?",
    "What's the difference between FSW, CEC and FST?",
    "How long does a police certificate take?",
    "What happens if I miss the 60-day ITA deadline?",
  ]

  if (!profile) return base

  const questions = []
  const crs = profile.crs_score_json?.total
  const hasLang = profile.language_tests?.length > 0
  const hasWork = profile.work_experiences?.length > 0
  const edu = profile.education

  if (crs) questions.push(`My CRS is ${crs}. What's the fastest way to increase it?`)
  if (hasLang) {
    const test = profile.language_tests[0]
    questions.push(`I have ${test?.test_type?.toUpperCase()} scores. Can retaking it help my CRS?`)
  }
  if (hasWork) questions.push("Does my foreign work experience help for Express Entry?")
  if (edu && !edu.is_canadian) questions.push("Do I need an ECA for my foreign degree?")
  if (profile.has_spouse) questions.push("How do I include my spouse's language score in my CRS?")
  if (!profile.has_provincial_nomination) questions.push("Which PNP streams am I most likely eligible for?")

  // Fill remaining slots from base questions
  const combined = [...new Set([...questions, ...base])]
  return combined.slice(0, 6)
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3 glass rounded-2xl rounded-tl-sm w-fit">
      {[0, 0.15, 0.3].map((delay, i) => (
        <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
      ))}
    </div>
  )
}

export default function Assistant() {
  const [sessionId] = useState(() => uuidv4())
  const [input, setInput] = useState('')
  const { data: profile } = useProfile()

  // Build personalized welcome once profile loads
  const welcomeMsg = getWelcomeMessage(profile)
  const { messages, sendMessage, isStreaming, stop, clear } = useAiChat(sessionId, welcomeMsg)
  const quickQuestions = getQuickQuestions(profile)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
    inputRef.current?.focus()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-140px)] flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Bot size={24} className="text-maple-400" /> AI Assistant
          </h1>
          <p className="text-slate-400 text-sm mt-1">Knows your profile · RAG-powered IRCC knowledge base</p>
        </div>
        <button onClick={clear} className="btn-ghost text-xs text-slate-500">
          <Trash2 size={14} /> Clear
        </button>
      </div>

      {/* Profile context pill — shows what AI knows */}
      {profile && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex-wrap">
          <Bot size={12} />
          <span>AI knows your profile:</span>
          {profile.crs_score_json?.total && <span className="badge-green">CRS {profile.crs_score_json.total}</span>}
          {profile.language_tests?.[0] && <span className="badge-slate">{profile.language_tests[0].test_type?.toUpperCase()}</span>}
          {profile.education && <span className="badge-slate">{profile.education.level?.replace(/_/g, ' ')}</span>}
          {profile.work_experiences?.length > 0 && <span className="badge-slate">{profile.work_experiences.length} job{profile.work_experiences.length > 1 ? 's' : ''}</span>}
          {(!profile.language_tests?.length || !profile.education || !profile.work_experiences?.length) && (
            <span className="text-amber-400">· Complete your profile for better answers</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
            >
              <div className={clsx(
                'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                msg.role === 'user' ? 'bg-maple-500' : 'bg-slate-700'
              )}>
                {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-maple-400" />}
              </div>
              <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    className="text-sm text-slate-200 prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-ul:text-slate-300"
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                      li: ({ children }) => <li className="text-slate-300">{children}</li>,
                      code: ({ children }) => <code className="bg-slate-800 px-1.5 py-0.5 rounded text-maple-300 text-xs">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Bot size={14} className="text-maple-400" />
              </div>
              <TypingIndicator />
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Quick questions (only when fresh) */}
      {messages.length === 1 && (
        <div className="flex-shrink-0">
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Sparkles size={12} /> Suggested questions for your profile</p>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-xs px-3 py-2 glass rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-maple-500/50 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 glass rounded-2xl border border-slate-700 p-2 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything about your Express Entry journey..."
          rows={1}
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 resize-none outline-none text-sm p-2 min-h-[40px] max-h-[120px]"
          style={{ height: 'auto' }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
        />
        {isStreaming ? (
          <button onClick={stop} className="w-10 h-10 rounded-xl bg-maple-500/20 hover:bg-maple-500/30 flex items-center justify-center text-maple-400 transition-colors flex-shrink-0">
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-xl bg-maple-500 hover:bg-maple-600 disabled:opacity-30 flex items-center justify-center text-white transition-colors flex-shrink-0"
          >
            <Send size={16} />
          </button>
        )}
      </div>

      <p className="text-center text-xs text-slate-600 flex-shrink-0">
        AI provides information only — not legal immigration advice. Consult an RCIC for complex situations.
      </p>
    </div>
  )
}



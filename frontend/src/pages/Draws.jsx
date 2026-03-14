import React from 'react'
// src/pages/Draws.jsx

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, BarChart3, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { useQuery } from 'react-query'
import { drawsAPI, aiAPI } from '../services/api'
import { useAppStore } from '../store'
import clsx from 'clsx'

const TYPE_META = {
  FSW:         { label: 'Federal Skilled Worker',    icon: '🌐', badge: 'badge-blue'   },
  CEC:         { label: 'Canadian Experience Class', icon: '🍁', badge: 'badge-maple'  },
  FST:         { label: 'Federal Skilled Trades',    icon: '🔧', badge: 'badge-yellow' },
  PNP:         { label: 'Provincial Nominee',        icon: '🏛️',  badge: 'badge-purple' },
  FRENCH:      { label: 'French Language',           icon: '🇫🇷', badge: 'badge-green'  },
  STEM:        { label: 'STEM Occupations',          icon: '🔬', badge: 'badge-blue'   },
  HEALTHCARE:  { label: 'Healthcare',                icon: '🏥', badge: 'badge-maple'  },
  TRADE:       { label: 'Trades Occupations',        icon: '🔨', badge: 'badge-yellow' },
  TRANSPORT:   { label: 'Transport',                 icon: '🚛', badge: 'badge-yellow' },
  AGRICULTURE: { label: 'Agriculture',               icon: '🌾', badge: 'badge-green'  },
  GENERAL:     { label: 'General Round',             icon: '✨', badge: 'badge-slate'  },
}

function getMeta(drawType) {
  if (!drawType) return TYPE_META.GENERAL
  const upper = drawType.toUpperCase()
  return TYPE_META[upper] ||
    TYPE_META[Object.keys(TYPE_META).find(k => upper.includes(k))] ||
    { label: drawType, icon: '📋', badge: 'badge-slate' }
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl p-3 border border-slate-700 text-sm">
      <p className="text-slate-400 text-xs">{payload[0].payload.date}</p>
      <p className="text-maple-400 font-bold">{payload[0].value} CRS</p>
      {payload[0].payload.invitations && (
        <p className="text-slate-400 text-xs">{payload[0].payload.invitations?.toLocaleString()} invitations</p>
      )}
    </div>
  )
}

function EligibilityCard({ item, userCrs }) {
  const meta = getMeta(item.draw_type)
  return (
    <div className={clsx('card border transition-all',
      item.status === 'eligible' ? 'border-emerald-500/40 bg-emerald-500/5' :
      item.status === 'close'    ? 'border-amber-500/30 bg-amber-500/5' :
                                   'border-slate-700'
    )}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xl">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate">{meta.label}</p>
          <p className="text-xs text-slate-500">Last: {format(parseISO(item.latest_date), 'MMM d, yyyy')}</p>
        </div>
        <div className="flex-shrink-0">
          {item.status === 'eligible'
            ? <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold"><CheckCircle2 size={12} /> Eligible</span>
            : item.status === 'close'
            ? <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold"><Clock size={12} /> Close</span>
            : <span className="flex items-center gap-1 text-xs text-slate-500"><AlertCircle size={12} /> Not yet</span>
          }
        </div>
      </div>
      <div className="flex items-center justify-between text-xs mt-1">
        <span className="text-slate-400">Cutoff: <span className="text-white font-semibold">{item.latest_crs}</span></span>
        {item.gap !== null && (
          <span className={clsx('font-semibold',
            item.gap <= 0 ? 'text-emerald-400' : item.gap <= 25 ? 'text-amber-400' : 'text-slate-500'
          )}>
            {item.gap <= 0 ? `+${Math.abs(item.gap)} above` : `${item.gap} pts needed`}
          </span>
        )}
      </div>
      {item.gap !== null && item.gap > 0 && (
        <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-maple-500/50 rounded-full"
            style={{ width: `${Math.max(5, Math.min(100, (userCrs / item.latest_crs) * 100))}%` }} />
        </div>
      )}
    </div>
  )
}

export default function Draws() {
  const [activeTab, setActiveTab] = useState('overview')
  const [activeType, setActiveType] = useState('all')
  const crsScore = useAppStore(s => s.crsScore)
  const score = crsScore?.total

  const { data: draws = [], isLoading } = useQuery(
    ['draws', activeType],
    () => drawsAPI.getAll({ draw_type: activeType !== 'all' ? activeType : undefined, limit: 100 }).then(r => r.data),
    { staleTime: 5 * 60 * 1000 }
  )
  const { data: drawTypes = [] } = useQuery('draw-types', () => drawsAPI.getTypes().then(r => r.data), { staleTime: 10 * 60 * 1000 })
  const { data: eligibility } = useQuery('draw-eligibility', () => drawsAPI.getEligibility().then(r => r.data), { enabled: !!score, staleTime: 10 * 60 * 1000 })
  const { data: prediction } = useQuery('draw-prediction', () => aiAPI.getDrawPrediction().then(r => r.data), { enabled: !!score, staleTime: 30 * 60 * 1000 })

  const chartData = draws.slice(0, 20).reverse().map(d => ({
    date: format(parseISO(d.draw_date), 'MMM d'),
    crs: d.minimum_crs,
    invitations: d.invitations_issued,
  }))
  const allCrs = draws.map(d => d.minimum_crs).filter(Boolean)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Draw Intelligence</h1>
          <p className="text-slate-400 text-sm mt-1">IRCC draw monitoring · eligibility analysis · AI predictions</p>
        </div>
        {score && <span className="badge-maple">Your CRS: {score}</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl w-fit flex-wrap">
        {[
          { id: 'overview',     label: 'Overview' },
          { id: 'eligibility',  label: '🎯 My Eligibility', disabled: !score },
          { id: 'by_type',      label: 'By Draw Type' },
          { id: 'history',      label: 'All Draws' },
        ].map(tab => (
          <button key={tab.id} disabled={tab.disabled}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id ? 'bg-maple-500 text-white shadow' :
              tab.disabled ? 'text-slate-600 cursor-not-allowed' :
              'text-slate-400 hover:text-white hover:bg-slate-700'
            )}
          >{tab.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Latest Draw CRS',   value: draws[0]?.minimum_crs || '—', sub: draws[0] ? format(parseISO(draws[0].draw_date), 'MMM d, yyyy') : 'No data' },
                  { label: 'Avg CRS (last 10)', value: draws.slice(0,10).length ? Math.round(draws.slice(0,10).reduce((s,d)=>s+d.minimum_crs,0)/Math.min(10,draws.length)) : '—', sub: 'Recent draws' },
                  { label: 'Lowest CRS Ever',   value: allCrs.length ? Math.min(...allCrs) : '—', sub: 'All time' },
                  { label: 'Draw Types Active', value: drawTypes.length || '—', sub: 'Different pools' },
                ].map((s, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="stat-card">
                    <p className="text-2xl font-display font-bold text-white">{s.value}</p>
                    <p className="text-sm text-slate-300 font-medium mt-1">{s.label}</p>
                    <p className="text-xs text-slate-500">{s.sub}</p>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card">
                  <h3 className="font-semibold text-white mb-4">CRS Trend — Last 20 Draws</h3>
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis domain={['auto','auto']} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                        <Tooltip content={<CustomTooltip />} />
                        {score && <ReferenceLine y={score} stroke="#d63031" strokeDasharray="5 5" strokeOpacity={0.8}
                          label={{ value: `You: ${score}`, fill: '#d63031', fontSize: 11, position: 'insideTopLeft' }} />}
                        <Bar dataKey="crs" fill="#334155" radius={[4,4,0,0]} activeBar={{ fill: '#d63031' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-56 flex items-center justify-center text-slate-500">
                      {isLoading ? <Loader2 size={24} className="animate-spin" /> : 'No draw data'}
                    </div>
                  )}
                </div>

                <div className="card space-y-4">
                  <h3 className="font-semibold text-white">AI Prediction</h3>
                  {prediction ? (
                    <>
                      <div className="text-center py-3">
                        <div className="text-4xl font-display font-bold text-maple-400 glow-text">
                          {Math.round((prediction.invitation_probability_6_months || 0) * 100)}%
                        </div>
                        <p className="text-slate-400 text-xs mt-1">chance of ITA in 6 months</p>
                        <div className="progress-bar mt-3">
                          <div className="progress-fill" style={{ width: `${(prediction.invitation_probability_6_months || 0) * 100}%` }} />
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">12-month probability</span>
                          <span className="text-white font-medium">{Math.round((prediction.invitation_probability_12_months || 0) * 100)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Likely draw type</span>
                          <span className="text-white font-medium text-xs">{prediction.likely_draw_type}</span>
                        </div>
                        {prediction.score_needed_for_high_probability && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Score for high chance</span>
                            <span className="text-maple-400 font-bold">{prediction.score_needed_for_high_probability}</span>
                          </div>
                        )}
                      </div>
                      {prediction.trend_analysis && (
                        <p className="text-xs text-slate-500 border-t border-slate-800 pt-3">{prediction.trend_analysis}</p>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Calculate your CRS score first</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ELIGIBILITY */}
          {activeTab === 'eligibility' && eligibility && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-slate-400">Your CRS Score</p>
                  <p className="text-3xl font-bold text-white">{eligibility.crs_score}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {eligibility.eligible_programs?.map(p => <span key={p} className="badge-maple">{p}</span>)}
                  {!eligibility.eligible_programs?.length && <span className="text-slate-500 text-sm">Complete your profile to determine eligible programs</span>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {eligibility.draw_types?.map(item => (
                  <EligibilityCard key={item.draw_type} item={item} userCrs={eligibility.crs_score} />
                ))}
              </div>
              <p className="text-xs text-slate-500 text-center">Based on latest draw CRS cutoffs. Program-specific criteria (e.g. Canadian work experience for CEC) also apply.</p>
            </div>
          )}

          {/* BY TYPE */}
          {activeTab === 'by_type' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {drawTypes.map((type, i) => {
                const meta = getMeta(type.draw_type)
                return (
                  <motion.div key={type.draw_type}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="card hover:border-slate-600 cursor-pointer transition-all"
                    onClick={() => { setActiveType(type.draw_type); setActiveTab('history') }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{meta.label}</p>
                        <p className="text-xs text-slate-500">{type.total_draws} draws · Last: {type.latest_date ? format(parseISO(type.latest_date), 'MMM d') : 'N/A'}</p>
                      </div>
                      {type.recent_trend === 'rising'  && <TrendingUp size={15} className="text-red-400" />}
                      {type.recent_trend === 'falling' && <TrendingDown size={15} className="text-green-400" />}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { val: type.latest_crs, label: 'Latest' },
                        { val: type.avg_crs,    label: 'Avg' },
                        { val: type.lowest_crs, label: 'Lowest' },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-lg font-bold text-white">{s.val || '—'}</p>
                          <p className="text-xs text-slate-500">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {score && type.latest_crs && (
                      <div className={clsx('mt-3 text-xs font-semibold text-center py-1 rounded-lg',
                        score >= type.latest_crs ? 'bg-emerald-500/15 text-emerald-400' :
                        score >= type.latest_crs - 50 ? 'bg-amber-500/15 text-amber-400' :
                        'bg-slate-800 text-slate-500'
                      )}>
                        {score >= type.latest_crs ? `✓ Your ${score} meets cutoff` : `${type.latest_crs - score} pts below cutoff`}
                      </div>
                    )}
                    <p className="text-xs text-slate-600 text-center mt-2">Click to filter draws →</p>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button onClick={() => setActiveType('all')}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all flex-shrink-0',
                    activeType === 'all' ? 'bg-maple-500 text-white border-maple-500' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  )}>All Types</button>
                {drawTypes.map(type => {
                  const meta = getMeta(type.draw_type)
                  return (
                    <button key={type.draw_type} onClick={() => setActiveType(type.draw_type)}
                      className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all flex-shrink-0 flex items-center gap-1',
                        activeType === type.draw_type ? 'bg-maple-500 text-white border-maple-500' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                      )}
                    ><span>{meta.icon}</span> {meta.label}</button>
                  )
                })}
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs border-b border-slate-800">
                      <th className="text-left py-2 pr-4">Draw #</th>
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-right py-2 pr-4">Min CRS</th>
                      <th className="text-right py-2 pr-4">Invitations</th>
                      {score && <th className="text-right py-2">vs You</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {draws.map(draw => {
                      const meta = getMeta(draw.draw_type)
                      const gap = score ? draw.minimum_crs - score : null
                      return (
                        <tr key={draw.id} className={clsx('hover:bg-slate-800/50 transition-colors', gap !== null && gap <= 0 && 'bg-emerald-500/5')}>
                          <td className="py-3 pr-4 font-mono text-slate-300">#{draw.draw_number}</td>
                          <td className="py-3 pr-4 text-slate-400">{format(parseISO(draw.draw_date), 'MMM d, yyyy')}</td>
                          <td className="py-3 pr-4">
                            <span className={clsx('text-xs px-2 py-0.5 rounded-full flex items-center gap-1 w-fit', meta.badge)}>
                              <span>{meta.icon}</span>{meta.label}
                            </span>
                          </td>
                          <td className={clsx('py-3 pr-4 text-right font-bold font-mono', gap !== null && gap <= 0 ? 'text-emerald-400' : 'text-white')}>
                            {draw.minimum_crs}{gap !== null && gap <= 0 && <span className="ml-1 text-xs">✓</span>}
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-400">{draw.invitations_issued?.toLocaleString()}</td>
                          {score && <td className="py-3 text-right">
                            {gap !== null && <span className={clsx('text-xs font-semibold', gap <= 0 ? 'text-emerald-400' : gap <= 25 ? 'text-amber-400' : 'text-slate-500')}>
                              {gap <= 0 ? `+${Math.abs(gap)}` : `-${gap}`}
                            </span>}
                          </td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {draws.length === 0 && !isLoading && <p className="text-center py-8 text-slate-500 text-sm">No draws found.</p>}
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  )
}

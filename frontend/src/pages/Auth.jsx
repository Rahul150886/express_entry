import React from 'react'
// src/pages/Auth.jsx

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Leaf, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI, profileAPI } from '../services/api'
import { useAuthStore } from '../store'
import log from '../services/logger'

function PasswordInput({ register, name, placeholder, error }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        {...register(name)}
        className="input pr-12"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export function LoginPage() {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm()
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const onSubmit = async ({ email, password }) => {
    log.info('LoginPage', `submit: email=${email}`)
    try {
      const res = await authAPI.login(email, password)
      const { access_token, refresh_token } = res.data
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)

      // Fetch profile to get full_name
      let full_name = null
      try {
        const profileRes = await profileAPI.get()
        full_name = profileRes.data?.full_name
      } catch (_) {
        // New user with no profile yet — that's fine
      }

      setAuth({ email, full_name }, access_token)
      log.info('LoginPage', `login success: email=${email}  name=${full_name}`)
      toast.success(`Welcome back${full_name ? ', ' + full_name.split(' ')[0] : ''}!`)
      navigate('/dashboard')
    } catch (err) {
      log.error('LoginPage', `login failed: ${err?.response?.data?.detail || err?.message}`)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue your PR journey">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Email address</label>
          <input type="email" placeholder="you@example.com" {...register('email', { required: true })} className="input" />
        </div>
        <div>
          <label className="label">Password</label>
          <PasswordInput register={register} name="password" placeholder="Your password" />
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2">
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <>Sign In <ArrowRight size={18} /></>}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-6">
        Don't have an account?{' '}
        <Link to="/register" className="text-maple-400 hover:text-maple-300 font-medium">Create one</Link>
      </p>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm()
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const onSubmit = async (data) => {
    log.info('RegisterPage', `submit: email=${data.email}  name=${data.full_name}`)
    try {
      const res = await authAPI.register(data)
      const { access_token, refresh_token } = res.data
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      setAuth({ email: data.email, full_name: data.full_name }, access_token)
      log.info('RegisterPage', `registration success: email=${data.email}`)
      toast.success('Account created! Let\'s build your profile.')
      navigate('/profile')
    } catch (err) {
      log.error('RegisterPage', `registration failed: ${err?.response?.data?.detail || err?.message}`)
    }
  }

  return (
    <AuthShell title="Start your journey" subtitle="Canada's permanent residence, simplified">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input placeholder="John Smith" {...register('full_name', { required: true })} className="input" />
        </div>
        <div>
          <label className="label">Email address</label>
          <input type="email" placeholder="you@example.com" {...register('email', { required: true })} className="input" />
        </div>
        <div>
          <label className="label">Password</label>
          <PasswordInput register={register} name="password" placeholder="At least 8 characters" />
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2">
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <>Create Account <ArrowRight size={18} /></>}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-maple-400 hover:text-maple-300 font-medium">Sign in</Link>
      </p>
    </AuthShell>
  )
}

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-maple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-700/30 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-maple-500 rounded-2xl flex items-center justify-center glow-maple">
            <Leaf size={24} className="text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-white text-xl leading-tight">Express Entry PR</p>
            <p className="text-maple-400 text-sm">Canada Immigration Assistant</p>
          </div>
        </div>

        <div className="card">
          <h1 className="text-2xl font-display font-bold text-white mb-1">{title}</h1>
          <p className="text-slate-400 text-sm mb-6">{subtitle}</p>
          {children}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Not affiliated with IRCC or the Government of Canada.<br />
          For immigration advice, consult a licensed RCIC.
        </p>
      </motion.div>
    </div>
  )
}

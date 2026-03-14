import React from 'react'
// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import Layout from './components/layout/Layout'
import { LoginPage, RegisterPage } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Documents from './pages/Documents'
import Draws from './pages/Draws'
import Assistant from './pages/Assistant'
import Application from './pages/Application'
import IeltsPrep from './pages/IeltsPrep'
import Tools from './pages/Tools'
import DocumentsGenerator from './pages/DocumentsGenerator'
import ToolsHub from './pages/ToolsHub'
import Onboarding from './pages/Onboarding'
import IRCCAssist from './pages/IRCCAssist'
import Readiness from './pages/Readiness'
import StudentHub from './pages/StudentHub'
import StudentProfile from './pages/StudentProfile'
import StudentAITools from './pages/StudentAITools'
import StudentTracker from './pages/StudentTracker'
import StudentFinancial from './pages/StudentFinancial'
import StudentPRPathway from './pages/StudentPRPathway'
import { useAuthStore } from './store'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  }
})

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const token = localStorage.getItem('access_token')
  if (!isAuthenticated && !token) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const token = localStorage.getItem('access_token')
  if (isAuthenticated || token) return <Navigate to="/dashboard" replace />
  return children
}

// After register, redirect new users to onboarding instead of dashboard
function SmartDashboardRedirect() {
  const onboardingDone = localStorage.getItem('onboarding_complete')
  if (!onboardingDone) return <Navigate to="/onboarding" replace />
  return <Navigate to="/dashboard" replace />
}

function AuthLogoutHandler() {
  const navigate = useNavigate()
  const logout = useAuthStore(s => s.logout)
  useEffect(() => {
    const handler = () => {
      logout()
      queryClient.clear()
      navigate('/login', { replace: true })
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [navigate, logout])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthLogoutHandler />
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

          {/* Onboarding — private but no Layout chrome */}
          <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />

          {/* Smart root redirect */}
          <Route path="/" element={<PrivateRoute><SmartDashboardRedirect /></PrivateRoute>} />

          {/* Main app — in Layout */}
          <Route path="/dashboard"         element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
          <Route path="/profile"           element={<PrivateRoute><Layout><Profile /></Layout></PrivateRoute>} />
          <Route path="/documents"         element={<PrivateRoute><Layout><Documents /></Layout></PrivateRoute>} />
          <Route path="/draws"             element={<PrivateRoute><Layout><Draws /></Layout></PrivateRoute>} />
          <Route path="/application"       element={<PrivateRoute><Layout><Application /></Layout></PrivateRoute>} />
          <Route path="/assistant"         element={<PrivateRoute><Layout><Assistant /></Layout></PrivateRoute>} />
          <Route path="/ielts"             element={<PrivateRoute><Layout><IeltsPrep /></Layout></PrivateRoute>} />

          <Route path="/ircc-assist"        element={<PrivateRoute><Layout><IRCCAssist /></Layout></PrivateRoute>} />
          <Route path="/readiness"           element={<PrivateRoute><Layout><Readiness /></Layout></PrivateRoute>} />

          {/* Student Visa Module */}
          <Route path="/student"             element={<PrivateRoute><Layout><StudentHub /></Layout></PrivateRoute>} />
          <Route path="/student/profile"     element={<PrivateRoute><Layout><StudentProfile /></Layout></PrivateRoute>} />
          <Route path="/student/eligibility" element={<PrivateRoute><Layout><StudentAITools /></Layout></PrivateRoute>} />
          <Route path="/student/tools"       element={<PrivateRoute><Layout><StudentAITools /></Layout></PrivateRoute>} />
          <Route path="/student/tracker"     element={<PrivateRoute><Layout><StudentTracker /></Layout></PrivateRoute>} />
          <Route path="/student/financial"   element={<PrivateRoute><Layout><StudentFinancial /></Layout></PrivateRoute>} />
          <Route path="/student/pr-pathway"  element={<PrivateRoute><Layout><StudentPRPathway /></Layout></PrivateRoute>} />

          {/* Tools — /tools goes directly to the tool runner, /tools/hub is the discovery page */}
          <Route path="/tools"             element={<PrivateRoute><Layout><Tools /></Layout></PrivateRoute>} />
          <Route path="/tools/hub"         element={<PrivateRoute><Layout><ToolsHub /></Layout></PrivateRoute>} />

          {/* Keep old routes working */}
          <Route path="/noc-finder"        element={<PrivateRoute><Layout><ToolsHub /></Layout></PrivateRoute>} />
          <Route path="/immigration-tools" element={<PrivateRoute><Layout><DocumentsGenerator /></Layout></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(148,163,184,0.12)',
            borderRadius: '12px',
            fontSize: '14px',
            fontFamily: 'Figtree, sans-serif',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#d63031', secondary: '#fff' } },
          duration: 4000,
        }}
      />
    </QueryClientProvider>
  )
}

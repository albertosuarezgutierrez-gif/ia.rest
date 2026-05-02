'use client'
import { useEffect, useState } from 'react'

interface Session {
  id: string
  nombre: string
  rol: 'admin' | 'camarero'
}

export function useAuth(requiredRole?: 'admin' | 'camarero') {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem('ia_rest_session')

    if (!raw) {
      // No session — redirect to login
      setChecking(false)
      window.location.href = '/login'
      return
    }

    try {
      const s: Session = JSON.parse(raw)

      // Wrong role for this page
      if (requiredRole === 'admin' && s.rol !== 'admin') {
        setChecking(false)
        window.location.href = '/edge'
        return
      }

      // Valid session
      setSession(s)
      setChecking(false)
    } catch {
      // Corrupt session data
      localStorage.removeItem('ia_rest_session')
      setChecking(false)
      window.location.href = '/login'
    }
  }, [])

  return { session, checking }
}

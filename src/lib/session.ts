import { NextRequest } from 'next/server'

export interface ApiSession {
  id: string
  nombre: string
  rol: string
  restaurante_id: string
  restaurante_nombre: string
}

// Lee la sesión del header x-ia-session (pasado por el frontend)
export function getSession(req: NextRequest): ApiSession | null {
  const raw = req.headers.get('x-ia-session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// Extrae restaurante_id o devuelve el demo como fallback
export function getRestauranteId(req: NextRequest): string {
  const s = getSession(req)
  return s?.restaurante_id ?? '00000000-0000-0000-0000-000000000001'
}

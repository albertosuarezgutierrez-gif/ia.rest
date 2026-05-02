import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('camareros')
    .select('id, nombre, pin, rol')
    .eq('pin', pin)
    .eq('activo', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  const camarero = { id: data.id, nombre: data.nombre, rol: data.rol }
  const res = NextResponse.json({ camarero })

  // Set session cookie for middleware
  res.cookies.set('ia_session', JSON.stringify(camarero), {
    httpOnly: false, // needs to be readable by client too
    maxAge: 60 * 60 * 12, // 12 hours
    path: '/',
    sameSite: 'lax',
  })

  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('ia_session')
  return res
}

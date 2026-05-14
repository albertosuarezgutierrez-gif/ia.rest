import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('estado', 'activo')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return NextResponse.json({ turno: null })
  return NextResponse.json({ turno: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { nombre } = await req.json()

  // Close any active shift
  await supabase
    .from('turnos')
    .update({ estado: 'cerrado' })
    .eq('estado', 'activo')

  // Open new shift
  const { data, error } = await supabase
    .from('turnos')
    .insert({ nombre: nombre || `Turno ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}

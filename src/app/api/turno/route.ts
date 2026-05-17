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
    .maybeSingle()

  if (error) return NextResponse.json({ turno: null })
  return NextResponse.json({ turno: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  // FIX-03: extraer restaurante_id para filtrar correctamente y no afectar otros restaurantes
  const rid = getRestauranteId(req)
  const { nombre } = await req.json()

  // Cerrar solo el turno activo de ESTE restaurante
  await supabase
    .from('turnos')
    .update({ estado: 'cerrado' })
    .eq('estado', 'activo')
    .eq('restaurante_id', rid)

  // Abrir nuevo turno con restaurante_id
  const { data, error } = await supabase
    .from('turnos')
    .insert({
      nombre: nombre || `Turno ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`,
      restaurante_id: rid,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ turno: data })
}

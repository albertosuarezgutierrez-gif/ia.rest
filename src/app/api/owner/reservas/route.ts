import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────
function getSession(req: NextRequest) {
  return req.headers.get('x-ia-session')
}

async function getRestauranteId(supabase: ReturnType<typeof createServerClient>, token: string) {
  const { data } = await supabase
    .from('sesiones_activas')
    .select('restaurante_id, rol')
    .eq('session_token', token)
    .gt('expires_at', new Date().toISOString())
    .single()
  return data
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ─── GET /api/owner/reservas?fecha=YYYY-MM-DD ─────────────────
export async function GET(req: NextRequest) {
  const token = getSession(req)
  if (!token) return err('Sin sesión', 401)

  const supabase = createServerClient()
  const session = await getRestauranteId(supabase, token)
  if (!session) return err('Sesión inválida', 401)
  if (!['owner', 'admin', 'super_admin', 'jefe_sala'].includes(session.rol)) {
    return err('Sin permisos', 403)
  }

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('reservas')
    .select(`
      id, nombre_cliente, telefono, num_personas,
      fecha_reserva, hora_reserva, duracion_min,
      notas, estado, canal, created_at, thefork_id,
      mesa_id, mesas(id, codigo, nombre)
    `)
    .eq('restaurante_id', session.restaurante_id)
    .eq('fecha_reserva', fecha)
    .not('estado', 'in', '("cancelada","no_show")')
    .order('hora_reserva', { ascending: true })

  if (error) return err(error.message, 500)

  // También cargar mesas disponibles para el selector
  const { data: mesas } = await supabase
    .from('mesas')
    .select('id, codigo, nombre, zona, capacidad')
    .eq('restaurante_id', session.restaurante_id)
    .order('codigo')

  return NextResponse.json({ reservas: data || [], mesas: mesas || [] })
}

// ─── POST /api/owner/reservas ─── Crear ──────────────────────
export async function POST(req: NextRequest) {
  const token = getSession(req)
  if (!token) return err('Sin sesión', 401)

  const supabase = createServerClient()
  const session = await getRestauranteId(supabase, token)
  if (!session) return err('Sesión inválida', 401)
  if (!['owner', 'admin', 'super_admin', 'jefe_sala', 'camarero'].includes(session.rol)) {
    return err('Sin permisos', 403)
  }

  const body = await req.json()
  const { nombre_cliente, telefono, num_personas, fecha_reserva,
    hora_reserva, duracion_min = 90, notas, canal = 'manual', mesa_id } = body

  if (!nombre_cliente?.trim()) return err('nombre_cliente requerido')
  if (!fecha_reserva) return err('fecha_reserva requerida')
  if (!hora_reserva) return err('hora_reserva requerida')
  if (!num_personas || num_personas < 1) return err('num_personas inválido')

  const { data, error } = await supabase
    .from('reservas')
    .insert({
      restaurante_id: session.restaurante_id,
      nombre_cliente: nombre_cliente.trim(),
      telefono:       telefono?.trim() || null,
      num_personas,
      fecha_reserva,
      hora_reserva,
      duracion_min,
      notas:          notas?.trim() || null,
      canal,
      mesa_id:        mesa_id || null,
      estado:         'pendiente',
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return NextResponse.json({ reserva: data }, { status: 201 })
}

// ─── PATCH /api/owner/reservas ─── Actualizar ────────────────
export async function PATCH(req: NextRequest) {
  const token = getSession(req)
  if (!token) return err('Sin sesión', 401)

  const supabase = createServerClient()
  const session = await getRestauranteId(supabase, token)
  if (!session) return err('Sesión inválida', 401)
  if (!['owner', 'admin', 'super_admin', 'jefe_sala', 'camarero'].includes(session.rol)) {
    return err('Sin permisos', 403)
  }

  const body = await req.json()
  const { id, ...patch } = body

  if (!id) return err('id requerido')

  // Verificar que pertenece al restaurante
  const { data: existing } = await supabase
    .from('reservas')
    .select('id')
    .eq('id', id)
    .eq('restaurante_id', session.restaurante_id)
    .single()

  if (!existing) return err('Reserva no encontrada', 404)

  // Campos permitidos para actualizar
  const allowed = ['nombre_cliente', 'telefono', 'num_personas', 'fecha_reserva',
    'hora_reserva', 'duracion_min', 'notas', 'estado', 'mesa_id', 'canal']
  const updateData: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in patch) updateData[k] = patch[k] === '' ? null : patch[k]
  }

  const { data, error } = await supabase
    .from('reservas')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return NextResponse.json({ reserva: data })
}

// ─── DELETE /api/owner/reservas ─── Cancelar ─────────────────
export async function DELETE(req: NextRequest) {
  const token = getSession(req)
  if (!token) return err('Sin sesión', 401)

  const supabase = createServerClient()
  const session = await getRestauranteId(supabase, token)
  if (!session) return err('Sesión inválida', 401)
  if (!['owner', 'admin', 'super_admin'].includes(session.rol)) {
    return err('Sin permisos', 403)
  }

  const body = await req.json()
  const { id } = body
  if (!id) return err('id requerido')

  // Soft-delete: marcar como cancelada
  const { error } = await supabase
    .from('reservas')
    .update({ estado: 'cancelada' })
    .eq('id', id)
    .eq('restaurante_id', session.restaurante_id)

  if (error) return err(error.message, 500)
  return NextResponse.json({ ok: true })
}

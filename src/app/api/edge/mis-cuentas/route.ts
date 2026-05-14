import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  // Todas las comandas abiertas del restaurante (no cerradas ni canceladas).
  // Se incluyen todos los tipos (comanda, cuenta, etc.).
  // En el componente se separan en "Mis mesas" / "Otras mesas".
  const { data, error } = await supabase
    .from('comandas')
    .select(`
      id, estado, tipo, created_at, numero_ticket, num_comensales, nombre_cuenta,
      mesa:mesas(id, codigo, capacidad),
      camarero:camareros(id, nombre),
      items:comanda_items(id, nombre, cantidad, precio_unitario, notas, estado)
    `)
    .eq('restaurante_id', session.restaurante_id)
    .not('estado', 'in', '(cerrada,cancelada)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type RawItem = { precio_unitario: number | null; cantidad: number }

  const cuentas = (data ?? []).map(c => {
    const items = (c.items ?? []) as RawItem[]
    const total = items.reduce((s, it) => s + (it.precio_unitario ?? 0) * it.cantidad, 0)
    const min = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000)
    return { ...c, total_estimado: total, minutos_esperando: min }
  })

  return NextResponse.json({ cuentas })
}

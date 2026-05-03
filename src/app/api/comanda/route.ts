import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// POST /api/comanda — comanda manual (sin voz)
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const { mesa_id, items, tipo = 'comanda', num_comensales } = await req.json()

    if (!mesa_id || !items?.length) {
      return NextResponse.json({ error: 'mesa_id e items requeridos' }, { status: 400 })
    }

    // Obtener sesión del header
    const sessionHeader = req.headers.get('x-ia-session')
    let camarero_id = ''
    let turno_id = ''
    try {
      const s = JSON.parse(sessionHeader ?? '{}')
      camarero_id = s.id ?? ''
    } catch {}

    // Obtener turno activo
    const { data: turno } = await supabase
      .from('turnos').select('id')
      .eq('restaurante_id', rid).eq('estado', 'activo')
      .single()
    turno_id = turno?.id ?? ''

    if (!turno_id) {
      return NextResponse.json({ error: 'Sin turno activo' }, { status: 400 })
    }

    // Crear comanda
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        mesa_id, camarero_id, turno_id,
        tipo, estado: tipo === 'cuenta' ? 'nueva' : 'en_cocina',
        restaurante_id: rid,
        ...(num_comensales ? { num_comensales } : {}),
      })
      .select().single()
    if (cmdErr) throw cmdErr

    // Crear items
    const itemsToInsert = items.map((it: {
      nombre: string; cantidad: number; notas?: string
      producto_id?: string; precio_unitario?: number
      formato_id?: string; formato_nombre?: string; seccion_id?: string
    }) => ({
      comanda_id: comanda.id,
      nombre: it.nombre,
      cantidad: it.cantidad,
      notas: it.notas ?? null,
      producto_id: it.producto_id ?? null,
      precio_unitario: it.precio_unitario ?? null,
      formato_id: it.formato_id ?? null,
      formato_nombre: it.formato_nombre ?? null,
      seccion_id: it.seccion_id ?? null,
      restaurante_id: rid,
    }))

    await supabase.from('comanda_items').insert(itemsToInsert)

    // Actualizar estado mesa
    const mesaEstados: Record<string, string> = {
      comanda: 'activa', marchar: 'marchar', cuenta: 'cuenta', aviso: 'aviso', '86': 'activa'
    }
    await supabase.from('mesas').update({
      estado: mesaEstados[tipo] ?? 'activa',
      ultima_comanda: new Date().toISOString(),
      camarero_id,
    }).eq('id', mesa_id)

    return NextResponse.json({ ok: true, comanda_id: comanda.id, numero_ticket: comanda.numero_ticket })
  } catch (err) {
    console.error('[COMANDA MANUAL]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}

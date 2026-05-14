import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

// POST /api/bridge/scan — owner solicita escaneo de red
// El bridge lo recoge en el próximo poll y registra las impresoras encontradas
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'admin', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  // Buscar bridge token activo para este restaurante
  const { data: bt } = await supabase
    .from('bridge_tokens')
    .select('id')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .single()

  if (!bt) {
    return NextResponse.json({ error: 'No hay bridge configurado. Instala el bridge primero.' }, { status: 404 })
  }

  // Marcar scan_requested = true
  await supabase
    .from('bridge_tokens')
    .update({ scan_requested: true })
    .eq('id', bt.id)

  return NextResponse.json({ ok: true, message: 'Escaneo solicitado. El bridge buscará impresoras en ~5 segundos.' })
}

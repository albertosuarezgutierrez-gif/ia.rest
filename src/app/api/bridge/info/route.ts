import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })

  const sb = createServerClient()
  const { data: bt, error } = await sb
    .from('bridge_tokens')
    .select('restaurante_id, activo, bridge_version')
    .eq('token', token)
    .single()

  if (error || !bt) return NextResponse.json({ error: 'token inválido' }, { status: 401 })
  if (!bt.activo) return NextResponse.json({ error: 'bridge desactivado' }, { status: 403 })

  await sb.from('bridge_tokens').update({
    ultimo_ping: new Date().toISOString(),
    bridge_version: req.nextUrl.searchParams.get('v') || bt.bridge_version,
  }).eq('token', token)

  const { data: impresoras } = await sb
    .from('impresoras')
    .select('id, nombre, ip_address, port, mac_address, activa')
    .eq('restaurante_id', bt.restaurante_id)
    .eq('activa', true)

  return NextResponse.json({ ok: true, restaurante_id: bt.restaurante_id, impresoras: impresoras ?? [] })
}

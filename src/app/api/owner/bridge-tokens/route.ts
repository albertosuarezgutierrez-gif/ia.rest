// src/app/api/owner/bridge-tokens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESTAURANTE_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  const { data, error } = await sb()
    .from('bridge_tokens')
    .select('id, token, nombre, activo, ultimo_ping, created_at')
    .eq('restaurante_id', RESTAURANTE_ID)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data })
}

export async function POST(req: NextRequest) {
  const { nombre } = await req.json()
  const { data, error } = await sb()
    .from('bridge_tokens')
    .insert({ nombre: nombre || 'Bridge local', restaurante_id: RESTAURANTE_ID })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await sb().from('bridge_tokens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

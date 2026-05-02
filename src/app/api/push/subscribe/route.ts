import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { subscription, camarero_id } = await req.json()

  if (!subscription || !camarero_id) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { camarero_id, subscription: JSON.stringify(subscription), updated_at: new Date().toISOString() },
      { onConflict: 'camarero_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const { camarero_id } = await req.json()
  if (!camarero_id) return NextResponse.json({ error: 'Falta camarero_id' }, { status: 400 })
  await supabase.from('push_subscriptions').delete().eq('camarero_id', camarero_id)
  return NextResponse.json({ ok: true })
}

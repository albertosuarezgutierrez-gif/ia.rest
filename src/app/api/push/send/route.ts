import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerClient } from '@/lib/supabase'

webpush.setVapidDetails(
  'mailto:hola@ia.rest',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { title, body, mesa, camarero_ids, data } = await req.json()

  // Obtener suscripciones — si se pasan camarero_ids, filtrar; si no, notificar a todos
  let query = supabase.from('push_subscriptions').select('*')
  if (camarero_ids?.length) query = query.in('camarero_id', camarero_ids)
  const { data: subs, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title: title || 'ia.rest', body, mesa, data: data || {} })
  let sent = 0

  await Promise.all(
    subs.map(async (row) => {
      try {
        const sub = JSON.parse(row.subscription)
        await webpush.sendNotification(sub, payload)
        sent++
      } catch (err: unknown) {
        // Suscripción expirada — limpiar
        const e = err as { statusCode?: number }
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id)
        }
      }
    })
  )

  return NextResponse.json({ ok: true, sent })
}

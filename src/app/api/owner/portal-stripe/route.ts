import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

function getSession(req: NextRequest) {
  const header = req.headers.get('x-ia-session')
  if (!header) return null
  try { return JSON.parse(header) } catch { return null }
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()

  // Buscar stripe_customer_id del perfil
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('stripe_customer_id')
    .eq('nombre', session.nombre)
    .single()

  if (!perfil?.stripe_customer_id) {
    return NextResponse.json({ error: 'No hay suscripción activa' }, { status: 404 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any })
  const appUrl = process.env.APP_URL ?? 'https://ia-rest.vercel.app'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: perfil.stripe_customer_id,
    return_url: `${appUrl}/owner`,
  })

  return NextResponse.json({ url: portalSession.url })
}

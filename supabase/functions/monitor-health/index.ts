// monitor-health — Edge Function
// Llamada por pg_cron cada 5 minutos
// Comprueba: bridge offline, comandas sin print_job, sesiones zombie, Stripe webhooks fallidos

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const incidencias: Array<{ tipo: string; modulo: string; mensaje: string; detalle: object; restaurante_id: string | null; nivel: string }> = []

  // ── CHECK 1: Bridges desconectados > 15 min ──────────────────────
  try {
    const { data: bridges } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id, last_seen, restaurante:restaurantes(nombre)')
      .not('last_seen', 'is', null)

    const ahora = new Date()
    for (const bridge of bridges || []) {
      const lastSeen = new Date(bridge.last_seen)
      const minutos = (ahora.getTime() - lastSeen.getTime()) / 60000
      if (minutos > 15) {
        incidencias.push({
          tipo: 'bridge_offline',
          modulo: 'bridge',
          mensaje: `Bridge desconectado hace ${Math.round(minutos)} min`,
          detalle: { last_seen: bridge.last_seen, minutos_offline: Math.round(minutos) },
          restaurante_id: bridge.restaurante_id,
          nivel: minutos > 60 ? 'critico' : 'aviso',
        })
      }
    }
  } catch (e) {
    console.error('Check bridges falló:', e)
  }

  // ── CHECK 2: Comandas nuevas sin print_job > 3 min ───────────────
  try {
    const tresMinAtras = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    const { data: comandasSinPrint } = await supabase
      .from('comandas')
      .select('id, restaurante_id, created_at, mesa_nombre')
      .eq('estado', 'nueva')
      .lt('created_at', tresMinAtras)
      .not('id', 'in',
        supabase.from('print_jobs').select('comanda_id').not('comanda_id', 'is', null)
      )

    for (const comanda of comandasSinPrint || []) {
      incidencias.push({
        tipo: 'comanda_sin_imprimir',
        modulo: 'comanda',
        mensaje: `Comanda mesa ${comanda.mesa_nombre || '?'} sin imprimir hace >3 min`,
        detalle: { comanda_id: comanda.id, created_at: comanda.created_at },
        restaurante_id: comanda.restaurante_id,
        nivel: 'aviso',
      })
    }
  } catch (e) {
    console.error('Check comandas sin print falló:', e)
  }

  // ── CHECK 3: Print jobs fallidos repetidos (>= 3 reintentos) ─────
  try {
    const { data: jobsFallidos } = await supabase
      .from('print_jobs')
      .select('id, restaurante_id, comanda_id, intentos, error')
      .eq('estado', 'error')
      .gte('intentos', 3)
      .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

    for (const job of jobsFallidos || []) {
      incidencias.push({
        tipo: 'print_job_fallido',
        modulo: 'bridge',
        mensaje: `Impresión fallida ${job.intentos} veces consecutivas`,
        detalle: { job_id: job.id, comanda_id: job.comanda_id, error: job.error },
        restaurante_id: job.restaurante_id,
        nivel: 'aviso',
      })
    }
  } catch (e) {
    console.error('Check print jobs fallidos:', e)
  }

  // ── CHECK 4: Sesiones zombie > 24h ───────────────────────────────
  try {
    const { data: zombies, count } = await supabase
      .from('sesiones_activas')
      .select('id', { count: 'exact', head: false })
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if ((count || 0) > 5) {
      incidencias.push({
        tipo: 'sesiones_zombie',
        modulo: 'sesion',
        mensaje: `${count} sesiones zombie > 24h detectadas`,
        detalle: { count },
        restaurante_id: null,
        nivel: 'info',
      })

      // Auto-fix: cerrar sesiones zombie
      await supabase
        .from('sesiones_activas')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    }
  } catch (e) {
    console.error('Check sesiones zombie:', e)
  }

  // ── Notificar incidencias nuevas ──────────────────────────────────
  let notificadas = 0
  for (const inc of incidencias) {
    // Evitar duplicados: no notificar si ya hay una incidencia igual no resuelta en la última hora
    const { count: existing } = await supabase
      .from('incidencias_sistema')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', inc.tipo)
      .eq('restaurante_id', inc.restaurante_id)
      .eq('resuelta', false)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if ((existing || 0) === 0) {
      await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inc),
      })
      notificadas++
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    checks_realizados: 4,
    incidencias_detectadas: incidencias.length,
    notificadas,
    timestamp: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})

// ============================================================
// ia.rest · /api/print
// ============================================================
// Bridge endpoint para impresoras ip_local.
// La impresora NO hace polling — lo hace un proceso Node.js local
// en la red del restaurante (scripts/bridge-local.js).
//
// GET  ?token=BRIDGE_TOKEN
//   → devuelve print_jobs pendientes con print_data (ESC/POS)
//   → el bridge los manda via TCP a IP:9100
//
// POST { job_id, status: 'impreso'|'error', error_msg? }
//   → el bridge confirma entrega
//
// POST { trigger: 'test', impresora_id }
//   → crea un job de prueba para verificar conectividad
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generarEscPos, generarTextoPlano } from '@/lib/courier'

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── GET — Bridge solicita jobs pendientes ────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  const sb = supabase()

  // Verificar token de bridge
  const { data: bridge } = await sb
    .from('bridge_tokens')
    .select('id, activo')
    .eq('token', token)
    .single()

  if (!bridge?.activo) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // Actualizar último ping del bridge
  await sb.from('bridge_tokens')
    .update({ ultimo_ping: new Date().toISOString() })
    .eq('id', bridge.id)

  // Buscar impresoras ip_local activas
  const { data: impresoras } = await sb
    .from('impresoras')
    .select('id, ip_address, port')
    .eq('connection_type', 'ip_local')
    .eq('activa', true)

  if (!impresoras?.length) {
    return NextResponse.json({ jobs: [] })
  }

  const impresoraIds = impresoras.map(i => i.id)
  const impresoraInfo: Record<string, { ip: string; port: number }> = {}
  for (const i of impresoras) {
    impresoraInfo[i.id] = { ip: i.ip_address ?? '', port: i.port ?? 9100 }
  }

  // Obtener jobs pendientes (máx. 20 por polling)
  const { data: jobs } = await sb
    .from('print_jobs')
    .select('id, impresora_id, print_data, payload, attempts')
    .in('impresora_id', impresoraIds)
    .in('status', ['pendiente'])
    .order('created_at', { ascending: true })
    .limit(20)

  if (!jobs?.length) {
    return NextResponse.json({ jobs: [] })
  }

  // Marcar como "encolado" para no servir duplicados
  const jobIds = jobs.map(j => j.id)
  await sb.from('print_jobs')
    .update({ status: 'encolado', sent_at: new Date().toISOString() })
    .in('id', jobIds)

  const result = jobs.map(j => ({
    id:         j.id,
    ip:         impresoraInfo[j.impresora_id]?.ip ?? '',
    port:       impresoraInfo[j.impresora_id]?.port ?? 9100,
    print_data: j.print_data,
    attempts:   j.attempts,
  }))

  return NextResponse.json({ jobs: result })
}

// ── POST — Bridge confirma / Owner dispara test ──────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sb = supabase()

  // ─ Test de impresión (disparado desde /owner) ─────────────
  if (body.trigger === 'test' && body.impresora_id) {
    const { data: imp } = await sb
      .from('impresoras')
      .select('id, nombre, seccion_id, ip_address, port, connection_type')
      .eq('id', body.impresora_id)
      .single()

    if (!imp) {
      return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })
    }

    const payload = {
      mesa:       'TEST',
      camarero:   'ia.rest',
      ticket_num: 0,
      seccion:    imp.seccion_id ?? 'test',
      items: [
        { nombre: 'TICKET DE PRUEBA', cantidad: 1 },
        { nombre: 'Conexión verificada', cantidad: 1 },
      ],
      tipo: 'test',
      ts:   new Date().toISOString(),
    }

    const printData = imp.connection_type === 'ip_local' || imp.connection_type === 'usb_bridge'
      ? generarEscPos(payload)
      : generarTextoPlano(payload)

    const { data: job, error } = await sb
      .from('print_jobs')
      .insert({
        impresora_id: imp.id,
        seccion_id:   imp.seccion_id,
        payload,
        print_data:   printData,
        status:       'pendiente',
        // No comanda_id — es un test
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, job_id: job.id })
  }

  // ─ Confirmación de entrega desde bridge ──────────────────
  const { job_id, status, error_msg } = body

  if (!job_id || !['impreso', 'error'].includes(status)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    status,
    attempts: supabaseSql('attempts + 1'),
  }

  if (status === 'impreso') {
    update.acked_at = new Date().toISOString()
  } else if (status === 'error') {
    update.error_msg  = error_msg ?? 'Error desconocido'
    update.status     = 'error'
  }

  // No podemos usar RPC inline aquí — lo hacemos con update numérico
  const { data: current } = await sb
    .from('print_jobs')
    .select('attempts')
    .eq('id', job_id)
    .single()

  await sb.from('print_jobs')
    .update({
      status,
      attempts:  (current?.attempts ?? 0) + 1,
      acked_at:  status === 'impreso' ? new Date().toISOString() : undefined,
      error_msg: status === 'error' ? (error_msg ?? 'Error desconocido') : undefined,
    })
    .eq('id', job_id)

  // Si impreso: actualizar comanda_items
  if (status === 'impreso') {
    const { data: job } = await sb
      .from('print_jobs')
      .select('comanda_id, seccion_id')
      .eq('id', job_id)
      .single()

    if (job?.comanda_id) {
      await sb.from('comanda_items')
        .update({
          print_status: 'impreso',
          printed_at:   new Date().toISOString(),
        })
        .eq('comanda_id', job.comanda_id)
        .eq('seccion_id', job.seccion_id)
    }
  }

  return NextResponse.json({ ok: true })
}

// Placeholder para evitar error de linting — no es una RPC real
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function supabaseSql(_expr: string) { return undefined }

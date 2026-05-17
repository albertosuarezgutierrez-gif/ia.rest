// lib/notify.ts — fire-and-forget helper para sistema de monitorización
export type NivelAlerta = 'info' | 'aviso' | 'critico' | 'resuelto'
export type ModuloAlerta = 'comanda' | 'cobro' | 'bridge' | 'qr' | 'ear' | 'stripe' | 'verifactu' | 'sesion' | 'sistema' | 'cron'

interface NotifyOptions {
  tipo: string; modulo: ModuloAlerta; mensaje: string
  detalle?: Record<string, unknown>; restaurante_id?: string | null
  nivel?: NivelAlerta; auto_resuelta?: boolean
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function notifyError(opts: NotifyOptions): void {
  fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nivel: 'aviso', ...opts }),
  }).catch((e) => { console.error('[notify] Error:', e) })
}

export async function notifyErrorAsync(opts: NotifyOptions): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-error`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nivel: 'aviso', ...opts }),
    })
    const data = await res.json()
    return data.id ?? null
  } catch (e) { console.error('[notify] Error:', e); return null }
}

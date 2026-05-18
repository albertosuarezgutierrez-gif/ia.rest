import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { getMenuCache } from '@/lib/brain-cache'

// ── /api/brain/conversar ──────────────────────────────────────────────────────
// Turno conversacional NIM cuando BRAIN tiene confianza baja.
// El camarero habló algo ambiguo → NIM pregunta → camarero responde → NIM resuelve.
//
// POST body: {
//   texto_original: string       // lo que dijo el camarero
//   historial: [{role, content}] // turnos anteriores (máx 4)
//   turno_id: string
//   restaurante_id?: string
// }
//
// Devuelve: {
//   respuesta: string            // pregunta NIM al camarero (para TTS)
//   resuelto: boolean            // true = ya hay suficiente info para pasar a BRAIN
//   brain_texto?: string         // si resuelto, el texto normalizado para pasar a /api/transcribe
//   historial_nuevo: [{role, content}]
// }

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const { texto_original, historial = [], turno_id } = await req.json()
  if (!texto_original?.trim()) return NextResponse.json({ error: 'texto_original requerido' }, { status: 400 })

  const supabase = createServerClient()

  // ── Contexto de carta (para que NIM conozca los productos reales) ──────────
  let cartaCtx = ''
  try {
    const cache = await getMenuCache(restauranteId)
    if (cache.productos.length > 0) {
      const nombres = cache.productos.map(p => {
        const aliases = p.aliases.length > 1 ? ` [${p.aliases.slice(1).join('/')}]` : ''
        return `${p.nombre}${aliases}`
      }).join(', ')
      cartaCtx = `\nCARTA ACTUAL: ${nombres}`
    }
  } catch { /* continuar sin carta */ }

  // ── Mesas activas para contexto ─────────────────────────────────────────────
  let mesasCtx = ''
  try {
    const { data: mesas } = await supabase
      .from('mesas')
      .select('codigo, estado, nombre')
      .eq('restaurante_id', restauranteId)
      .in('estado', ['activa', 'marchar', 'aviso', 'cuenta'])
      .limit(20)
    if (mesas?.length) {
      mesasCtx = `\nMESAS ACTIVAS: ${mesas.map(m => m.codigo).join(', ')}`
    }
  } catch { /* continuar */ }

  // ── System prompt conversacional ────────────────────────────────────────────
  const system = `Eres el asistente de voz de ia.rest, un TPV hostelero español.
Un camarero dijo algo que no se entendió bien y necesitas resolverlo en máximo 2 turnos.
Vocabulario hostelero: marchar = sacar plato ya, 86 = se acabó, cuenta = cobrar mesa.${cartaCtx}${mesasCtx}

REGLAS ESTRICTAS:
1. Sé MUY breve. Máximo 8 palabras por pregunta.
2. Pregunta UNA sola cosa a la vez.
3. Si ya tienes suficiente info para entender la comanda, devuelve JSON con resuelto=true.
4. Si es la 2ª respuesta del camarero, SIEMPRE intenta resolver aunque sea con suposición razonable.
5. Tono hostelero real: directo, sin formalidades.

RESPONDE SIEMPRE en JSON puro (sin markdown):
{
  "respuesta": "pregunta corta al camarero o confirmación",
  "resuelto": false,
  "brain_texto": null
}
O si ya está resuelto:
{
  "respuesta": "confirmación breve al camarero",
  "resuelto": true,
  "brain_texto": "texto normalizado para la comanda, ej: 'dos croquetas mesa T04'"
}

Ejemplos de buenas preguntas:
- "¿Qué mesa?" (si no se entendió la mesa)
- "¿Bacalao o rabo de toro?" (si 'especialidad' es ambigua)
- "¿Cuántas raciones?" (si falta cantidad)
- "¿Con o sin pan?" (nota relevante)`

  // ── Historial de conversación (máx 4 turnos) ────────────────────────────────
  const turnosPrevios = (historial as { role: string; content: string }[]).slice(-4)
  const mensajes: { role: 'user' | 'assistant'; content: string }[] = [
    ...turnosPrevios.map(t => ({
      role: t.role as 'user' | 'assistant',
      content: t.content,
    })),
    { role: 'user', content: texto_original },
  ]

  const raw = await callAI(system, mensajes, 200)
  if (!raw) return NextResponse.json({ error: 'NIM sin respuesta' }, { status: 500 })

  let parsed: { respuesta: string; resuelto: boolean; brain_texto?: string | null }
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    // Si NIM no devuelve JSON válido, tratar como pregunta simple
    parsed = { respuesta: raw.trim().slice(0, 120), resuelto: false, brain_texto: null }
  }

  // Historial actualizado para el siguiente turno
  const historial_nuevo = [
    ...turnosPrevios,
    { role: 'user', content: texto_original },
    { role: 'assistant', content: parsed.respuesta },
  ]

  return NextResponse.json({
    respuesta: parsed.respuesta,
    resuelto: parsed.resuelto ?? false,
    brain_texto: parsed.brain_texto ?? null,
    historial_nuevo,
  })
}

import { notifyError } from '@/lib/notify'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 800

/** Transcribe audio. Intenta Groq Whisper primero, fallback automático a OpenAI si falla. */
export async function transcribir(audioBlob: Blob): Promise<{ texto: string; latencia_ms: number; proveedor?: string }> {
  const start = Date.now()

  // ── Intentar Groq primero ──────────────────────────────────────────────────
  if (process.env.GROQ_API_KEY && process.env.EAR_PROVIDER !== 'openai') {
    try {
      const resultado = await transcribirConGroq(audioBlob)
      return { ...resultado, proveedor: 'groq' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const esRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('limit')
      const esAuth      = msg.includes('401') || msg.includes('API key') || msg.includes('authentication')

      console.warn(`[EAR] Groq falló (${msg}) — activando fallback OpenAI`)

      // Notificar — no crítico si es rate limit, crítico si es auth
      notifyError({
        tipo: 'ear_groq_fallback',
        modulo: 'ear',
        mensaje: `Groq Whisper falló, usando OpenAI como fallback`,
        detalle: { error: msg, esRateLimit, esAuth },
        nivel: esAuth ? 'critico' : 'aviso',
      })

      // Si no hay clave OpenAI, relanzar el error original
      if (!process.env.OPENAI_API_KEY) throw err
    }
  }

  // ── Fallback: OpenAI Whisper ───────────────────────────────────────────────
  try {
    const resultado = await transcribirConOpenAI(audioBlob)
    return { ...resultado, proveedor: 'openai' }
  } catch (err) {
    notifyError({
      tipo: 'ear_openai_fallback_fail',
      modulo: 'ear',
      mensaje: 'EAR completamente caído — Groq Y OpenAI fallaron',
      detalle: { error: String(err) },
      nivel: 'critico',
    })
    throw err
  }
}

// ── Groq Whisper ──────────────────────────────────────────────────────────────
async function transcribirConGroq(audioBlob: Blob): Promise<{ texto: string; latencia_ms: number }> {
  const start = Date.now()
  const Groq = (await import('groq-sdk')).default
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const file = new File([audioBlob], 'audio.webm', { type: audioBlob.type })
      const transcripcion = await groq.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3-turbo',
        language: 'es',
        response_format: 'json',
      })
      return { texto: transcripcion.text, latencia_ms: Date.now() - start }
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[EAR/Groq] intento ${attempt}/${MAX_RETRIES}: ${msg}`)
      if (msg.includes('401') || msg.includes('API key') || msg.includes('authentication')) throw err
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
    }
  }
  throw lastError
}

// ── OpenAI Whisper (fallback) ─────────────────────────────────────────────────
async function transcribirConOpenAI(audioBlob: Blob): Promise<{ texto: string; latencia_ms: number }> {
  const start = Date.now()
  const formData = new FormData()
  formData.append('file', new File([audioBlob], 'audio.webm', { type: audioBlob.type }))
  formData.append('model', 'whisper-1')
  formData.append('language', 'es')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI Whisper error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return { texto: data.text, latencia_ms: Date.now() - start }
}

import { BinaryLike } from 'crypto'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 800

/** Transcribe audio con Groq Whisper. Reintenta hasta MAX_RETRIES veces ante fallos transitorios. */
export async function transcribir(audioBlob: Blob): Promise<{ texto: string; latencia_ms: number }> {
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
      return {
        texto: transcripcion.text,
        latencia_ms: Date.now() - start,
      }
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[EAR] intento ${attempt}/${MAX_RETRIES} fallido: ${msg}`)

      // No reintentar en errores de autenticación/clave
      if (msg.includes('401') || msg.includes('API key') || msg.includes('authentication')) throw err

      // Esperar antes del reintento
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
    }
  }

  console.error('[EAR] todos los intentos fallaron')
  throw lastError
}

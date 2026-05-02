import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function transcribir(audioBlob: Blob): Promise<{ texto: string; latencia_ms: number }> {
  const start = Date.now()

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
}

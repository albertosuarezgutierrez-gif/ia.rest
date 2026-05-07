import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 90

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json()
    if (!images?.length) return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
    if (images.length > 15) return NextResponse.json({ error: 'Máximo 15 páginas' }, { status: 400 })

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const VALID_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
    type ValidType = typeof VALID_TYPES[number]
    const normalizeType = (t: string): ValidType => {
      if (t === 'image/jpg') return 'image/jpeg'
      if (VALID_TYPES.includes(t as ValidType)) return t as ValidType
      return 'image/jpeg'
    }

    const imageBlocks = images.map((img: { data: string; mediaType: string }) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: normalizeType(img.mediaType), data: img.data },
    }))

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      messages: [{
        role: 'user',
        content: [...imageBlocks, {
          type: 'text',
          text: `Eres un experto en hostelería española. Extrae TODOS los platos, tapas, bebidas y postres de esta carta de restaurante.

Devuelve SOLO un JSON válido sin texto adicional ni markdown:
{"productos":[{"nombre":"string","descripcion":"string|null","precio":0.00,"categoria":"string","alergenos":["string"]}]}

Reglas estrictas:
- nombre: tal como aparece en la carta
- descripcion: descripción del plato o null
- precio: número decimal (ej: 9.50) o null si no aparece
- categoria: infiere del contexto (Entrantes, Tapas, Principales, Carnes, Pescados, Mariscos, Postres, Bebidas, Vinos, Cervezas, Bocadillos, Pizzas, Ensaladas, Arroces, Sopas, Desayunos, Raciones, Medias raciones)
- alergenos: array con los alérgenos EU presentes. Usa exactamente estos nombres cuando aplique: ["Gluten","Crustáceos","Huevo","Pescado","Cacahuetes","Soja","Lácteos","Frutos de cáscara","Apio","Mostaza","Sésamo","Dióxido de azufre","Altramuces","Moluscos"]. Array vacío [] si no hay alérgenos claros.
- Incluye ABSOLUTAMENTE TODOS los productos visibles en todas las páginas
- Si hay varias páginas, combina en un único array sin duplicados
- No inventes productos que no estén en la carta`,
        }],
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json({ productos: parsed.productos || [] })
    } catch {
      return NextResponse.json({ error: 'Error al parsear respuesta IA', raw }, { status: 500 })
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    console.error('[onboarding/extract-carta] error:', e.status, e.message)
    return NextResponse.json({ error: e.message || 'Error al extraer la carta' }, { status: 500 })
  }
}

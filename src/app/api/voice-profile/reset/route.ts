/**
 * DELETE /api/voice-profile/reset?camarero_id=xxx
 *
 * Elimina el perfil de voz del camarero (en Azure y en BD).
 * Permite recalibrar desde cero.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { azureDisponible, eliminarPerfilAzure } from '@/lib/azure-speaker'

export async function DELETE(req: NextRequest) {
  try {
    const camareroId = req.nextUrl.searchParams.get('camarero_id')
    if (!camareroId) {
      return NextResponse.json({ error: 'camarero_id requerido' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Obtener el azure_profile_id para eliminarlo
    const { data: vp } = await supabase
      .from('voice_profiles')
      .select('azure_profile_id')
      .eq('camarero_id', camareroId)
      .maybeSingle()

    // Eliminar en Azure (si existe y Azure está configurado)
    if (vp?.azure_profile_id && azureDisponible() && !vp.azure_profile_id.startsWith('sim_')) {
      await eliminarPerfilAzure(vp.azure_profile_id).catch(err =>
        console.warn('[VOICE-RESET] No se pudo eliminar perfil en Azure:', err)
      )
    }

    // Eliminar en BD
    await supabase.from('voice_profiles').delete().eq('camarero_id', camareroId)

    return NextResponse.json({ ok: true, mensaje: 'Perfil eliminado — puedes recalibrar' })
  } catch (err) {
    console.error('[VOICE-RESET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

'use client'
// ============================================================
// ia.rest · /running — Pantalla del Running (repartidor de platos)
// Módulo #15: Running + Notificaciones configurables
//
// - Solo recibe notificaciones cuando cocina marca MARCHAR
// - No puede tomar comandas
// - Vista realtime de platos pendientes de llevar
// - Audio TTS en cada nuevo plato
// - Urgencia por color según tiempo de espera
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import SugerenciaButton from '@/components/SugerenciaButton'

// ── Paleta ─────────────────────────────────────────────────
const K = {
  bg:    '#0D0B08',
  c1:    '#161310',
  c2:    '#1F1A15',
  fg:    '#F6F1E7',
  fg2:   '#C9BFAA',
  fg3:   '#8D8270',
  rule:  '#2F2820',
  red:   '#D9442B',
  redS:  '#2A1008',
  amb:   '#E8A33B',
  ambS:  '#261900',
  gr:    '#3F7D44',
  grS:   '#0C1A0E',
}

const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

// ── Tipos ──────────────────────────────────────────────────
interface MarcharItem {
  id: string
  mesa_codigo: string
  zona_nombre: string | null
  items_resumen: string
  items_detalle: { nombre: string; cantidad: number }[]
  created_at: string
  recogido: boolean
}

// ── Helpers ────────────────────────────────────────────────
function edadStr(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m === 0) return 'AHORA'
  if (m < 60)  return `+${m}m`
  return `+${Math.floor(m / 60)}h${m % 60 ? m % 60 + 'm' : ''}`
}

function urgencia(iso: string): 'ok' | 'warn' | 'crit' {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2)  return 'ok'
  if (m < 5)  return 'warn'
  return 'crit'
}

function urgenciaColor(u: 'ok' | 'warn' | 'crit') {
  return u === 'ok' ? K.gr : u === 'warn' ? K.amb : K.red
}

function urgenciaBg(u: 'ok' | 'warn' | 'crit') {
  return u === 'ok' ? K.grS : u === 'warn' ? K.ambS : K.redS
}

function hablar(texto: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(texto)
  utt.lang   = 'es-ES'
  utt.rate   = 0.9
  utt.pitch  = 1
  utt.volume = 1
  const voces = window.speechSynthesis.getVoices()
  const esVoz = voces.find(v => v.lang.startsWith('es') && v.localService)
             ?? voces.find(v => v.lang.startsWith('es'))
  if (esVoz) utt.voice = esVoz
  window.speechSynthesis.speak(utt)
}

// ── Componente principal ───────────────────────────────────
export default function RunningPage() {
  const { session, checking } = useAuth('running')
  const [items, setItems]   = useState<MarcharItem[]>([])
  const [zonas, setZonas]   = useState<{ id: string; nombre: string }[]>([])
  const [zonasRun, setZonasRun] = useState<string[]>([]) // zona_ids asignadas
  const [loading, setLoading]   = useState(true)
  const [time, setTime]         = useState(new Date())
  const [showZonas, setShowZonas] = useState(false)
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const sh = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-ia-session': typeof window !== 'undefined'
      ? localStorage.getItem('ia_rest_session') ?? ''
      : '',
  }), [])

  // ── Cargar historial de platos pendientes ──────────────
  const cargarItems = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('marchar_log')
      .select('*')
      .eq('receptor_id', session.id)
      .eq('recogido', false)
      .eq('restaurante_id', session.restaurante_id)
      .order('created_at', { ascending: true })
    setItems((data ?? []) as MarcharItem[])
    setLoading(false)
  }, [session])

  // ── Cargar zonas disponibles y asignadas ───────────────
  const cargarZonas = useCallback(async () => {
    if (!session) return
    const [resZonas, resAsig] = await Promise.all([
      fetch('/api/owner/zonas', { headers: sh() }),
      fetch(`/api/owner/running-zonas?camarero_id=${session.id}`, { headers: sh() }),
    ])
    if (resZonas.ok) {
      const z = await resZonas.json()
      setZonas((z ?? []).map((zona: { id: string; nombre: string }) => ({ id: zona.id, nombre: zona.nombre })))
    }
    if (resAsig.ok) {
      const a = await resAsig.json()
      setZonasRun((a ?? []).filter((r: { activo: boolean }) => r.activo).map((r: { zona_id: string }) => r.zona_id))
    }
  }, [session, sh])

  // ── Suscripción realtime ───────────────────────────────
  useEffect(() => {
    if (!session) return
    cargarItems()
    cargarZonas()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canal = (supabase.channel(`running-${session.id}`) as any)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'marchar_log',
          filter: `receptor_id=eq.${session.id}`,
        },
        (payload: { new: MarcharItem }) => {
          const nuevo = payload.new as MarcharItem
          setItems((prev: MarcharItem[]) => [...prev, nuevo])
          // Audio TTS
          hablar(`Saliendo. Mesa ${nuevo.mesa_codigo}. ${nuevo.items_resumen.replace(/×/g, '').replace(/·/g, ',')}`)
        }
      )
      .subscribe()

    canalRef.current = canal

    // Reloj para actualizar colores de urgencia
    const t = setInterval(() => setTime(new Date()), 10000)
    return () => {
      canal.unsubscribe()
      clearInterval(t)
    }
  }, [session, cargarItems, cargarZonas])

  // ── Suprimir warning de time not used ──────────────────
  void time

  // ── Logout ─────────────────────────────────────────────
  const logout = () => {
    localStorage.removeItem('ia_rest_session')
    window.location.href = '/login'
  }

  // ── Toggle zona ────────────────────────────────────────
  const toggleZona = async (zonaId: string) => {
    if (!session) return
    const asignada = zonasRun.includes(zonaId)
    if (asignada) {
      // Desactivar
      const { data: entries } = await supabase
        .from('running_zonas')
        .select('id')
        .eq('camarero_id', session.id)
        .eq('zona_id', zonaId)
      if (entries?.length) {
        await fetch('/api/owner/running-zonas', {
          method: 'DELETE',
          headers: sh(),
          body: JSON.stringify({ id: entries[0].id }),
        })
      }
      setZonasRun((prev: string[]) => prev.filter((z: string) => z !== zonaId))
    } else {
      // Activar
      await fetch('/api/owner/running-zonas', {
        method: 'POST',
        headers: sh(),
        body: JSON.stringify({ camarero_id: session.id, zona_id: zonaId }),
      })
      setZonasRun((prev: string[]) => [...prev, zonaId])
    }
  }

  if (checking || !session) {
    return <div style={{ minHeight: '100dvh', background: K.bg }} />
  }

  const zonasNombres = zonas
    .filter((z: { id: string; nombre: string }) => zonasRun.includes(z.id))
    .map((z: { id: string; nombre: string }) => z.nombre)
    .join(' · ')

  const pendientes = items.filter((i: MarcharItem) => !i.recogido)

  return (
    <>
      <SugerenciaButton session={session} tema="dark" />
      <div style={{ minHeight: '100dvh', background: K.bg, fontFamily: SN, display: 'flex', flexDirection: 'column' }}>
        <style>{`
          @keyframes slideIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
          @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&family=JetBrains+Mono:wght@500;700&display=swap');
        `}</style>

        {/* ── Header ─────────────────────────────────────────── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: K.c1, borderBottom: `1px solid ${K.rule}`,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', height: 56,
        }}>
          {/* Marca */}
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: K.fg }}>
            ia<span style={{ color: K.red }}>.</span>rest
          </div>
          <div style={{
            fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
            color: K.red, textTransform: 'uppercase',
            padding: '3px 7px', border: `1px solid ${K.red}44`,
            borderRadius: 3, background: K.redS,
          }}>
            RUNNING
          </div>

          {/* Nombre + zonas */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontFamily: SN, fontWeight: 600, fontSize: 14, color: K.fg, lineHeight: 1 }}>
              {session.nombre}
            </div>
            {zonasNombres && (
              <div style={{ fontFamily: SM, fontSize: 10, color: K.fg3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {zonasNombres}
              </div>
            )}
          </div>

          {/* Botón zonas */}
          <button
            onClick={() => setShowZonas((v: boolean) => !v)}
            style={{
              background: showZonas ? K.red : K.c2,
              border: `1px solid ${showZonas ? K.red : K.rule}`,
              borderRadius: 8, padding: '7px 12px',
              color: K.fg, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Mis zonas
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            style={{
              background: 'none', border: `1px solid ${K.rule}`,
              borderRadius: 6, padding: '6px 10px',
              color: K.fg3, fontSize: 12, cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </header>

        {/* ── Panel zonas ────────────────────────────────────── */}
        {showZonas && (
          <div style={{
            background: K.c1, borderBottom: `1px solid ${K.rule}`,
            padding: '12px 16px',
          }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: K.fg3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Zonas que cubro ahora mismo
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {zonas.length === 0 && (
                <div style={{ fontFamily: SN, fontSize: 13, color: K.fg3 }}>
                  No hay zonas configuradas — pide al owner que las cree en el panel.
                </div>
              )}
              {zonas.map((z: { id: string; nombre: string }) => {
                const activa = zonasRun.includes(z.id)
                return (
                  <button
                    key={z.id}
                    onClick={() => toggleZona(z.id)}
                    style={{
                      padding: '8px 14px',
                      background: activa ? K.gr + '33' : K.c2,
                      border: `1px solid ${activa ? K.gr : K.rule}`,
                      borderRadius: 8, cursor: 'pointer',
                      color: activa ? K.gr : K.fg3,
                      fontSize: 13, fontWeight: activa ? 700 : 500,
                    }}
                  >
                    {activa ? '✓ ' : ''}{z.nombre}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Contenido principal ────────────────────────────── */}
        <div style={{ flex: 1, padding: '16px', maxWidth: 640, width: '100%', margin: '0 auto' }}>

          {/* Contador */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: K.fg3, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {pendientes.length === 0 ? 'Sin platos pendientes' : `${pendientes.length} plato${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''}`}
            </div>
            {!loading && pendientes.length > 0 && (
              <div style={{
                fontFamily: SM, fontSize: 10, color: K.red, fontWeight: 700,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}>
                ● LIVE
              </div>
            )}
          </div>

          {/* Estado vacío */}
          {!loading && pendientes.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: K.fg3, fontFamily: SE, fontStyle: 'italic', fontSize: 18,
            }}>
              Todo entregado.
              <div style={{ fontFamily: SN, fontSize: 13, color: K.fg3, fontStyle: 'normal', marginTop: 8 }}>
                Cuando cocina marche un plato de tu zona, aparecerá aquí.
              </div>
            </div>
          )}

          {/* Lista de platos ─────────────────────────────── */}
          {pendientes.map((item: MarcharItem) => {
            const u = urgencia(item.created_at)
            const col = urgenciaColor(u)
            const bg  = urgenciaBg(u)
            return (
              <div
                key={item.id}
                style={{
                  animation: 'slideIn .25s ease',
                  border: `1px solid ${col}55`,
                  borderLeft: `3px solid ${col}`,
                  borderRadius: 12, padding: '16px',
                  marginBottom: 12,
                  background: bg + '88',
                }}
              >
                {/* Cabecera: zona + mesa */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  {item.zona_nombre && (
                    <div style={{
                      fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
                      textTransform: 'uppercase', color: col,
                      padding: '3px 7px', border: `1px solid ${col}44`,
                      borderRadius: 3, background: col + '18',
                    }}>
                      {item.zona_nombre}
                    </div>
                  )}
                  <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, fontWeight: 500, color: K.fg }}>
                    Mesa {item.mesa_codigo}
                  </div>
                  <div style={{ marginLeft: 'auto', fontFamily: SM, fontSize: 12, color: col, fontWeight: 700 }}>
                    {edadStr(item.created_at)}
                  </div>
                </div>

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {item.items_detalle?.length > 0
                    ? item.items_detalle.map((it: { nombre: string; cantidad: number }, idx: number) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontFamily: SM, fontSize: 18, fontWeight: 700, color: col, minWidth: 28 }}>
                            {it.cantidad}×
                          </span>
                          <span style={{ fontFamily: SN, fontSize: 15, color: K.fg }}>
                            {it.nombre}
                          </span>
                        </div>
                      ))
                    : (
                      <div style={{ fontFamily: SN, fontSize: 14, color: K.fg2 }}>
                        {item.items_resumen}
                      </div>
                    )
                  }
                </div>
              </div>
            )
          })}

          {/* Historial entregados (colapsado) */}
          {items.filter((i: MarcharItem) => i.recogido).length > 0 && (
            <div style={{ marginTop: 24, color: K.fg3, fontFamily: SM, fontSize: 11, textAlign: 'center' }}>
              {items.filter((i: MarcharItem) => i.recogido).length} entregados en esta sesión
            </div>
          )}
        </div>

        {/* ── Footer info ────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${K.rule}`,
          fontFamily: SM, fontSize: 10, color: K.fg3,
          display: 'flex', justifyContent: 'center', gap: 16,
        }}>
          <span>Running · {session.restaurante_nombre}</span>
          <span style={{ color: K.rule }}>|</span>
          <span>Solo lectura · sin comandas</span>
        </div>
      </div>
    </>
  )
}

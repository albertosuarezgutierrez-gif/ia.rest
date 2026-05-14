'use client'
// ia.rest · MisCuentasTab — Resumen de sala: cuentas pedidas + mesas activas
import React, { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg:'#F6F1E7', bg1:'#FBF8F1', bg2:'#EFE7D6', bg3:'#E5DAC2',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  verm:'#D9442B', vermD:'#A8311E', vermS:'#F4D8CF',
  amb:'#E8A33B', ambS:'#F7E3B6',
  gr:'#3F7D44', grS:'#D4E4D2',
  teal:'#2B6A6E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

interface CuentaItem {
  id: string; nombre: string; cantidad: number
  precio_unitario: number | null; notas: string | null; estado: string
}
export interface Comanda {
  id: string; estado: string; tipo: string; created_at: string
  numero_ticket: number; num_comensales: number | null
  total_estimado: number; minutos_esperando: number
  nombre_cuenta: string | null
  mesa: { id: string; codigo: string; capacidad: number } | null
  camarero: { id: string; nombre: string } | null
  items: CuentaItem[]
}

interface Props {
  session: { id: string; nombre: string; rol: string; restaurante_id: string }
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
  // Solo notifica cambios en cuentas PEDIDAS (estado=cuenta_pedida/tipo=cuenta)
  // — este count es el que alimenta el badge de nav
  onCountChange: (n: number) => void
}

// Helper: determina si una comanda es "cuenta urgente" (pendiente de cobro)
function esCuentaPedida(c: Comanda): boolean {
  return c.estado === 'cuenta_pedida' || c.tipo === 'cuenta'
}

export default function MisCuentasTab({ session, onVerMesa, onCountChange }: Props) {
  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const sesRef = useRef(JSON.stringify(session))

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/edge/mis-cuentas', {
        headers: { 'x-ia-session': sesRef.current },
      })
      const d = await r.json()
      if (r.ok) {
        const lista: Comanda[] = d.cuentas ?? []
        setComandasState(lista)
        // Badge: solo cuentas urgentes (pedidas)
        onCountChange(lista.filter(esCuentaPedida).length)
        setError('')
      } else {
        setError(d.error ?? 'Error al cargar')
      }
    } catch {
      setError('Sin conexión')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    cargar()
    const iv = setInterval(cargar, 15_000)
    return () => clearInterval(iv)
  }, [cargar])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink4 }}>Cargando sala…</div>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: C.bg, padding: 24 }}>
      <div style={{ fontFamily: SM, fontSize: 12, color: C.verm }}>{error}</div>
      <button onClick={cargar} style={{ background: 'transparent', border: `1px solid ${C.rule}`, color: C.ink3, padding: '8px 18px', borderRadius: 8, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>Reintentar</button>
    </div>
  )

  // Separar: cuentas urgentes (pedidas) vs sala activa
  const cuentasPedidas = comandas.filter(esCuentaPedida)
  const salaActiva     = comandas.filter(c => !esCuentaPedida(c))

  // Separar mis mesas vs otras en sala activa
  const misSala  = salaActiva.filter(c => c.camarero?.id === session.id)
  const otrasSala = salaActiva.filter(c => c.camarero?.id !== session.id)

  // Total cuentas urgentes
  const totalUrgente = cuentasPedidas.reduce((s, c) => s + c.total_estimado, 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* ── Header ── */}
      <div style={{ padding: '10px 16px', flexShrink: 0, background: C.bg1, borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink, flex: 1 }}>Sala</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {cuentasPedidas.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.vermS, border: `1px solid ${C.verm}55`, borderRadius: 8, padding: '3px 8px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.verm, animation: 'ldot 1.2s infinite' }} />
              <span style={{ fontFamily: SM, fontSize: 9, color: C.verm, fontWeight: 700 }}>
                {cuentasPedidas.length} CUENTA{cuentasPedidas.length > 1 ? 'S' : ''}
              </span>
            </div>
          )}
          {cuentasPedidas.length > 0 && totalUrgente > 0 && (
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.verm }}>
              {totalUrgente.toFixed(2).replace('.', ',')} €
            </div>
          )}
          {salaActiva.length > 0 && (
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '3px 8px' }}>
              {salaActiva.length} activa{salaActiva.length > 1 ? 's' : ''}
            </div>
          )}
          <button onClick={cargar} style={{ background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: C.ink4, display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Lista ── */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' as const, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Estado vacío total */}
        {comandas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '52px 20px' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink4, marginBottom: 6 }}>Sala libre</div>
            <div style={{ fontFamily: SC, fontSize: 14, color: C.ink4 }}>Sin mesas activas en este turno</div>
          </div>
        )}

        {/* ══ CUENTAS PEDIDAS — sección urgente ══ */}
        {cuentasPedidas.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.verm, flexShrink: 0, animation: 'ldot 1.2s infinite' }} />
              <span style={{ fontFamily: SM, fontSize: 9, color: C.verm, letterSpacing: '.1em', textTransform: 'uppercase' as const, fontWeight: 700 }}>Pendientes de cobro</span>
            </div>
            {cuentasPedidas.map(c => (
              <CobrarCard key={c.id} comanda={c} esMia={c.camarero?.id === session.id} onVerMesa={onVerMesa} />
            ))}
          </>
        )}

        {/* ══ SALA ACTIVA — mis mesas ══ */}
        {misSala.length > 0 && (
          <>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, letterSpacing: '.1em', textTransform: 'uppercase' as const, paddingLeft: 2, marginTop: cuentasPedidas.length ? 8 : 0 }}>
              Mis mesas activas
            </div>
            {misSala.map(c => (
              <SalaCard key={c.id} comanda={c} esMia onVerMesa={onVerMesa} />
            ))}
          </>
        )}

        {/* ══ SALA ACTIVA — otras mesas ══ */}
        {otrasSala.length > 0 && (
          <>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, letterSpacing: '.1em', textTransform: 'uppercase' as const, paddingLeft: 2, marginTop: (misSala.length || cuentasPedidas.length) ? 8 : 0 }}>
              Otras mesas
            </div>
            {otrasSala.map(c => (
              <SalaCard key={c.id} comanda={c} esMia={false} onVerMesa={onVerMesa} />
            ))}
          </>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}

/* ─── Tarjeta urgente (cuenta_pedida) — diseño prominente ── */
function CobrarCard({ comanda, esMia, onVerMesa }: {
  comanda: Comanda; esMia: boolean
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
}) {
  const touchRef = useRef({ startY: 0, moved: false })
  const mesa = comanda.mesa
  const min  = comanda.minutos_esperando
  const col  = min >= 8 ? C.verm : C.amb

  const abrir = () => { if (mesa) onVerMesa(mesa.id, mesa.codigo, mesa.capacidad) }

  return (
    <div
      onTouchStart={e => { touchRef.current = { startY: e.touches[0].clientY, moved: false } }}
      onTouchMove={e => { if (Math.abs(e.touches[0].clientY - touchRef.current.startY) > 8) touchRef.current.moved = true }}
      onTouchEnd={e => { if (!touchRef.current.moved) { e.preventDefault(); abrir() } }}
      onClick={abrir}
      style={{
        background: C.bg1, borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        border: `1.5px solid ${col}66`, borderLeft: `4px solid ${col}`,
        boxShadow: min >= 8 ? `0 2px 16px ${C.verm}22` : `0 1px 8px ${C.amb}18`,
        animation: min >= 8 ? 'urgPulse 1.8s ease-in-out infinite' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px 9px', borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ minWidth: 44 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, fontWeight: 500, color: col, lineHeight: 1 }}>
            {mesa?.codigo ?? '?'}
          </div>
          {comanda.nombre_cuenta && (
            <div style={{ fontFamily: SC, fontSize: 11, color: C.ink3, lineHeight: 1, marginTop: 1 }}>{comanda.nombre_cuenta}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: col, textTransform: 'uppercase' as const, letterSpacing: '.07em', fontWeight: 700 }}>
            {min >= 8 ? `⚠ Esperando ${min}m` : '⏳ Cuenta pedida'}
          </div>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 2 }}>
            {comanda.items.length} producto{comanda.items.length !== 1 ? 's' : ''}
            {comanda.num_comensales ? ` · ${comanda.num_comensales} pax` : ''}
            {comanda.camarero && !esMia && <span style={{ color: C.ink3 }}> · {comanda.camarero.nombre}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, fontWeight: 500, color: C.ink, lineHeight: 1 }}>
            {comanda.total_estimado > 0
              ? `${comanda.total_estimado.toFixed(2).replace('.', ',')}€`
              : <span style={{ fontSize: 13, color: C.ink4 }}>—</span>
            }
          </div>
          <div style={{ background: col, borderRadius: 6, padding: '4px 12px', fontFamily: SM, fontSize: 9, color: '#fff', fontWeight: 700 }}>
            COBRAR →
          </div>
        </div>
      </div>
      {/* Resumen items */}
      <div style={{ padding: '5px 14px 8px', background: (min >= 8 ? C.vermS : C.ambS) + '55', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {comanda.items.slice(0, 3).map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: col, lineHeight: 1, minWidth: 14, textAlign: 'center' }}>{it.cantidad}</span>
            <span style={{ fontFamily: SN, fontSize: 12, color: C.ink, flex: 1 }}>{it.nombre}</span>
            {it.precio_unitario != null && (
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                {(it.precio_unitario * it.cantidad).toFixed(2).replace('.', ',')}€
              </span>
            )}
          </div>
        ))}
        {comanda.items.length === 0 && (
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, fontStyle: 'italic' }}>Abre para ver el detalle</div>
        )}
        {comanda.items.length > 3 && (
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, fontStyle: 'italic', paddingLeft: 20 }}>
            +{comanda.items.length - 3} más…
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Tarjeta sala activa — diseño compacto ─────────────── */
function SalaCard({ comanda, esMia, onVerMesa }: {
  comanda: Comanda; esMia: boolean
  onVerMesa: (mesaId: string, mesaCodigo: string, capacidad?: number) => void
}) {
  const touchRef = useRef({ startY: 0, moved: false })
  const mesa  = comanda.mesa
  const min   = comanda.minutos_esperando
  const lista = comanda.estado === 'lista'
  const urgente = min > 60
  const col   = urgente ? C.verm : lista ? C.gr : comanda.estado === 'en_cocina' ? C.amb : C.ink4

  const abrir = () => { if (mesa) onVerMesa(mesa.id, mesa.codigo, mesa.capacidad) }

  const labelEstado = comanda.estado === 'en_cocina' ? 'cocina'
    : comanda.estado === 'lista' ? 'lista ✓'
    : 'activa'

  return (
    <div
      onTouchStart={e => { touchRef.current = { startY: e.touches[0].clientY, moved: false } }}
      onTouchMove={e => { if (Math.abs(e.touches[0].clientY - touchRef.current.startY) > 8) touchRef.current.moved = true }}
      onTouchEnd={e => { if (!touchRef.current.moved) { e.preventDefault(); abrir() } }}
      onClick={abrir}
      style={{
        background: C.bg1, borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`,
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        boxShadow: '0 1px 3px rgba(26,23,20,.05)',
      }}
    >
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, fontWeight: 500, color: col, lineHeight: 1, minWidth: 36 }}>
        {mesa?.codigo ?? '?'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {comanda.items.slice(0, 3).map(it => `${it.cantidad}× ${it.nombre}`).join(', ') || (comanda.nombre_cuenta ?? '—')}
          {comanda.items.length > 3 && ` +${comanda.items.length - 3}`}
        </div>
        <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 1 }}>
          {labelEstado} · {min}m
          {comanda.num_comensales ? ` · ${comanda.num_comensales}p` : ''}
          {!esMia && comanda.camarero && <span style={{ color: col }}> · {comanda.camarero.nombre}</span>}
        </div>
      </div>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink3, flexShrink: 0 }}>
        {comanda.total_estimado > 0 ? `${comanda.total_estimado.toFixed(2).replace('.', ',')}€` : ''}
      </div>
    </div>
  )
}

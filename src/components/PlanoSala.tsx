'use client'
// ============================================================
// ia.rest · PlanoSala — Vista de planta de sala (solo lectura)
// Shared por /edge (camarero) y /jefe (jefe de sala)
// Renderiza mesas en sus posiciones reales (pos_x/pos_y de BD)
// Si pos_x/pos_y son null → auto-layout en grid
// ============================================================

import { useRef, useEffect, useState, useCallback } from 'react'

const CANVAS_W = 580
const CANVAS_H = 320
const GRID     = 20

export type MesaEstado = 'libre' | 'activa' | 'en_cocina' | 'lista' |
                         'marchar' | 'urgente' | 'aviso' | 'cuenta'

export interface MesaPlano {
  id: string
  codigo: string
  capacidad: number
  zona: string          // tipo de zona: 'salon', 'terraza', etc.
  pos_x: number | null
  pos_y: number | null
  forma: 'round' | 'square' | 'bar' | null
  estado: MesaEstado
  num_comensales?: number | null
  camarero_nombre?: string | null
  minutos_abierta?: number | null
  es_mia?: boolean      // mesa del camarero actual
}

export interface ZonaInfo {
  id: string
  tipo: string
  nombre: string
}

interface Props {
  mesas: MesaPlano[]
  zonas: ZonaInfo[]
  onMesaTap?: (mesa: MesaPlano) => void
  resaltarMias?: boolean   // borde más grueso en mesas del camarero
  mostrarLibres?: boolean  // mostrar también mesas libres (default: true)
  mesaSeleccionada?: string | null
}

// ── Colores de estado ────────────────────────────────────────
const ESTADO: Record<string, { border: string; bg: string; fg: string; dot: string }> = {
  libre:    { border: 'rgba(216,205,182,0.25)', bg: '#FBF8F1',              fg: '#9A8D7C', dot: 'rgba(216,205,182,0.3)' },
  activa:   { border: 'rgba(63,125,68,0.5)',   bg: 'rgba(63,125,68,0.07)', fg: '#3F7D44', dot: '#3F7D44' },
  en_cocina:{ border: 'rgba(232,163,59,0.55)', bg: 'rgba(232,163,59,0.07)',fg: '#E8A33B', dot: '#E8A33B' },
  lista:    { border: 'rgba(63,125,68,0.7)',   bg: 'rgba(63,125,68,0.12)', fg: '#3F7D44', dot: '#3F7D44' },
  marchar:  { border: 'rgba(63,125,68,0.7)',   bg: 'rgba(63,125,68,0.12)', fg: '#3F7D44', dot: '#3F7D44' },
  urgente:  { border: 'rgba(217,68,43,0.7)',   bg: 'rgba(217,68,43,0.09)', fg: '#D9442B', dot: '#D9442B' },
  aviso:    { border: 'rgba(232,163,59,0.7)',  bg: 'rgba(232,163,59,0.1)', fg: '#E8A33B', dot: '#E8A33B' },
  cuenta:   { border: 'rgba(26,23,20,0.3)',    bg: 'rgba(26,23,20,0.05)',  fg: '#3A332C', dot: '#6B5F52' },
}

function mesaSize(forma: string | null, cap: number) {
  if (forma === 'bar')    return { w: 60, h: 30 }
  if (forma === 'square') return { w: cap >= 6 ? 64 : 54, h: cap >= 6 ? 64 : 54 }
  return { w: cap >= 6 ? 60 : 50, h: cap >= 6 ? 60 : 50 }
}

function autoPos(idx: number) {
  return { x: 28 + (idx % 6) * 84, y: 28 + Math.floor(idx / 6) * 88 }
}

function tiempoStr(min: number | null | undefined) {
  if (!min || min < 1) return null
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}`
}

export default function PlanoSala({
  mesas, zonas, onMesaTap,
  resaltarMias = true,
  mostrarLibres = true,
  mesaSeleccionada = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [zonaActiva, setZonaActiva] = useState('')

  // Inicializar zona activa con la primera que tenga mesas
  useEffect(() => {
    if (!zonaActiva && zonas.length > 0) {
      const primera = zonas.find(z => mesas.some(m => m.zona === z.tipo)) ?? zonas[0]
      setZonaActiva(primera.tipo)
    }
  }, [zonas, mesas, zonaActiva])

  const calcScale = useCallback(() => {
    if (!containerRef.current) return
    const w = containerRef.current.clientWidth
    setScale(Math.min(1, w / CANVAS_W))
  }, [])

  useEffect(() => {
    calcScale()
    const ro = new ResizeObserver(calcScale)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [calcScale])

  const mesasZona = mesas.filter(m =>
    m.zona === zonaActiva && (mostrarLibres || m.estado !== 'libre')
  )

  // Contadores por zona para badges en tabs
  const cntZona = (tipo: string) => ({
    urgentes: mesas.filter(m => m.zona === tipo && m.estado === 'urgente').length,
    activas:  mesas.filter(m => m.zona === tipo && m.estado !== 'libre').length,
    total:    mesas.filter(m => m.zona === tipo).length,
  })

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <style>{`
        .mesa-tap{transition:transform .1s cubic-bezier(.34,1.56,.64,1);cursor:pointer}
        .mesa-tap:active{transform:scale(.93)!important}
        @keyframes urgPulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideZona{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Tabs de zona */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 10,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {zonas.map(z => {
          const cnt = cntZona(z.tipo)
          const on  = zonaActiva === z.tipo
          return (
            <button key={z.id} onClick={() => setZonaActiva(z.tipo)} style={{
              padding: '6px 12px', borderRadius: 8, flexShrink: 0,
              border: `1px solid ${on ? '#D9442B' : '#D8CDB6'}`,
              background: on ? '#F4D8CF' : '#FBF8F1',
              color: on ? '#D9442B' : '#9A8D7C',
              fontSize: 11, fontFamily: "'Inter Tight',system-ui,sans-serif",
              fontWeight: on ? 500 : 400, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {z.nombre}
              {cnt.urgentes > 0 && (
                <span style={{
                  background: '#D9442B', color: '#fff',
                  borderRadius: 8, fontSize: 9, padding: '0 5px',
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                  animation: 'urgPulse 1s ease-in-out infinite',
                }}>
                  {cnt.urgentes}⚠
                </span>
              )}
              {cnt.urgentes === 0 && cnt.activas > 0 && (
                <span style={{
                  background: 'rgba(63,125,68,0.15)', color: '#3F7D44',
                  borderRadius: 8, fontSize: 9, padding: '0 5px',
                  fontFamily: "'JetBrains Mono',monospace",
                }}>
                  {cnt.activas}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Canvas */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: CANVAS_H * scale,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: 0, left: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          background: '#FBF8F1',
          borderRadius: 12,
          border: '1px solid #D8CDB6',
          backgroundImage: `linear-gradient(rgba(216,205,182,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(216,205,182,0.18) 1px,transparent 1px)`,
          backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
          animation: 'slideZona .18s ease',
        }}>
          {/* Hint zona */}
          <div style={{
            position: 'absolute', top: 8, left: 12,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
            color: '#9A8D7C', letterSpacing: '.08em',
            textTransform: 'uppercase', pointerEvents: 'none', opacity: .5,
          }}>
            {zonas.find(z => z.tipo === zonaActiva)?.nombre ?? zonaActiva}
          </div>

          {mesasZona.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Newsreader',serif", fontStyle: 'italic',
              fontSize: 16, color: '#9A8D7C', opacity: .5,
            }}>
              Sin mesas en esta zona
            </div>
          )}

          {mesasZona.map((mesa, idx) => {
            const pos   = mesa.pos_x !== null && mesa.pos_y !== null
              ? { x: mesa.pos_x, y: mesa.pos_y }
              : autoPos(idx)
            const sz    = mesaSize(mesa.forma, mesa.capacidad)
            const pal   = ESTADO[mesa.estado] ?? ESTADO.libre
            const isSel = mesaSeleccionada === mesa.id
            const isUrgente = mesa.estado === 'urgente'
            const pax   = mesa.num_comensales
            const tiempo = tiempoStr(mesa.minutos_abierta)
            const isRound  = (mesa.forma ?? 'round') === 'round'
            const isSquare = mesa.forma === 'square'

            return (
              <div
                key={mesa.id}
                className="mesa-tap"
                onClick={() => onMesaTap?.(mesa)}
                style={{
                  position: 'absolute',
                  left: pos.x, top: pos.y,
                  width: sz.w, height: sz.h,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: isUrgente ? 'urgPulse 1.5s ease-in-out infinite' : undefined,
                }}
              >
                <div style={{
                  width: '100%', height: '100%',
                  borderRadius: isRound ? '50%' : isSquare ? 8 : 4,
                  background: isSel ? '#F4D8CF' : pal.bg,
                  border: `${resaltarMias && mesa.es_mia ? 2 : 1.5}px solid ${isSel ? '#D9442B' : pal.border}`,
                  boxShadow: isSel
                    ? `0 0 0 3px rgba(217,68,43,0.18)`
                    : mesa.es_mia && resaltarMias
                      ? `0 0 0 1px rgba(217,68,43,0.12)`
                      : '0 1px 2px rgba(26,23,20,.05)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 1, position: 'relative', transition: 'all .12s',
                }}>
                  {/* Código/número */}
                  {mesa.forma !== 'bar' && (
                    <div style={{
                      fontFamily: "'Newsreader',serif", fontStyle: 'italic',
                      fontSize: sz.w > 54 ? 18 : 15,
                      fontWeight: 500, color: isSel ? '#D9442B' : pal.fg,
                      lineHeight: 1,
                    }}>
                      {mesa.capacidad}
                    </div>
                  )}
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 7, color: isSel ? '#D9442B' : pal.fg,
                    lineHeight: 1, opacity: .85,
                  }}>
                    {mesa.codigo}
                  </div>

                  {/* Tiempo abierta */}
                  {tiempo && mesa.estado !== 'libre' && (
                    <div style={{
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                      color: isUrgente ? '#D9442B' : '#9A8D7C',
                      lineHeight: 1, marginTop: 1,
                    }}>
                      {tiempo}
                    </div>
                  )}

                  {/* Dot de estado */}
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: pal.dot,
                    border: mesa.estado === 'libre' ? '1px solid rgba(216,205,182,0.4)' : 'none',
                    marginTop: 2, flexShrink: 0,
                  }} />

                  {/* Badge pax */}
                  {pax && pax > 0 && mesa.estado !== 'libre' && (
                    <div style={{
                      position: 'absolute', top: -6, left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#3F7D44', color: '#fff',
                      borderRadius: 6, fontSize: 7, fontWeight: 700,
                      fontFamily: "'JetBrains Mono',monospace",
                      padding: '1px 4px', lineHeight: 1.4,
                      border: '1.5px solid #FBF8F1', whiteSpace: 'nowrap',
                    }}>
                      {pax}p
                    </div>
                  )}

                  {/* Punto azul = mesa de otro camarero */}
                  {resaltarMias && mesa.es_mia === false && mesa.estado !== 'libre' && (
                    <div style={{
                      position: 'absolute', top: 3, right: 3,
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#2B6A6E',
                    }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leyenda compacta */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
        marginTop: 8, padding: '0 2px',
      }}>
        {[
          { dot: 'rgba(216,205,182,0.5)', label: 'Libre' },
          { dot: '#E8A33B', label: 'En cocina' },
          { dot: '#3F7D44', label: 'Lista / Marchando' },
          { dot: '#D9442B', label: 'Urgente' },
        ].map(l => (
          <div key={l.label} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: '#9A8D7C',
            fontFamily: "'Inter Tight',system-ui,sans-serif",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.dot, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
        {resaltarMias && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9A8D7C', fontFamily: "'Inter Tight',system-ui,sans-serif" }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2B6A6E', flexShrink: 0 }} />
            Otro camarero
          </div>
        )}
      </div>
    </div>
  )
}

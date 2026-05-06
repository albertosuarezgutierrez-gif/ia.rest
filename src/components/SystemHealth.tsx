'use client'

// ia.rest · src/components/SystemHealth.tsx
// Panel de salud del sistema para /super — monitorización de errores en tiempo real

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// ── Paleta (igual que super/page.tsx) ────────────────────────────────────────
const C = {
  bg: '#F6F1E7', bg2: '#EFE7D6', bg3: '#E5DAC2', ink: '#1A1714',
  ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6', ruleS: '#B8A98B',
  red: '#D9442B', redD: '#A8311E', redS: '#F4D8CF',
  green: '#3F7D44', greenS: '#D4E4D2',
  amber: '#E8A33B', amberS: '#FAF0DC',
  dark: '#14110E',
}
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Nivel = 'info' | 'warning' | 'critical'
type Categoria =
  | 'ear' | 'brain' | 'courier' | 'vox' | 'auth'
  | 'stripe' | 'verifactu' | 'push' | 'edge' | 'db' | 'system'

interface ResumenRow {
  nivel: Nivel
  categoria: Categoria
  total: number
  pendientes: number
  resueltos: number
  ultimo_error: string
  ultima_hora: number
}

interface ErrorRow {
  id: string
  nivel: Nivel
  categoria: Categoria
  mensaje: string
  funcion_origen: string | null
  restaurante_id: string | null
  contexto: Record<string, unknown> | null
  resuelto: boolean
  resuelto_at: string | null
  resuelto_por: string | null
  notas_resolucion: string | null
  created_at: string
  restaurantes?: { nombre: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const NIVEL_CONFIG: Record<Nivel, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'CRÍTICO', color: C.red,   bg: C.redS,   dot: C.red   },
  warning:  { label: 'AVISO',   color: C.amber, bg: C.amberS, dot: C.amber },
  info:     { label: 'INFO',    color: C.ink3,  bg: C.bg2,    dot: C.ink4  },
}

const CAT_LABEL: Record<Categoria, string> = {
  ear: 'EAR / Voz', brain: 'BRAIN / IA', courier: 'COURIER / Rutas',
  vox: 'VOX / TTS', auth: 'Auth', stripe: 'Stripe',
  verifactu: 'VeriFactu', push: 'Push', edge: 'Edge Fn',
  db: 'Base de datos', system: 'Sistema',
}

function relativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ── Componente ────────────────────────────────────────────────────────────────
interface Props {
  session: { restaurante_id?: string } | null
}

export default function SystemHealth({ session }: Props) {
  const supabase = createClientComponentClient()
  const [resumen, setResumen]       = useState<ResumenRow[]>([])
  const [errores, setErrores]       = useState<ErrorRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtroNivel, setFiltroNivel] = useState<Nivel | 'todos'>('todos')
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [expandido, setExpandido]   = useState<string | null>(null)
  const [notas, setNotas]           = useState('')
  const [resolviendo, setResolviendo] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await supabase
        .from('v_system_errors_resumen')
        .select('*')
      setResumen(res ?? [])

      let q = supabase
        .from('system_errors')
        .select('*, restaurantes(nombre)')
        .order('created_at', { ascending: false })
        .limit(150)

      if (soloPendientes) q = q.eq('resuelto', false)
      if (filtroNivel !== 'todos') q = q.eq('nivel', filtroNivel)

      const { data: errs } = await q
      setErrores((errs as ErrorRow[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [supabase, filtroNivel, soloPendientes])

  useEffect(() => { cargar() }, [cargar])

  // Real-time: nuevos errores → append directo
  useEffect(() => {
    const ch = supabase
      .channel('system_errors_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_errors' }, (p) => {
        const e = p.new as ErrorRow
        setErrores(prev => [e, ...prev])
        if (e.nivel === 'critical') {
          document.title = '🔴 Error crítico — ia.rest'
          setTimeout(() => { document.title = 'ia.rest' }, 6000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase])

  async function resolver(id: string) {
    setResolviendo(id)
    await supabase.rpc('resolver_error', {
      p_error_id: id,
      p_notas: notas || null,
      p_resuelto_por: 'alberto',
    })
    setResolviendo(null)
    setExpandido(null)
    setNotas('')
    cargar()
  }

  // KPIs
  const critPend  = resumen.filter(r => r.nivel === 'critical').reduce((a, r) => a + Number(r.pendientes), 0)
  const warnPend  = resumen.filter(r => r.nivel === 'warning').reduce((a, r) => a + Number(r.pendientes), 0)
  const infoPend  = resumen.filter(r => r.nivel === 'info').reduce((a, r) => a + Number(r.pendientes), 0)
  const hora      = resumen.reduce((a, r) => a + Number(r.ultima_hora), 0)

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.ink }}>
            Salud del sistema
          </div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2 }}>
            últimas 24h · tiempo real
          </div>
        </div>
        <button
          onClick={cargar}
          style={{
            fontFamily: SN, fontSize: 12, color: C.ink3,
            background: C.bg2, border: `1px solid ${C.rule}`,
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
          }}
        >
          ↺ Actualizar
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Críticos',       value: critPend,  color: critPend > 0  ? C.red   : C.ink4 },
          { label: 'Avisos',         value: warnPend,  color: warnPend > 0  ? C.amber : C.ink4 },
          { label: 'Info pend.',     value: infoPend,  color: infoPend > 0  ? C.ink2  : C.ink4 },
          { label: 'Última hora',    value: hora,      color: hora > 0      ? C.ink2  : C.ink4 },
        ].map(k => (
          <div key={k.label} style={{ background: C.bg2, borderRadius: 8, padding: '16px 20px', border: `1px solid ${C.rule}` }}>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 6 }}>
              {k.label.toUpperCase()}
            </div>
            <div style={{ fontFamily: SE, fontSize: 36, fontStyle: 'italic', color: k.color, lineHeight: 1 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Resumen por categoría ── */}
      {resumen.length > 0 && (
        <div style={{ background: C.bg2, borderRadius: 8, border: `1px solid ${C.rule}`, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', padding: '10px 16px', borderBottom: `1px solid ${C.rule}` }}>
            POR CATEGORÍA (24H)
          </div>
          {resumen.map((r, i) => {
            const cfg = NIVEL_CONFIG[r.nivel]
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                borderBottom: i < resumen.length - 1 ? `1px solid ${C.rule}` : undefined,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                <span style={{ fontFamily: SM, fontSize: 10, color: cfg.color, width: 60, flexShrink: 0 }}>
                  {cfg.label}
                </span>
                <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2, flex: 1 }}>
                  {CAT_LABEL[r.categoria]}
                </span>
                <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
                  {r.pendientes} pend. / {r.total} total
                </span>
                <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                  {relativo(r.ultimo_error)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {(['todos', 'critical', 'warning', 'info'] as const).map(n => (
          <button key={n} onClick={() => setFiltroNivel(n)} style={{
            fontFamily: SN, fontSize: 11, cursor: 'pointer',
            padding: '5px 12px', borderRadius: 20,
            background: filtroNivel === n ? C.red : C.bg2,
            color:      filtroNivel === n ? '#fff' : C.ink3,
            border:     `1px solid ${filtroNivel === n ? C.red : C.rule}`,
            transition: 'all .15s',
          }}>
            {n === 'todos' ? 'Todos' : NIVEL_CONFIG[n].label}
          </button>
        ))}
        <button onClick={() => setSoloPendientes(p => !p)} style={{
          marginLeft: 'auto', fontFamily: SN, fontSize: 11, cursor: 'pointer',
          padding: '5px 12px', borderRadius: 20,
          background: soloPendientes ? C.bg3 : C.bg2,
          color: C.ink3, border: `1px solid ${C.rule}`,
        }}>
          {soloPendientes ? '● Solo pendientes' : '○ Todos'}
        </button>
      </div>

      {/* ── Listado ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: SM, fontSize: 12, color: C.ink4 }}>
          cargando…
        </div>
      ) : errores.length === 0 ? (
        <div style={{
          background: C.greenS, border: `1px solid ${C.green}`, borderRadius: 8,
          padding: '32px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.green }}>
            ✓ Todo limpio
          </div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginTop: 4 }}>
            Sin errores pendientes en las últimas 24h
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {errores.map(err => {
            const cfg  = NIVEL_CONFIG[err.nivel]
            const open = expandido === err.id
            const borderColor = err.resuelto ? C.rule
              : err.nivel === 'critical' ? C.red
              : err.nivel === 'warning'  ? C.amber
              : C.rule

            return (
              <div key={err.id} style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                background: err.resuelto ? C.bg : cfg.bg,
                opacity: err.resuelto ? 0.5 : 1,
                transition: 'opacity .2s',
              }}>
                {/* Fila principal */}
                <button
                  onClick={() => { setExpandido(open ? null : err.id); setNotas('') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontFamily: SM, fontSize: 10, color: cfg.color }}>{cfg.label}</span>
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>{CAT_LABEL[err.categoria]}</span>
                      {err.funcion_origen && (
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>· {err.funcion_origen}</span>
                      )}
                      {err.restaurantes?.nombre && (
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>· {err.restaurantes.nombre}</span>
                      )}
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, wordBreak: 'break-word' }}>
                      {err.mensaje}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{relativo(err.created_at)}</div>
                    {err.resuelto && (
                      <div style={{ fontFamily: SM, fontSize: 10, color: C.green, marginTop: 2 }}>resuelto</div>
                    )}
                  </div>
                </button>

                {/* Detalle expandido */}
                {open && (
                  <div style={{ borderTop: `1px solid ${C.rule}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {err.contexto && (
                      <div>
                        <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 6 }}>CONTEXTO</div>
                        <pre style={{
                          fontFamily: SM, fontSize: 11, color: C.ink2,
                          background: C.bg3, borderRadius: 6, padding: 12,
                          overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0,
                        }}>
                          {JSON.stringify(err.contexto, null, 2)}
                        </pre>
                      </div>
                    )}

                    {err.resuelto && err.notas_resolucion && (
                      <div style={{ background: C.greenS, border: `1px solid ${C.green}`, borderRadius: 6, padding: '8px 12px' }}>
                        <span style={{ fontFamily: SM, fontSize: 11, color: C.green }}>
                          Resuelto por {err.resuelto_por}: {err.notas_resolucion}
                        </span>
                      </div>
                    )}

                    {!err.resuelto && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          placeholder="Notas de resolución (opcional)…"
                          value={notas}
                          onChange={e => setNotas(e.target.value)}
                          rows={2}
                          style={{
                            fontFamily: SN, fontSize: 12, color: C.ink, padding: '8px 12px',
                            background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 6,
                            resize: 'none', outline: 'none', width: '100%', boxSizing: 'border-box',
                          }}
                        />
                        <button
                          onClick={() => resolver(err.id)}
                          disabled={resolviendo === err.id}
                          style={{
                            alignSelf: 'flex-start', fontFamily: SN, fontSize: 12, cursor: 'pointer',
                            padding: '7px 16px', borderRadius: 6,
                            background: resolviendo === err.id ? C.ink4 : C.green,
                            color: '#fff', border: 'none',
                          }}
                        >
                          {resolviendo === err.id ? 'Marcando…' : '✓ Marcar como resuelto'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useMesas, useComandas, useTranscripciones, useProductos86, useReloj } from '@/hooks/useRealtime'

const C = {
  paper: '#F6F1E7', paper2: '#EFE7D6', paper3: '#E5DAC2', bone: '#FBF8F1',
  ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6', ruleS: '#B8A98B',
  red: '#D9442B', redD: '#A8311E', redS: '#F4D8CF',
  amber: '#E8A33B', amberS: '#F7E3B6',
  teal: '#2B6A6E',
  green: '#3F7D44', greenS: '#D4E4D2',
}
const SN = "'Inter Tight', system-ui, sans-serif"
const SE = "'Newsreader', Georgia, serif"
const SM = "'JetBrains Mono', ui-monospace, monospace"

const STATUS_PAL: Record<string, { bg: string; fg: string; ac: string }> = {
  libre:   { bg: C.bone,    fg: C.ink3,  ac: C.ruleS },
  activa:  { bg: '#FBF8F1', fg: C.ink,   ac: C.green },
  marchar: { bg: C.greenS,  fg: '#2D5C32', ac: C.green },
  aviso:   { bg: C.amberS,  fg: '#7A5614', ac: C.amber },
  urgente: { bg: C.redS,    fg: C.redD,  ac: C.red },
  cuenta:  { bg: C.paper2,  fg: C.ink2,  ac: C.ink3 },
}

function tiempoDesde(isoStr: string | null): string {
  if (!isoStr) return ''
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `+${mins}m`
  return `+${Math.floor(mins/60)}h${mins%60?mins%60+'m':''}`
}

function edadColor(isoStr: string | null): string {
  if (!isoStr) return C.ink3
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000)
  if (mins < 10) return C.green
  if (mins < 20) return C.amber
  return C.red
}

const NAV = [
  { id: 'salon',      label: 'Salon',        icon: 'M4 4h16v6H4zM4 14h7v6H4zM13 14h7v6h-7z' },
  { id: 'cocina',     label: 'Cocina',        icon: 'M3 12h18M5 12V8a7 7 0 0 1 14 0v4M7 12v6h10v-6' },
  { id: 'comandas',   label: 'Comandas',      icon: 'M5 4h11l3 3v13H5z' },
  { id: 'transcript', label: 'Transcripcion', icon: 'M4 5h12M4 10h16M4 15h10M4 20h14' },
]

export default function HubPage() {
  const [tab, setTab] = useState('salon')
  const [selMesa, setSelMesa] = useState<string | null>(null)
  const { mesas, loading: mesasLoad } = useMesas()
  const { comandas } = useComandas()
  const transcripciones = useTranscripciones()
  const productos86 = useProductos86()
  const ahora = useReloj()

  const LOGO = () => (
    <svg width="28" height="28" viewBox="0 0 56 56">
      <rect width="56" height="56" rx="8" fill="#1F1A15"/>
      <g transform="translate(11,14)">
        <rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/>
        <rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/>
        <rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/>
        <rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/>
        <rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/>
        <rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/>
      </g>
    </svg>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.paper }}>

      {/* HEADER */}
      <div style={{ height: 56, padding: '0 20px', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.bone, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LOGO />
          <span style={{ fontFamily: SE, fontSize: 20, fontWeight: 500, color: C.ink, letterSpacing: '-0.01em' }}>
            ia<span style={{ color: C.red }}>.</span>rest
          </span>
          <span style={{ width: 1, height: 18, background: C.rule }} />
          <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2, fontWeight: 500 }}>Control Hub</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 86 alerts */}
          {productos86.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {productos86.slice(0, 3).map(p => (
                <span key={p.id} style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 3, background: C.redS, color: C.redD }}>
                  86 {p.nombre}
                </span>
              ))}
            </div>
          )}
          {/* Agent pills */}
          <div style={{ display: 'flex', gap: 5 }}>
            {['EAR','BRAIN','VOX','COURIER'].map(a => (
              <span key={a} style={{ fontFamily: SN, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 999, background: C.greenS, color: '#2D5C32', display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: C.green }} />{a}
              </span>
            ))}
          </div>
          <span style={{ fontFamily: SM, fontSize: 14, fontWeight: 700, color: C.ink }}>
            {ahora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* SIDEBAR */}
        <div style={{ width: 180, background: C.bone, borderRight: `1px solid ${C.rule}`, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
          {NAV.map(it => (
            <button key={it.id} onClick={() => setTab(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: tab === it.id ? C.paper3 : 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: SN, fontSize: 13, fontWeight: 600, color: tab === it.id ? C.ink : C.ink2, textAlign: 'left' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={it.icon}/></svg>
              {it.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <a href="/kds" target="_blank" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: '#14110E', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: SN, fontSize: 12, fontWeight: 600, color: '#F6F1E7', textDecoration: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Abrir KDS
          </a>
          <a href="/edge" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: C.red, border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: SN, fontSize: 12, fontWeight: 600, color: '#F6F1E7', textDecoration: 'none', marginTop: 4 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
            App Camarero
          </a>
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: C.paper }}>

          {/* SALON */}
          {tab === 'salon' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontFamily: SE, fontSize: 24, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em' }}>Salon</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['marchar','activa','aviso','urgente','libre'] as const).map(s => {
                      const p = STATUS_PAL[s]
                      return (
                        <span key={s} style={{ display: 'flex', gap: 5, alignItems: 'center', fontFamily: SN, fontSize: 10, color: C.ink3, fontWeight: 600 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: p.ac }} />
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </span>
                      )
                    })}
                  </div>
                </div>
                {mesasLoad ? (
                  <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4 }}>Cargando mesas...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                    {mesas.map(m => {
                      const pal = STATUS_PAL[m.estado] || STATUS_PAL.libre
                      const sel = selMesa === m.id
                      return (
                        <button key={m.id} onClick={() => setSelMesa(sel ? null : m.id)} style={{ background: pal.bg, border: `1px solid ${sel ? pal.ac : C.rule}`, borderRadius: 8, padding: '12px 10px', cursor: 'pointer', boxShadow: sel ? `0 0 0 2px ${pal.ac}` : 'none', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', minHeight: 80 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontFamily: SE, fontSize: 20, fontWeight: 500, color: pal.fg }}>{m.codigo}</span>
                            {m.estado !== 'libre' && <span style={{ width: 6, height: 6, borderRadius: 999, background: pal.ac, flexShrink: 0 }} />}
                          </div>
                          {m.camarero && <div style={{ fontFamily: SN, fontSize: 10, color: pal.fg, opacity: 0.75 }}>{m.camarero.nombre}</div>}
                          {m.ultima_comanda && (
                            <div style={{ fontFamily: SM, fontSize: 10, color: edadColor(m.ultima_comanda) }}>
                              {tiempoDesde(m.ultima_comanda)}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* LIVE TRANSCRIPT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontFamily: SE, fontSize: 24, fontWeight: 500, color: C.ink, letterSpacing: '-0.02em' }}>Transcripcion</div>
                <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: SN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span style={{ width: 5, height: 5, borderRadius: 999, background: C.teal }} />
                      En vivo
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{transcripciones.length} eventos</span>
                  </div>
                  {transcripciones.length === 0 && (
                    <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4, fontStyle: 'italic' }}>Esperando voz...</div>
                  )}
                  {transcripciones.map((t, i) => (
                    <div key={t.id || i} className="slide-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: `1px solid ${C.rule}` }}>
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, width: 40, flexShrink: 0, paddingTop: 2 }}>
                        {new Date(t.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span style={{ fontFamily: SN, fontSize: 9, fontWeight: 700, padding: '2px 5px', background: C.paper2, borderRadius: 2, flexShrink: 0, color: C.ink }}>
                        {t.camarero?.nombre?.split(' ')[0] || 'CAM'}
                      </span>
                      <span style={{ fontFamily: SM, fontSize: 11, color: C.ink2, flex: 1, lineHeight: 1.4 }}>
                        {t.texto_original}
                      </span>
                      {t.texto_brain && (
                        <span style={{ fontFamily: SN, fontSize: 9, fontWeight: 700, color: C.red, flexShrink: 0 }}>
                          {(t.texto_brain as any).tipo?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* COCINA - Cola de tickets */}
          {tab === 'cocina' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontFamily: SE, fontSize: 24, fontWeight: 500, color: C.ink }}>Cola de cocina · {comandas.filter(c => c.tipo === 'comanda' || c.tipo === 'marchar').length} activos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {comandas.filter(c => ['comanda','marchar'].includes(c.tipo)).map(c => {
                  const edad = tiempoDesde(c.created_at)
                  const colEdad = edadColor(c.created_at)
                  return (
                    <div key={c.id} className="slide-in" style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 0, padding: 14, fontFamily: SM, textTransform: 'uppercase' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink }}>{c.mesa?.codigo}</span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: colEdad }}>{edad}</span>
                      </div>
                      <div style={{ borderTop: `1px dashed ${C.ruleS}`, paddingTop: 8 }}>
                        {(c.items || []).map((it, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, fontWeight: 600, color: it.estado === 'listo' ? C.ink4 : C.ink }}>
                            <span style={{ color: C.red, width: 20 }}>{it.cantidad}x</span>
                            {it.nombre}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: C.ink3 }}>
                        <span>{c.camarero?.nombre}</span>
                        <span>#{c.numero_ticket}</span>
                      </div>
                    </div>
                  )
                })}
                {comandas.filter(c => c.tipo === 'comanda').length === 0 && (
                  <div style={{ fontFamily: SE, fontSize: 20, color: C.ink3, fontStyle: 'italic', gridColumn: '1/-1', padding: 20 }}>Cocina libre.</div>
                )}
              </div>
            </div>
          )}

          {/* COMANDAS - historial */}
          {tab === 'comandas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontFamily: SE, fontSize: 24, fontWeight: 500, color: C.ink }}>Historial de comandas</div>
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden' }}>
                {comandas.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, alignItems: 'center' }}>
                    <span style={{ fontFamily: SE, fontSize: 18, fontWeight: 500, color: C.ink, width: 48, flexShrink: 0 }}>{c.mesa?.codigo}</span>
                    <span style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 2, background: c.tipo === '86' ? C.redS : c.tipo === 'marchar' ? C.greenS : C.paper2, color: c.tipo === '86' ? C.redD : c.tipo === 'marchar' ? '#2D5C32' : C.ink2, flexShrink: 0 }}>
                      {c.tipo.toUpperCase()}
                    </span>
                    <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2, flex: 1 }}>
                      {(c.items || []).map(it => `${it.cantidad}x ${it.nombre}`).join(', ') || '—'}
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, flexShrink: 0 }}>
                      {new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {comandas.length === 0 && (
                  <div style={{ padding: 20, fontFamily: SM, fontSize: 12, color: C.ink4 }}>Sin comandas en este turno.</div>
                )}
              </div>
            </div>
          )}

          {/* TRANSCRIPCION completa */}
          {tab === 'transcript' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontFamily: SE, fontSize: 24, fontWeight: 500, color: C.ink }}>Transcripcion completa</div>
              <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden' }}>
                {transcripciones.map((t, i) => (
                  <div key={t.id || i} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, width: 52, flexShrink: 0, paddingTop: 2 }}>
                      {new Date(t.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ fontFamily: SN, fontSize: 10, fontWeight: 700, padding: '2px 6px', background: C.paper2, borderRadius: 2, flexShrink: 0, color: C.ink }}>
                      {t.camarero?.nombre?.split(' ')[0] || 'CAM'}
                    </span>
                    <span style={{ fontFamily: SM, fontSize: 13, color: C.ink2, flex: 1, lineHeight: 1.4 }}>
                      {t.texto_original}
                    </span>
                    {t.latencia_ms && (
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.green, flexShrink: 0 }}>{t.latencia_ms}ms</span>
                    )}
                  </div>
                ))}
                {transcripciones.length === 0 && (
                  <div style={{ padding: 20, fontFamily: SM, fontSize: 12, color: C.ink4 }}>Sin transcripciones.</div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'

const C = {
  bg:'#14110E', e1:'#1F1A15', e2:'#2A241D', e3:'#2F2820',
  fg:'#F6F1E7', fg2:'#C9BFAA', fg3:'#8D8270',
  rule:'#2F2820', rS:'#4A3F33',
  red:'#D9442B', rD:'#A8311E',
  gr:'#3F7D44', grS:'rgba(63,125,68,.15)',
  amber:'#E8A33B',
}
// Light theme for tablet/desktop
const L = {
  bg:'#F6F1E7', bg2:'#EFE7D6', bg3:'#E5DAC2',
  fg:'#1A1714', fg2:'#3A332C', fg3:'#6B5F52',
  rule:'#D8CDB6', rS:'#B8A98B',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

interface Mesa { id:string; codigo:string; zona:string; estado:string }
interface Formato { id:string; nombre:string; precio:number }
interface Producto { id:string; nombre:string; categoria:string; precio:number|null; seccion:string; nombre_alternativo:string[]; formatos?:Formato[] }
interface LineaComanda { producto:Producto; cantidad:number; formato:Formato|null; notas:string }

const ESTADO_COLOR: Record<string,string> = {
  libre:'#4A3F33', activa:'#3F7D44', marchar:'#2D7A2D', aviso:'#E8A33B', urgente:'#D9442B', cuenta:'#6B5F52'
}
const ESTADO_BG: Record<string,string> = {
  libre:'#1F1A15', activa:'rgba(63,125,68,.15)', marchar:'rgba(63,125,68,.25)',
  aviso:'rgba(232,163,59,.15)', urgente:'rgba(217,68,43,.15)', cuenta:'#1F1A15'
}

interface Props {
  session: { id:string; nombre:string; rol:string; restaurante_id:string }
  turnoId: string | null
  isDark: boolean  // true = dark mode (móvil), false = light (tablet/desktop)
  onBack?: () => void
}

export default function ModoManual({ session, turnoId, isDark, onBack }: Props) {
  const T = isDark ? C : { ...C, bg:L.bg, e1:L.bg2, e2:L.bg3, fg:L.fg, fg2:L.fg2, fg3:L.fg3, rule:L.rule, rS:L.rS }

  const [step, setStep] = useState<'mesa'|'carta'|'resumen'|'enviado'|'error'>('mesa')
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [mesaSel, setMesaSel] = useState<Mesa|null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [catActiva, setCatActiva] = useState('')
  const [lineas, setLineas] = useState<LineaComanda[]>([])
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [ticketNum, setTicketNum] = useState<number|null>(null)
  const [zonas, setZonas] = useState<string[]>([])
  const [zonaFiltro, setZonaFiltro] = useState('todas')

  const sh = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-ia-session': JSON.stringify(session),
  }), [session])

  // Cargar mesas y carta
  useEffect(() => {
    fetch('/api/owner/mesas', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.mesas) {
          setMesas(d.mesas)
          const zs = [...new Set<string>(d.mesas.map((m: Mesa) => m.zona))]
          setZonas(zs)
        }
      })
    fetch('/api/owner/carta', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.productos) {
          const prods: Producto[] = d.productos
          setProductos(prods)
          const cats = [...new Set<string>(prods.map(p => p.categoria || p.seccion || 'Otros'))]
          setCategorias(cats)
          if (cats.length) setCatActiva(cats[0])
        }
      })
    // Formatos
    fetch('/api/owner/formatos', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.formatos) {
          setProductos(prev => prev.map(p => ({
            ...p,
            formatos: d.formatos.filter((f: Formato & {producto_id:string}) => f.producto_id === p.id)
          })))
        }
      })
  }, [sh])

  const addProducto = (p: Producto, fmt: Formato | null = null) => {
    setLineas(prev => {
      const key = p.id + (fmt?.id ?? '')
      const exist = prev.find(l => l.producto.id === p.id && l.formato?.id === fmt?.id)
      if (exist) return prev.map(l => l.producto.id === p.id && l.formato?.id === fmt?.id ? {...l, cantidad: l.cantidad + 1} : l)
      return [...prev, { producto: p, cantidad: 1, formato: fmt, notas: '' }]
    })
  }

  const removeLinea = (idx: number) => setLineas(prev => prev.filter((_,i) => i !== idx))
  const updateCantidad = (idx: number, delta: number) => setLineas(prev => prev.map((l,i) => i===idx ? {...l, cantidad: Math.max(1, l.cantidad+delta)} : l))

  const totalPrecio = lineas.reduce((acc, l) => {
    const precio = l.formato ? l.formato.precio : (l.producto.precio ?? 0)
    return acc + precio * l.cantidad
  }, 0)

  const enviar = async () => {
    if (!mesaSel || !lineas.length) return
    setEnviando(true)
    try {
      const items = lineas.map(l => ({
        nombre: l.formato ? `${l.producto.nombre} (${l.formato.nombre})` : l.producto.nombre,
        cantidad: l.cantidad,
        notas: l.notas || undefined,
        producto_id: l.producto.id,
        precio_unitario: l.formato ? l.formato.precio : (l.producto.precio ?? undefined),
        formato_id: l.formato?.id ?? undefined,
        formato_nombre: l.formato?.nombre ?? undefined,
        seccion_id: l.producto.seccion ?? undefined,
      }))
      const r = await fetch('/api/comanda', {
        method: 'POST',
        headers: sh(),
        body: JSON.stringify({ mesa_id: mesaSel.id, items, tipo: 'comanda' }),
      })
      const d = await r.json()
      if (d.ok) {
        setTicketNum(d.numero_ticket)
        setStep('enviado')
      } else {
        setErrorMsg(d.error ?? 'Error al enviar')
        setStep('error')
      }
    } catch {
      setErrorMsg('Error de red')
      setStep('error')
    } finally {
      setEnviando(false)
    }
  }

  const reset = () => { setStep('mesa'); setMesaSel(null); setLineas([]); setErrorMsg(''); setTicketNum(null) }

  const mesasFiltradas = zonaFiltro === 'todas' ? mesas : mesas.filter(m => m.zona === zonaFiltro)
  const prodsFiltrados = productos.filter(p => (p.categoria || p.seccion || 'Otros') === catActiva)

  // ─── RENDER ───────────────────────────────────────────────────────────────
  const wrapStyle: React.CSSProperties = {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: T.bg, fontFamily: SN,
  }

  // Header
  const Header = () => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:`1px solid ${T.rule}`, background: isDark ? C.e1 : L.bg2, flexShrink:0 }}>
      {onBack && (
        <button onPointerDown={onBack} style={{ background:'none', border:`1px solid ${T.rS}`, borderRadius:3, padding:'4px 8px', color:T.fg3, fontFamily:SM, fontSize:9, cursor:'pointer', letterSpacing:'.06em' }}>
          ← VOZ
        </button>
      )}
      <span style={{ fontFamily:SM, fontSize:10, color:T.fg3, letterSpacing:'.1em', textTransform:'uppercase' }}>
        COMANDA MANUAL{mesaSel ? ` · ${mesaSel.codigo}` : ''}
      </span>
      {lineas.length > 0 && (
        <span style={{ marginLeft:'auto', fontFamily:SM, fontSize:11, fontWeight:700, color:C.red }}>
          {lineas.reduce((a,l) => a+l.cantidad, 0)} items · {totalPrecio.toFixed(2)}€
        </span>
      )}
      {lineas.length > 0 && step === 'carta' && (
        <button onPointerDown={() => setStep('resumen')}
          style={{ background:C.red, border:'none', borderRadius:3, padding:'6px 12px', color:C.fg, fontFamily:SN, fontSize:12, fontWeight:700, cursor:'pointer', marginLeft: lineas.length > 0 ? 0 : 'auto' }}>
          Revisar →
        </button>
      )}
    </div>
  )

  // ─── STEP: MESA ───────────────────────────────────────────────────────────
  if (step === 'mesa') return (
    <div style={wrapStyle}>
      <Header/>
      <div style={{ padding:'12px 14px 4px', flexShrink:0 }}>
        <div style={{ fontFamily:SE, fontSize:18, color:T.fg, fontWeight:500, marginBottom:10 }}>¿Qué mesa?</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onPointerDown={() => setZonaFiltro('todas')}
            style={{ fontFamily:SM, fontSize:9, padding:'3px 10px', borderRadius:999, border:`1px solid ${zonaFiltro==='todas'?C.red:T.rS}`, background: zonaFiltro==='todas'?C.red:'transparent', color: zonaFiltro==='todas'?C.fg:T.fg3, cursor:'pointer', letterSpacing:'.06em' }}>
            TODAS
          </button>
          {zonas.map(z => (
            <button key={z} onPointerDown={() => setZonaFiltro(z)}
              style={{ fontFamily:SM, fontSize:9, padding:'3px 10px', borderRadius:999, border:`1px solid ${zonaFiltro===z?C.red:T.rS}`, background: zonaFiltro===z?C.red:'transparent', color: zonaFiltro===z?C.fg:T.fg3, cursor:'pointer', letterSpacing:'.06em', textTransform:'uppercase' }}>
              {z}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'8px 14px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(80px, 1fr))', gap:8 }}>
          {mesasFiltradas.map(m => (
            <button key={m.id} onPointerDown={() => { setMesaSel(m); setStep('carta') }}
              style={{ padding:'10px 6px', borderRadius:6, border:`1px solid ${ESTADO_COLOR[m.estado]||T.rS}`, background: isDark ? (ESTADO_BG[m.estado]||C.e1) : (m.estado==='libre'?L.bg2:ESTADO_BG[m.estado]||L.bg3), cursor:'pointer', display:'flex', flexDirection:'column', gap:4, textAlign:'left' }}>
              <span style={{ fontFamily:SE, fontSize:18, fontWeight:500, color: isDark ? C.fg : L.fg, lineHeight:1 }}>{m.codigo}</span>
              <span style={{ fontFamily:SM, fontSize:8, color: ESTADO_COLOR[m.estado]||T.fg3, letterSpacing:'.06em', textTransform:'uppercase' }}>{m.estado}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  // ─── STEP: CARTA ─────────────────────────────────────────────────────────
  if (step === 'carta') return (
    <div style={wrapStyle}>
      <Header/>
      {/* Tabs categorías */}
      <div style={{ display:'flex', gap:0, overflowX:'auto', borderBottom:`1px solid ${T.rule}`, flexShrink:0, padding:'0 4px' }}>
        {categorias.map(cat => (
          <button key={cat} onPointerDown={() => setCatActiva(cat)}
            style={{ padding:'9px 14px', background:'transparent', border:'none', borderBottom: catActiva===cat?`2px solid ${C.red}`:'2px solid transparent', color: catActiva===cat?T.fg:T.fg3, fontFamily:SN, fontSize:12, fontWeight: catActiva===cat?700:400, cursor:'pointer', whiteSpace:'nowrap', marginBottom:-1 }}>
            {cat}
          </button>
        ))}
      </div>
      {/* Productos */}
      <div style={{ flex:1, overflow:'auto', padding:10, display:'flex', flexDirection:'column', gap:6 }}>
        {prodsFiltrados.map(p => {
          const fmts = p.formatos?.filter(f => f.precio > 0)
          return (
            <div key={p.id} style={{ background: isDark?C.e1:L.bg2, border:`1px solid ${T.rule}`, borderRadius:6, padding:'10px 12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: fmts?.length ? 8 : 0 }}>
                <span style={{ fontFamily:SN, fontSize:14, fontWeight:600, color:T.fg }}>{p.nombre}</span>
                {!fmts?.length && (
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {p.precio != null && <span style={{ fontFamily:SM, fontSize:11, color:T.fg3 }}>{p.precio.toFixed(2)}€</span>}
                    <button onPointerDown={() => addProducto(p)}
                      style={{ width:30, height:30, borderRadius:999, background:C.red, border:'none', color:C.fg, fontSize:20, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                      +
                    </button>
                  </div>
                )}
              </div>
              {fmts?.length ? (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {fmts.map(fmt => (
                    <button key={fmt.id} onPointerDown={() => addProducto(p, fmt)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:4, background: isDark?C.e2:L.bg3, border:`1px solid ${T.rule}`, cursor:'pointer' }}>
                      <span style={{ fontFamily:SN, fontSize:12, color:T.fg2 }}>{fmt.nombre}</span>
                      <span style={{ fontFamily:SM, fontSize:10, color:T.fg3 }}>{fmt.precio.toFixed(2)}€</span>
                      <span style={{ fontFamily:SN, fontSize:16, fontWeight:700, color:C.red, lineHeight:1 }}>+</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
        {prodsFiltrados.length === 0 && (
          <div style={{ fontFamily:SE, fontSize:14, color:T.fg3, fontStyle:'italic', padding:20, textAlign:'center' }}>Sin productos en esta categoría.</div>
        )}
      </div>
      {/* Resumen flotante si hay items */}
      {lineas.length > 0 && (
        <div style={{ padding:'10px 14px', borderTop:`1px solid ${T.rule}`, background: isDark?C.e1:L.bg2, flexShrink:0, display:'flex', gap:8, alignItems:'center', overflowX:'auto' }}>
          {lineas.map((l,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4, background: isDark?C.e2:L.bg3, borderRadius:4, padding:'3px 8px', flexShrink:0 }}>
              <span style={{ fontFamily:SM, fontSize:10, color:T.fg3 }}>{l.cantidad}×</span>
              <span style={{ fontFamily:SN, fontSize:11, color:T.fg }}>{l.formato ? `${l.producto.nombre}·${l.formato.nombre}` : l.producto.nombre}</span>
              <button onPointerDown={() => removeLinea(i)} style={{ background:'none', border:'none', color:C.red, fontSize:14, cursor:'pointer', lineHeight:1, padding:'0 2px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── STEP: RESUMEN ────────────────────────────────────────────────────────
  if (step === 'resumen') return (
    <div style={wrapStyle}>
      <Header/>
      <div style={{ flex:1, overflow:'auto', padding:14 }}>
        <div style={{ marginBottom:12 }}>
          <span style={{ fontFamily:SE, fontSize:22, color:T.fg, fontWeight:500 }}>{mesaSel?.codigo}</span>
          <span style={{ fontFamily:SM, fontSize:11, color:T.fg3, marginLeft:10 }}>{lineas.reduce((a,l)=>a+l.cantidad,0)} items</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
          {lineas.map((l,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background: isDark?C.e1:L.bg2, border:`1px solid ${T.rule}`, borderRadius:6 }}>
              <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                <button onPointerDown={() => updateCantidad(i,-1)} style={{ width:24,height:24,borderRadius:999,background: isDark?C.e2:L.bg3,border:`1px solid ${T.rS}`,color:T.fg,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
                <span style={{ fontFamily:SM,fontSize:13,fontWeight:700,color:T.fg,width:24,textAlign:'center' }}>{l.cantidad}</span>
                <button onPointerDown={() => updateCantidad(i,+1)} style={{ width:24,height:24,borderRadius:999,background: isDark?C.e2:L.bg3,border:`1px solid ${T.rS}`,color:T.fg,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:SN,fontSize:13,fontWeight:600,color:T.fg }}>{l.producto.nombre}</div>
                {l.formato && <div style={{ fontFamily:SM,fontSize:10,color:T.fg3 }}>{l.formato.nombre}</div>}
              </div>
              <span style={{ fontFamily:SM,fontSize:11,color:T.fg3 }}>
                {((l.formato?l.formato.precio:(l.producto.precio??0))*l.cantidad).toFixed(2)}€
              </span>
              <button onPointerDown={() => removeLinea(i)} style={{ background:'none',border:'none',color:C.red,fontSize:18,cursor:'pointer',lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'10px 12px',borderTop:`2px solid ${T.rule}`,marginBottom:20 }}>
          <span style={{ fontFamily:SM,fontSize:11,color:T.fg3,letterSpacing:'.06em' }}>TOTAL</span>
          <span style={{ fontFamily:SE,fontSize:22,fontWeight:500,color:T.fg }}>{totalPrecio.toFixed(2)}€</span>
        </div>
      </div>
      <div style={{ padding:'10px 14px 24px',display:'flex',gap:8,flexShrink:0 }}>
        <button onPointerDown={() => setStep('carta')}
          style={{ flex:1,padding:'12px',background:'transparent',border:`1px solid ${T.rS}`,borderRadius:4,color:T.fg3,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
          Añadir más
        </button>
        <button onPointerDown={enviar} disabled={enviando}
          style={{ flex:2,padding:'12px',background: enviando?T.rS:C.red,border:'none',borderRadius:4,color:C.fg,fontFamily:SN,fontSize:14,fontWeight:700,cursor: enviando?'default':'pointer',transition:'background .15s' }}>
          {enviando ? 'Enviando...' : 'Enviar a cocina'}
        </button>
      </div>
    </div>
  )

  // ─── STEP: ENVIADO ────────────────────────────────────────────────────────
  if (step === 'enviado') return (
    <div style={{ ...wrapStyle, alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ width:64,height:64,borderRadius:999,background:C.grS,border:`2px solid ${C.gr}`,display:'flex',alignItems:'center',justifyContent:'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
      </div>
      <div style={{ fontFamily:SE,fontSize:22,color:T.fg,fontWeight:500 }}>Comanda enviada.</div>
      {ticketNum && <div style={{ fontFamily:SM,fontSize:11,color:T.fg3 }}>Ticket #{ticketNum} · {mesaSel?.codigo}</div>}
      <div style={{ display:'flex',gap:8,marginTop:12 }}>
        <button onPointerDown={reset}
          style={{ padding:'10px 20px',background:'transparent',border:`1px solid ${T.rS}`,borderRadius:4,color:T.fg3,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
          Nueva comanda
        </button>
        {onBack && (
          <button onPointerDown={onBack}
            style={{ padding:'10px 20px',background:C.red,border:'none',borderRadius:4,color:C.fg,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
            Volver a voz
          </button>
        )}
      </div>
    </div>
  )

  // ─── STEP: ERROR ──────────────────────────────────────────────────────────
  return (
    <div style={{ ...wrapStyle, alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontFamily:SM,fontSize:12,color:C.red,textAlign:'center',maxWidth:240 }}>{errorMsg}</div>
      <button onPointerDown={reset}
        style={{ padding:'10px 20px',background:'transparent',border:`1px solid ${T.rS}`,borderRadius:4,color:T.fg3,fontFamily:SN,fontSize:13,fontWeight:600,cursor:'pointer' }}>
        Reintentar
      </button>
    </div>
  )
}

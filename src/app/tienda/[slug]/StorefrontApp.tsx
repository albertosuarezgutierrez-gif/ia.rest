'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Producto {
  id: string
  nombre: string
  descripcion?: string
  precio: number
  seccion: string
  alergenos?: string[]
}
interface StorefrontConfig {
  slug: string
  nombre_publico: string
  descripcion?: string
  logo_url?: string
  color_primario: string
  acepta_delivery: boolean
  acepta_recogida: boolean
  tiempo_estimado_min: number
  pedido_minimo_eur: number
}
interface CartItem { producto: Producto; cantidad: number; notas?: string }
type Vista = 'carta' | 'datos' | 'pago' | 'confirmado'

// ─── Pago Stripe ─────────────────────────────────────────────────────────────
function PagoStripe({ clientSecret, onOk }: { clientSecret: string; onOk: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pagar = async () => {
    if (!stripe || !elements) return
    setBusy(true); setErr('')
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (error) { setErr(error.message ?? 'Error'); setBusy(false) }
    else onOk()
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {err && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
      <button
        onClick={pagar} disabled={busy || !stripe}
        className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98]"
        style={{ background: busy ? '#9C8E7E' : '#D9442B' }}
      >
        {busy ? 'Procesando…' : 'Confirmar y pagar'}
      </button>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function StorefrontApp({ slug }: { slug: string }) {
  const [config, setConfig] = useState<StorefrontConfig | null>(null)
  const [secciones, setSecciones] = useState<Record<string, Producto[]>>({})
  const [carrito, setCarrito] = useState<CartItem[]>([])
  const [vista, setVista] = useState<Vista>('carta')
  const [tipo, setTipo] = useState<'delivery' | 'recogida'>('delivery')
  const [secActiva, setSecActiva] = useState('')
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [creando, setCreando] = useState(false)
  const [clientSecret, setClientSecret] = useState('')
  const [pedidoId, setPedidoId] = useState('')
  const [pedidoNum, setPedidoNum] = useState(0)
  const seccionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Formulario
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    fetch(`/api/storefront/carta?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErr(d.error); return }
        setConfig(d.config)
        setSecciones(d.secciones)
        setSecActiva(Object.keys(d.secciones)[0] ?? '')
        if (!d.config.acepta_delivery) setTipo('recogida')
      })
      .catch(() => setErr('No se pudo cargar la carta'))
      .finally(() => setCargando(false))
  }, [slug])

  // Scroll spy — actualiza sección activa al hacer scroll
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setSecActiva(e.target.id.replace('sec-', '')) })
    }, { rootMargin: '-40% 0px -55% 0px' })
    Object.values(seccionRefs.current).forEach(el => { if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [secciones])

  const total = carrito.reduce((a, i) => a + i.producto.precio * i.cantidad, 0)
  const uds = carrito.reduce((a, i) => a + i.cantidad, 0)
  const acento = config?.color_primario ?? '#D9442B'

  const añadir = useCallback((p: Producto) => {
    setCarrito(prev => {
      const ex = prev.find(i => i.producto.id === p.id)
      return ex ? prev.map(i => i.producto.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)
                : [...prev, { producto: p, cantidad: 1 }]
    })
  }, [])

  const cambiar = useCallback((id: string, d: number) => {
    setCarrito(prev => prev.map(i => i.producto.id === id ? { ...i, cantidad: i.cantidad + d } : i).filter(i => i.cantidad > 0))
  }, [])

  const irASec = (sec: string) => {
    setSecActiva(sec)
    seccionRefs.current[sec]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const crearPedido = async () => {
    if (!nombre.trim() || !telefono.trim()) return
    if (tipo === 'delivery' && !direccion.trim()) return
    setCreando(true); setErr('')
    const res = await fetch('/api/storefront/pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, tipo,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: tipo === 'delivery' ? direccion : null,
        cliente_notas: notas || null,
        items: carrito.map(i => ({
          producto_id: i.producto.id,
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.producto.precio,
          notas: i.notas ?? null,
        })),
      }),
    })
    const d = await res.json()
    setCreando(false)
    if (d.error) { setErr(d.error); return }
    setClientSecret(d.client_secret)
    setPedidoId(d.pedido_id)
    setPedidoNum(d.numero)
    setVista('pago')
  }

  // ── Estados de carga / error ─────────────────────────────────────────────
  if (cargando) return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-[#D9442B] border-t-transparent animate-spin" />
        <span className="text-sm text-[#9C8E7E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cargando carta…</span>
      </div>
    </div>
  )

  if (err && !config) return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-5xl mb-4">😕</p>
        <p className="font-bold text-[#14110E] text-lg mb-1" style={{ fontFamily: 'Newsreader, serif' }}>Tienda no disponible</p>
        <p className="text-[#9C8E7E] text-sm">{err}</p>
      </div>
    </div>
  )
  if (!config) return null

  // ── CONFIRMADO ───────────────────────────────────────────────────────────
  if (vista === 'confirmado') return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-6 text-center" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-6" style={{ background: acento + '18' }}>✓</div>
      <h1 className="text-2xl font-bold text-[#14110E] mb-1" style={{ fontFamily: 'Newsreader, serif' }}>¡Pedido #{pedidoNum} recibido!</h1>
      <p className="text-[#6B5E4C] mb-6 text-sm">
        {tipo === 'delivery' ? `Entrega en aprox. ${config.tiempo_estimado_min} min` : 'Listo para recoger en breve'}
      </p>
      <a href={`/tienda/${slug}/pedido/${pedidoId}`}
        className="w-full max-w-xs py-4 rounded-2xl text-white font-bold text-base block"
        style={{ background: acento }}>
        Seguir mi pedido en directo
      </a>
    </div>
  )

  // ── PAGO ─────────────────────────────────────────────────────────────────
  if (vista === 'pago' && clientSecret) return (
    <div className="min-h-screen bg-[#FAFAF8]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="sticky top-0 bg-white border-b border-[#EBEBEB] px-4 py-3 flex items-center gap-3">
        <button onClick={() => setVista('datos')} className="text-[#9C8E7E] text-sm">← Volver</button>
        <span className="font-bold text-[#14110E]">Pago seguro</span>
      </div>
      <div className="max-w-md mx-auto p-5">
        <div className="bg-white rounded-2xl p-4 border border-[#EBEBEB] mb-5">
          <p className="text-xs text-[#9C8E7E] mb-1">Total a pagar</p>
          <p className="text-3xl font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>{total.toFixed(2)} €</p>
          <p className="text-xs text-[#9C8E7E] mt-1">{tipo === 'delivery' ? `🛵 Delivery · ${direccion}` : '🏪 Recogida en local'}</p>
        </div>
        <Elements stripe={stripePromise} options={{ clientSecret, locale: 'es', appearance: { theme: 'flat', variables: { colorPrimary: acento, borderRadius: '12px' } } }}>
          <PagoStripe clientSecret={clientSecret} onOk={() => setVista('confirmado')} />
        </Elements>
        <p className="text-center text-xs text-[#C0B5A8] mt-4">🔒 Pago seguro con Stripe</p>
      </div>
    </div>
  )

  // ── DATOS DEL CLIENTE ────────────────────────────────────────────────────
  if (vista === 'datos') {
    const ok = nombre.trim() && telefono.trim() && (tipo !== 'delivery' || direccion.trim())
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
        <div className="sticky top-0 bg-white border-b border-[#EBEBEB] px-4 py-3 flex items-center gap-3">
          <button onClick={() => setVista('carta')} className="text-[#9C8E7E] text-sm">← Volver</button>
          <span className="font-bold text-[#14110E]">Completa tu pedido</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto p-5 space-y-5">

            {/* Tipo — solo si acepta los dos */}
            {config.acepta_delivery && config.acepta_recogida && (
              <div className="grid grid-cols-2 gap-2">
                {(['delivery', 'recogida'] as const).map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    className="py-3 rounded-2xl text-sm font-semibold border-2 transition-all"
                    style={{ borderColor: tipo === t ? acento : '#EBEBEB', background: tipo === t ? acento + '12' : 'white', color: tipo === t ? acento : '#6B5E4C' }}>
                    {t === 'delivery' ? '🛵 Delivery' : '🏪 Recoger'}
                  </button>
                ))}
              </div>
            )}

            {/* Resumen carrito */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
              {carrito.map((item, i) => (
                <div key={item.producto.id} className={`flex items-center justify-between px-4 py-3 ${i < carrito.length - 1 ? 'border-b border-[#F5F5F5]' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded-md" style={{ background: acento }}>{item.cantidad}×</span>
                    <span className="text-sm font-medium text-[#14110E]">{item.producto.nombre}</span>
                  </div>
                  <span className="text-sm text-[#6B5E4C]">{(item.producto.precio * item.cantidad).toFixed(2)} €</span>
                </div>
              ))}
              <div className="px-4 py-3 border-t border-[#EBEBEB] flex justify-between font-bold">
                <span className="text-[#14110E]">Total</span>
                <span style={{ color: acento }}>{total.toFixed(2)} €</span>
              </div>
            </div>

            {/* Campos */}
            <div className="space-y-3">
              {[
                { label: 'Tu nombre', val: nombre, set: setNombre, ph: 'Nombre completo', type: 'text' },
                { label: 'Teléfono', val: telefono, set: setTelefono, ph: '600 000 000', type: 'tel' },
                ...(tipo === 'delivery' ? [{ label: 'Dirección de entrega', val: direccion, set: setDireccion, ph: 'Calle, número, piso', type: 'text' }] : []),
                { label: 'Notas (alérgenos, instrucciones…)', val: notas, set: setNotas, ph: 'Sin cebolla, sin gluten…', type: 'text' },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-semibold text-[#6B5E4C] mb-1.5 uppercase tracking-wide">{f.label}</label>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] bg-white text-[#14110E] placeholder-[#C0B5A8] text-sm focus:outline-none focus:border-[#D9442B] transition-colors" />
                </div>
              ))}
            </div>

            {err && <p className="text-sm text-red-500 text-center">{err}</p>}
          </div>
        </div>

        <div className="p-4 bg-white border-t border-[#EBEBEB]">
          <button onClick={crearPedido} disabled={!ok || creando}
            className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98]"
            style={{ background: ok && !creando ? acento : '#C0B5A8' }}>
            {creando ? 'Un momento…' : `Ir a pagar · ${total.toFixed(2)} €`}
          </button>
        </div>
      </div>
    )
  }

  // ── CARTA (pantalla principal) ───────────────────────────────────────────
  const secsKeys = Object.keys(secciones)

  return (
    <div className="min-h-screen bg-[#FAFAF8]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>

      {/* Header del restaurante */}
      <div className="bg-white border-b border-[#EBEBEB]">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-start gap-3 mb-3">
            {config.logo_url && <img src={config.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-[#14110E] text-lg leading-tight" style={{ fontFamily: 'Newsreader, serif' }}>
                {config.nombre_publico}
              </h1>
              {config.descripcion && <p className="text-xs text-[#9C8E7E] mt-0.5 line-clamp-1">{config.descripcion}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-[#9C8E7E]">
                <span>⏱ {config.tiempo_estimado_min} min</span>
                {config.pedido_minimo_eur > 0 && <span>· Mín. {config.pedido_minimo_eur} €</span>}
                {config.acepta_delivery && <span className="text-green-600 font-medium">· Delivery</span>}
                {config.acepta_recogida && <span className="text-green-600 font-medium">· Recogida</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs secciones */}
        <div className="max-w-2xl mx-auto overflow-x-auto scrollbar-none px-4 pb-3">
          <div className="flex gap-1.5 w-max">
            {secsKeys.map(sec => (
              <button key={sec} onClick={() => irASec(sec)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border"
                style={{
                  background: secActiva === sec ? acento : 'transparent',
                  color: secActiva === sec ? 'white' : '#6B5E4C',
                  borderColor: secActiva === sec ? acento : '#E8E0D4',
                }}>
                {sec.charAt(0).toUpperCase() + sec.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-36 space-y-6">
        {secsKeys.map(sec => (
          <div key={sec} id={`sec-${sec}`} ref={el => { seccionRefs.current[sec] = el }}>
            <h2 className="text-base font-bold text-[#14110E] mb-2 capitalize" style={{ fontFamily: 'Newsreader, serif' }}>{sec}</h2>
            <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden divide-y divide-[#F5F5F5]">
              {(secciones[sec] ?? []).map(p => {
                const en = carrito.find(i => i.producto.id === p.id)
                return (
                  <div key={p.id} className="flex items-center px-4 py-3.5 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#14110E] text-sm">{p.nombre}</p>
                      {p.descripcion && <p className="text-xs text-[#9C8E7E] mt-0.5 line-clamp-2">{p.descripcion}</p>}
                      {p.alergenos && p.alergenos.length > 0 && (
                        <p className="text-xs text-[#C0B5A8] mt-0.5">⚠ {p.alergenos.join(', ')}</p>
                      )}
                      <p className="text-sm font-bold mt-1" style={{ color: acento }}>{p.precio.toFixed(2)} €</p>
                    </div>
                    <div className="flex-shrink-0">
                      {en ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => cambiar(p.id, -1)}
                            className="w-7 h-7 rounded-full border border-[#E8E0D4] flex items-center justify-center text-[#6B5E4C] font-bold text-base leading-none">−</button>
                          <span className="w-5 text-center text-sm font-bold text-[#14110E]">{en.cantidad}</span>
                          <button onClick={() => cambiar(p.id, 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-base leading-none"
                            style={{ background: acento }}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => añadir(p)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg leading-none shadow-sm"
                          style={{ background: acento }}>+</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── CARRITO FLOTANTE + DRAWER ─────────────────────────────────────── */}
      {uds > 0 && (
        <>
          {/* Botón flotante */}
          {!carritoAbierto && (
            <div className="fixed bottom-5 inset-x-0 flex justify-center z-30 px-4">
              <button onClick={() => setCarritoAbierto(true)}
                className="flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold shadow-2xl w-full max-w-sm"
                style={{ background: acento }}>
                <span className="bg-white/25 rounded-lg px-2 py-0.5 text-sm font-bold min-w-[28px] text-center">{uds}</span>
                <span className="flex-1 text-center text-sm">Ver mi pedido</span>
                <span className="text-sm font-bold">{total.toFixed(2)} €</span>
              </button>
            </div>
          )}

          {/* Drawer desde abajo */}
          {carritoAbierto && (
            <>
              {/* Overlay */}
              <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setCarritoAbierto(false)} />
              {/* Sheet */}
              <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-[#E8E0D4]" />
                </div>
                {/* Título */}
                <div className="px-5 py-3 flex items-center justify-between border-b border-[#F5F5F5]">
                  <h2 className="font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>Tu pedido</h2>
                  <button onClick={() => setCarritoAbierto(false)} className="text-[#9C8E7E] text-sm font-medium">Cerrar</button>
                </div>

                {/* Items scrollables */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                  {carrito.map(item => (
                    <div key={item.producto.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#14110E]">{item.producto.nombre}</p>
                        <p className="text-xs text-[#9C8E7E]">{item.producto.precio.toFixed(2)} € / ud.</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => cambiar(item.producto.id, -1)}
                          className="w-7 h-7 rounded-full border border-[#E8E0D4] flex items-center justify-center text-[#6B5E4C] font-bold text-base">−</button>
                        <span className="w-5 text-center text-sm font-bold text-[#14110E]">{item.cantidad}</span>
                        <button onClick={() => cambiar(item.producto.id, 1)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-base" style={{ background: acento }}>+</button>
                      </div>
                      <p className="w-14 text-right text-sm font-bold text-[#14110E]">{(item.producto.precio * item.cantidad).toFixed(2)} €</p>
                    </div>
                  ))}
                </div>

                {/* Total + CTA */}
                <div className="px-5 pb-6 pt-3 border-t border-[#F5F5F5] space-y-3">
                  {config.pedido_minimo_eur > 0 && total < config.pedido_minimo_eur && (
                    <p className="text-xs text-amber-600 text-center bg-amber-50 py-2 rounded-xl">
                      Pedido mínimo {config.pedido_minimo_eur} € · Faltan {(config.pedido_minimo_eur - total).toFixed(2)} €
                    </p>
                  )}
                  <div className="flex justify-between font-bold text-[#14110E]">
                    <span>Total</span>
                    <span style={{ color: acento }}>{total.toFixed(2)} €</span>
                  </div>
                  <button
                    onClick={() => { setCarritoAbierto(false); setVista('datos') }}
                    disabled={total < (config.pedido_minimo_eur ?? 0)}
                    className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98]"
                    style={{ background: total >= (config.pedido_minimo_eur ?? 0) ? acento : '#C0B5A8' }}>
                    Pedir ahora · {total.toFixed(2)} €
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

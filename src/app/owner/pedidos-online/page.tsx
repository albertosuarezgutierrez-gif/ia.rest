'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface PedidoOnline {
  id: string
  numero: number
  tipo: string
  canal: string
  estado: string
  cliente_nombre: string
  cliente_telefono: string
  cliente_direccion?: string
  items: Array<{ nombre: string; cantidad: number; precio_unitario: number; notas?: string }>
  total: number
  cobro: string
  tiempo_recogida_min: number
  created_at: string
}

interface Session {
  id: string; nombre: string; rol: string; restaurante_id: string
}

// ─── Config visual por estado ─────────────────────────────────────────────────
const ESTADO_CFG: Record<string, { label: string; color: string; next: string; nextLabel: string; icon: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#E8A33B', next: 'confirmado', nextLabel: 'Confirmar',       icon: '⏳' },
  confirmado: { label: 'Confirmado', color: '#3B82F6', next: 'en_cocina',  nextLabel: 'Enviar a cocina', icon: '✓'  },
  en_cocina:  { label: 'En cocina',  color: '#8B5CF6', next: 'listo',      nextLabel: 'Marcar listo',    icon: '👨‍🍳' },
  listo:      { label: 'Listo',      color: '#3F7D44', next: 'entregado',  nextLabel: 'Entregado ✓',     icon: '✅' },
  entregado:  { label: 'Entregado',  color: '#9C8E7E', next: '',           nextLabel: '',                icon: '🎉' },
  cancelado:  { label: 'Cancelado',  color: '#EF4444', next: '',           nextLabel: '',                icon: '✕'  },
}

const CANAL_ICON: Record<string, string> = {
  online: '🌐', telefono: '📞', mostrador: '🏪'
}

const TIPO_LABEL: Record<string, string> = {
  delivery: '🛵 Delivery', recogida: '🏃 Recogida', telefono: '📞 Teléfono', mostrador: '🏪 Mostrador'
}

// ─── Componente tarjeta pedido ────────────────────────────────────────────────
function TarjetaPedido({
  pedido, session, onActualizar
}: {
  pedido: PedidoOnline
  session: Session
  onActualizar: (id: string, estado: string) => void
}) {
  const [avanzando, setAvanzando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const cfg = ESTADO_CFG[pedido.estado] ?? ESTADO_CFG.pendiente

  const ahora = Date.now()
  const creado = new Date(pedido.created_at).getTime()
  const minutos = Math.floor((ahora - creado) / 60000)

  const avanzar = async (nuevoEstado: string, setCargando: (v: boolean) => void) => {
    setCargando(true)
    const res = await fetch('/api/storefront/estado', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-ia-session': JSON.stringify(session),
      },
      body: JSON.stringify({ pedido_id: pedido.id, estado: nuevoEstado }),
    })
    const d = await res.json()
    setCargando(false)
    if (d.ok) onActualizar(pedido.id, nuevoEstado)
  }

  return (
    <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] overflow-hidden"
      style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      {/* Header de la tarjeta */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[#2A2420]">
        <div className="flex items-center gap-2">
          <span className="text-lg">{cfg.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#F6F1E7] text-sm">#{pedido.numero}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: cfg.color + '25', color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-[#9C8E7E]">
              {TIPO_LABEL[pedido.tipo] ?? pedido.tipo}
              {pedido.canal !== 'online' && ` · ${CANAL_ICON[pedido.canal]} ${pedido.canal}`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-[#D9442B]">{pedido.total.toFixed(2)} €</p>
          <p className="text-xs text-[#9C8E7E]">{minutos}' · {pedido.cobro === 'online' ? '💳 Pagado' : pedido.cobro}</p>
        </div>
      </div>

      {/* Datos cliente */}
      <div className="px-4 py-2.5 border-b border-[#2A2420]">
        <p className="font-semibold text-[#F6F1E7] text-sm">{pedido.cliente_nombre}</p>
        {pedido.cliente_telefono && <p className="text-xs text-[#9C8E7E]">{pedido.cliente_telefono}</p>}
        {pedido.cliente_direccion && (
          <p className="text-xs text-[#D8CDB6] mt-0.5">📍 {pedido.cliente_direccion}</p>
        )}
        {pedido.tiempo_recogida_min > 0 && (
          <p className="text-xs text-[#E8A33B] mt-0.5">⏱ {pedido.tiempo_recogida_min} min estimados</p>
        )}
      </div>

      {/* Items */}
      <div className="px-4 py-2.5 space-y-1 border-b border-[#2A2420]">
        {pedido.items.map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-[#D8CDB6]">{item.cantidad}× {item.nombre}
              {item.notas && <span className="text-[#9C8E7E]"> — {item.notas}</span>}
            </span>
            <span className="text-[#9C8E7E]">{(item.precio_unitario * item.cantidad).toFixed(2)} €</span>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="px-4 py-3 flex gap-2">
        {cfg.next && (
          <button
            onClick={() => avanzar(cfg.next, setAvanzando)}
            disabled={avanzando}
            className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.97]"
            style={{ background: avanzando ? '#4A3F35' : '#D9442B' }}>
            {avanzando ? '…' : cfg.nextLabel}
          </button>
        )}
        {!['entregado', 'cancelado'].includes(pedido.estado) && (
          <button
            onClick={() => avanzar('cancelado', setCancelando)}
            disabled={cancelando}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-[#3A3028] text-[#9C8E7E] hover:text-[#EF4444] hover:border-[#EF4444] transition-colors">
            {cancelando ? '…' : 'Cancelar'}
          </button>
        )}
        {pedido.estado === 'entregado' && (
          <p className="flex-1 text-center text-xs text-[#3F7D44] font-semibold py-2.5">✓ Completado</p>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function PedidosOnlinePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [pedidos, setPedidos] = useState<PedidoOnline[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'delivery' | 'recogida' | 'telefono' | 'mostrador'>('todos')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ia_session')
      if (raw) setSession(JSON.parse(raw))
    } catch { /* nada */ }
  }, [])

  const cargarPedidos = useCallback(async () => {
    if (!session) return
    const res = await fetch('/api/storefront/estado?activos=1', {
      headers: { 'x-ia-session': JSON.stringify(session) }
    })
    const d = await res.json()
    setPedidos(d.pedidos ?? [])
    setCargando(false)
  }, [session])

  useEffect(() => {
    if (session) cargarPedidos()
  }, [session, cargarPedidos])

  // Realtime — escuchar cambios en pedidos_online
  useEffect(() => {
    if (!session) return
    const ch = supabase.channel('pedidos-online-panel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pedidos_online',
        filter: `restaurante_id=eq.${session.restaurante_id}`,
      }, () => { cargarPedidos() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session, cargarPedidos])

  const onActualizar = (id: string, nuevoEstado: string) => {
    setPedidos(prev => {
      if (['entregado', 'cancelado'].includes(nuevoEstado)) {
        return prev.filter(p => p.id !== id)
      }
      return prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p)
    })
  }

  if (!session) return (
    <div className="min-h-screen bg-[#14110E] flex items-center justify-center">
      <p className="text-[#9C8E7E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Inicia sesión primero</p>
    </div>
  )

  const pedidosFiltrados = filtro === 'todos' ? pedidos
    : pedidos.filter(p => p.tipo === filtro || p.canal === filtro)

  const counts = {
    total: pedidos.length,
    delivery: pedidos.filter(p => p.tipo === 'delivery').length,
    recogida: pedidos.filter(p => p.tipo === 'recogida' || p.canal === 'mostrador').length,
    telefono: pedidos.filter(p => p.canal === 'telefono').length,
  }

  return (
    <div className="min-h-screen bg-[#14110E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#14110E] border-b border-[#2A2420] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-bold text-[#F6F1E7] text-lg" style={{ fontFamily: 'Newsreader, serif' }}>
              Pedidos online
            </h1>
            <p className="text-xs text-[#9C8E7E]">
              {counts.total === 0 ? 'Sin pedidos activos' : `${counts.total} activo${counts.total > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={cargarPedidos} className="text-[#9C8E7E] text-sm border border-[#2A2420] px-3 py-1.5 rounded-xl">
            ↻ Actualizar
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {([
            { key: 'todos', label: `Todos (${counts.total})` },
            { key: 'delivery', label: `🛵 Delivery (${counts.delivery})` },
            { key: 'recogida', label: `🏪 Recogida (${counts.recogida})` },
            { key: 'telefono', label: `📞 Teléfono (${counts.telefono})` },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={{
                background: filtro === f.key ? '#D9442B' : '#1E1A16',
                color: filtro === f.key ? 'white' : '#9C8E7E',
                borderColor: filtro === f.key ? '#D9442B' : '#2A2420',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-10">
        {cargando ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-[3px] border-[#D9442B] border-t-transparent animate-spin" />
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-[#9C8E7E] font-medium">Sin pedidos activos</p>
            <p className="text-xs text-[#4A3F35] mt-1">Los pedidos nuevos aparecen aquí automáticamente</p>
          </div>
        ) : (
          pedidosFiltrados.map(p => (
            <TarjetaPedido key={p.id} pedido={p} session={session} onActualizar={onActualizar} />
          ))
        )}
      </div>
    </div>
  )
}

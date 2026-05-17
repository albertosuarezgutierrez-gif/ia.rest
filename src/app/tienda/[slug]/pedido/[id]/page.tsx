'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ESTADOS = [
  { key: 'pendiente',   label: 'Pedido recibido',    icon: '📋' },
  { key: 'confirmado',  label: 'Confirmado',          icon: '✓'  },
  { key: 'en_cocina',   label: 'En cocina',           icon: '👨‍🍳' },
  { key: 'listo',       label: 'Listo',               icon: '✅' },
  { key: 'entregado',   label: 'Entregado',           icon: '🎉' },
]

interface Pedido {
  id: string
  numero: number
  estado: string
  tipo: 'delivery' | 'recogida'
  cliente_nombre: string
  items: Array<{ nombre: string; cantidad: number; precio_unitario: number }>
  total: number
  created_at: string
}

export default function TrackingPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // Carga inicial
    fetch(`/api/storefront/pedido?id=${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.pedido) setPedido(data.pedido)
        setCargando(false)
      })

    // Suscripción realtime
    const channel = supabase
      .channel(`pedido-${params.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos_online',
          filter: `id=eq.${params.id}`,
        },
        payload => {
          setPedido(prev => prev ? { ...prev, ...(payload.new as Partial<Pedido>) } : prev)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [params.id])

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#F6F1E7] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#D9442B] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="min-h-screen bg-[#F6F1E7] flex items-center justify-center">
        <p className="text-[#6B5E4C]">Pedido no encontrado</p>
      </div>
    )
  }

  const estadoIdx = ESTADOS.findIndex(e => e.key === pedido.estado)

  return (
    <div className="min-h-screen bg-[#F6F1E7]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Cabecera */}
        <div className="text-center mb-8">
          <p className="text-sm text-[#9C8E7E] mb-1">Pedido #{pedido.numero}</p>
          <h1 className="text-2xl font-bold text-[#14110E]" style={{ fontFamily: 'Newsreader, serif' }}>
            {pedido.tipo === 'delivery' ? 'En camino' : 'Seguimiento'}
          </h1>
        </div>

        {/* Timeline de estados */}
        <div className="bg-white rounded-2xl p-6 border border-[#E8E0D4] mb-6">
          {ESTADOS.filter(e => e.key !== 'cancelado').map((estado, idx) => {
            const completado = idx <= estadoIdx
            const activo = idx === estadoIdx
            return (
              <div key={estado.key} className="flex items-center gap-4 mb-4 last:mb-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 transition-all"
                  style={{
                    backgroundColor: completado ? '#D9442B' : '#F0EBE3',
                    transform: activo ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {completado ? (idx === estadoIdx ? estado.icon : '✓') : <span className="text-[#C0B5A8] text-xs">{idx + 1}</span>}
                </div>
                <div className="flex-1">
                  <p
                    className="font-semibold"
                    style={{ color: completado ? '#14110E' : '#C0B5A8' }}
                  >
                    {estado.label}
                  </p>
                  {activo && (
                    <p className="text-xs text-[#D9442B] animate-pulse">En curso...</p>
                  )}
                </div>
                {idx < ESTADOS.length - 2 && (
                  <div
                    className="absolute ml-5 mt-10 w-0.5 h-4"
                    style={{ backgroundColor: idx < estadoIdx ? '#D9442B' : '#E8E0D4' }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Resumen del pedido */}
        <div className="bg-white rounded-2xl p-5 border border-[#E8E0D4]">
          <h2 className="font-bold text-[#14110E] mb-3" style={{ fontFamily: 'Newsreader, serif' }}>
            Tu pedido
          </h2>
          <div className="space-y-2 mb-3">
            {pedido.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm text-[#6B5E4C]">
                <span>{item.cantidad}× {item.nombre}</span>
                <span>{(item.precio_unitario * item.cantidad).toFixed(2)} €</span>
              </div>
            ))}
          </div>
          <div className="border-t border-[#E8E0D4] pt-3 flex justify-between font-bold text-[#14110E]">
            <span>Total</span>
            <span>{pedido.total.toFixed(2)} €</span>
          </div>
        </div>

        <p className="text-center text-xs text-[#C0B5A8] mt-6">
          Esta página se actualiza automáticamente
        </p>
      </div>
    </div>
  )
}

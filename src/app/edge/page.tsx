'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const C = {
  bg: '#14110E', e1: '#1F1A15', e2: '#2A241D',
  fg: '#F6F1E7', fg2: '#C9BFAA', fg3: '#8D8270',
  rule: '#2F2820', rS: '#4A3F33',
  red: '#D9442B', rD: '#A8311E', amb: '#E8A33B', tl: '#2B6A6E', gr: '#3F7D44',
}
const SN = "'Inter Tight', system-ui, sans-serif"
const SE = "'Newsreader', Georgia, serif"
const SM = "'JetBrains Mono', ui-monospace, monospace"

type Screen = 'idle' | 'recording' | 'processing' | 'confirm' | 'sent' | 'error'

interface BrainResult {
  mesa: string; tipo: string; items: {nombre:string;cantidad:number}[]; confianza: number; raw: string
}

function WaveBars({ active }: { active: boolean }) {
  const heights = [12,24,36,18,40,28,16,32,42,20,30,14,36,22,18,10,26,34,14,22]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
      <style>{`@keyframes wv{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}`}</style>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: 3, background: i % 2 ? C.red : C.fg, borderRadius: 2,
          height: active ? h : Math.max(3, h * 0.15),
          transformOrigin: 'center',
          animation: active ? `wv 1.1s ${(i*0.05).toFixed(2)}s ease-in-out infinite` : 'none',
          transition: 'height 200ms ease',
        }} />
      ))}
    </div>
  )
}

export default function EdgePage() {
  const [screen, setScreen] = useState<Screen>('idle')
  const [transcript, setTranscript] = useState('')
  const [brain, setBrain] = useState<BrainResult | null>(null)
  const [error, setError] = useState('')
  const [camareroNombre, setCamareroNombre] = useState('Camarero')
  const [turnoId, setTurnoId] = useState<string | null>(null)
  const [camareroId, setCamareroId] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [pin, setPin] = useState('')
  const [latencia, setLatencia] = useState<number | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const holdRef = useRef(false)

  // Init: check session & get active shift
  useEffect(() => {
    const stored = localStorage.getItem('ia_rest_session')
    if (stored) {
      const s = JSON.parse(stored)
      setCamareroId(s.id); setCamareroNombre(s.nombre); setLoggedIn(true)
      fetchTurno()
    }
  }, [])

  const fetchTurno = async () => {
    const r = await fetch('/api/turno')
    const d = await r.json()
    if (d.turno) setTurnoId(d.turno.id)
  }

  const handleLogin = async () => {
    if (pin.length < 4) return
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
    const d = await r.json()
    if (d.camarero) {
      localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
      setCamareroId(d.camarero.id); setCamareroNombre(d.camarero.nombre); setLoggedIn(true)
      fetchTurno()
    } else {
      setError('PIN incorrecto')
    }
  }

  const startRecording = useCallback(async () => {
    if (screen !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(100)
      mediaRef.current = mr
      holdRef.current = true
      setScreen('recording')
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50)
    } catch (e) {
      setError('Sin acceso al microfono')
      setScreen('error')
    }
  }, [screen])

  const stopRecording = useCallback(async () => {
    if (!holdRef.current || !mediaRef.current) return
    holdRef.current = false
    setScreen('processing')

    const mr = mediaRef.current
    await new Promise<void>(resolve => {
      mr.onstop = () => resolve()
      mr.stop()
    })
    mr.stream.getTracks().forEach(t => t.stop())

    if (chunksRef.current.length === 0) { setScreen('idle'); return }

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const fd = new FormData()
    fd.append('audio', blob, 'audio.webm')
    fd.append('camarero_id', camareroId || 'demo')
    fd.append('turno_id', turnoId || 'demo')

    try {
      const r = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok) {
        setTranscript(d.texto)
        setBrain(d.brain)
        setLatencia(d.latencia_ms)
        setScreen('confirm')
        if (navigator.vibrate) navigator.vibrate([30, 50, 30])
      } else {
        setError(d.error || 'Error procesando voz')
        setScreen('error')
      }
    } catch {
      setError('Error de red')
      setScreen('error')
    }
  }, [camareroId, turnoId])

  // Keyboard PTT: space bar
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); startRecording() } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') stopRecording() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [startRecording, stopRecording])

  // LOGIN SCREEN
  if (!loggedIn) {
    return (
      <div style={{ height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
        <svg width="52" height="52" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#1F1A15"/><g transform="translate(11,14)"><rect x="0" y="11" width="3" height="6" rx="1.5" fill="#F6F1E7"/><rect x="6" y="6" width="3" height="16" rx="1.5" fill="#F6F1E7"/><rect x="12" y="0" width="3" height="28" rx="1.5" fill="#D9442B"/><rect x="18" y="3" width="3" height="22" rx="1.5" fill="#F6F1E7"/><rect x="24" y="9" width="3" height="10" rx="1.5" fill="#F6F1E7"/><rect x="30" y="12" width="3" height="4" rx="1.5" fill="#F6F1E7"/></g></svg>
        <div style={{ fontFamily: SE, fontSize: 28, color: C.fg, fontWeight: 500, textAlign: 'center' }}>ia<span style={{ color: C.red }}>.</span>rest<br/><span style={{ fontSize: 18, opacity: 0.6 }}>Edge</span></div>
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            placeholder="PIN de acceso"
            value={pin} onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ background: C.e1, border: `1px solid ${C.rS}`, borderRadius: 4, padding: '14px 16px', fontFamily: SM, fontSize: 18, color: C.fg, outline: 'none', textAlign: 'center', letterSpacing: '0.2em', width: '100%' }}
          />
          {error && <div style={{ fontFamily: SN, fontSize: 12, color: C.red, textAlign: 'center' }}>{error}</div>}
          <button onClick={handleLogin} style={{ background: C.red, border: 'none', borderRadius: 4, padding: '14px', fontFamily: SN, fontSize: 15, fontWeight: 700, color: C.fg, cursor: 'pointer', width: '100%' }}>
            Entrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes pulse{50%{opacity:.3}}@keyframes blink{50%{opacity:0}}@keyframes toastUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* TOP BAR */}
      <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${C.rule}`, background: C.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: screen === 'recording' ? C.tl : C.fg3, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: screen === 'recording' ? C.tl : C.fg3, animation: screen === 'recording' ? 'pulse 1.2s ease-in-out infinite' : 'none' }} />
            {screen === 'recording' ? 'EAR · escuchando' : screen === 'processing' ? 'BRAIN · procesando...' : 'EAR · en espera'}
          </span>
          <span style={{ fontFamily: SM, fontSize: 11, color: C.fg3 }}>{camareroNombre}</span>
        </div>
        <WaveBars active={screen === 'recording'} />
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 16, overflow: 'auto' }}>

        {/* IDLE */}
        {screen === 'idle' && (
          <>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: SE, fontSize: 20, color: C.fg, textAlign: 'center', lineHeight: 1.3, maxWidth: 260 }}>
                Manten pulsado para hablar.
              </div>
            </div>
          </>
        )}

        {/* RECORDING */}
        {screen === 'recording' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontFamily: SM, fontSize: 14, color: C.tl, letterSpacing: '0.04em', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.tl, animation: 'pulse 1.2s ease-in-out infinite' }} />
              GRABANDO
            </div>
          </div>
        )}

        {/* PROCESSING */}
        {screen === 'processing' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontFamily: SM, fontSize: 13, color: C.fg3 }}>Procesando...</div>
            {transcript && (
              <div style={{ fontFamily: SM, fontSize: 13, color: C.fg2, textAlign: 'center', maxWidth: 280, lineHeight: 1.4 }}>
                {`"${transcript}"`}
              </div>
            )}
          </div>
        )}

        {/* CONFIRM */}
        {screen === 'confirm' && brain && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Transcript */}
            <div style={{ background: C.e1, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontFamily: SM, fontSize: 9, color: C.fg3, letterSpacing: '0.1em', marginBottom: 6 }}>EAR · {latencia}ms</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: C.fg, lineHeight: 1.5 }}>{`"${transcript}"`}</div>
            </div>
            {/* Brain result */}
            <div style={{ background: C.e1, border: `1px solid ${C.rS}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: SE, fontSize: 32, color: C.fg, fontWeight: 500 }}>{brain.mesa}</span>
                <span style={{ fontFamily: SN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.amb, textTransform: 'uppercase', padding: '3px 8px', background: 'rgba(232,163,59,0.12)', borderRadius: 999 }}>{brain.tipo}</span>
              </div>
              <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {brain.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontFamily: SN, fontSize: 15, color: C.fg }}>
                    <span style={{ fontFamily: SM, fontWeight: 700, color: C.red, width: 28 }}>{it.cantidad}x</span>
                    {it.nombre}
                  </div>
                ))}
                {brain.items.length === 0 && (
                  <div style={{ fontFamily: SN, fontSize: 13, color: C.fg3 }}>Sin items</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setScreen('idle')} style={{ flex: 1, background: 'transparent', border: `1px solid ${C.rS}`, color: C.fg2, padding: 12, borderRadius: 4, fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={() => setScreen('sent')} style={{ flex: 2, background: C.red, border: 'none', color: C.fg, padding: 12, borderRadius: 4, fontFamily: SN, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Enviar a barra
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SENT */}
        {screen === 'sent' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(63,125,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${C.gr}` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
            </div>
            <div style={{ fontFamily: SE, fontSize: 22, color: C.fg, fontWeight: 500 }}>Enviado.</div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.fg3 }}>{latencia}ms · {brain?.mesa}</div>
            <button onClick={() => { setScreen('idle'); setBrain(null); setTranscript('') }} style={{ marginTop: 16, background: 'transparent', border: `1px solid ${C.rS}`, color: C.fg2, padding: '12px 24px', borderRadius: 4, fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Volver
            </button>
          </div>
        )}

        {/* ERROR */}
        {screen === 'error' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontFamily: SM, fontSize: 14, color: C.red }}>{error}</div>
            <button onClick={() => { setScreen('idle'); setError('') }} style={{ background: 'transparent', border: `1px solid ${C.rS}`, color: C.fg2, padding: '12px 24px', borderRadius: 4, fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* PTT BUTTON */}
      <div style={{ padding: '12px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, flexShrink: 0 }}>
        <div style={{ fontFamily: SM, fontSize: 9, color: C.fg3, letterSpacing: '0.1em', marginBottom: 4 }}>
          {screen === 'recording' ? 'SUELTA PARA ENVIAR' : 'MANTÉN PULSADO'}
        </div>
        <button
          onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
          onTouchStart={e => { e.preventDefault(); startRecording() }}
          onTouchEnd={e => { e.preventDefault(); stopRecording() }}
          style={{
            width: 180, height: 180, borderRadius: 999,
            border: `4px solid ${screen === 'recording' ? C.red : C.rS}`,
            background: screen === 'recording' ? C.red : C.e1,
            color: C.fg, fontFamily: SN, fontSize: 16, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'transform 120ms cubic-bezier(0.34,1.56,0.64,1), background 200ms, border-color 200ms',
            transform: screen === 'recording' ? 'scale(0.95)' : 'scale(1)',
            boxShadow: screen === 'recording'
              ? '0 0 0 16px rgba(217,68,43,0.15), 0 0 0 32px rgba(217,68,43,0.06)'
              : '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8,
            userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" fill={screen === 'recording' ? C.fg : 'none'}/>
            <path d="M5 11a7 7 0 0 0 14 0"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
          </svg>
          {screen === 'recording' ? 'Hablando' : 'PTT'}
        </button>
      </div>
    </div>
  )
}

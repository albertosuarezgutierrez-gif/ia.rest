'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const C = {
  bg:'#14110E', e1:'#1F1A15', e2:'#2A241D',
  fg:'#F6F1E7', fg2:'#C9BFAA', fg3:'#8D8270',
  rule:'#2F2820', rS:'#4A3F33',
  red:'#D9442B', rD:'#A8311E',
  green:'#3F7D44',
}
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    if (pin.length < 4) { setError('PIN mínimo 4 dígitos'); return }
    setLoading(true); setError('')
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const d = await r.json()
    if (d.camarero) {
      localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
      // Redirect based on role
      if (d.camarero.rol === 'admin') {
        router.push('/hub')
      } else {
        router.push('/edge')
      }
    } else {
      setError('PIN incorrecto'); setLoading(false)
    }
  }

  const handleKey = (k: string) => {
    if (k === 'del') { setPin(p => p.slice(0,-1)); return }
    if (pin.length >= 6) return
    setPin(p => p + k)
  }

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
      <style>{`
        .pin-key { width:72px; height:72px; border-radius:999px; background:#1F1A15; border:1px solid #2F2820; color:#F6F1E7; font-family:'Inter Tight',system-ui,sans-serif; font-size:22px; font-weight:500; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .12s, transform .1s; user-select:none; }
        .pin-key:active { background:#2A241D; transform:scale(.93); }
      `}</style>

      {/* Logo */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, marginBottom:40 }}>
        <svg width="56" height="56" viewBox="0 0 56 56">
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
        <div style={{ fontFamily:SE, fontSize:28, color:C.fg, fontWeight:500, textAlign:'center' }}>
          ia<span style={{ color:C.red }}>.</span>rest
        </div>
        <div style={{ fontFamily:SM, fontSize:11, color:C.fg3, letterSpacing:'.1em' }}>INTRODUCE TU PIN</div>
      </div>

      {/* PIN dots */}
      <div style={{ display:'flex', gap:14, marginBottom:8 }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{ width:14, height:14, borderRadius:999, background: i < pin.length ? C.red : C.rS, transition:'background .15s' }}/>
        ))}
      </div>

      {/* Error */}
      <div style={{ height:20, marginBottom:24, fontFamily:SN, fontSize:12, color:C.red, textAlign:'center' }}>
        {error}
      </div>

      {/* Numeric keypad */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,72px)', gap:14, justifyContent:'center' }}>
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => (
          k === '' ? <div key={i}/> :
          k === 'del' ? (
            <button key={i} className="pin-key" onClick={() => handleKey('del')} style={{ fontSize:16 }}>
              ⌫
            </button>
          ) : (
            <button key={i} className="pin-key" onClick={() => handleKey(k)}>
              {k}
            </button>
          )
        ))}
      </div>

      {/* Enter button */}
      <button
        onClick={handleLogin}
        disabled={loading || pin.length < 4}
        style={{ marginTop:32, width:'100%', maxWidth:230, background:pin.length>=4&&!loading?C.red:'#2A241D', border:'none', borderRadius:4, padding:'16px', fontFamily:SN, fontSize:15, fontWeight:700, color:pin.length>=4&&!loading?C.fg:C.fg3, cursor:pin.length>=4?'pointer':'default', transition:'background .2s' }}
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>

      <div style={{ marginTop:32, fontFamily:SM, fontSize:10, color:C.fg3, textAlign:'center', lineHeight:1.8 }}>
        ADMIN · PIN 0000<br/>
        CAMARERO · PIN 1234 o 5678
      </div>
    </div>
  )
}

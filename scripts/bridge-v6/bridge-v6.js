#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// ia.rest Bridge v6 — Cloud Edition
// Sin servidor local · Sin puertos abiertos · Sin antivirus issues
//
// Arquitectura: Supabase Realtime (WSS) como canal de comunicación
//   1. Bridge se conecta a Supabase Realtime usando anon key (pública)
//   2. Se suscribe a cambios en print_jobs de su restaurante_id
//   3. Cuando llega un job → imprime por TCP directo
//   4. Reconecta automáticamente si se cae la conexión
//   5. Ping cada 30s para mantener ultimo_ping actualizado en BD
// ═══════════════════════════════════════════════════════════════

const net  = require('net')
const http = require('http')
const https = require('https')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const VERSION      = '6.0.0'
const API          = 'https://www.iarest.es'
const SUPABASE_URL = 'https://efncqyvhniaxsirhdxaa.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbmNxeXZobmlheHNpcmhkeGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2ODk5MzYsImV4cCI6MjA5MzI2NTkzNn0.dt3ko-HWzJK57FQyRDTjU07QBsYv9fpGo8Sm3Cs6heA'

const CONFIG_DIR  = path.join(os.homedir(), '.iarest')
const CONFIG_FILE = path.join(CONFIG_DIR, 'bridge-v6.json')

// ── Config ────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}
  return {}
}
function saveConfig(data) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadConfig(), ...data }, null, 2))
}

// ── TCP ESC/POS ───────────────────────────────────────────────
function sendESCPOS(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error(`TCP timeout ${ip}:${port}`)) }, 8000)
    socket.connect(parseInt(port) || 9100, ip, () => {
      socket.write(data, () => {
        clearTimeout(timeout)
        socket.end()
        resolve()
      })
    })
    socket.on('error', (e) => { clearTimeout(timeout); reject(e) })
  })
}

// ── REST helpers ──────────────────────────────────────────────
function fetchJSON(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    }
    const req = mod.request(options, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }) }
        catch { resolve({ status: res.statusCode, body }) }
      })
    })
    req.on('error', reject)
    if (opts.body) req.write(JSON.stringify(opts.body))
    req.end()
  })
}

// ── MAC recovery (por si cambia la IP) ───────────────────────
const macToIP = {}
function getLocalIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '192.168.1.1'
}

// ── Imprimir un job ───────────────────────────────────────────
async function printJob(job) {
  let ip = job.ip || job.ip_address
  const port = job.port || 9100
  const data = Buffer.from(job.print_data, 'base64')

  try {
    await sendESCPOS(ip, port, data)
    await fetchJSON(`${API}/api/print`, {
      method: 'POST',
      headers: { 'x-bridge-token': TOKEN },
      body: { job_id: job.id, status: 'impreso' }
    })
    console.log(`[OK] ${new Date().toLocaleTimeString('es-ES')} Job ${job.id.slice(0,8)} → ${ip}:${port}`)
  } catch (e) {
    console.warn(`[WARN] Print failed: ${e.message}`)
    // Intentar recuperar por MAC
    const mac = job.mac_address || Object.keys(macToIP).find(m => macToIP[m] === ip)
    if (mac) {
      const cfg = loadConfig()
      const saved = cfg.printers?.find(p => p.mac === mac)
      if (saved?.ip && saved.ip !== ip) {
        try {
          await sendESCPOS(saved.ip, port, data)
          await fetchJSON(`${API}/api/print`, {
            method: 'POST',
            headers: { 'x-bridge-token': TOKEN },
            body: { job_id: job.id, status: 'impreso' }
          })
          console.log(`[OK Recovery] ${job.id.slice(0,8)} → ${saved.ip}`)
          return
        } catch {}
      }
    }
    // Marcar como error
    await fetchJSON(`${API}/api/print`, {
      method: 'POST',
      headers: { 'x-bridge-token': TOKEN },
      body: { job_id: job.id, status: 'error', error_msg: e.message }
    }).catch(() => {})
  }
}

// ── Ping a BD (mantiene ultimo_ping actualizado) ──────────────
async function ping() {
  try {
    await fetchJSON(`${API}/api/print?token=${TOKEN}&v=${VERSION}`, {
      headers: { 'x-bridge-token': TOKEN }
    })
  } catch {}
}

// ── Realtime WebSocket (sin dependencias externas) ────────────
// Implementamos el protocolo Phoenix/Supabase Realtime manualmente
// para no necesitar npm install en el EXE compilado
const WebSocket = require('ws')

let ws = null
let wsReady = false
let reconnectTimer = null
let heartbeatTimer = null
let joinRef = 1
let restauranteId = null

function wsConnect() {
  if (ws) { try { ws.terminate() } catch {} }
  clearTimeout(reconnectTimer)
  clearInterval(heartbeatTimer)

  const wsUrl = `${SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`
  console.log(`[WS] Conectando a Supabase Realtime...`)

  ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    wsReady = true
    console.log(`[WS] Conectado`)

    // Heartbeat cada 25s
    heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }))
      }
    }, 25000)

    // Suscribirse al canal de print_jobs del restaurante
    subscribeChannel()
  })

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)
      handleMessage(msg)
    } catch {}
  })

  ws.on('close', () => {
    wsReady = false
    clearInterval(heartbeatTimer)
    console.log(`[WS] Desconectado — reconectando en 5s...`)
    reconnectTimer = setTimeout(wsConnect, 5000)
  })

  ws.on('error', (e) => {
    console.warn(`[WS] Error: ${e.message}`)
  })
}

function subscribeChannel() {
  if (!restauranteId) return
  const channel = `realtime:public:print_jobs:restaurante_id=eq.${restauranteId}`
  const msg = {
    topic: channel,
    event: 'phx_join',
    payload: {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: '' },
        postgres_changes: [
          { event: 'INSERT', schema: 'public', table: 'print_jobs', filter: `restaurante_id=eq.${restauranteId}` }
        ]
      }
    },
    ref: String(joinRef++)
  }
  ws.send(JSON.stringify(msg))
  console.log(`[WS] Suscrito a print_jobs · restaurante ${restauranteId.slice(0,8)}...`)
}

function handleMessage(msg) {
  // Nuevo print_job insertado
  if (msg.event === 'postgres_changes' || msg.event === '*') {
    const record = msg.payload?.data?.record || msg.payload?.record
    if (record && record.status === 'pendiente' && record.restaurante_id === restauranteId) {
      console.log(`[WS] Nuevo job detectado: ${record.id?.slice(0,8)}`)
      // Fetch completo del job (incluye ip, print_data, etc.)
      fetchAndPrint(record.id).catch(e => console.error('[WS] Print error:', e.message))
    }
  }
}

async function fetchAndPrint(jobId) {
  const r = await fetchJSON(`${API}/api/print?token=${TOKEN}&v=${VERSION}&job_id=${jobId}`)
  if (r.body?.jobs?.length) {
    for (const job of r.body.jobs) await printJob(job)
  }
}

// ── Bootstrap ─────────────────────────────────────────────────
const TOKEN = process.env.BRIDGE_TOKEN || loadConfig().token || ''
if (!TOKEN) {
  console.error('[ia.rest Bridge v6] Token no configurado.')
  console.error('Ejecuta el wizard de configuración primero.')
  process.exit(1)
}

console.log(`\n[ia.rest Bridge] v${VERSION} · Cloud Edition`)
console.log(`API: ${API}`)
console.log(`Token: ${TOKEN.slice(0,8)}...`)
console.log('')

// 1. Resolver restaurante_id desde el token
;(async () => {
  try {
    const r = await fetchJSON(`${API}/api/bridge/info?token=${TOKEN}`)
    if (!r.body?.restaurante_id) throw new Error('Token inválido o sin restaurante_id')
    restauranteId = r.body.restaurante_id

    // Cargar MACs de la config
    const cfg = loadConfig()
    if (cfg.printers) cfg.printers.forEach(p => { if (p.mac && p.ip) macToIP[p.mac] = p.ip })

    console.log(`[OK] Bridge listo. Esperando jobs... (restaurante ${restauranteId.slice(0,8)})`)

    // 2. Ping inmediato
    await ping()

    // 3. Conectar Realtime
    wsConnect()

    // 4. Ping cada 30s (mantiene ultimo_ping en BD)
    setInterval(ping, 30000)

    // 5. Poll de respaldo cada 60s (por si falla el WS)
    setInterval(async () => {
      try {
        const r = await fetchJSON(`${API}/api/print?token=${TOKEN}&v=${VERSION}`)
        if (r.body?.jobs?.length) {
          console.log(`[Poll backup] ${r.body.jobs.length} jobs pendientes`)
          for (const job of r.body.jobs) await printJob(job)
        }
      } catch {}
    }, 60000)

  } catch (e) {
    console.error('[Bridge] Error de inicio:', e.message)
    process.exit(1)
  }
})()

process.on('uncaughtException', (e) => {
  console.error('[Bridge] Error fatal:', e.message)
  process.exit(1)
})
process.on('unhandledRejection', (e) => {
  console.error('[Bridge] Promesa rechazada:', e)
  process.exit(1)
})

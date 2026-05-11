#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local
// ============================================================
// Corre en la red del restaurante (Raspberry Pi, PC de caja,
// cualquier ordenador con Node.js ≥18).
//
// Hace polling a /api/print cada 3 segundos,
// manda los jobs pendientes a la impresora via TCP (puerto 9100),
// confirma la entrega al servidor.
//
// Instalación:
//   npm install node-fetch   # o usa el fetch nativo de Node 18+
//
// Uso:
//   node bridge-local.js
//
// Variables de entorno (.env o exportadas):
//   IAREST_API=https://www.iarest.es   (sin slash final)
//   BRIDGE_TOKEN=tu_token_de_32_chars
// ============================================================

const net = require('net')

const API    = (process.env.IAREST_API    || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN  = process.env.BRIDGE_TOKEN   || ''
const POLL_MS = parseInt(process.env.POLL_MS || '3000', 10)
const TIMEOUT_MS = 5000  // TCP connection timeout

if (!TOKEN) {
  console.error('[BRIDGE] BRIDGE_TOKEN no configurado. Copia el token desde /owner → Impresoras.')
  process.exit(1)
}

// ── Colores para la consola ──────────────────────────────────
const COL = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
}

function log(level, msg) {
  const ts = new Date().toLocaleTimeString('es-ES')
  const color = { info: COL.gray, ok: COL.green, warn: COL.yellow, error: COL.red }[level] || ''
  console.log(`${COL.gray}${ts}${COL.reset} ${color}[${level.toUpperCase()}]${COL.reset} ${msg}`)
}

// ── Envío TCP a impresora ────────────────────────────────────
function enviarAlaPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    if (!ip) return reject(new Error('IP no configurada'))

    const socket = new net.Socket()
    let sent = false

    socket.setTimeout(TIMEOUT_MS)

    socket.connect(port, ip, () => {
      // Convertir string con bytes de control a Buffer
      // print_data viene en base64 desde el servidor
      const buf = Buffer.from(data, 'base64')
      socket.write(buf, (err) => {
        if (err) {
          socket.destroy()
          return reject(err)
        }
        // Pequeña espera antes de cerrar (la impresora necesita tiempo para leer)
        setTimeout(() => {
          socket.end()
          sent = true
          resolve(true)
        }, 200)
      })
    })

    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Timeout conectando a ${ip}:${port}`))
    })

    socket.on('error', (err) => {
      if (!sent) reject(err)
    })

    socket.on('close', () => {
      if (!sent) reject(new Error('Socket cerrado antes de enviar'))
    })
  })
}

// ── Confirmar al servidor ────────────────────────────────────
async function confirmar(jobId, status, errorMsg) {
  try {
    const res = await fetch(`${API}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, status, error_msg: errorMsg }),
    })
    if (!res.ok) {
      log('warn', `Confirmación fallida para job ${jobId.slice(0,8)}: HTTP ${res.status}`)
    }
  } catch (err) {
    log('warn', `Error confirmando job ${jobId.slice(0,8)}: ${err.message}`)
  }
}

// ── Ciclo de polling ─────────────────────────────────────────
let running = false

async function poll() {
  if (running) return
  running = true

  try {
    const res = await fetch(`${API}/api/print?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      if (res.status === 401) {
        log('error', 'Token inválido. Revisa BRIDGE_TOKEN en /owner → Impresoras.')
        process.exit(1)
      }
      log('warn', `Polling: HTTP ${res.status}`)
      return
    }

    const { jobs } = await res.json()

    if (!jobs?.length) return

    log('info', `${jobs.length} job(s) recibido(s)`)

    for (const job of jobs) {
      const tag = `[${job.id.slice(0,8)}] ${job.ip}:${job.port}`

      try {
        log('info', `Enviando → ${tag}`)
        await enviarAlaPrinter(job.ip, job.port, job.print_data)
        log('ok', `Impreso   ✓ ${tag}`)
        await confirmar(job.id, 'impreso')
      } catch (err) {
        log('error', `Fallo     ✗ ${tag} — ${err.message}`)
        await confirmar(job.id, 'error', err.message)
      }
    }
  } catch (err) {
    if (err.name !== 'TimeoutError') {
      log('warn', `Poll error: ${err.message}`)
    }
  } finally {
    running = false
  }
}

// ── Arranque ─────────────────────────────────────────────────
console.log(`${COL.bold}ia.rest · Bridge local${COL.reset}`)
console.log(`${COL.gray}API:   ${API}${COL.reset}`)
console.log(`${COL.gray}Token: ${TOKEN.slice(0, 8)}...${COL.reset}`)
console.log(`${COL.gray}Poll:  cada ${POLL_MS}ms${COL.reset}`)
console.log('')
log('ok', 'Bridge iniciado. Esperando jobs...')

setInterval(poll, POLL_MS)
poll() // primer poll inmediato

// Graceful shutdown
process.on('SIGINT', () => {
  log('info', 'Deteniendo bridge...')
  process.exit(0)
})

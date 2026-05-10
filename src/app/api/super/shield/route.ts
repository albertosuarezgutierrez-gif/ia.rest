import { NextRequest, NextResponse } from 'next/server'

const KEY = process.env.SUPER_ACCESS_KEY

/**
 * GET /api/super/shield?k=<SUPER_ACCESS_KEY>
 *
 * Si la clave es correcta → establece cookie __super_shield y redirige a /super.
 * Si es incorrecta → 404 (no revela nada).
 *
 * La cookie es HttpOnly + Secure + SameSite=Strict → no accesible por JS.
 * Duración: 8 horas. Pasadas las 8h hay que volver a usar el enlace.
 *
 * Guarda este enlace solo en tu gestor de contraseñas:
 * https://ia-rest.vercel.app/api/super/shield?k=<TU_CLAVE>
 */
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k')

  // Fail secure: si no hay clave configurada o es incorrecta → 404 silencioso
  if (!KEY || !k || k !== KEY) {
    return new NextResponse(null, { status: 404 })
  }

  const res = NextResponse.redirect(new URL('/super', req.url))

  res.cookies.set('__super_shield', KEY, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 horas
    path: '/',
  })

  return res
}

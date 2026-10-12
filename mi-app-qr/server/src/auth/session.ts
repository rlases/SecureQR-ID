import session, { type SessionOptions } from 'express-session';

export function createSessionMiddleware(secret: string, secureCookie: boolean = false) {
  const options: SessionOptions = {
    secret,
    name: 'sqrid.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure: la cookie de sesión solo viaja por HTTPS cuando el servidor
      // efectivamente sirve por HTTPS (ADR-0008) — forzarlo siempre rompería
      // el login en `npm run dev` sin TLS local.
      secure: secureCookie,
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  };
  return session(options);
}

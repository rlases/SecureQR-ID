import session, { type SessionOptions } from 'express-session';

export function createSessionMiddleware(secret: string) {
  const options: SessionOptions = {
    secret,
    name: 'sqrid.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  };
  return session(options);
}

// Настройки из окружения. Без секретов в коде: в проде всё приходит из .env.
export function loadConfig(env = process.env) {
  const appUrl = (env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');
  return {
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mebel',
    appUrl,
    secureCookie: appUrl.startsWith('https://'),
    smtpUrl: env.SMTP_URL || '',
    mailFrom: env.MAIL_FROM || 'Конструктор мебели <no-reply@localhost>',
    sessionDays: 30,
  };
}

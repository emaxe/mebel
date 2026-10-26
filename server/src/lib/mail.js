import nodemailer from 'nodemailer';

/** Почтовик: {send({to, subject, text})}. Без SMTP_URL письма печатаются в лог (удобно в dev). */
export function createMailer(cfg, log = console) {
  if (!cfg.smtpUrl) return { send: async m => log.info(`[mail] to=${m.to} subject=${m.subject}\n${m.text}`) };
  const tr = nodemailer.createTransport(cfg.smtpUrl);
  return { send: m => tr.sendMail({ from: cfg.mailFrom, ...m }) };
}

export const verifyMail = (cfg, token) => ({
  subject: 'Подтверждение почты — Конструктор мебели',
  text: `Подтвердите адрес, открыв ссылку:\n${cfg.appUrl}/index.html#verify=${token}\n\nЕсли вы не регистрировались, просто проигнорируйте письмо.`,
});

export const resetMail = (cfg, token) => ({
  subject: 'Сброс пароля — Конструктор мебели',
  text: `Чтобы задать новый пароль, откройте ссылку (действует час):\n${cfg.appUrl}/index.html#reset=${token}\n\nЕсли вы не запрашивали сброс, проигнорируйте письмо.`,
});

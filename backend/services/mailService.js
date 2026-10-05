// Compatibilidade temporária com imports legados.
// O envio SMTP/Google foi deliberadamente desativado para impedir duplicidade.
// Todo novo envio deve passar por services/emailService.js e pela outbox persistente.

const isMailConfigured = () => false;

const sendMail = async () => {
  const error = new Error('Provedor SMTP/Google desativado. Utilize o serviço central de e-mail.');
  error.code = 'LEGACY_EMAIL_PROVIDER_DISABLED';
  throw error;
};

module.exports = { sendMail, isMailConfigured };

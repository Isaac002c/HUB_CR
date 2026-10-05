require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const tenantContext = require('./middlewares/tenantContext');
const { userContext } = require('./middlewares/authorize');
const { auditTrail } = require('./middlewares/auditTrail');
const pool = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const leadsRoutes = require('./routes/leadsRoutes');
const assetRoutes = require('./routes/assetsRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const targetsRoutes = require('./routes/targetsRoutes');
const sellersRoutes = require('./routes/sellersRoutes');
const forecastRoutes = require('./routes/forecastRoutes');
const clientRoutes = require('./routes/clientRoutes');
const contractRoutes = require('./routes/contractRoutes');
const documentRoutes = require('./routes/documentRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const saasRoutes = require('./routes/saasRoutes');
const userManagementRoutes = require('./routes/userManagementRoutes');
const finesRoutes = require('./routes/finesRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const multasLeadsRoutes = require('./routes/multasLeadsRoutes');
const uploadRoutes        = require('./routes/uploadRoutes');
const fineProtocolRoutes  = require('./routes/fineProtocolRoutes');
const approvalRoutes      = require('./routes/approvalRoutes');
const companyRoutes       = require('./routes/companyRoutes');
const calendarEventRoutes = require('./routes/calendarEventRoutes');
const masterRoutes        = require('./routes/masterRoutes');
const managementRoutes    = require('./routes/managementRoutes');
const meRoutes            = require('./routes/meRoutes');
const emailRoutes         = require('./routes/emailRoutes');
const generatedDocumentRoutes = require('./routes/generatedDocumentRoutes');
const resendWebhookRoutes = require('./routes/resendWebhookRoutes');
const emailWorker         = require('./services/emailWorker');

const app = express();

// Confia no proxy reverso (Nginx) para X-Forwarded-For e X-Forwarded-Proto
// Necessário para rate-limit e cookies secure funcionarem corretamente atrás do Nginx
app.set('trust proxy', 1);

// ============================================
// CORS
// ============================================

// Em produção, defina FRONTEND_URL no .env com o domínio real
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  ...FRONTEND_URL.split(',').map((origin) => origin.trim()).filter(Boolean),
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================
// SECURITY HEADERS
// ============================================

const connectSrcDirectives = ["'self'", ...FRONTEND_URL.split(',').map((origin) => origin.trim()).filter(Boolean)];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: connectSrcDirectives,
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

//  Remove header que revela tecnologia
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.set('Cache-Control', 'no-store');
  next();
});

// ============================================
// RATE LIMIT GLOBAL
// ============================================

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,                  // 200 requests por IP
  message: { success: false, message: 'Muitas requisições. Tente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// ============================================
// MIDDLEWARES
// ============================================

// O webhook do Resend precisa do corpo bruto para validar a assinatura.
// Ele é público por natureza, mas autenticado criptograficamente pelo svix signature.
app.use('/api/webhooks/resend', resendWebhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Log simples só em dev
const isDev = process.env.NODE_ENV !== 'production';
app.use((req, res, next) => {
  if (isDev) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROTAS
// ============================================

app.use('/auth', authRoutes);

// Serve arquivos de upload estaticamente (sem autenticação — URL contém tenantId no path)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.set('Cache-Control', 'private, max-age=86400');
    // O hub está em hub.crrecursos.com.br e os arquivos em api-hub. Sem esta
    // exceção, o header global "same-origin" do Helmet bloqueia imagens válidas
    // no navegador e elas aparecem quebradas na vitrine de deferidos.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('X-Content-Type-Options', 'nosniff');
  },
}));

app.use('/api', tenantContext);
// Carrega role/equipe/ativo do banco (autoritativo) após validar o tenant.
app.use('/api', userContext);
// Registra automaticamente toda mutação autenticada, com credenciais mascaradas.
app.use('/api', auditTrail);

app.use('/api/me', meRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/targets', targetsRoutes);
app.use('/api/sellers', sellersRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/generated-documents', generatedDocumentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api', saasRoutes);
app.use('/api/fines', finesRoutes);
app.use('/api/users/management', userManagementRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/multas-leads', multasLeadsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/fine-protocols', fineProtocolRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/calendar-events', calendarEventRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/emails', emailRoutes);

// ============================================
// HEALTH CHECK (sem autenticação — para uptime monitors)
// ============================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ============================================
// 404
// ============================================

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: 'Erro interno do servidor',
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

// Handlers de crash para evitar queda silenciosa em produção
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
  process.exit(1);
});

(async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log(' Conectado ao Banco de Dados');
  } catch (err) {
    console.error(' Erro ao conectar no banco:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(` CR Recursos CRM rodando na porta ${PORT} (${process.env.NODE_ENV || 'development'})`);
    emailWorker.start();
  });
})();

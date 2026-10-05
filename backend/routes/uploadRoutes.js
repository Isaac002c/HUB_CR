const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', req.tenantId || 'default');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const name = crypto.randomUUID() + (ext || '');
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.'));
    }
    cb(null, true);
  },
});

// POST /api/upload
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
  }

  const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
  const fileUrl = `${baseUrl}/uploads/${req.tenantId}/${req.file.filename}`;

  res.json({
    success: true,
    data: {
      url:          fileUrl,
      filename:     req.file.filename,
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      size:         req.file.size,
    },
  });
});

// Tratamento de erros do multer
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'Arquivo muito grande. Tamanho máximo: 10MB.' });
  }
  return res.status(400).json({ success: false, error: err.message || 'Erro no upload' });
});

module.exports = router;

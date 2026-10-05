'use client';

// Modal para renomear SOMENTE o nome de exibição de um documento já anexado.
// O arquivo físico, file_url, id, datas e vínculos NÃO mudam — só o file_name.
// A extensão é mostrada fixa (não editável) e preservada automaticamente pelo backend.
// Validação espelha o backend (que é a fonte de verdade): PATCH /api/documents/:id/rename.

import React, { useState } from 'react';
import { renameDocument } from '../../lib/documentsAPI';

const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|]/;

// Separa "nome base" e "extensão" do nome exibido; usa o arquivo armazenado como fallback da extensão.
const splitName = (doc) => {
  const full = doc.file_name || doc.name || '';
  const m = /^(.*?)(\.[A-Za-z0-9]{1,8})$/.exec(full);
  if (m) return { base: m[1], ext: m[2] };
  const um = /\.([A-Za-z0-9]{1,8})(?:[?#].*)?$/.exec(doc.file_url || '');
  return { base: full, ext: um ? `.${um[1]}` : '' };
};

export default function RenameDocumentModal({ doc, onClose, onRenamed }) {
  const { base, ext } = splitName(doc);
  const [value, setValue] = useState(base);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const validate = (raw) => {
    const b = (raw || '').trim();
    if (!b) return 'O nome não pode ficar vazio.';
    if (b.length > 120) return 'O nome deve ter no máximo 120 caracteres.';
    if (FORBIDDEN_NAME_CHARS.test(b)) return 'O nome não pode conter: \\ / : * ? " < > |';
    if (!/[\p{L}\p{N}]/u.test(b)) return 'O nome precisa ter ao menos uma letra ou número.';
    return null;
  };

  const save = async (e) => {
    e.preventDefault();
    const err = validate(value);
    if (err) { setError(err); return; }
    try {
      setSaving(true);
      setError(null);
      const updated = await renameDocument(doc.id, value.trim());
      onRenamed && onRenamed(updated);   // só atualiza a tela após confirmação do backend
      onClose && onClose();
    } catch (e2) {
      setError(e2.message || 'Não foi possível renomear o documento.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Renomear documento</h2>
          <button type="button" onClick={onClose} className="btn-close">✕</button>
        </div>
        {error && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{error}</div>}
        <form onSubmit={save} className="modal-form">
          <div className="form-group">
            <label>Nome do documento</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                autoFocus
                value={value}
                onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
                maxLength={120}
                placeholder="Ex.: Procuração - João da Silva"
                style={{ flex: 1 }}
              />
              {ext && <span style={{ color: '#64748b', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{ext}</span>}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>
              {ext
                ? `A extensão ${ext} é mantida automaticamente. O arquivo anexado não muda.`
                : 'O arquivo anexado não muda — apenas o nome exibido.'}
            </p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

// Seção de documentos reutilizável. Recebe um "scope" que vincula o documento:
//   { company_id } | { vehicle_id } | { client_id }
// Reusa as MESMAS APIs (documentsAPI + uploadsAPI) e storage por tenant.
// Exclusão direta apenas para admin (mesma regra do DELETE /api/documents).
//
// Props opcionais de categoria (todas as seções compartilham o mesmo scope no banco,
// então usamos a categoria para separar listas dentro do mesmo escopo):
//   lockedCategory     -> seção dedicada: lista só docs dessa categoria e trava o upload nela
//   excludeCategories  -> esconde docs dessas categorias (ex.: tirar "Relatório Mensal" dos docs gerais)

import React, { useState, useEffect, useCallback } from 'react';
import { getDocuments, createDocument, deleteDocument } from '../../lib/documentsAPI';
import { uploadFile } from '../../lib/uploadsAPI';
import RenameDocumentModal from './RenameDocumentModal';

export default function DocumentsSection({ scope, title = 'Documentos', subtitle = null, docTypes = [], isAdmin = false, lockedCategory = null, excludeCategories = [] }) {
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShow]  = useState(false);
  const [form, setForm]       = useState({ name: '', type: '', description: '' });
  const [file, setFile]       = useState(null);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState(null);
  const [renamingDoc, setRenamingDoc] = useState(null);
  const [renameOk, setRenameOk] = useState(false);

  const scopeKey = JSON.stringify(scope || {});

  const load = useCallback(async () => {
    if (!scope || !Object.values(scope)[0]) { setDocs([]); setLoading(false); return; }
    try {
      setLoading(true);
      const data = await getDocuments(scope);
      setDocs(data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Selecione um arquivo para anexar.'); return; }
    try {
      setSaving(true);
      setUploading(true);
      const uploaded = await uploadFile(file);
      setUploading(false);
      await createDocument({
        ...scope,
        file_url:    uploaded.url,
        file_name:   form.name || uploaded.originalName,
        file_type:   uploaded.mimeType,
        file_size:   uploaded.size,
        category:    lockedCategory || form.type || 'outros',
        description: form.description || null,
      });
      setForm({ name: '', type: '', description: '' });
      setFile(null);
      setShow(false);
      await load();
    } catch (err) { setUploading(false); setError(err.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!isAdmin) return;
    if (!confirm('Excluir documento?')) return;
    try { await deleteDocument(id); await load(); }
    catch (err) { setError(err.message); }
  };

  // Seção dedicada (lockedCategory) mostra só a sua categoria; senão, pode esconder categorias.
  const visibleDocs = lockedCategory
    ? docs.filter(d => (d.category || '') === lockedCategory)
    : (excludeCategories.length
        ? docs.filter(d => !excludeCategories.includes(d.category))
        : docs);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{subtitle || `${visibleDocs.length} documento(s)`}</p>
        </div>
        <button onClick={() => { setError(null); setShow(true); }} className="btn-primary" style={{ background: '#475569', borderColor: '#475569' }}>+ Documento</button>
      </div>

      {error && <div className="error-message" style={{ margin: '12px 18px 0', fontSize: 13 }}>{error}</div>}
      {renameOk && <div style={{ margin: '12px 18px 0', fontSize: 13, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}>Documento renomeado com sucesso.</div>}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
      ) : visibleDocs.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum documento anexado.</div>
      ) : (
        <div className="cd-doc-list" style={{ padding: 12 }}>
          {visibleDocs.map((doc) => (
            <div key={doc.id} className="cd-doc-item">
              <div className="cd-doc-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="cd-doc-info">
                {doc.file_url
                  ? <a href={doc.file_url} target="_blank" rel="noreferrer" className="cd-doc-name" style={{ color: '#751518', textDecoration: 'none' }}>{doc.file_name || 'Documento'}</a>
                  : <span className="cd-doc-name">{doc.file_name || 'Documento'}</span>}
                <span className="cd-doc-meta">
                  {doc.category && doc.category !== 'outros' && <span>{doc.category}</span>}
                  {doc.description && <span>{doc.description}</span>}
                  {doc.uploaded_at && <span>{new Date(doc.uploaded_at).toLocaleDateString('pt-BR')}</span>}
                </span>
              </div>
              <button onClick={() => setRenamingDoc(doc)} className="btn-icon" title="Renomear documento">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              {isAdmin && (
                <button onClick={() => remove(doc.id)} className="btn-icon danger" title="Excluir">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShow(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Adicionar Documento</h2>
              <button type="button" onClick={() => setShow(false)} className="btn-close">✕</button>
            </div>
            {error && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{error}</div>}
            <form onSubmit={save} className="modal-form">
              <div className="form-group">
                <label>Arquivo (PDF, JPG, PNG · máx. 10 MB)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files[0] || null)} />
              </div>
              {lockedCategory ? (
                <div className="form-group"><label>Nome/Identificação</label><input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex.: Relatório Junho/2026" /></div>
              ) : (
                <div className="form-row">
                  <div className="form-group"><label>Nome/Identificação</label><input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Opcional" /></div>
                  <div className="form-group"><label>Tipo</label>
                    {docTypes.length > 0 ? (
                      <select value={form.type} onChange={(e) => setForm(p => ({ ...p, type: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <input value={form.type} onChange={(e) => setForm(p => ({ ...p, type: e.target.value }))} placeholder="Opcional" />
                    )}
                  </div>
                </div>
              )}
              <div className="form-group"><label>Descrição</label><textarea rows={2} value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShow(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{uploading ? 'Enviando...' : saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renamingDoc && (
        <RenameDocumentModal
          doc={renamingDoc}
          onClose={() => setRenamingDoc(null)}
          onRenamed={(updated) => {
            setDocs(prev => prev.map(d => (d.id === updated.id ? { ...d, file_name: updated.file_name } : d)));
            setRenameOk(true);
            setTimeout(() => setRenameOk(false), 3500);
          }}
        />
      )}
    </div>
  );
}

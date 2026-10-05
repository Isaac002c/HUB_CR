'use client';

/* eslint-disable @next/next/no-img-element -- imagens enviadas pelos usuários têm URL dinâmica no storage do tenant */

import { useState, useEffect } from 'react';
import { getDeferred, updateDeferredImage, deleteDeferredImage } from '../lib/contractsAPI';
import { uploadFile } from '../lib/uploadsAPI';

const GREEN = '#15803d';
const DEFERRED_SEARCH_FIELDS = [
  ['vehicle_plate', 'Placa'],
  ['client_name', 'Cliente'],
  ['infraction_type', 'ART'],
  ['numero_multa', 'Auto'],
];
const fmtDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).substring(0, 10).split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : '—';
};

export default function Deferidos() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selected, setSelected] = useState(null); // modal somente leitura
  const [search, setSearch]   = useState('');
  const [searchField, setSearchField] = useState('vehicle_plate');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving]   = useState(false);
  const [imageError, setImageError] = useState('');

  const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const canManageImage = ['master','admin','supervisor','super_admin'].includes(currentUser?.role);
  const canDeleteImage = ['master','admin'].includes(currentUser?.role);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try { setLoading(true); setError(null); setItems(await getDeferred() || []); }
    catch (e) { setError('Não foi possível carregar os deferidos.'); }
    finally { setLoading(false); }
  };

  const filtered = items.filter(i => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedSearch) return true;
    return String(i[searchField] || '').toLocaleLowerCase('pt-BR').includes(normalizedSearch);
  });

  const changeImage = async (file) => {
    if (!file || !selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Use uma imagem JPG, PNG ou WEBP.');
      return;
    }
    try {
      setUploading(true); setImageError('');
      const uploaded = await uploadFile(file);
      const updated = await updateDeferredImage(selected.id, uploaded.url);
      const next = { ...selected, deferred_image_url: updated.deferred_image_url };
      setSelected(next);
      setItems((previous) => previous.map((item) => item.id === next.id ? next : item));
    } catch (err) {
      setImageError(err.message || 'Não foi possível salvar a imagem.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async () => {
    if (!selected?.deferred_image_url || removing) return;
    if (!confirm('Excluir esta imagem da vitrine? O processo deferido continuará registrado.')) return;
    try {
      setRemoving(true); setImageError('');
      await deleteDeferredImage(selected.id);
      const next = { ...selected, deferred_image_url: null };
      setSelected(next);
      setItems((previous) => previous.map((item) => item.id === next.id ? next : item));
    } catch (err) {
      setImageError(err.message || 'Não foi possível excluir a imagem.');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando deferidos...</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="ag-head">
        <div>
          <h2 className="ag-head-title">Deferidos</h2>
          <p className="ag-head-sub">Resultados favoráveis obtidos pela <strong style={{ color: GREEN }}>CR Recursos</strong>.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select aria-label="Pesquisar deferidos por" value={searchField} onChange={(event) => setSearchField(event.target.value)}
            style={{ height: 38, padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', color: '#0f172a' }}>
            {DEFERRED_SEARCH_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" aria-label="Pesquisar deferidos" placeholder="Digite sua pesquisa..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34, paddingRight: 12, height: 38, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', width: 240, color: '#0f172a' }} />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>
      )}

      <div className="ag-card">
        <div className="ag-card-head" style={{ '--accent': GREEN, '--accent-soft': '#dcfce7' }}>
          <span className="ag-card-dot" />
          <span className="ag-card-title">Processos deferidos</span>
          <span className="ag-card-count">{filtered.length}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="ag-empty">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Nenhum processo deferido encontrado.
          </div>
        ) : (
          <div className="ag-list">
            {filtered.map((it) => (
              <div key={it.id} className="ag-item" onClick={() => { setSelected(it); setImageError(''); }} role="button" tabIndex={0}>
                {it.deferred_image_url ? <img src={it.deferred_image_url} alt="Resultado deferido" style={thumbStyle} /> : <div className="ag-ava" style={{ background: '#dcfce7', color: GREEN }}>{(it.client_name || '?').charAt(0).toUpperCase()}</div>}
                <div className="ag-itembody">
                  <div className="ag-name">{it.client_name || 'Sem nome'}{it.company_id ? '  ·  Empresa' : ''}</div>
                  <div className="ag-meta">{[it.numero_multa, it.vehicle_plate, it.infraction_type && `Art. ${it.infraction_type}`, it.organ].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div className="ag-right">
                  <span className="ag-date">{fmtDate(it.due_date)}</span>
                  <span className="ag-pill" style={{ background: '#dcfce7', color: GREEN }}>Deferido</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal somente leitura */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" style={{ maxWidth: 680, maxHeight: 'calc(100vh - 28px)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{selected.client_name || 'Processo'}</h2>
                <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: GREEN, padding: '2px 10px', borderRadius: 999 }}>
                  DEFERIDO · somente leitura
                </span>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="btn-close">✕</button>
            </div>

            <div style={imageCard}>
              <div style={proofHeaderStyle}>
                <div style={proofSealStyle}>✓</div>
                <div>
                  <div style={proofEyebrowStyle}>RESULTADO OBTIDO PELA CR RECURSOS</div>
                  <strong style={{ color: '#14532d', fontSize: 14 }}>Resultado favorável documentado</strong>
                  <div style={{ color: '#5f7668', fontSize: 11, marginTop: 2 }}>Registro interno de processo acompanhado pelo escritório.</div>
                </div>
              </div>
              {selected.deferred_image_url ? (
                <a href={selected.deferred_image_url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                  <img src={selected.deferred_image_url} alt={`Resultado deferido de ${selected.client_name || 'cliente'}`} style={previewStyle} />
                </a>
              ) : (
                <div style={emptyImageStyle}>
                  <strong>Imagem do resultado deferido</strong>
                  <span>{canManageImage ? 'Adicione a imagem que será apresentada nesta vitrine.' : 'A imagem ainda não foi adicionada pela equipe responsável.'}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canManageImage && (
                  <label className="btn-secondary" style={{ alignSelf: 'flex-start', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.65 : 1 }}>
                    {uploading ? 'Enviando imagem...' : selected.deferred_image_url ? 'Substituir imagem' : '+ Adicionar imagem'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => changeImage(event.target.files?.[0])} style={{ display: 'none' }} />
                  </label>
                )}
                {canDeleteImage && selected.deferred_image_url && (
                  <button type="button" onClick={removeImage} disabled={removing}
                    style={{ alignSelf: 'flex-start', padding: '9px 13px', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', fontWeight: 600, cursor: removing ? 'wait' : 'pointer', opacity: removing ? 0.65 : 1 }}>
                    {removing ? 'Excluindo imagem...' : 'Excluir imagem'}
                  </button>
                )}
              </div>
              {imageError && <span style={{ color: '#b91c1c', fontSize: 12 }}>{imageError}</span>}
            </div>

            <div className="deferred-detail-grid">
              <div style={detailFieldStyle}><span style={detailLabelStyle}>Tipo</span>{selected.company_id ? 'Empresa' : 'Cliente'}</div>
              <div style={detailFieldStyle}><span style={detailLabelStyle}>Órgão</span>{selected.organ || '—'}</div>
              <div style={detailFieldStyle}><span style={detailLabelStyle}>Nº Auto/Processo</span>{selected.numero_multa || '—'}</div>
              <div style={detailFieldStyle}>
                <span style={detailLabelStyle}>Placa</span>{selected.vehicle_plate || '—'}
                <span style={{ ...detailLabelStyle, marginTop: 10 }}>Enquadramento</span>{selected.infraction_type || selected.notes || '—'}
              </div>
              <div style={detailFieldStyle}><span style={detailLabelStyle}>Andamento</span>Deferido</div>
              <div style={detailFieldStyle}><span style={detailLabelStyle}>Prazo</span>{fmtDate(selected.due_date)}</div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thumbStyle = { width: 46, height: 46, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: '1px solid #bbf7d0' };
const imageCard = { display: 'flex', flexDirection: 'column', gap: 12, padding: 14, margin: '0 0 18px', border: '1px solid #dbe7df', borderRadius: 12, background: '#f8fffa' };
const previewStyle = { width: '100%', maxHeight: 260, borderRadius: 9, objectFit: 'contain', background: '#0f172a' };
const emptyImageStyle = { minHeight: 108, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 16, textAlign: 'center', color: '#64748b', fontSize: 12, border: '1px dashed #a7d7b5', borderRadius: 9, background: '#fff' };
const proofHeaderStyle = { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, border: '1px solid #d1fae5', background: 'linear-gradient(90deg, #ecfdf5, #f8fffa)' };
const proofSealStyle = { width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 999, background: '#15803d', color: '#fff', fontSize: 15, fontWeight: 800 };
const proofEyebrowStyle = { color: '#15803d', fontSize: 9, letterSpacing: '.07em', fontWeight: 800, marginBottom: 2 };
const detailFieldStyle = { minWidth: 0, lineHeight: 1.45, overflowWrap: 'anywhere' };
const detailLabelStyle = { color: '#94a3b8', display: 'block', fontSize: 11, lineHeight: 1.25, marginBottom: 4 };

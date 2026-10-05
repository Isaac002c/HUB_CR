'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCompanies, createCompany, updateCompany, deleteCompany } from '../lib/companiesAPI';

const STATUS_OPTIONS = [
  { value: 'ativo',   label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
];
const STATUS_LABELS = { ativo: 'Ativo', inativo: 'Inativo' };

const EMPTY_FORM = {
  razao_social: '', nome_fantasia: '', cnpj: '', responsavel: '',
  phone: '', email: '', address: '', notes: '', status: 'ativo',
};

// Máscara CNPJ: 00.000.000/0000-00
const maskCnpj = (value) => {
  const d = (value || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};

const maskPhone = (value) => {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function MultasCompanies() {
  const router = useRouter();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formData, setFormData]   = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState(null);
  const searchDebounce            = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async (q = '') => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCompanies(q);
      setCompanies(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      if (term.length >= 2) load(term);
      else if (term.length === 0) load();
    }, 300);
  };

  const validateForm = () => {
    if (!formData.razao_social.trim()) return 'Razão social é obrigatória.';
    const digits = formData.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return 'CNPJ deve ter 14 dígitos.';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'E-mail inválido.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const v = validateForm();
    if (v) { setFormError(v); return; }
    try {
      setSaving(true);
      const payload = { ...formData, cnpj: formData.cnpj.replace(/\D/g, '') };
      if (editing) await updateCompany(editing.id, payload);
      else         await createCompany(payload);
      closeModal();
      load(searchTerm.length >= 2 ? searchTerm : '');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const openEdit = (e, c) => {
    e.stopPropagation();
    setEditing(c);
    setFormData({
      razao_social: c.razao_social || '', nome_fantasia: c.nome_fantasia || '',
      cnpj: maskCnpj(c.cnpj || ''), responsavel: c.responsavel || '',
      phone: c.phone || '', email: c.email || '', address: c.address || '',
      notes: c.notes || '', status: c.status || 'ativo',
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditing(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Excluir esta empresa? Esta ação não pode ser desfeita.')) return;
    try {
      await deleteCompany(id);
      load(searchTerm.length >= 2 ? searchTerm : '');
    } catch (err) {
      // Empresa com processos vinculados não pode ser excluída — orienta inativar
      setError(err.message);
    }
  };

  const set = (field) => (e) => {
    let value = e.target.value;
    if (field === 'cnpj')  value = maskCnpj(value);
    if (field === 'phone') value = maskPhone(value);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const displayed = companies.filter(c => !filterStatus || (c.status || 'ativo') === filterStatus);
  const ativas   = companies.filter(c => (c.status || 'ativo') === 'ativo').length;
  const inativas = companies.filter(c => c.status === 'inativo').length;

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando empresas...</p>
    </div>
  );

  return (
    <div className="clients-page">

      <div className="clients-summary">
        <div className="clients-summary-card all" onClick={() => setFilterStatus('')} style={{ cursor: 'pointer' }}>
          <span className="summary-number">{companies.length}</span>
          <span className="summary-label">Total de Empresas</span>
        </div>
        <div className="clients-summary-card fechado" onClick={() => setFilterStatus('ativo')} style={{ cursor: 'pointer' }}>
          <span className="summary-number">{ativas}</span>
          <span className="summary-label">Ativas</span>
        </div>
        <div className="clients-summary-card nego" onClick={() => setFilterStatus('inativo')} style={{ cursor: 'pointer' }}>
          <span className="summary-number">{inativas}</span>
          <span className="summary-label">Inativas</span>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button onClick={() => setError(null)} className="btn-close">✕</button>
        </div>
      )}

      <div className="clients-toolbar">
        <div className="clients-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar por razão social, fantasia, CNPJ ou placa..."
            value={searchTerm}
            onChange={handleSearch}
            className="clients-search-input"
          />
        </div>
        <div className="clients-filters">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="clients-filter-select">
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={openNew} className="btn-primary clients-new-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nova Empresa
        </button>
      </div>

      <div className="clients-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Razão Social</th>
              <th>CNPJ</th>
              <th>Responsável</th>
              <th>Telefone</th>
              <th>Status</th>
              <th style={{ width: 80 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>
                    </svg>
                    <p style={{ color: '#94a3b8' }}>
                      {filterStatus ? `Nenhuma empresa ${STATUS_LABELS[filterStatus]?.toLowerCase()}` : 'Nenhuma empresa cadastrada'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : displayed.map((c) => (
              <tr key={c.id} onClick={() => router.push(`/multas/companies/${c.id}`)} className="clickable-row">
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(117,21,24,0.1)', color: '#751518',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {c.razao_social?.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: '#0f172a', display: 'block' }}>{c.razao_social}</strong>
                      {c.nome_fantasia && <span style={{ fontSize: 12, color: '#94a3b8' }}>{c.nome_fantasia}</span>}
                    </div>
                  </div>
                </td>
                <td style={{ color: '#475569', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap' }}>{maskCnpj(c.cnpj) || '—'}</td>
                <td style={{ color: '#475569' }}>{c.responsavel || '—'}</td>
                <td style={{ color: '#475569', whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                <td>
                  <span className={`client-status-badge ${c.status === 'inativo' ? 'negociacao' : 'fechado'}`}>
                    {STATUS_LABELS[c.status] || 'Ativo'}
                  </span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="actions-cell">
                    <button onClick={(e) => openEdit(e, c)} className="btn-icon" title="Editar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={(e) => handleDelete(e, c.id)} className="btn-icon danger" title="Excluir">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  {editing ? 'Editar Empresa' : 'Nova Empresa'}
                </h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {editing ? 'Atualize os dados da empresa' : 'Preencha os dados da nova empresa'}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="btn-close">✕</button>
            </div>

            {formError && (
              <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{formError}</div>
            )}

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Razão Social *</label>
                <input type="text" value={formData.razao_social} onChange={set('razao_social')} placeholder="Razão social da empresa" required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Nome Fantasia</label>
                  <input type="text" value={formData.nome_fantasia} onChange={set('nome_fantasia')} placeholder="Nome fantasia" />
                </div>
                <div className="form-group">
                  <label>CNPJ *</label>
                  <input type="text" value={formData.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" inputMode="numeric" required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Responsável</label>
                  <input type="text" value={formData.responsavel} onChange={set('responsavel')} placeholder="Nome do responsável" />
                </div>
                <div className="form-group">
                  <label>Telefone</label>
                  <input type="text" value={formData.phone} onChange={set('phone')} placeholder="(21) 99999-0000" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>E-mail</label>
                  <input type="email" value={formData.email} onChange={set('email')} placeholder="email@empresa.com" />
                </div>
                <div className="form-group">
                  <label>Status *</label>
                  <select value={formData.status} onChange={set('status')} required>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Endereço</label>
                <input type="text" value={formData.address} onChange={set('address')} placeholder="Rua, número, bairro, cidade" />
              </div>

              <div className="form-group">
                <label>Observações</label>
                <textarea value={formData.notes} onChange={set('notes')} rows={3} placeholder="Anotações adicionais sobre a empresa..." />
              </div>

              <div className="form-actions">
                <button type="button" onClick={closeModal} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

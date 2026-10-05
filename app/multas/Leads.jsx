'use client';

import { useState, useEffect } from 'react';
import {
  getMultasLeads, createMultasLead, updateMultasLead,
  updateMultasLeadStatus, deleteMultasLead
} from '../lib/multasLeadsAPI';

// ─── Constantes ──────────────────────────────────────────────────────────

const COLUMNS = [
  {
    key:   'entrada',
    label: 'Entrada',
    color: '#64748b',
    bg:    '#f1f5f9',
    desc:  'Novos contatos',
  },
  {
    key:   'possui_defensor',
    label: 'Já Possui Defensor',
    color: '#8b5cf6',
    bg:    '#ede9fe',
    desc:  'Já tem advogado',
  },
  {
    key:   'nao_quer_defender',
    label: 'Não Quer se Defender',
    color: '#f59e0b',
    bg:    '#fef3c7',
    desc:  'Não tem interesse',
  },
  {
    key:   'negociacao',
    label: 'Em Negociação',
    color: '#3b82f6',
    bg:    '#eff6ff',
    desc:  'Em tratativa',
  },
  {
    key:   'fechado',
    label: 'Fechado',
    color: '#751518',
    bg:    'rgba(117,21,24,0.06)',
    desc:  'Contrato assinado',
  },
];

const SOURCE_OPTIONS = [
  'Indicação', 'WhatsApp', 'Instagram', 'Site', 'Google',
  'Facebook', 'Telefone', 'Presencial', 'Lista', 'Outros',
];

const BLOCKED_STATUSES = ['nao_quer_defender'];

const MOTIVO_LABELS = {
  possui_defensor:   'Nome / Contato do Defensor',
  nao_quer_defender: 'Motivo de Não Querer se Defender',
};

const EMPTY_FORM = {
  name: '', cpf: '', cnh: '', first_license_date: '',
  birth_date: '', phone: '', source: '', status: 'entrada', notes: '', motivo: '',
};

const toInputDate = (v) => (!v ? '' : v.substring(0, 10));

const formatDate = (v) => (!v ? '—' : new Date(v).toLocaleDateString('pt-BR'));

// Helpers de data — idênticos ao módulo Clientes para permitir paste
const normalizeDate = (v) => {
  if (!v) return '';
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
  const digits = s.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
};

const isoToDisplay = (v) => {
  if (!v) return '';
  const s = v.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
  return s;
};

const displayToIso = (v) => {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mSep = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mSep) return `${mSep[3]}-${mSep[2].padStart(2,'0')}-${mSep[1].padStart(2,'0')}`;
  const mRaw = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (mRaw) return `${mRaw[3]}-${mRaw[2]}-${mRaw[1]}`;
  return null;
};

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export default function MultasLeads() {
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [formError, setFormError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [formData, setFormData]   = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [selectedLead, setSelectedLead] = useState(null); // painel lateral
  const [dragOver, setDragOver]   = useState(null);
  const [searchName, setSearchName] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMultasLeads();
      setLeads(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const leadsByColumn = (key) => leads.filter(l =>
    l.status === key &&
    (!searchName || l.name?.toLowerCase().includes(searchName.toLowerCase()))
  );

  // ── Formulário ─────────────────────────────────────────────────

  const openNew = (defaultStatus = 'entrada') => {
    setEditingLead(null);
    setFormData({ ...EMPTY_FORM, status: defaultStatus });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (lead) => {
    setEditingLead(lead);
    setFormData({
      name:               lead.name               || '',
      cpf:                lead.cpf                || '',
      cnh:                lead.cnh                || '',
      first_license_date: isoToDisplay(lead.first_license_date),
      birth_date:         isoToDisplay(lead.birth_date),
      phone:              lead.phone              || '',
      source:             lead.source             || '',
      status:             lead.status             || 'entrada',
      notes:              lead.notes              || '',
      motivo:             lead.motivo             || '',
    });
    setFormError(null);
    setShowModal(true);
    setSelectedLead(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const cpfDigits = formData.cpf.replace(/\D/g, '');
    if (cpfDigits && cpfDigits.length !== 11) {
      setFormError('CPF deve ter 11 dígitos.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...formData,
        first_license_date: displayToIso(formData.first_license_date),
        birth_date:         displayToIso(formData.birth_date),
      };
      if (editingLead) {
        await updateMultasLead(editingLead.id, payload);
      } else {
        await createMultasLead(payload);
      }
      setShowModal(false);
      setFormError(null);
      setEditingLead(null);
      setFormData(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este lead?')) return;
    try {
      await deleteMultasLead(id);
      setSelectedLead(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Status change (via select ou drag) ─────────────────────────

  const changeStatus = async (id, newStatus) => {
    try {
      await updateMultasLeadStatus(id, newStatus);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────────

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('leadId', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, colKey) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    setDragOver(null);
    if (!leadId) return;
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.status !== colKey) {
      await changeStatus(leadId, colKey);
    }
  };

  const set = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando leads...</p>
    </div>
  );

  return (
    <div className="leads-page">
      {/* Header */}
      <div className="leads-header">
        <div>
          <h2 className="leads-title">Leads — Captação</h2>
          <p className="leads-sub">{leads.length} lead{leads.length !== 1 ? 's' : ''} no total</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              style={{
                paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13,
                outline: 'none', background: '#fff', width: 200,
                color: '#0f172a',
              }}
            />
          </div>
          <button className="btn-primary leads-new-btn" onClick={() => openNew()}>
            <PlusIcon /> Novo Lead
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const colLeads = leadsByColumn(col.key);
          const isDragTarget = dragOver === col.key;
          return (
            <div
              key={col.key}
              className={`kanban-col${isDragTarget ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              {/* Column header */}
              <div className="kanban-col-header">
                <div className="kanban-col-title-row">
                  <div className="kanban-col-dot" style={{ background: col.color }} />
                  <span className="kanban-col-title" style={{ color: col.color }}>{col.label}</span>
                  <span className="kanban-col-count">{colLeads.length}</span>
                </div>
                <button
                  className="kanban-add-btn"
                  onClick={() => openNew(col.key)}
                  title={`Novo lead em ${col.label}`}
                >
                  <PlusIcon />
                </button>
              </div>

              {/* Cards */}
              <div className="kanban-cards">
                {colLeads.length === 0 && (
                  <div className="kanban-empty">
                    <p>Nenhum lead aqui</p>
                  </div>
                )}
                {colLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onClick={() => setSelectedLead(lead)}
                    style={{ borderLeft: `3px solid ${col.color}` }}
                  >
                    <div className="kanban-card-name">{lead.name}</div>
                    {lead.phone && (
                      <div className="kanban-card-meta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 3h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 10.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 17z"/>
                        </svg>
                        {lead.phone}
                      </div>
                    )}
                    {lead.source && (
                      <div className="kanban-card-meta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        {lead.source}
                      </div>
                    )}
                    {lead.created_by_name && (
                      <div className="kanban-card-meta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        {lead.created_by_name}
                      </div>
                    )}
                    {BLOCKED_STATUSES.includes(lead.status) && lead.motivo && (
                      <div className="kanban-card-meta" style={{ color: col.color, fontStyle: 'italic', marginTop: 4, borderTop: `1px solid ${col.color}22`, paddingTop: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        {lead.motivo}
                      </div>
                    )}
                    <div className="kanban-card-date">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Painel lateral — detalhes do lead */}
      {selectedLead && (
        <div className="lead-panel-overlay" onClick={() => setSelectedLead(null)}>
          <div className="lead-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lead-panel-header">
              <div>
                <h3 className="lead-panel-name">{selectedLead.name}</h3>
                <span className="lead-panel-status" style={{
                  background: COLUMNS.find(c => c.key === selectedLead.status)?.bg || '#f1f5f9',
                  color: COLUMNS.find(c => c.key === selectedLead.status)?.color || '#475569',
                }}>
                  {COLUMNS.find(c => c.key === selectedLead.status)?.label || selectedLead.status}
                </span>
              </div>
              <button className="lead-panel-close" onClick={() => setSelectedLead(null)}>✕</button>
            </div>

            <div className="lead-panel-fields">
              {[
                { label: 'CPF',         value: selectedLead.cpf || '—' },
                { label: 'CNH',         value: selectedLead.cnh || '—' },
                { label: 'Nascimento',  value: formatDate(selectedLead.birth_date) },
                { label: '1ª Hab.',     value: formatDate(selectedLead.first_license_date) },
                { label: 'Telefone',    value: selectedLead.phone || '—' },
                { label: 'Origem',      value: selectedLead.source || '—' },
                { label: 'Criado por',  value: selectedLead.created_by_name || '—' },
                { label: 'Cadastrado',  value: formatDate(selectedLead.created_at) },
              ].map(({ label, value }) => (
                <div key={label} className="lead-panel-field">
                  <span className="lead-panel-field-label">{label}</span>
                  <span className="lead-panel-field-value">{value}</span>
                </div>
              ))}
              {selectedLead.notes && (
                <div className="lead-panel-field" style={{ gridColumn: '1/-1' }}>
                  <span className="lead-panel-field-label">Observações</span>
                  <span className="lead-panel-field-value" style={{ fontStyle: 'italic', color: '#64748b' }}>{selectedLead.notes}</span>
                </div>
              )}
              {BLOCKED_STATUSES.includes(selectedLead.status) && (
                <div className="lead-panel-field" style={{ gridColumn: '1/-1' }}>
                  <span className="lead-panel-field-label" style={{ color: COLUMNS.find(c => c.key === selectedLead.status)?.color }}>
                    {MOTIVO_LABELS[selectedLead.status]}
                  </span>
                  <span className="lead-panel-field-value" style={{ fontStyle: selectedLead.motivo ? 'normal' : 'italic', color: selectedLead.motivo ? '#0f172a' : '#94a3b8' }}>
                    {selectedLead.motivo || 'Não informado'}
                  </span>
                </div>
              )}
            </div>

            {/* Mover status */}
            <div className="lead-panel-section">
              <p className="lead-panel-section-title">Mover para:</p>
              <div className="lead-panel-status-btns">
                {COLUMNS.filter(c => c.key !== selectedLead.status).map((col) => (
                  <button
                    key={col.key}
                    className="lead-status-move-btn"
                    style={{ borderColor: col.color, color: col.color }}
                    onClick={async () => {
                      await changeStatus(selectedLead.id, col.key);
                      setSelectedLead(prev => ({ ...prev, status: col.key }));
                    }}
                  >
                    → {col.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lead-panel-actions">
              <button className="btn-secondary" onClick={() => openEdit(selectedLead)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar
              </button>
              <button
                className="btn-icon danger"
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13 }}
                onClick={() => handleDelete(selectedLead.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo/editar lead */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setFormError(null); }}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  {editingLead ? 'Editar Lead' : 'Novo Lead'}
                </h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {editingLead ? 'Atualize os dados do lead' : 'Cadastre um novo contato'}
                </p>
              </div>
              <button type="button" onClick={() => { setShowModal(false); setFormError(null); }} className="btn-close">✕</button>
            </div>

            {formError && (
              <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Nome completo *</label>
                <input type="text" value={formData.name} onChange={set('name')} required placeholder="Nome do contato" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CPF</label>
                  <input type="text" value={formData.cpf} onChange={set('cpf')} maxLength={14} placeholder="000.000.000-00" />
                </div>
                <div className="form-group">
                  <label>CNH</label>
                  <input type="text" value={formData.cnh} onChange={set('cnh')} placeholder="Número da CNH" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Nascimento</label>
                  <input
                    type="text"
                    value={formData.birth_date}
                    onChange={e => setFormData(prev => ({ ...prev, birth_date: normalizeDate(e.target.value) }))}
                    placeholder="ex: 01/01/2000 ou 01012000"
                  />
                </div>
                <div className="form-group">
                  <label>1ª Habilitação</label>
                  <input
                    type="text"
                    value={formData.first_license_date}
                    onChange={e => setFormData(prev => ({ ...prev, first_license_date: normalizeDate(e.target.value) }))}
                    placeholder="ex: 01/01/2000 ou 01012000"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Telefone</label>
                  <input type="text" value={formData.phone} onChange={set('phone')} placeholder="(21) 99999-0000" />
                </div>
                <div className="form-group">
                  <label>Origem</label>
                  <select value={formData.source} onChange={set('source')}>
                    <option value="">Selecione...</option>
                    {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={formData.status} onChange={set('status')}>
                  {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              {BLOCKED_STATUSES.includes(formData.status) && (
                <div className="form-group" style={{ background: COLUMNS.find(c=>c.key===formData.status)?.bg || '#f8fafc', borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLUMNS.find(c=>c.key===formData.status)?.color || '#e2e8f0'}33` }}>
                  <label style={{ color: COLUMNS.find(c=>c.key===formData.status)?.color }}>
                    {MOTIVO_LABELS[formData.status]} *
                  </label>
                  <input
                    type="text"
                    value={formData.motivo}
                    onChange={set('motivo')}
                    placeholder={formData.status === 'possui_defensor' ? 'Ex.: Dr. João Silva — (21) 99999-0000' : 'Ex.: Não quer gastar dinheiro no momento'}
                    required={BLOCKED_STATUSES.includes(formData.status)}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Observações</label>
                <textarea value={formData.notes} onChange={set('notes')} rows={2} placeholder="Informações adicionais..." />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : editingLead ? 'Salvar' : 'Criar Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

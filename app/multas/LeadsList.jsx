'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMultasLeads, createMultasLead, updateMultasLead,
  updateMultasLeadStatus, deleteMultasLead
} from '../lib/multasLeadsAPI';
import { requestDeletion } from '../lib/approvalsAPI';
import { getConsultants } from '../lib/calendarAPI';
import EventFormModal from './components/EventFormModal';

const ALL_STATUSES = [
  { value: 'entrada',           label: 'Entrada',              color: '#64748b' },
  { value: 'possui_defensor',   label: 'Já Possui Defensor',   color: '#8b5cf6' },
  { value: 'nao_quer_defender', label: 'Não Quer se Defender', color: '#f59e0b' },
  { value: 'negociacao',        label: 'Em Negociação',        color: '#3b82f6' },
  { value: 'nao_encontrado',    label: 'Não Encontrado',       color: '#ef4444' },
  { value: 'fechado',           label: 'Fechado',              color: '#751518' },
  { value: 'perdido',           label: 'Perdido',              color: '#94a3b8' },
];

const SOURCE_OPTIONS = ['Indicação','WhatsApp','Instagram','Site','Google','Facebook','Telefone','Presencial','Lista','Outros'];
const BLOCKED_STATUSES = ['nao_quer_defender'];
const MOTIVO_LABELS = { nao_quer_defender: 'Motivo de Não Querer se Defender' };

const EMPTY_FORM = {
  name:'', cpf:'', cnh:'', first_license_date:'', birth_date:'', phone:'', source:'', status:'entrada', notes:'', motivo:'', consultant_id:'',
};

const formatDate = (v) => (!v ? '—' : new Date(v).toLocaleDateString('pt-BR'));

const normalizeDate = (v) => {
  if (!v) return '';
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
  const digits = s.replace(/\D/g,'').slice(0,8);
  if (digits.length===8) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  if (digits.length<=2) return digits;
  if (digits.length<=4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
};
const isoToDisplay = (v) => {
  if (!v) return '';
  const s=v.substring(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
  return s;
};
const displayToIso = (v) => {
  if (!v||!v.trim()) return null;
  const s=v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mSep=s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mSep) return `${mSep[3]}-${mSep[2].padStart(2,'0')}-${mSep[1].padStart(2,'0')}`;
  const mRaw=s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (mRaw) return `${mRaw[3]}-${mRaw[2]}-${mRaw[1]}`;
  return null;
};

const getStatusInfo = (v) => ALL_STATUSES.find(s=>s.value===v) || { label: v, color: '#94a3b8' };
const matchesLeadSearch = (lead, value) => {
  const query = String(value || '').trim().toLocaleLowerCase('pt-BR');
  if (!query) return true;

  const searchableFields = [lead.name, lead.cpf, lead.cnh, lead.phone]
    .map(field => String(field || '').toLocaleLowerCase('pt-BR'));
  const textMatch = searchableFields.some(field => field.includes(query));
  const digitsQuery = query.replace(/\D/g, '');
  const numericQuery = /^[\d\s()+./-]+$/.test(query);
  const digitsMatch = numericQuery && digitsQuery.length > 0 && [lead.cpf, lead.cnh, lead.phone]
    .some(field => String(field || '').replace(/\D/g, '').includes(digitsQuery));

  return textMatch || digitsMatch;
};

export default function LeadsList() {
  const [leads,        setLeads]        = useState([]);
  const [consultants,  setConsultants]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [formError,    setFormError]    = useState(null);
  const [showModal,    setShowModal]    = useState(false);
  const [editingLead,  setEditingLead]  = useState(null);
  const [formData,     setFormData]     = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(null); // lead obj
  const [deleteReason,    setDeleteReason]    = useState('');
  const [deletingSolicitar, setDeletingSolicitar] = useState(false);
  const [schedulingLead,  setSchedulingLead]  = useState(null); // lead → agendamento (modal da Agenda pré-preenchido)

  const currentUser = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isAdmin = ['master','admin','super_admin'].includes(currentUser?.role);
  const canManageConsultant = ['master','supervisor'].includes(String(currentUser?.role || '').toLowerCase());

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [leadRows, consultantRows] = await Promise.all([
        getMultasLeads(),
        canManageConsultant ? getConsultants().catch(() => []) : Promise.resolve([]),
      ]);
      setLeads(leadRows || []);
      setConsultants(consultantRows || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [canManageConsultant]);

  useEffect(() => { load(); }, [load]);

  const displayed = leads.filter(l =>
    matchesLeadSearch(l, search) &&
    (!filterStatus || l.status === filterStatus)
  );

  const openNew = () => { setEditingLead(null); setFormData(EMPTY_FORM); setFormError(null); setShowModal(true); };
  const openEdit = (lead) => {
    setEditingLead(lead);
    setFormData({
      name: lead.name||'', cpf: lead.cpf||'', cnh: lead.cnh||'',
      first_license_date: isoToDisplay(lead.first_license_date),
      birth_date: isoToDisplay(lead.birth_date),
      phone: lead.phone||'', source: lead.source||'', status: lead.status||'entrada',
      notes: lead.notes||'', motivo: lead.motivo||'', consultant_id: lead.created_by||'',
    });
    setFormError(null);
    setShowModal(true);
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
      const { consultant_id, ...leadFields } = formData;
      const payload = { ...leadFields, first_license_date: displayToIso(formData.first_license_date), birth_date: displayToIso(formData.birth_date) };
      if (editingLead && canManageConsultant) payload.consultant_id = consultant_id;
      if (editingLead) { await updateMultasLead(editingLead.id, payload); }
      else             { await createMultasLead(payload); }
      setShowModal(false); setEditingLead(null); setFormData(EMPTY_FORM); setFormError(null);
      await load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateMultasLeadStatus(id, newStatus);
      setLeads(prev => prev.map(l => l.id===id ? {...l, status: newStatus} : l));
    } catch (err) { setError(err.message); }
  };

  const handleDeleteAdmin = async (id) => {
    if (!confirm('Excluir este lead definitivamente?')) return;
    try { await deleteMultasLead(id); await load(); }
    catch (err) { setError(err.message); }
  };

  const handleSolicitarExclusao = async (e) => {
    e.preventDefault();
    try {
      setDeletingSolicitar(true);
      await requestDeletion({
        target_type: 'lead', target_id: showDeleteModal.id,
        target_label: showDeleteModal.name, reason: deleteReason,
      });
      setShowDeleteModal(null); setDeleteReason('');
      alert('Solicitação enviada. Aguarde aprovação do administrador.');
    } catch (err) { setError(err.message); }
    finally { setDeletingSolicitar(false); }
  };

  const set = (f) => (e) => setFormData(p => ({ ...p, [f]: e.target.value }));

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'60px 0', flexDirection:'column', alignItems:'center', gap:14 }}>
      <div className="loading-spinner" style={{ width:32, height:32, border:'3px solid #e2e8f0', borderTopColor:'#751518' }} />
      <p style={{ color:'#94a3b8', fontSize:14 }}>Carregando leads...</p>
    </div>
  );

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
              style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Buscar por nome, CPF, CNH ou telefone..." value={search}
              onChange={e=>setSearch(e.target.value)}
              style={{ paddingLeft:34, paddingRight:12, paddingTop:8, paddingBottom:8, border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', background:'#fff', color:'#0f172a', width:200 }}
            />
          </div>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{ padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff', color:'#0f172a', outline:'none' }}>
            <option value="">Todos os status</option>
            {ALL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span style={{ fontSize:13, color:'#94a3b8' }}>{displayed.length} lead{displayed.length!==1?'s':''}</span>
        </div>
        <button className="btn-primary" onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Lead
        </button>
      </div>

      {error && (
        <div className="error-message" style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <span>{error}</span>
          <button onClick={()=>setError(null)} style={{ border:'none', background:'none', cursor:'pointer' }}>✕</button>
        </div>
      )}

      {/* Tabela */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden' }}>
        <table className="data-table" style={{ margin:0 }}>
          <thead>
            <tr>
              <th>Nome</th><th>CPF</th><th>CNH</th><th>Telefone</th>
              <th>Data de Entrada</th><th>Status</th><th>Criado por</th><th style={{width:80}}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>Nenhum lead encontrado</td></tr>
            ) : displayed.map(lead => {
              const si = getStatusInfo(lead.status);
              return (
                <tr key={lead.id}>
                  <td><strong style={{ color:'#0f172a' }}>{lead.name}</strong></td>
                  <td style={{ fontFamily:'monospace', fontSize:13, color:'#475569' }}>{lead.cpf||'—'}</td>
                  <td style={{ color:'#475569' }}>{lead.cnh||'—'}</td>
                  <td style={{ color:'#475569', whiteSpace:'nowrap' }}>{lead.phone||'—'}</td>
                  <td style={{ color:'#475569', whiteSpace:'nowrap' }}>{formatDate(lead.created_at)}</td>
                  <td>
                    <select
                      value={lead.status}
                      onChange={e=>handleStatusChange(lead.id, e.target.value)}
                      style={{ fontSize:12, padding:'3px 8px', borderRadius:6, border:`1px solid ${si.color}`, color:si.color, background:'white', cursor:'pointer', outline:'none' }}
                    >
                      {ALL_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td style={{ color:'#475569', fontSize:13 }}>{lead.created_by_name||'—'}</td>
                  <td>
                    <div className="actions-cell">
                      <button onClick={()=>setSchedulingLead(lead)} className="btn-icon" title="Agendar" style={{ color:'#751518' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          <line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
                        </svg>
                      </button>
                      <button onClick={()=>openEdit(lead)} className="btn-icon" title="Editar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      {isAdmin ? (
                        <button onClick={()=>handleDeleteAdmin(lead.id)} className="btn-icon danger" title="Excluir">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          </svg>
                        </button>
                      ) : (
                        <button onClick={()=>{ setShowDeleteModal(lead); setDeleteReason(''); }} className="btn-icon" title="Solicitar exclusão" style={{ color:'#f59e0b' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal criar/editar lead */}
      {showModal && (
        <div className="modal-overlay" onClick={()=>{ setShowModal(false); setFormError(null); }}>
          <div className="modal-content" style={{ maxWidth:520 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize:18, fontWeight:700, color:'#0f172a' }}>{editingLead?'Editar Lead':'Novo Lead'}</h2>
                <p style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{editingLead?'Atualize os dados do lead':'Cadastre um novo contato'}</p>
              </div>
              <button type="button" onClick={()=>{ setShowModal(false); setFormError(null); }} className="btn-close">✕</button>
            </div>
            {formError && (
              <div className="error-message" style={{ margin:'0 0 12px', fontSize:13 }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Nome completo *</label>
                <input type="text" value={formData.name} onChange={set('name')} required placeholder="Nome do contato" />
              </div>
              <div className="form-row">
                <div className="form-group"><label>CPF</label>
                  <input type="text" value={formData.cpf} onChange={set('cpf')} maxLength={14} placeholder="000.000.000-00" />
                </div>
                <div className="form-group"><label>CNH</label>
                  <input type="text" value={formData.cnh} onChange={set('cnh')} placeholder="Número da CNH" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Nascimento</label>
                  <input type="text" value={formData.birth_date} onChange={e=>setFormData(p=>({...p,birth_date:normalizeDate(e.target.value)}))} placeholder="ex: 01/01/2000" />
                </div>
                <div className="form-group"><label>1ª Habilitação</label>
                  <input type="text" value={formData.first_license_date} onChange={e=>setFormData(p=>({...p,first_license_date:normalizeDate(e.target.value)}))} placeholder="ex: 01/01/2000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Telefone</label>
                  <input type="text" value={formData.phone} onChange={set('phone')} placeholder="(21) 99999-0000" />
                </div>
                <div className="form-group"><label>Origem</label>
                  <select value={formData.source} onChange={set('source')}>
                    <option value="">Selecione...</option>
                    {SOURCE_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Status</label>
                <select value={formData.status} onChange={set('status')}>
                  {ALL_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {editingLead && canManageConsultant && (
                <div className="form-group"><label>Consultor responsável</label>
                  <select value={formData.consultant_id || ''} onChange={set('consultant_id')} required>
                    <option value="">Selecione...</option>
                    {editingLead.created_by && !consultants.some(consultant => consultant.id === editingLead.created_by) && (
                      <option value={editingLead.created_by}>{editingLead.created_by_name || 'Consultor atual'}</option>
                    )}
                    {consultants.map(consultant => (
                      <option key={consultant.id} value={consultant.id}>{consultant.name || 'Sem nome'}</option>
                    ))}
                  </select>
                </div>
              )}
              {BLOCKED_STATUSES.includes(formData.status) && (
                <div className="form-group" style={{ background:'#fef3c7', borderRadius:8, padding:'10px 12px', border:'1px solid #f59e0b33' }}>
                  <label style={{ color:'#d97706' }}>{MOTIVO_LABELS[formData.status]}</label>
                  <input type="text" value={formData.motivo} onChange={set('motivo')} placeholder="Ex.: Não quer gastar dinheiro no momento" />
                </div>
              )}
              <div className="form-group"><label>Observações</label>
                <textarea value={formData.notes} onChange={set('notes')} rows={2} placeholder="Informações adicionais..." />
              </div>
              <div className="form-actions">
                <button type="button" onClick={()=>setShowModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving?'Salvando...':editingLead?'Salvar':'Criar Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal solicitar exclusão */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={()=>setShowDeleteModal(null)}>
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize:16, fontWeight:700, color:'#0f172a' }}>Solicitar Exclusão</h2>
              <button onClick={()=>setShowDeleteModal(null)} className="btn-close">✕</button>
            </div>
            <form onSubmit={handleSolicitarExclusao} className="modal-form">
              <p style={{ fontSize:13, color:'#475569', marginBottom:12 }}>
                Solicitando exclusão de: <strong>{showDeleteModal.name}</strong>
              </p>
              <div className="form-group">
                <label>Motivo da exclusão</label>
                <textarea value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} rows={3} placeholder="Explique por que deseja excluir este lead..." />
              </div>
              <div className="form-actions">
                <button type="button" onClick={()=>setShowDeleteModal(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={deletingSolicitar} style={{ background:'#f59e0b', borderColor:'#f59e0b' }}>
                  {deletingSolicitar?'Enviando...':'Solicitar Exclusão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lead → Agendamento (form compartilhado da Agenda, pré-preenchido; não altera o lead) */}
      {schedulingLead && (
        <EventFormModal
          heading="Novo Agendamento"
          initialData={{
            title: schedulingLead.name || '',
            attendee_cpf: schedulingLead.cpf || '',
            attendee_cnh: schedulingLead.cnh || '',
            attendee_first_cnh: schedulingLead.first_license_date || '',
            attendee_birth_date: schedulingLead.birth_date || '',
            attendee_phone: schedulingLead.phone || '',
          }}
          onClose={() => setSchedulingLead(null)}
          onSaved={() => {
            setSchedulingLead(null);
            alert('Agendamento criado! Confira na aba Agenda.');
          }}
        />
      )}
    </div>
  );
}

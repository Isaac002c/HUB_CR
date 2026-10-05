'use client';

import { useState, useEffect } from 'react';
import {
  getKanbanLeads, createMultasLead, updateMultasLead,
  updateMultasLeadStatus, deleteMultasLead
} from '../lib/multasLeadsAPI';
import { requestDeletion } from '../lib/approvalsAPI';

// Colunas do kanban de Tarefas — sem "Entrada", com "Não Encontrado" e "Perdido"
const COLUMNS = [
  { key: 'possui_defensor',   label: 'Já Possui Defensor',   color: '#8b5cf6', bg: '#ede9fe',                   desc: 'Já tem advogado' },
  { key: 'nao_quer_defender', label: 'Não Quer se Defender', color: '#f59e0b', bg: '#fef3c7',                   desc: 'Não tem interesse' },
  { key: 'negociacao',        label: 'Em Negociação',        color: '#3b82f6', bg: '#eff6ff',                   desc: 'Em tratativa' },
  { key: 'nao_encontrado',    label: 'Não Encontrado',       color: '#ef4444', bg: 'rgba(239,68,68,0.06)',      desc: 'Não atendeu/localizado' },
  { key: 'fechado',           label: 'Fechado',              color: '#751518', bg: 'rgba(117,21,24,0.06)',      desc: 'Contrato assinado' },
  { key: 'perdido',           label: 'Perdido',              color: '#94a3b8', bg: '#f1f5f9',                   desc: 'Lead perdido' },
];

const formatDate = (v) => (!v ? '—' : new Date(v).toLocaleDateString('pt-BR'));

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

export default function Tarefas() {
  const [leads,       setLeads]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [search,      setSearch]      = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deleteReason,    setDeleteReason]    = useState('');
  const [deletingSolicitar, setDeletingSolicitar] = useState(false);

  const currentUser = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isAdmin = ['master','admin','super_admin'].includes(currentUser?.role);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true); setError(null);
      setLeads(await getKanbanLeads() || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Apenas leads que estão em colunas válidas de Tarefas
  const leadsByColumn = (key) => leads.filter(l =>
    l.status === key &&
    (!search || l.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const changeStatus = async (id, newStatus) => {
    try {
      await updateMultasLeadStatus(id, newStatus);
      setLeads(prev => prev.map(l => l.id===id ? {...l, status: newStatus} : l));
    } catch (err) { setError(err.message); }
  };

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
    if (lead && lead.status !== colKey) await changeStatus(leadId, colKey);
  };

  const handleDeleteAdmin = async (id) => {
    if (!confirm('Excluir este lead definitivamente?')) return;
    try { await deleteMultasLead(id); setSelectedLead(null); await load(); }
    catch (err) { setError(err.message); }
  };

  const handleSolicitarExclusao = async (e) => {
    e.preventDefault();
    try {
      setDeletingSolicitar(true);
      await requestDeletion({ target_type:'lead', target_id:showDeleteModal.id, target_label:showDeleteModal.name, reason:deleteReason });
      setShowDeleteModal(null); setDeleteReason('');
      alert('Solicitação enviada. Aguarde aprovação do administrador.');
    } catch (err) { setError(err.message); }
    finally { setDeletingSolicitar(false); }
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'60px 0', flexDirection:'column', alignItems:'center', gap:14 }}>
      <div className="loading-spinner" style={{ width:32, height:32, border:'3px solid #e2e8f0', borderTopColor:'#751518' }} />
      <p style={{ color:'#94a3b8', fontSize:14 }}>Carregando tarefas...</p>
    </div>
  );

  return (
    <div className="leads-page">
      <div className="leads-header">
        <div>
          <h2 className="leads-title">Tarefas</h2>
          <p className="leads-sub">{leads.filter(l=>COLUMNS.some(c=>c.key===l.status)).length} tarefa(s) ativas</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
              style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Buscar por nome..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{ paddingLeft:34, paddingRight:12, paddingTop:8, paddingBottom:8, border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:200, color:'#0f172a' }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <span>{error}</span>
          <button onClick={()=>setError(null)} style={{ border:'none', background:'none', cursor:'pointer' }}>✕</button>
        </div>
      )}

      <div className="kanban-board">
        {COLUMNS.map(col => {
          const colLeads = leadsByColumn(col.key);
          return (
            <div key={col.key}
              className={`kanban-col${dragOver===col.key?' drag-over':''}`}
              onDragOver={e=>{e.preventDefault();setDragOver(col.key);}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={e=>handleDrop(e,col.key)}
            >
              <div className="kanban-col-header">
                <div className="kanban-col-title-row">
                  <div className="kanban-col-dot" style={{ background:col.color }} />
                  <span className="kanban-col-title" style={{ color:col.color }}>{col.label}</span>
                  <span className="kanban-col-count">{colLeads.length}</span>
                </div>
              </div>
              <div className="kanban-cards">
                {colLeads.length===0 && <div className="kanban-empty"><p>Nenhum lead aqui</p></div>}
                {colLeads.map(lead=>(
                  <div key={lead.id} className="kanban-card" draggable
                    onDragStart={e=>handleDragStart(e,lead.id)}
                    onClick={()=>setSelectedLead(lead)}
                    style={{ borderLeft:`3px solid ${col.color}` }}
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
                    {lead.motivo && col.key!=='possui_defensor' && (
                      <div className="kanban-card-meta" style={{ color:col.color, fontStyle:'italic', marginTop:4, borderTop:`1px solid ${col.color}22`, paddingTop:4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        {lead.motivo}
                      </div>
                    )}
                    <div className="kanban-card-date">{new Date(lead.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Painel lateral */}
      {selectedLead && (
        <div className="lead-panel-overlay" onClick={()=>setSelectedLead(null)}>
          <div className="lead-panel" onClick={e=>e.stopPropagation()}>
            <div className="lead-panel-header">
              <div>
                <h3 className="lead-panel-name">{selectedLead.name}</h3>
                <span className="lead-panel-status" style={{
                  background: COLUMNS.find(c=>c.key===selectedLead.status)?.bg||'#f1f5f9',
                  color: COLUMNS.find(c=>c.key===selectedLead.status)?.color||'#475569',
                }}>
                  {COLUMNS.find(c=>c.key===selectedLead.status)?.label||selectedLead.status}
                </span>
              </div>
              <button className="lead-panel-close" onClick={()=>setSelectedLead(null)}>✕</button>
            </div>
            <div className="lead-panel-fields">
              {[
                { label:'CPF',        value:selectedLead.cpf||'—' },
                { label:'CNH',        value:selectedLead.cnh||'—' },
                { label:'Telefone',   value:selectedLead.phone||'—' },
                { label:'Origem',     value:selectedLead.source||'—' },
                { label:'Criado por', value:selectedLead.created_by_name||'—' },
                { label:'Cadastrado', value:formatDate(selectedLead.created_at) },
              ].map(({label,value})=>(
                <div key={label} className="lead-panel-field">
                  <span className="lead-panel-field-label">{label}</span>
                  <span className="lead-panel-field-value">{value}</span>
                </div>
              ))}
              {selectedLead.notes && (
                <div className="lead-panel-field" style={{ gridColumn:'1/-1' }}>
                  <span className="lead-panel-field-label">Observações</span>
                  <span className="lead-panel-field-value" style={{ fontStyle:'italic', color:'#64748b' }}>{selectedLead.notes}</span>
                </div>
              )}
            </div>
            <div className="lead-panel-section">
              <p className="lead-panel-section-title">Mover para:</p>
              <div className="lead-panel-status-btns">
                {COLUMNS.filter(c=>c.key!==selectedLead.status).map(col=>(
                  <button key={col.key} className="lead-status-move-btn" style={{ borderColor:col.color, color:col.color }}
                    onClick={async()=>{ await changeStatus(selectedLead.id,col.key); setSelectedLead(p=>({...p,status:col.key})); }}>
                    → {col.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="lead-panel-actions">
              {isAdmin ? (
                <button className="btn-icon danger" style={{ padding:'8px 14px', borderRadius:8, fontSize:13 }}
                  onClick={()=>handleDeleteAdmin(selectedLead.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                  Excluir
                </button>
              ) : (
                <button style={{ padding:'8px 14px', borderRadius:8, fontSize:13, background:'#fef3c7', border:'1px solid #f59e0b', color:'#d97706', cursor:'pointer' }}
                  onClick={()=>{ setShowDeleteModal(selectedLead); setDeleteReason(''); setSelectedLead(null); }}>
                  Solicitar Exclusão
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal solicitar exclusão */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={()=>setShowDeleteModal(null)}>
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize:16, fontWeight:700 }}>Solicitar Exclusão</h2>
              <button onClick={()=>setShowDeleteModal(null)} className="btn-close">✕</button>
            </div>
            <form onSubmit={handleSolicitarExclusao} className="modal-form">
              <p style={{ fontSize:13, color:'#475569', marginBottom:12 }}>
                Solicitando exclusão de: <strong>{showDeleteModal.name}</strong>
              </p>
              <div className="form-group">
                <label>Motivo da exclusão</label>
                <textarea value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} rows={3} placeholder="Explique por que deseja excluir..." />
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
    </div>
  );
}

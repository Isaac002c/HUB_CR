'use client';

// Painel de protocolos reutilizável (múltiplos protocolos por processo).
// Mesma lógica/aparência do módulo de Multas, reusando as MESMAS APIs
// (fineProtocolsAPI + uploadsAPI) e o mesmo storage por tenant — sem sistema paralelo.

import React, { useState, useEffect } from 'react';
import { listByFine, createProtocol, updateProtocol, deleteProtocol, sendProtocolEmail, getProtocolEmailHistory } from '../../lib/fineProtocolsAPI';
import { uploadFile } from '../../lib/uploadsAPI';

const formatDate = (v) => {
  if (!v) return '—';
  const s = String(v).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};
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
  const mSep = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (mSep) return `${mSep[3]}-${mSep[2].padStart(2,'0')}-${mSep[1].padStart(2,'0')}`;
  const mRaw = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (mRaw) return `${mRaw[3]}-${mRaw[2]}-${mRaw[1]}`;
  return null;
};

// Sem "Pendente" (mesma spec do módulo de multas)
const PROTOCOL_STATUS_OPTIONS = [
  { value: 'protocolado', label: 'Protocolado' },
  { value: 'concluido',   label: 'Concluído' },
  { value: 'indeferido',  label: 'Indeferido' },
];

const EMAIL_STATUS_STYLE = {
  queued: { label: 'Na fila', color: '#b45309', bg: '#fef3c7' },
  processing: { label: 'Processando', color: '#1d4ed8', bg: '#dbeafe' },
  sent: { label: 'Aceito pelo Resend', color: '#0369a1', bg: '#e0f2fe' },
  delivered: { label: 'Entregue', color: '#15803d', bg: '#dcfce7' },
  delivery_delayed: { label: 'Entrega atrasada', color: '#b45309', bg: '#ffedd5' },
  bounced: { label: 'Rejeitado', color: '#b91c1c', bg: '#fee2e2' },
  complained: { label: 'Marcado como spam', color: '#991b1b', bg: '#fee2e2' },
  suppressed: { label: 'Bloqueado', color: '#7f1d1d', bg: '#fee2e2' },
  failed: { label: 'Falhou', color: '#b91c1c', bg: '#fee2e2' },
  cancelled: { label: 'Cancelado', color: '#64748b', bg: '#f1f5f9' },
};

function ProtocolItemForm({ form, setForm, onSubmit, onCancel, submitting, uploadingId, uploadError, handleFileUpload }) {
  return (
    <div style={{ padding:'12px', background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0', marginBottom:8 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
        <div><label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:3 }}>Número</label>
          <input type="text" value={form.protocol_number||''} onChange={e=>setForm(p=>({...p,protocol_number:e.target.value}))} placeholder="Ex.: 2024/00123" style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12 }} />
        </div>
        <div><label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:3 }}>Data</label>
          <div style={{ display:'flex', gap:4 }}>
            <input type="text" value={isoToDisplay(form.protocol_date||'')} onChange={e=>setForm(p=>({...p,protocol_date:normalizeDate(e.target.value)}))} placeholder="dd/mm/aaaa" inputMode="numeric" style={{ flex:1, padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12 }} />
            <input type="date" value={displayToIso(form.protocol_date)||''} onChange={e=>setForm(p=>({...p,protocol_date: e.target.value? isoToDisplay(e.target.value):''}))} title="Calendário" aria-label="Escolher data" style={{ width:32, flexShrink:0, padding:0, border:'1px solid #e2e8f0', borderRadius:6, fontSize:12 }} />
          </div>
        </div>
        <div><label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:3 }}>Status</label>
          <select value={form.protocol_status||'protocolado'} onChange={e=>setForm(p=>({...p,protocol_status:e.target.value}))} style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, background:'#fff' }}>
            {PROTOCOL_STATUS_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:8 }}>
        <label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:3 }}>Observações</label>
        <textarea value={form.protocol_notes||''} onChange={e=>setForm(p=>({...p,protocol_notes:e.target.value}))} rows={2} placeholder="Observações..." style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, resize:'vertical' }} />
      </div>
      <div style={{ marginBottom:8 }}>
        <label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:3 }}>Anexo</label>
        {form.protocol_file_url ? (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6 }}>
            <a href={form.protocol_file_url} target="_blank" rel="noreferrer" style={{ color:'#16a34a', fontSize:12, flex:1 }}>Abrir / Baixar</a>
            <button type="button" onClick={()=>setForm(p=>({...p,protocol_file_url:''}))} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:11 }}>Remover</button>
          </div>
        ) : (
          <label style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'#fff', border:'1px dashed #cbd5e1', borderRadius:6, cursor:'pointer' }}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e=>handleFileUpload(e, setForm)} disabled={uploadingId==='uploading'} />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{uploadingId==='uploading'?'Enviando...':'Anexar PDF, JPG ou PNG (máx. 10 MB)'}</span>
          </label>
        )}
      </div>
      {uploadError && <p style={{ color:'#ef4444', fontSize:11, margin:'4px 0' }}>{uploadError}</p>}
      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
        {onCancel && <button type="button" onClick={onCancel} style={{ padding:'5px 12px', borderRadius:6, fontSize:12, background:'#fff', border:'1px solid #e2e8f0', color:'#475569', cursor:'pointer' }}>Cancelar</button>}
        <button type="button" onClick={onSubmit} disabled={submitting} style={{ padding:'5px 12px', borderRadius:6, fontSize:12, background:'#751518', border:'none', color:'#fff', cursor:'pointer' }}>
          {submitting?'Salvando...':'Salvar'}
        </button>
      </div>
    </div>
  );
}

export default function ProtocolPanel({ contract, onClose }) {
  const [protocols,     setProtocols]    = useState([]);
  const [loadingProto,  setLoadingProto] = useState(true);
  const [showAddForm,   setShowAddForm]  = useState(false);
  const [editingId,     setEditingId]    = useState(null);
  const [saving,        setSaving]       = useState(false);
  const [uploadingId,   setUploadingId]  = useState(null);
  const [uploadError,   setUploadError]  = useState('');
  const [emailingId,    setEmailingId]   = useState(null);
  const [emailFeedback, setEmailFeedback] = useState(null);
  const [emailHistory,  setEmailHistory] = useState([]);

  const emptyProto = { protocol_number:'', protocol_date:'', protocol_status:'protocolado', protocol_notes:'', protocol_file_url:'' };
  const [newForm, setNewForm] = useState(emptyProto);

  useEffect(() => {
    Promise.all([
      listByFine(contract.id).catch(() => []),
      getProtocolEmailHistory(contract.id).catch(() => []),
    ]).then(([protocolData, historyData]) => {
      setProtocols(protocolData || []);
      setEmailHistory(historyData || []);
    }).finally(() => setLoadingProto(false));
  }, [contract.id]);

  const reloadEmailHistory = () => getProtocolEmailHistory(contract.id)
    .then(data => setEmailHistory(data || []))
    .catch(() => {});

  const handleFileUpload = async (e, formSetter) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    setUploadingId('uploading');
    try {
      const up = await uploadFile(file);
      formSetter(prev => ({ ...prev, protocol_file_url: up.url }));
    } catch (err) { setUploadError(err.message); }
    finally { setUploadingId(null); }
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      const created = await createProtocol({ ...newForm, protocol_date: displayToIso(newForm.protocol_date), fine_id: contract.id });
      setProtocols(prev => [...prev, created]);
      setNewForm({ ...emptyProto });
      setShowAddForm(false);
    } catch (err) { setUploadError(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteItem = async (id) => {
    if (!confirm('Excluir este protocolo?')) return;
    try {
      await deleteProtocol(id);
      setProtocols(prev => prev.filter(p => p.id!==id));
    } catch (err) { setUploadError(err.message); }
  };

  const handleSendEmail = async (protoId) => {
    setEmailFeedback(null);
    setEmailingId(protoId);
    try {
      const r = await sendProtocolEmail(protoId);
      const msg = r?.duplicate
        ? `Este protocolo já possui um envio registrado (${EMAIL_STATUS_STYLE[r.status]?.label || r.status}).`
        : `E-mail enfileirado para ${r?.queued_for || 'o cliente'}. A entrega será atualizada aqui.`;
      setEmailFeedback({ id: protoId, type: 'success', msg });
      await reloadEmailHistory();
    } catch (err) {
      setEmailFeedback({ id: protoId, type: 'error', msg: err.message || 'Falha ao enviar o e-mail.' });
    } finally {
      setEmailingId(null);
    }
  };

  const hasLegacy = !!(contract.protocol_number || contract.protocol_date || contract.protocol_file_url);

  return (
    <div className="cd-protocol-panel">
      <div className="cd-protocol-header">
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#751518" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span className="cd-protocol-title">Protocolos</span>
          <span style={{ fontSize:11, color:'#94a3b8', background:'#f1f5f9', borderRadius:10, padding:'1px 7px' }}>
            {protocols.length + (hasLegacy ? 1 : 0)}
          </span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button type="button" onClick={()=>setShowAddForm(v=>!v)} style={{ padding:'4px 10px', borderRadius:6, fontSize:11, background:'#751518', border:'none', color:'#fff', cursor:'pointer' }}>
            + Adicionar
          </button>
          {onClose && <button className="cd-protocol-close" onClick={onClose}>✕</button>}
        </div>
      </div>

      <div style={{ padding:'8px 12px' }}>
        {loadingProto ? (
          <p style={{ fontSize:12, color:'#94a3b8', textAlign:'center', padding:'12px 0' }}>Carregando...</p>
        ) : (
          <>
            {showAddForm && (
              <ProtocolItemForm
                form={newForm} setForm={setNewForm}
                onSubmit={handleAdd} onCancel={()=>setShowAddForm(false)}
                submitting={saving}
                uploadingId={uploadingId} uploadError={uploadError} handleFileUpload={handleFileUpload}
              />
            )}

            {hasLegacy && (
              <div style={{ padding:'10px 12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'#92400e' }}>Protocolo legado</span>
                  <span style={{ fontSize:10, color:'#b45309' }}>somente leitura</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, fontSize:12, color:'#475569' }}>
                  <div><strong>Nº:</strong> {contract.protocol_number||'—'}</div>
                  <div><strong>Data:</strong> {formatDate(contract.protocol_date)}</div>
                  <div><strong>Status:</strong> {contract.protocol_status||'—'}</div>
                </div>
                {contract.protocol_notes && <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>{contract.protocol_notes}</div>}
                {contract.protocol_file_url && (
                  <a href={contract.protocol_file_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#92400e', display:'block', marginTop:4 }}>Abrir anexo legado</a>
                )}
              </div>
            )}

            {protocols.map(proto => (
              <div key={proto.id} style={{ padding:'10px 12px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:8 }}>
                {editingId === proto.id ? (
                  <ProtocolItemForm
                    form={proto}
                    setForm={updater => setProtocols(prev => prev.map(p =>
                      p.id === proto.id ? (typeof updater === 'function' ? updater(p) : { ...p, ...updater }) : p
                    ))}
                    onSubmit={async()=>{
                      const current = protocols.find(p=>p.id===proto.id) || proto;
                      setSaving(true);
                      try {
                        const updated = await updateProtocol(current.id, { ...current, protocol_date: displayToIso(current.protocol_date) });
                        setProtocols(prev => prev.map(p=>p.id===current.id ? updated : p));
                        setEditingId(null);
                      } catch (err) { setUploadError(err.message); }
                      finally { setSaving(false); }
                    }}
                    onCancel={()=>setEditingId(null)}
                    submitting={saving}
                    uploadingId={uploadingId} uploadError={uploadError} handleFileUpload={handleFileUpload}
                  />
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, fontSize:12, color:'#475569', marginBottom:6 }}>
                      <div><strong>Nº:</strong> {proto.protocol_number||'—'}</div>
                      <div><strong>Data:</strong> {formatDate(proto.protocol_date)}</div>
                      <div><strong>Status:</strong> {PROTOCOL_STATUS_OPTIONS.find(o=>o.value===proto.protocol_status)?.label || proto.protocol_status}</div>
                    </div>
                    {proto.protocol_notes && <div style={{ fontSize:12, color:'#64748b', marginBottom:6 }}>{proto.protocol_notes}</div>}
                    {proto.protocol_file_url && (
                      <a href={proto.protocol_file_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#16a34a', display:'block', marginBottom:6 }}>Abrir / Baixar anexo</a>
                    )}
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button type="button" onClick={()=>setEditingId(proto.id)} style={{ padding:'3px 10px', borderRadius:5, fontSize:11, background:'#f1f5f9', border:'none', color:'#475569', cursor:'pointer' }}>Editar</button>
                      {proto.protocol_file_url && (
                        <button type="button" disabled={emailingId===proto.id} onClick={()=>handleSendEmail(proto.id)} title="Enviar protocolo por e-mail ao cliente" style={{ padding:'3px 10px', borderRadius:5, fontSize:11, background:'#751518', border:'none', color:'#fff', cursor: emailingId===proto.id?'wait':'pointer', opacity: emailingId===proto.id?0.7:1 }}>
                          {emailingId===proto.id ? 'Enfileirando...' : 'Enviar por e-mail'}
                        </button>
                      )}
                      <button type="button" onClick={()=>handleDeleteItem(proto.id)} style={{ padding:'3px 10px', borderRadius:5, fontSize:11, background:'#fee2e2', border:'none', color:'#991b1b', cursor:'pointer' }}>Excluir</button>
                    </div>
                    {emailFeedback?.id===proto.id && (
                      <div style={{ marginTop:6, fontSize:11, fontWeight:600, color: emailFeedback.type==='success' ? '#15803d' : '#b91c1c' }}>
                        {emailFeedback.msg}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {protocols.length === 0 && !hasLegacy && !showAddForm && (
              <p style={{ fontSize:12, color:'#94a3b8', textAlign:'center', padding:'16px 0' }}>
                Nenhum protocolo cadastrado. Clique em &quot;+ Adicionar&quot;.
              </p>
            )}

            {emailHistory.length > 0 && (
              <div style={{ marginTop:12, borderTop:'1px solid #e2e8f0', paddingTop:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#334155', marginBottom:8 }}>Histórico de e-mails do processo</div>
                <div style={{ display:'grid', gap:6 }}>
                  {emailHistory.slice(0, 12).map(event => {
                    const style = EMAIL_STATUS_STYLE[event.status] || EMAIL_STATUS_STYLE.queued;
                    return (
                      <div key={event.id} style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', flexWrap:'wrap' }}>
                        <div style={{ minWidth:180 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'#334155' }}>{event.message}</div>
                          <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{new Date(event.provider_created_at || event.created_at).toLocaleString('pt-BR')}</div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, color:style.color, background:style.bg, borderRadius:12, padding:'3px 8px' }}>{style.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

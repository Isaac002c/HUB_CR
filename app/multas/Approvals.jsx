'use client';

import { useState, useEffect, useCallback } from 'react';
import { listApprovals, approveRequest, rejectRequest, archiveOldLeads } from '../lib/approvalsAPI';

const STATUS_LABELS = { pending:'Pendente', approved:'Aprovado', rejected:'Recusado' };
const STATUS_COLORS = {
  pending:  { bg:'#fef3c7', color:'#d97706' },
  approved: { bg:'#dcfce7', color:'#15803d' },
  rejected: { bg:'#fee2e2', color:'#991b1b' },
};
const TYPE_LABELS = { lead:'Lead', client:'Cliente', contract:'Contrato/Serviço', document:'Documento' };

const formatDate = (v) => (!v ? '—' : new Date(v).toLocaleString('pt-BR'));

export default function Approvals() {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [filter,   setFilter]   = useState('pending');
  const [acting,   setActing]   = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState(null);

  const currentUser = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const canReview = ['master','supervisor','super_admin'].includes(currentUser?.role);
  const canArchive = ['master','super_admin'].includes(currentUser?.role);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      setItems(await listApprovals(filter || null) || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { if (canReview) load(); }, [canReview, load]);

  const handleApprove = async (id) => {
    if (!confirm('Aprovar esta solicitação e executar a exclusão?')) return;
    try {
      setActing(id);
      await approveRequest(id);
      await load();
    } catch (err) { setError(err.message); }
    finally { setActing(null); }
  };

  const handleReject = async (id) => {
    if (!confirm('Recusar esta solicitação?')) return;
    try {
      setActing(id);
      await rejectRequest(id);
      await load();
    } catch (err) { setError(err.message); }
    finally { setActing(null); }
  };

  const handleArchive = async () => {
    if (!confirm('Arquivar leads antigos?\n\n• Negociação → mais de 30 dias\n• Demais status → mais de 7 dias\n\nEsta ação é reversível apenas manualmente no banco.')) return;
    try {
      setArchiving(true);
      const result = await archiveOldLeads();
      setArchiveResult(`${result?.length ?? 0} lead(s) arquivados.`);
    } catch (err) { setError(err.message); }
    finally { setArchiving(false); }
  };

  if (!canReview) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'80px 0', gap:16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <p style={{ color:'#94a3b8', fontSize:15 }}>Acesso restrito ao Master e à supervisão responsável.</p>
      </div>
    );
  }

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* Header + Arquivar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={filter} onChange={e=>setFilter(e.target.value)}
            style={{ padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff', color:'#0f172a', outline:'none' }}>
            <option value="">Todas</option>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Recusadas</option>
          </select>
          <span style={{ fontSize:13, color:'#94a3b8' }}>{items.length} solicitação(ões)</span>
        </div>
        {canArchive && (
          <button onClick={handleArchive} disabled={archiving}
            style={{ padding:'8px 16px', borderRadius:8, fontSize:13, background:'#fff', border:'1px solid #e2e8f0', color:'#475569', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
            {archiving ? 'Arquivando...' : 'Arquivar Leads Antigos'}
          </button>
        )}
      </div>

      {archiveResult && (
        <div style={{ padding:'10px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, marginBottom:16, fontSize:13, color:'#15803d', display:'flex', justifyContent:'space-between' }}>
          {archiveResult}
          <button onClick={()=>setArchiveResult(null)} style={{ border:'none', background:'none', cursor:'pointer' }}>✕</button>
        </div>
      )}

      {error && (
        <div className="error-message" style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <span>{error}</span>
          <button onClick={()=>setError(null)} style={{ border:'none', background:'none', cursor:'pointer' }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}>
          <div className="loading-spinner" style={{ width:28, height:28, border:'3px solid #e2e8f0', borderTopColor:'#751518' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom:12 }}>
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <p>Nenhuma solicitação {filter === 'pending' ? 'pendente' : ''}</p>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden' }}>
          <table className="data-table" style={{ margin:0 }}>
            <thead>
              <tr>
                <th>Solicitado por</th>
                <th>Tipo</th>
                <th>Item</th>
                <th>Motivo</th>
                <th>Data</th>
                <th>Status</th>
                <th style={{ width:140 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
                return (
                  <tr key={item.id}>
                    <td style={{ color:'#0f172a' }}>
                      <strong>{item.requester_name || '—'}</strong>
                      {item.requester_email && <div style={{ fontSize:11, color:'#94a3b8' }}>{item.requester_email}</div>}
                    </td>
                    <td style={{ fontSize:13, color:'#475569' }}>{TYPE_LABELS[item.target_type] || item.target_type}</td>
                    <td style={{ color:'#0f172a', fontWeight:500 }}>{item.target_label || item.target_id}</td>
                    <td style={{ color:'#64748b', fontSize:13, maxWidth:200 }}>
                      <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.reason || '—'}
                      </span>
                    </td>
                    <td style={{ color:'#475569', fontSize:12, whiteSpace:'nowrap' }}>{formatDate(item.created_at)}</td>
                    <td>
                      <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:sc.bg, color:sc.color }}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                      {item.status !== 'pending' && item.reviewer_name && (
                        <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>por {item.reviewer_name}</div>
                      )}
                    </td>
                    <td>
                      {item.status === 'pending' && (
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>handleApprove(item.id)} disabled={acting===item.id}
                            style={{ padding:'5px 10px', borderRadius:6, fontSize:12, fontWeight:600, background:'#dcfce7', border:'1px solid #bbf7d0', color:'#15803d', cursor:'pointer' }}>
                            {acting===item.id ? '...' : 'Aprovar'}
                          </button>
                          <button onClick={()=>handleReject(item.id)} disabled={acting===item.id}
                            style={{ padding:'5px 10px', borderRadius:6, fontSize:12, fontWeight:600, background:'#fee2e2', border:'1px solid #fecaca', color:'#991b1b', cursor:'pointer' }}>
                            {acting===item.id ? '...' : 'Recusar'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

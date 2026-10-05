'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getCompanyById, updateCompany,
  getVehicles, setVehicleStatus, deleteVehicle,
  getVehicleFineCounts, getUnlinkedFines, linkFineToVehicle,
} from '../../../lib/companiesAPI';
import {
  formatDate, getPrazoStyle, getStatusStyle, getStatusLabel, maskCnpj, maskCpfCnpj,
} from '../../../lib/processConstants';
import DocumentsSection from '../../components/DocumentsSection';
import VehicleFormModal from '../../components/VehicleFormModal';

// ─── Helpers locais ───────────────────────────────────────────────────────────
const maskPhone = (value) => {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const COMPANY_DOC_TYPES = ['Contrato Social', 'Cartão CNPJ', 'Procuração', 'Contrato de Prestação', 'Comprovante', 'Outros'];
// Categoria reservada aos relatórios mensais — fica numa seção própria, separada dos documentos gerais.
const RELATORIO_MENSAL_CAT = 'Relatório Mensal';

export default function CompanyDetail() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id;

  const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isAdmin = ['master','admin','super_admin'].includes(currentUser?.role);

  const [company, setCompany]   = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [fineCounts, setFineCounts] = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Modais
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState({});
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Processos sem veículo vinculado (carregados sob demanda)
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [unlinked, setUnlinked] = useState([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [linkTarget, setLinkTarget] = useState({}); // fineId -> vehicleId selecionado
  const [linkingId, setLinkingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [c, v, counts] = await Promise.all([
        getCompanyById(companyId),
        getVehicles(companyId).catch(() => []),
        getVehicleFineCounts(companyId).catch(() => ({})),
      ]);
      setCompany(c);
      setVehicles(v || []);
      setFineCounts(counts || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const loadUnlinked = useCallback(async () => {
    setLoadingUnlinked(true);
    try { setUnlinked(await getUnlinkedFines(companyId) || []); }
    catch (err) { setError(err.message); }
    finally { setLoadingUnlinked(false); }
  }, [companyId]);

  const toggleUnlinked = () => {
    const next = !showUnlinked;
    setShowUnlinked(next);
    if (next && unlinked.length === 0) loadUnlinked();
  };

  const doLink = async (fineId) => {
    const vid = linkTarget[fineId];
    if (!vid) { setError('Selecione um veículo para vincular.'); return; }
    if (!confirm('Vincular este processo ao veículo selecionado? Apenas o vínculo será preenchido — prazos, protocolos e documentos não mudam.')) return;
    setLinkingId(fineId);
    try {
      await linkFineToVehicle(companyId, vid, fineId);
      await Promise.all([loadUnlinked(), load()]);
    } catch (err) { setError(err.message); }
    finally { setLinkingId(null); }
  };

  // ── Empresa ──
  const setC = (field) => (e) => {
    let v = e.target.value;
    if (field === 'cnpj') v = maskCnpj(v);
    if (field === 'phone') v = maskPhone(v);
    setCompanyForm(prev => ({ ...prev, [field]: v }));
  };
  const openCompanyEdit = () => {
    setCompanyForm({
      razao_social: company.razao_social || '', nome_fantasia: company.nome_fantasia || '',
      cnpj: maskCnpj(company.cnpj || ''), responsavel: company.responsavel || '',
      phone: company.phone || '', email: company.email || '', address: company.address || '',
      notes: company.notes || '', status: company.status || 'ativo',
    });
    setModalError(null);
    setShowCompanyModal(true);
  };
  const saveCompany = async (e) => {
    e.preventDefault();
    setModalError(null);
    if (!companyForm.razao_social?.trim()) { setModalError('Razão social é obrigatória.'); return; }
    if ((companyForm.cnpj || '').replace(/\D/g, '').length !== 14) { setModalError('CNPJ deve ter 14 dígitos.'); return; }
    try {
      setSaving(true);
      await updateCompany(companyId, { ...companyForm, cnpj: companyForm.cnpj.replace(/\D/g, '') });
      setShowCompanyModal(false);
      load();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  // ── Veículos ──
  const openVehicleNew = () => { setEditingVehicle(null); setShowVehicleModal(true); };
  const openVehicleEdit = (v) => { setEditingVehicle(v); setShowVehicleModal(true); };
  const onVehicleSaved = () => { setShowVehicleModal(false); load(); };
  const toggleVehicleStatus = async (v) => {
    try { await setVehicleStatus(companyId, v.id, v.status === 'inativo' ? 'ativo' : 'inativo'); load(); }
    catch (err) { setError(err.message); }
  };
  const removeVehicle = async (v) => {
    if (!confirm('Excluir este veículo?')) return;
    try { await deleteVehicle(companyId, v.id); load(); }
    catch (err) { setError(err.message); } // bloqueado se houver processo vinculado
  };

  const goToVehicle = (vid) => router.push(`/multas/companies/${companyId}/vehicles/${vid}`);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando empresa...</p>
    </div>
  );
  if (!company) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
      Empresa não encontrada. <button className="btn-secondary" onClick={() => router.push('/dashboard?module=multas&tab=companies')}>Voltar</button>
    </div>
  );

  return (
    <div className="client-detail-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Voltar + cabeçalho */}
      <div>
        <button onClick={() => router.push('/dashboard?module=multas&tab=companies')} className="btn-secondary" style={{ marginBottom: 14 }}>
          ← Empresas
        </button>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(117,21,24,0.1)', color: '#751518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
            {company.razao_social?.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{company.razao_social}</h1>
              <span className={`client-status-badge ${company.status === 'inativo' ? 'negociacao' : 'fechado'}`}>
                {company.status === 'inativo' ? 'Inativo' : 'Ativo'}
              </span>
            </div>
            {company.nome_fantasia && <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>{company.nome_fantasia}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 12, fontSize: 13, color: '#475569' }}>
              <div><strong>CNPJ:</strong> {maskCnpj(company.cnpj) || '—'}</div>
              <div><strong>Responsável:</strong> {company.responsavel || '—'}</div>
              <div><strong>Telefone:</strong> {company.phone || '—'}</div>
              <div><strong>E-mail:</strong> {company.email || '—'}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong>Endereço:</strong> {company.address || '—'}</div>
              {company.notes && <div style={{ gridColumn: '1 / -1' }}><strong>Obs.:</strong> {company.notes}</div>}
            </div>
          </div>
          <button onClick={openCompanyEdit} className="btn-primary">Editar empresa</button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button onClick={() => setError(null)} className="btn-close">✕</button>
        </div>
      )}

      {/* Veículos */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Veículos / Frota</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{vehicles.length} veículo(s) · clique na placa para ver os processos</p>
          </div>
          <button onClick={openVehicleNew} className="btn-primary">+ Veículo</button>
        </div>
        {vehicles.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum veículo cadastrado.</div>
        ) : (
          <table className="data-table" style={{ border: 'none', borderRadius: 0 }}>
            <thead>
              <tr><th>Placa</th><th>RENAVAM</th><th>CPF/CNPJ</th><th>Processos</th><th>Condutor</th><th>Status</th><th style={{ width: 110 }}>Ações</th></tr>
            </thead>
            <tbody>
              {vehicles.map(v => (
                <tr key={v.id} style={v.status === 'inativo' ? { opacity: 0.55 } : undefined}>
                  <td>
                    <button onClick={() => goToVehicle(v.id)} title="Abrir veículo"
                      style={{ fontFamily: 'monospace', fontWeight: 700, color: '#751518', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, textDecoration: 'underline' }}>
                      {v.plate || '—'}
                    </button>
                  </td>
                  <td style={{ color: '#475569' }}>{v.renavam || '—'}</td>
                  <td style={{ color: '#475569' }}>{maskCpfCnpj(v.owner_document) || '—'}</td>
                  <td>
                    <span style={{ display: 'inline-block', minWidth: 24, textAlign: 'center', background: '#f1f5f9', color: '#475569', borderRadius: 10, padding: '1px 9px', fontSize: 12, fontWeight: 600 }}>
                      {fineCounts[v.id] || 0}
                    </span>
                  </td>
                  <td>{v.driver_name || '—'}</td>
                  <td><span className={`client-status-badge ${v.status === 'inativo' ? 'negociacao' : 'fechado'}`}>{v.status === 'inativo' ? 'Inativo' : 'Ativo'}</span></td>
                  <td>
                    <div className="actions-cell">
                      <button onClick={() => goToVehicle(v.id)} className="btn-icon" title="Abrir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                      <button onClick={() => openVehicleEdit(v)} className="btn-icon" title="Editar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => toggleVehicleStatus(v)} className="btn-icon" title={v.status === 'inativo' ? 'Ativar' : 'Inativar'}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                      </button>
                      <button onClick={() => removeVehicle(v)} className="btn-icon danger" title="Excluir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Documentos da Empresa */}
      <DocumentsSection scope={{ company_id: companyId }} title="Documentos da Empresa" docTypes={COMPANY_DOC_TYPES} excludeCategories={[RELATORIO_MENSAL_CAT]} isAdmin={isAdmin} />

      {/* Processos sem veículo vinculado (sob demanda, fechado por padrão) */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <button onClick={toggleUnlinked} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Processos sem veículo vinculado</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Processos da empresa sem placa cadastrada / sem vínculo formal — vincule manualmente</p>
          </div>
          <span style={{ fontSize: 18, color: '#94a3b8' }}>{showUnlinked ? '▾' : '▸'}</span>
        </button>
        {showUnlinked && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {loadingUnlinked ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
            ) : unlinked.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum processo sem vínculo. 🎉</div>
            ) : (
              <table className="data-table" style={{ border: 'none', borderRadius: 0 }}>
                <thead>
                  <tr><th>Nº Auto/Processo</th><th>Placa</th><th>Prazo</th><th>Andamento</th><th>Vincular ao veículo</th></tr>
                </thead>
                <tbody>
                  {unlinked.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.numero_multa || '—'}</td>
                      <td>{f.vehicle_plate || <span style={{ color: '#ef4444' }}>sem placa</span>}</td>
                      <td style={{ fontSize: 13, ...getPrazoStyle(f.due_date) }}>{formatDate(f.due_date)}</td>
                      <td><span className="service-status-badge" style={getStatusStyle(f.status)}>{getStatusLabel(f.status)}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select value={linkTarget[f.id] || ''} onChange={e => setLinkTarget(p => ({ ...p, [f.id]: e.target.value }))} style={{ padding: '4px 6px', fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <option value="">Selecione...</option>
                            {vehicles.filter(v => v.status !== 'inativo').map(v => <option key={v.id} value={v.id}>{v.plate || '(sem placa)'}</option>)}
                          </select>
                          <button onClick={() => doLink(f.id)} disabled={linkingId === f.id} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
                            {linkingId === f.id ? '...' : 'Vincular'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Relatórios Mensais — anexo do relatório que a empresa monta/envia todo mês (fica salvo no sistema) */}
      <DocumentsSection
        scope={{ company_id: companyId }}
        title="Relatórios Mensais"
        subtitle="Anexe aqui o relatório de cada mês — fica salvo no sistema"
        lockedCategory={RELATORIO_MENSAL_CAT}
        isAdmin={isAdmin}
      />

      {/* Modal Empresa */}
      {showCompanyModal && (
        <div className="modal-overlay" onClick={() => setShowCompanyModal(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Editar Empresa</h2>
              <button type="button" onClick={() => setShowCompanyModal(false)} className="btn-close">✕</button>
            </div>
            {modalError && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{modalError}</div>}
            <form onSubmit={saveCompany} className="modal-form">
              <div className="form-group"><label>Razão Social *</label><input value={companyForm.razao_social || ''} onChange={setC('razao_social')} required /></div>
              <div className="form-row">
                <div className="form-group"><label>Nome Fantasia</label><input value={companyForm.nome_fantasia || ''} onChange={setC('nome_fantasia')} /></div>
                <div className="form-group"><label>CNPJ *</label><input value={companyForm.cnpj || ''} onChange={setC('cnpj')} inputMode="numeric" required /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Responsável</label><input value={companyForm.responsavel || ''} onChange={setC('responsavel')} /></div>
                <div className="form-group"><label>Telefone</label><input value={companyForm.phone || ''} onChange={setC('phone')} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>E-mail</label><input type="email" value={companyForm.email || ''} onChange={setC('email')} /></div>
                <div className="form-group"><label>Status *</label>
                  <select value={companyForm.status || 'ativo'} onChange={setC('status')}>
                    <option value="ativo">Ativo</option><option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Endereço</label><input value={companyForm.address || ''} onChange={setC('address')} /></div>
              <div className="form-group"><label>Observações</label><textarea rows={2} value={companyForm.notes || ''} onChange={setC('notes')} /></div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCompanyModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Veículo (componente compartilhado) */}
      {showVehicleModal && (
        <VehicleFormModal
          companyId={companyId}
          vehicle={editingVehicle}
          onClose={() => setShowVehicleModal(false)}
          onSaved={onVehicleSaved}
        />
      )}

    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getCompanyById, getVehicleById, getVehicleFines, linkFineToVehicle,
} from '../../../../../lib/companiesAPI';
import { createContract, updateContract, deleteContract } from '../../../../../lib/contractsAPI';
import { getServiceTypes } from '../../../../../lib/servicesAPI';
import {
  STATUS_OPTIONS, getStatusStyle, getStatusLabel, getOrganOptions,
  formatDate, getPrazoStyle, filterVehicleServiceTypes, filterStatusOptionsForRole, isBusinessDay,
} from '../../../../../lib/processConstants';
import ProtocolPanel from '../../../../components/ProtocolPanel';
import DocumentsSection from '../../../../components/DocumentsSection';
import VehicleFormModal from '../../../../components/VehicleFormModal';

const PAGE = 25;
const VEHICLE_DOC_TYPES = ['CRLV', 'CRV / DUT', 'Comprovante', 'Procuração', 'Nota Fiscal', 'Outros'];
const EMPTY_PROC = { service_id: '', numero_multa: '', real_infractor_name: '', infraction_type: '', organ: '', status: 'APRS DEFESA PREVIA', due_date: '', notes: '' };

// Prazo copia-e-cola: o estado guarda o texto exibido (dd/mm/aaaa); converte p/ ISO só ao salvar
// (sem new Date → timezone-safe). Mesmo comportamento do campo Prazo em clients/[id].
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
  const s = String(v).substring(0, 10);
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

export default function VehicleDetail() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id;
  const vehicleId = params.vid;

  const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isAdmin = ['master','admin','super_admin'].includes(currentUser?.role);

  const [company, setCompany] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Processos
  const [fines, setFines] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loadingFines, setLoadingFines] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [linkingId, setLinkingId] = useState(null);

  // Modais
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showProcModal, setShowProcModal] = useState(false);
  const [editingProc, setEditingProc] = useState(null);
  const [procForm, setProcForm] = useState(EMPTY_PROC);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  const allowedServiceTypes = filterVehicleServiceTypes(serviceTypes);
  const processStatusOptions = filterStatusOptionsForRole(STATUS_OPTIONS, currentUser?.role);
  const selectedProcessType = allowedServiceTypes.find((service) => String(service.id) === String(procForm.service_id));
  const isTriProcess = String(selectedProcessType?.code || '').toUpperCase() === 'TRI';
  const defaultServiceId = () => {
    const multa = allowedServiceTypes.find(s => (s.code || '').toUpperCase() === 'MULTA');
    return multa ? String(multa.id) : (allowedServiceTypes[0] ? String(allowedServiceTypes[0].id) : '');
  };

  const fetchFines = useCallback(async (status, reset) => {
    setLoadingFines(true);
    const off = reset ? 0 : offset;
    try {
      const res = await getVehicleFines(companyId, vehicleId, { status, limit: PAGE, offset: off });
      setTotal(res.total || 0);
      setFines(prev => reset ? (res.items || []) : [...prev, ...(res.items || [])]);
      setOffset(off + PAGE);
    } catch (err) { setError(err.message); }
    finally { setLoadingFines(false); }
  }, [companyId, vehicleId, offset]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [v, c, st] = await Promise.all([
        getVehicleById(companyId, vehicleId),
        getCompanyById(companyId).catch(() => null),
        getServiceTypes().catch(() => []),
      ]);
      setVehicle(v);
      setCompany(c);
      setServiceTypes(st || []);
      await fetchFines('', true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, vehicleId]);

  useEffect(() => { load(); }, [load]);

  const onFilterChange = (val) => { setStatusFilter(val); fetchFines(val, true); };

  // ── Processos ──
  const openProcNew = () => {
    setEditingProc(null);
    setProcForm({ ...EMPTY_PROC, service_id: defaultServiceId(), status: 'APRS DEFESA PREVIA' });
    setModalError(null);
    setShowProcModal(true);
  };
  const openProcEdit = (f) => {
    setEditingProc(f);
    setProcForm({
      service_id: String(f.service_id || defaultServiceId()),
      numero_multa: f.numero_multa || '',
      real_infractor_name: f.real_infractor_name || '',
      infraction_type: f.infraction_type || '',
      organ: f.organ || '',
      status: f.status || 'APRS DEFESA PREVIA',
      due_date: isoToDisplay(f.due_date),
      notes: f.notes || '',
    });
    setModalError(null);
    setShowProcModal(true);
  };
  const saveProc = async (e) => {
    e.preventDefault();
    setModalError(null);
    if (!procForm.service_id) { setModalError('Selecione o tipo de serviço.'); return; }
    if (!procForm.status)     { setModalError('Selecione o andamento.'); return; }
    if (isTriProcess && !procForm.numero_multa.trim()) { setModalError('Informe o número do Auto de Infração.'); return; }
    if (isTriProcess && !procForm.real_infractor_name.trim()) { setModalError('Informe o nome do real infrator.'); return; }
    const dueDate = displayToIso(procForm.due_date);
    if (procForm.due_date && !dueDate) { setModalError('Informe um prazo válido.'); return; }
    if (dueDate && !isBusinessDay(dueDate)) {
      setModalError('O prazo deve ser salvo em dia útil (segunda a sexta-feira). Escolha o próximo dia útil.');
      return;
    }
    const payload = {
      company_id: vehicle.company_id,
      vehicle_id: vehicleId,
      vehicle_plate: vehicle.plate,
      service_id: procForm.service_id,
      numero_multa: procForm.numero_multa,
      real_infractor_name: procForm.real_infractor_name.trim() || null,
      infraction_type: procForm.infraction_type.trim() || null,
      organ: procForm.organ || null,
      status: procForm.status,
      due_date: dueDate,
      notes: procForm.notes,
    };
    try {
      setSaving(true);
      if (editingProc) await updateContract(editingProc.id, payload);
      else             await createContract(payload);
      setShowProcModal(false);
      fetchFines(statusFilter, true);
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const removeProc = async (f) => {
    if (!confirm('Excluir este processo?')) return;
    try { await deleteContract(f.id); fetchFines(statusFilter, true); }
    catch (err) { setError(err.message); }
  };
  const linkProc = async (f) => {
    if (!confirm('Vincular este processo a este veículo? Apenas o vínculo é preenchido — prazos, protocolos e documentos não mudam.')) return;
    setLinkingId(f.id);
    try { await linkFineToVehicle(companyId, vehicleId, f.id); fetchFines(statusFilter, true); }
    catch (err) { setError(err.message); }
    finally { setLinkingId(null); }
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando veículo...</p>
    </div>
  );
  if (!vehicle) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
      Veículo não encontrado. <button className="btn-secondary" onClick={() => router.push(`/multas/companies/${companyId}`)}>Voltar à empresa</button>
    </div>
  );

  return (
    <div className="client-detail-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Voltar + cabeçalho do veículo */}
      <div>
        <button onClick={() => router.push(`/multas/companies/${companyId}`)} className="btn-secondary" style={{ marginBottom: 14 }}>
          ← {company?.razao_social || 'Empresa'}
        </button>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(117,21,24,0.1)', color: '#751518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0, fontFamily: 'monospace' }}>
            {(vehicle.plate || '—').substring(0, 4)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0, fontFamily: 'monospace' }}>{vehicle.plate || '—'}</h1>
              <span className={`client-status-badge ${vehicle.status === 'inativo' ? 'negociacao' : 'fechado'}`}>
                {vehicle.status === 'inativo' ? 'Inativo' : 'Ativo'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 12, fontSize: 13, color: '#475569' }}>
              <div><strong>Condutor:</strong> {vehicle.driver_name || '—'}</div>
              <div><strong>RENAVAM:</strong> {vehicle.renavam || '—'}</div>
              {(vehicle.brand || vehicle.model) && <div><strong>Veículo:</strong> {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}</div>}
              {vehicle.year && <div><strong>Ano:</strong> {vehicle.year}</div>}
            </div>
          </div>
          <button onClick={() => setShowVehicleModal(true)} className="btn-primary">Editar veículo</button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button onClick={() => setError(null)} className="btn-close">✕</button>
        </div>
      )}

      {/* Processos do veículo */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Processos / Multas</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{total} processo(s)</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={statusFilter} onChange={(e) => onFilterChange(e.target.value)} style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <option value="">Todos os andamentos</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={openProcNew} className="btn-primary">+ Processo</button>
          </div>
        </div>

        {fines.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            {loadingFines ? 'Carregando...' : 'Nenhum processo para este veículo.'}
          </div>
        ) : (
          <>
            <table className="data-table" style={{ border: 'none', borderRadius: 0 }}>
              <thead>
                <tr><th>Nº Auto/Processo</th><th>Placa</th><th>Enquadramento</th><th>Nome do Real Infrator</th><th>Órgão</th><th>Prazo</th><th>Andamento</th><th>Observações</th><th style={{ width: 160 }}>Ações</th></tr>
              </thead>
              <tbody>
                {fines.map(f => (
                  <React.Fragment key={f.id}>
                    <tr>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {f.numero_multa || '—'}
                        {!f.linked && <span title="Correspondência por placa, sem vínculo formal" style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '1px 6px' }}>por placa</span>}
                      </td>
                      <td>{f.vehicle_plate || '—'}</td>
                      <td>{f.infraction_type || '—'}</td>
                      <td style={{ fontWeight: f.real_infractor_name ? 600 : 400, color: f.real_infractor_name ? '#751518' : '#94a3b8' }}>{f.real_infractor_name || '—'}</td>
                      <td>{f.organ || '—'}</td>
                      <td style={{ fontSize: 13, ...getPrazoStyle(f.due_date) }}>{formatDate(f.due_date)}</td>
                      <td><span className="service-status-badge" style={getStatusStyle(f.status)}>{getStatusLabel(f.status)}</span></td>
                      <td style={{ color: '#64748b', fontSize: 13, maxWidth: 240 }} title={f.notes || ''}>
                        <span style={{ display: 'block', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.notes ? f.notes : '—'}</span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button onClick={() => setExpandedId(expandedId === f.id ? null : f.id)} className="btn-icon" title="Protocolos">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          </button>
                          {!f.linked && (
                            <button onClick={() => linkProc(f)} disabled={linkingId === f.id} className="btn-icon" title="Vincular a este veículo" style={{ color: '#0e7490' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            </button>
                          )}
                          <button onClick={() => openProcEdit(f)} className="btn-icon" title="Editar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => removeProc(f)} className="btn-icon danger" title="Excluir">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === f.id && (
                      <tr>
                        <td colSpan={9} style={{ background: '#f8fafc', padding: 12 }}>
                          <ProtocolPanel contract={f} onClose={() => setExpandedId(null)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {fines.length < total && (
              <div style={{ padding: 14, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => fetchFines(statusFilter, false)} disabled={loadingFines} className="btn-secondary">
                  {loadingFines ? 'Carregando...' : `Carregar mais (${fines.length}/${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Documentos do Veículo */}
      <DocumentsSection scope={{ vehicle_id: vehicleId }} title="Documentos do Veículo" docTypes={VEHICLE_DOC_TYPES} isAdmin={isAdmin} />

      {/* Modal Veículo */}
      {showVehicleModal && (
        <VehicleFormModal
          companyId={companyId}
          vehicle={vehicle}
          onClose={() => setShowVehicleModal(false)}
          onSaved={() => { setShowVehicleModal(false); load(); }}
        />
      )}

      {/* Modal Processo */}
      {showProcModal && (
        <div className="modal-overlay" onClick={() => setShowProcModal(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{editingProc ? 'Editar Processo' : 'Novo Processo'}</h2>
              <button type="button" onClick={() => setShowProcModal(false)} className="btn-close">✕</button>
            </div>
            {modalError && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{modalError}</div>}
            <form onSubmit={saveProc} className="modal-form">
              <div className="form-row">
                <div className="form-group"><label>Tipo de Serviço *</label>
                  <select value={procForm.service_id} onChange={e => setProcForm(p => ({ ...p, service_id: e.target.value }))} required>
                    <option value="">Selecione...</option>
                    {allowedServiceTypes.map(s => <option key={s.id} value={String(s.id)}>{s.label || s.code}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Nº Auto / Processo</label><input value={procForm.numero_multa} onChange={e => setProcForm(p => ({ ...p, numero_multa: e.target.value }))} /></div>
              </div>
              {isTriProcess && (
                <div className="form-group">
                  <label>Nome do Real Infrator *</label>
                  <input
                    value={procForm.real_infractor_name}
                    onChange={e => setProcForm(p => ({ ...p, real_infractor_name: e.target.value }))}
                    placeholder="Nome completo da pessoa que receberá a nova multa"
                    required
                  />
                </div>
              )}
              <div className="form-row">
                <div className="form-group"><label>Placa</label><input value={vehicle.plate || ''} readOnly disabled style={{ background: '#f8fafc', color: '#64748b' }} /></div>
                <div className="form-group"><label>Enquadramento (art.)</label><input value={procForm.infraction_type} onChange={e => setProcForm(p => ({ ...p, infraction_type: e.target.value }))} placeholder="Ex.: 218, inc. I" /></div>
                <div className="form-group">
                  <label>Prazo</label>
                  {/* Aceita colar/digitar dd/mm/aaaa, ddmmaaaa, yyyy-mm-dd; datepicker auxiliar à direita. */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="text" value={procForm.due_date}
                      onChange={e => setProcForm(p => ({ ...p, due_date: normalizeDate(e.target.value) }))}
                      placeholder="dd/mm/aaaa" inputMode="numeric" style={{ flex: 1 }} />
                    <input type="date" value={displayToIso(procForm.due_date) || ''}
                      onChange={e => setProcForm(p => ({ ...p, due_date: e.target.value ? isoToDisplay(e.target.value) : '' }))}
                      title="Escolher no calendário" aria-label="Escolher data no calendário"
                      style={{ width: 42, flexShrink: 0, padding: '0 4px' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Somente segunda a sexta-feira.</span>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Órgão Autuador</label>
                  <select value={procForm.organ} onChange={e => setProcForm(p => ({ ...p, organ: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {getOrganOptions(procForm.organ).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Andamento *</label>
                  <select value={procForm.status} onChange={e => setProcForm(p => ({ ...p, status: e.target.value }))} required>
                    <option value="">Selecione...</option>
                    {processStatusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Observações</label><textarea rows={2} value={procForm.notes} onChange={e => setProcForm(p => ({ ...p, notes: e.target.value }))} /></div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowProcModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

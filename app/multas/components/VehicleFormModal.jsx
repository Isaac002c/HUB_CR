'use client';

// Modal de cadastro/edição de veículo, compartilhado entre a tela da Empresa e a
// tela de detalhe do Veículo (sem duplicar formulário/validações).
//
// Campos de interface: Placa (obrigatória), RENAVAM, CPF/CNPJ do proprietário/responsável,
// Nome do condutor, CPF do condutor, CNH do condutor, Status.
// Ano/Marca/Modelo/Observações foram REMOVIDOS da interface mas seguem no banco:
// como não enviamos essas chaves, o back-end preserva os valores legados na edição.

import React, { useState } from 'react';
import { createVehicle, updateVehicle } from '../../lib/companiesAPI';
import { maskCpfCnpj, maskCpf, onlyDigits, validateCpfCnpj, validateCPF, validateCNH } from '../../lib/processConstants';

export default function VehicleFormModal({ companyId, vehicle, onClose, onSaved }) {
  const editing = !!vehicle;
  const [form, setForm] = useState({
    plate: vehicle?.plate || '',
    status: vehicle?.status || 'ativo',
    renavam: vehicle?.renavam || '',
    owner_document: maskCpfCnpj(vehicle?.owner_document || ''),
    driver_name: vehicle?.driver_name || '',
    driver_cpf: maskCpf(vehicle?.driver_cpf || ''),
    driver_cnh: onlyDigits(vehicle?.driver_cnh || ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.plate?.trim()) { setError('Placa é obrigatória.'); return; }
    if (form.owner_document && !validateCpfCnpj(form.owner_document)) { setError('CPF/CNPJ do proprietário inválido.'); return; }
    if (form.driver_cpf && !validateCPF(form.driver_cpf)) { setError('CPF do condutor inválido.'); return; }
    if (form.driver_cnh && !validateCNH(form.driver_cnh)) { setError('CNH do condutor deve ter 11 dígitos.'); return; }
    const payload = {
      plate: form.plate.trim().toUpperCase(),
      status: form.status,
      renavam: form.renavam || null,
      owner_document: onlyDigits(form.owner_document),
      driver_name: form.driver_name || null,
      driver_cpf: onlyDigits(form.driver_cpf),
      driver_cnh: onlyDigits(form.driver_cnh),
    };
    try {
      setSaving(true);
      if (editing) await updateVehicle(companyId, vehicle.id, payload);
      else         await createVehicle(companyId, payload);
      onSaved && onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{editing ? 'Editar Veículo' : 'Novo Veículo'}</h2>
          <button type="button" onClick={onClose} className="btn-close">✕</button>
        </div>
        {error && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{error}</div>}
        <form onSubmit={save} className="modal-form">
          <div className="form-row">
            <div className="form-group"><label>Placa *</label><input value={form.plate} onChange={e => setForm(p => ({ ...p, plate: e.target.value.toUpperCase() }))} placeholder="ABC1D23" required /></div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="ativo">Ativo</option><option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>RENAVAM</label>
              <input value={form.renavam} onChange={e => setForm(p => ({ ...p, renavam: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="Somente números" />
            </div>
            <div className="form-group">
              <label>CPF/CNPJ do proprietário/responsável</label>
              <input value={form.owner_document} onChange={e => setForm(p => ({ ...p, owner_document: maskCpfCnpj(e.target.value) }))} inputMode="numeric" placeholder="CPF ou CNPJ do dono do veículo" />
            </div>
          </div>
          <div className="form-group"><label>Nome do condutor</label><input value={form.driver_name} onChange={e => setForm(p => ({ ...p, driver_name: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label>CPF do condutor</label><input value={form.driver_cpf} onChange={e => setForm(p => ({ ...p, driver_cpf: maskCpf(e.target.value) }))} inputMode="numeric" /></div>
            <div className="form-group"><label>CNH do condutor</label><input value={form.driver_cnh} onChange={e => setForm(p => ({ ...p, driver_cnh: onlyDigits(e.target.value).slice(0, 11) }))} inputMode="numeric" placeholder="11 dígitos" /></div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

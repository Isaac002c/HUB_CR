'use client';

// Modal de criar/editar evento da Agenda — extraído de CalendarioEventos.jsx para
// ser reutilizado pelo fluxo Lead → Agendamento (LeadsList). Um único form, uma
// única validação e o mesmo tratamento de 409 (conflito/bloqueio) do backend.

import { useState, useEffect } from 'react';
import { createEvent, updateEvent, getConsultants } from '../../lib/calendarAPI';
import { getClients } from '../../lib/clientsAPI';
import { getServiceTypes } from '../../lib/servicesAPI';
import { maskCpf, onlyDigits, validateCPF, validateCNH } from '../../lib/processConstants';

// ── Constantes/helpers compartilhados do módulo de eventos ──────────────────
// Tipos selecionáveis (novos). Legados ficam só para exibição de eventos antigos.
export const TYPES = [
  { value: 'presencial',   label: 'Presencial',   color: '#751518' },
  { value: 'videochamada', label: 'Videochamada', color: '#6366f1' },
  { value: 'audiencia',    label: 'Audiência',    color: '#0891b2' },
  { value: 'ligacao',      label: 'Ligação',      color: '#f59e0b' },
];
export const LEGACY_TYPES = [
  { value: 'reuniao',  label: 'Reunião',  color: '#6366f1' },
  { value: 'prazo',    label: 'Prazo',    color: '#f59e0b' },
  { value: 'outro',    label: 'Outro',    color: '#64748b' },
  { value: 'bloqueio', label: 'Bloqueio', color: '#dc2626' },
];
export const ALL_TYPES = [...TYPES, ...LEGACY_TYPES];
export const typeInfo = (t) => ALL_TYPES.find(x => x.value === t) || { value: t, label: t || 'Outro', color: '#64748b' };

export const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência', 'Outro'];

export const fmtTime = (t) => (t ? String(t).substring(0, 5) : '');

// Datas em dd/mm/aaaa (digitação) <-> ISO (seletor/banco) — mesmo padrão do módulo de multas.
export const normalizeDate = (v) => {
  if (!v) return '';
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
  const digits = s.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
};
export const isoToDisplay = (v) => {
  if (!v) return '';
  const s = String(v).substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
  return s;
};
export const displayToIso = (v) => {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mSep = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (mSep) return `${mSep[3]}-${mSep[2].padStart(2,'0')}-${mSep[1].padStart(2,'0')}`;
  const mRaw = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (mRaw) return `${mRaw[3]}-${mRaw[2]}-${mRaw[1]}`;
  return null;
};

// Valor monetário digitado ("150,00", "1.500,00", "150.00") -> number | null | NaN (inválido).
const parseMoney = (s) => {
  if (s == null || !String(s).trim()) return null;
  let t = String(s).trim().replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // pt-BR: ponto = milhar
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
};

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const dt = new Date(); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; };

// Campo de data br: texto dd/mm/aaaa + seletor nativo. `value` é mantido em dd/mm/aaaa.
export function DateBRInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input type="text" value={value || ''} onChange={(e) => onChange(normalizeDate(e.target.value))} placeholder="dd/mm/aaaa" inputMode="numeric" style={{ flex: 1 }} />
      <input type="date" value={displayToIso(value) || ''} onChange={(e) => onChange(e.target.value ? isoToDisplay(e.target.value) : '')} title="Calendário" aria-label="Escolher data" style={{ width: 40, flexShrink: 0, padding: 0 }} />
    </div>
  );
}

const EMPTY = {
  title: '', description: '', event_date: '', start_time: '', end_time: '', type: 'presencial',
  client_id: '', status: 'agendado',
  service_type_id: '', responsible_user_id: '',
  attendee_cpf: '', attendee_cnh: '', attendee_first_cnh: '', attendee_birth_date: '',
  attendee_phone: '', value: '', payment_method: '',
};

/**
 * Modal de criar/editar evento.
 * - `event`: evento existente (modo edição) ou null (novo).
 * - `initialData`: pré-preenchimento para novo evento (usado pelo fluxo Lead → Agendamento).
 * - `heading`: título opcional do modal (default: Novo Evento / Editar Evento).
 * - `onSaved(saved)`: chamado após salvar com sucesso. `onClose()`: fechar sem salvar.
 */
export default function EventFormModal({ event, initialData, heading, onClose, onSaved }) {
  const editing = event && event.id ? event : null;

  const [clients, setClients]           = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [consultants, setConsultants]   = useState([]);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);

  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        title: editing.title || '', description: editing.description || '',
        event_date: String(editing.event_date).substring(0, 10),
        start_time: fmtTime(editing.start_time), end_time: fmtTime(editing.end_time),
        type: editing.type || 'outro',
        client_id: editing.client_id || '', status: editing.status || 'agendado',
        service_type_id: editing.service_type_id ? String(editing.service_type_id) : '',
        responsible_user_id: editing.responsible_user_id || '',
        attendee_cpf: maskCpf(editing.attendee_cpf || ''),
        attendee_cnh: editing.attendee_cnh || '',
        attendee_first_cnh: isoToDisplay(editing.attendee_first_cnh),
        attendee_birth_date: isoToDisplay(editing.attendee_birth_date),
        attendee_phone: editing.attendee_phone || '',
        value: editing.value != null && editing.value !== '' ? String(editing.value).replace('.', ',') : '',
        payment_method: editing.payment_method || '',
      };
    }
    const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
    const init = initialData || {};
    return {
      ...EMPTY,
      ...init,
      event_date: init.event_date || todayISO(),
      attendee_cpf: maskCpf(init.attendee_cpf || ''),
      attendee_cnh: init.attendee_cnh ? onlyDigits(String(init.attendee_cnh)).slice(0, 11) : '',
      attendee_first_cnh: isoToDisplay(init.attendee_first_cnh),
      attendee_birth_date: isoToDisplay(init.attendee_birth_date),
      attendee_phone: init.attendee_phone || '',
      responsible_user_id: init.responsible_user_id || currentUser?.id || '',
    };
  });

  useEffect(() => {
    getClients().then(d => setClients(d || [])).catch(() => {});
    getServiceTypes().then(d => setServiceTypes(d || [])).catch(() => {});
    getConsultants().then(d => setConsultants(d || [])).catch(() => {});
  }, []);

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const selectClient = (e) => {
    const clientId = e.target.value;

    // Limpar a seleção mantém os dados visíveis para não apagar uma edição manual.
    if (!clientId) {
      setForm(p => ({ ...p, client_id: '' }));
      return;
    }

    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) {
      setForm(p => ({ ...p, client_id: clientId }));
      return;
    }

    // Os dados de identificação passam a corresponder ao cliente selecionado.
    // Observações e demais dados próprios do evento não são sobrescritos.
    setForm(p => ({
      ...p,
      client_id: clientId,
      title: client.name || '',
      attendee_cpf: maskCpf(client.cpf || ''),
      attendee_cnh: client.cnh ? onlyDigits(String(client.cnh)).slice(0, 11) : '',
      attendee_birth_date: isoToDisplay(client.birth_date),
      attendee_first_cnh: isoToDisplay(client.first_cnh),
      attendee_phone: client.phone || '',
    }));
  };

  const save = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.title.trim()) { setError('Nome da pessoa agendada é obrigatório.'); return; }
    if (!form.event_date)   { setError('Data é obrigatória.'); return; }
    if (form.attendee_cpf && !validateCPF(form.attendee_cpf)) { setError('CPF inválido.'); return; }
    if (form.attendee_cnh && !validateCNH(form.attendee_cnh)) { setError('CNH deve ter 11 dígitos.'); return; }
    const money = parseMoney(form.value);
    if (Number.isNaN(money)) { setError('Valor inválido — use números, ex.: 1.500,00.'); return; }
    try {
      setSaving(true);
      const payload = {
        ...form,
        client_id: form.client_id || null,
        service_type_id: form.service_type_id || null,
        responsible_user_id: form.responsible_user_id || null,
        attendee_cpf: onlyDigits(form.attendee_cpf) || null,
        attendee_cnh: form.attendee_cnh ? onlyDigits(form.attendee_cnh) : null,
        attendee_first_cnh: displayToIso(form.attendee_first_cnh),
        attendee_birth_date: displayToIso(form.attendee_birth_date),
        attendee_phone: (form.attendee_phone || '').trim() || null,
        value: money,
        payment_method: form.payment_method || null,
      };
      const saved = editing ? await updateEvent(editing.id, payload) : await createEvent(payload);
      if (onSaved) onSaved(saved);
    } catch (err) { setError(err.message); }   // 409 = conflito de horário / agenda fechada
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{heading || (editing ? 'Editar Evento' : 'Novo Evento')}</h2>
          <button type="button" onClick={onClose} className="btn-close">✕</button>
        </div>
        {error && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{error}</div>}
        <form onSubmit={save} className="modal-form">
          <div className="form-group"><label>Nome da pessoa agendada *</label><input value={form.title} onChange={set('title')} placeholder="Nome de quem será atendido" required /></div>
          <div className="form-row">
            <div className="form-group"><label>Data *</label><input type="date" value={form.event_date} onChange={set('event_date')} required /></div>
            <div className="form-group"><label>Tipo</label>
              <select value={form.type} onChange={set('type')}>
                {(TYPES.some(t => t.value === form.type) ? TYPES : [...TYPES, typeInfo(form.type)]).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Início</label><input type="time" value={form.start_time} onChange={set('start_time')} /></div>
            <div className="form-group"><label>Fim</label><input type="time" value={form.end_time} onChange={set('end_time')} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Serviço</label>
              <select value={form.service_type_id} onChange={set('service_type_id')}>
                <option value="">— Nenhum —</option>
                {serviceTypes.map(s => <option key={s.id} value={String(s.id)}>{s.label || s.name || s.code}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Consultor</label>
              <select value={form.responsible_user_id || ''} onChange={set('responsible_user_id')}>
                <option value="">— Selecione —</option>
                {consultants.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>CPF</label><input value={form.attendee_cpf} onChange={e => setForm(p => ({ ...p, attendee_cpf: maskCpf(e.target.value) }))} inputMode="numeric" placeholder="000.000.000-00" /></div>
            <div className="form-group"><label>CNH</label><input value={form.attendee_cnh} onChange={e => setForm(p => ({ ...p, attendee_cnh: onlyDigits(e.target.value).slice(0, 11) }))} inputMode="numeric" placeholder="11 dígitos" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Data de nascimento</label><DateBRInput value={form.attendee_birth_date} onChange={(v) => setForm(p => ({ ...p, attendee_birth_date: v }))} /></div>
            <div className="form-group"><label>Primeira habilitação</label><DateBRInput value={form.attendee_first_cnh} onChange={(v) => setForm(p => ({ ...p, attendee_first_cnh: v }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Telefone</label><input value={form.attendee_phone} onChange={set('attendee_phone')} maxLength={20} placeholder="(21) 99999-0000" /></div>
            <div className="form-group"><label>Valor (R$)</label><input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value.replace(/[^\d.,]/g, '') }))} inputMode="decimal" placeholder="0,00" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Forma de pagamento</label>
              <select value={form.payment_method} onChange={set('payment_method')}>
                <option value="">— Selecione —</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Cliente (opcional)</label>
              <select value={form.client_id} onChange={selectClient}>
                <option value="">— Nenhum —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={set('status')}>
                <option value="agendado">Agendado</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label>Observações</label><textarea rows={2} value={form.description} onChange={set('description')} placeholder="Detalhes do evento..." /></div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 8px' }}>Sem horário = dia inteiro. Consultor padrão: você (usuário logado).</p>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar evento'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

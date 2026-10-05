'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getClientById, updateClient } from '../../../lib/clientsAPI';
import { getConsultants } from '../../../lib/calendarAPI';
import { getServicesByClient, deleteService, getServiceTypes } from '../../../lib/servicesAPI';
import { getContractsByService, createContract, updateContract, deleteContract, patchContractProtocol } from '../../../lib/contractsAPI';
import { getDocumentsByClient, createDocument, deleteDocument } from '../../../lib/documentsAPI';
import RenameDocumentModal from '../../components/RenameDocumentModal';
import { uploadFile } from '../../../lib/uploadsAPI';
import { listByFine, createProtocol, updateProtocol, deleteProtocol, sendProtocolEmail, getProtocolEmailHistory } from '../../../lib/fineProtocolsAPI';
import { requestDeletion } from '../../../lib/approvalsAPI';
import { getGeneratedDocumentTemplates, generateClientDocument } from '../../../lib/generatedDocumentsAPI';
// Cor do prazo: fonte de verdade compartilhada (mesmo jogo de cores em Empresas)
import { filterStatusOptionsForRole, getPrazoStyle, isBusinessDay } from '../../../lib/processConstants';

// ─── Constantes de negócio ────────────────────────────

const SERVICE_TYPES = [
  { value: 'MULTA',           label: 'Auto de Infração' },
  { value: 'CRCI',            label: 'CRCI' },
  { value: 'SUSPENSAO',       label: 'Suspensão' },
  { value: 'CASSACAO',        label: 'Cassação' },
  { value: 'REVISAO DE ATOS', label: 'Revisão de Atos' },
  { value: 'TRI',             label: 'TRI — Troca de Real Infrator' },
  { value: 'OUTROS',          label: 'Outros' },
];

// Fallback de IDs (usado apenas se a API /services/types falhar)
const SERVICE_TYPE_IDS = {
  'MULTA': '2', 'CRCI': '1',
  'SUSPENSAO': '3', 'CASSACAO': '4', 'REVISAO DE ATOS': '5', 'OUTROS': '7',
};

// Status disponíveis por tipo de serviço
const STATUS_OPTIONS_MULTA = [
  { value: 'APRS DEFESA PREVIA',      label: 'APRs — Defesa Prévia' },
  { value: 'DEFESA PREVIA - ANALISE', label: 'Defesa Prévia — Análise' },
  { value: 'APRS 1 INSTANCIA',        label: 'APRs — 1ª Instância' },
  { value: '1 INSTANCIA - ANALISE',   label: '1ª Instância — Análise' },
  { value: 'APRS 2 INSTANCIA',        label: 'APRs — 2ª Instância' },
  { value: '2 INSTANCIA - ANALISE',   label: '2ª Instância — Análise' },
  { value: 'DEFERIDO',                label: 'Deferido' },
  { value: 'INDEFERIDO',              label: 'Indeferido' },
  { value: 'TRANSITO EM JULGADO',     label: 'Trânsito em Julgado' },
  { value: 'FINALIZADO',              label: 'Finalizado' },
  { value: 'CANCELADO',               label: 'Cancelado' },
];

const STATUS_OPTIONS_SUSPENSAO = [
  { value: 'APRS DEFESA PREVIA',      label: 'APRs — Defesa Prévia' },
  { value: 'DEFESA PREVIA - ANALISE', label: 'Defesa Prévia — Análise' },
  { value: 'APRS 1 INSTANCIA',        label: 'APRs — 1ª Instância' },
  { value: '1 INSTANCIA - ANALISE',   label: '1ª Instância — Análise' },
  { value: 'APRS 2 INSTANCIA',        label: 'APRs — 2ª Instância' },
  { value: '2 INSTANCIA - ANALISE',   label: '2ª Instância — Análise' },
  { value: 'DEFERIDO',                label: 'Deferido' },
  { value: 'INDEFERIDO',              label: 'Indeferido' },
  { value: 'TRANSITO EM JULGADO',     label: 'Trânsito em Julgado' },
  { value: 'FINALIZADO',              label: 'Finalizado' },
  { value: 'CANCELADO',               label: 'Cancelado' },
];

const TIPO_SUSPENSAO_OPTIONS = [
  { value: 'EXCESSO DE PONTOS', label: 'Excesso de Pontos' },
  { value: 'MANDATORIA',        label: 'Mandatória' },
];

const STATUS_OPTIONS_GENERIC = [
  { value: 'EM ANDAMENTO',   label: 'Em Andamento' },
  { value: 'DEFERIDO',       label: 'Deferido' },
  { value: 'INDEFERIDO',     label: 'Indeferido' },
  { value: 'FINALIZADO',     label: 'Finalizado' },
  { value: 'CANCELADO',      label: 'Cancelado' },
];

const STATUS_OPTIONS_CRCI = [
  { value: 'EM ANDAMENTO', label: 'Em Andamento' },
  { value: 'FINALIZADO',   label: 'Finalizado' },
];

const ORGANS = ['DETRAN', 'DER', 'DNIT', 'SMTR', 'PRF', 'ANTT', 'PREFEITURA UF', 'OUTROS'];

// Inclui o valor já salvo como opção (ex.: "PMRJ" legado) caso não esteja mais na lista,
// para não perder/sobrescrever o órgão de registros antigos ao editar.
const getOrganOptions = (current) =>
  current && !ORGANS.includes(current) ? [current, ...ORGANS] : ORGANS;

const STATUS_COLORS = {
  'APRS DEFESA PREVIA':      { bg: '#dbeafe', text: '#2563eb' },
  'DEFESA PREVIA - ANALISE': { bg: '#1e3a8a', text: '#ffffff' },
  'APRS 1 INSTANCIA':        { bg: '#6d28d9', text: '#ffffff' },
  '1 INSTANCIA - ANALISE':   { bg: '#f3e8ff', text: '#9333ea' },
  'APRS 2 INSTANCIA':        { bg: '#fef2f2', text: '#ef4444' },
  '2 INSTANCIA - ANALISE':   { bg: '#fee2e2', text: '#b91c1c' },
  'MANDATORIA':               { bg: '#fdf2f8', text: '#c026d3' },
  'EXCESSO DE PONTOS':        { bg: '#fdf4ff', text: '#a21caf' },
  'PROTOCOLADO':              { bg: '#f0fdf4', text: '#16a34a' },
  'DEFERIDO':                 { bg: '#dcfce7', text: '#15803d' },
  'INDEFERIDO':               { bg: '#fee2e2', text: '#991b1b' },
  'TRANSITO EM JULGADO':      { bg: '#f0fdf4', text: '#166534' },
  'FINALIZADO':               { bg: '#f1f5f9', text: '#475569' },
  'CANCELADO':                { bg: '#f1f5f9', text: '#94a3b8' },
  'EM ANDAMENTO':             { bg: '#eff6ff', text: '#3b82f6' },
};

const getStatusOptions = (serviceValue) => {
  if (serviceValue === 'MULTA')                                    return STATUS_OPTIONS_MULTA;
  if (serviceValue === 'SUSPENSAO' || serviceValue === 'CASSACAO') return STATUS_OPTIONS_SUSPENSAO;
  if (serviceValue === 'CRCI')                                     return STATUS_OPTIONS_CRCI;
  if (serviceValue === 'TRI')                                      return STATUS_OPTIONS_GENERIC;
  return STATUS_OPTIONS_GENERIC;
};

const getStatusStyle = (status) => {
  const c = STATUS_COLORS[status];
  return c ? { background: c.bg, color: c.text } : { background: '#f1f5f9', color: '#475569' };
};

const getStatusLabel = (status) => {
  const all = [...STATUS_OPTIONS_MULTA, ...STATUS_OPTIONS_GENERIC];
  return all.find(o => o.value === status)?.label || status || '—';
};

const getServiceLabel = (value) =>
  SERVICE_TYPES.find(t => t.value === value?.toUpperCase())?.label || value || '—';

// getPrazoStyle agora vem de lib/processConstants (fonte única, reutilizada por
// Clientes e Empresas — mesmo jogo de cores: vencido/atenção/regular).

// ─── Helpers ─────────────────────────────────────────

// Formata campo date-only (YYYY-MM-DD) para dd/mm/aaaa sem conversão de timezone
const formatDate = (v) => {
  if (!v) return '—';
  const s = String(v).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};
const formatCPF  = (v) => (v ? v.replace(/\D/g, '') || '—' : '—');
const toInputDate = (v) => (!v ? '' : v.substring(0, 10));

// Normaliza qualquer formato de data para dd/mm/aaaa (usado no onChange)
const normalizeDate = (v) => {
  if (!v) return '';
  const s = v.trim();
  // ISO yyyy-mm-dd (vindo do banco ou colado)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const digits = s.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
};

// Converte dd/mm/aaaa → yyyy-mm-dd para exibir no input ao carregar
const isoToDisplay = (v) => {
  if (!v) return '';
  const s = v.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
};

// Converte dd/mm/aaaa, ddmmaaaa, yyyy-mm-dd → yyyy-mm-dd para salvar no banco
const displayToIso = (v) => {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  // Já é ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Com separadores: dd/mm/aaaa ou dd-mm-aaaa
  const mSep = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (mSep) return `${mSep[3]}-${mSep[2].padStart(2,'0')}-${mSep[1].padStart(2,'0')}`;
  // Só 8 dígitos: ddmmaaaa
  const mRaw = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (mRaw) return `${mRaw[3]}-${mRaw[2]}-${mRaw[1]}`;
  return null;
};

const CLIENT_STATUS_OPTIONS = [
  { value: 'entrada',            label: 'Entrada' },
  { value: 'possui_defensor',    label: 'Possui defensor' },
  { value: 'nao_quer_defender',  label: 'Não tem interesse em recorrer' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechado',    label: 'Fechado' },
  { value: 'nao_encontrado',     label: 'Não encontrado' },
  { value: 'perdido',             label: 'Perdido' },
];

const EMPTY_CONTRACT = {
  numero_multa: '', vehicle_plate: '', organ: '', status: '', notes: '',
  infraction_type: '', real_infractor_name: '',
  due_date: '',
  protocol_number: '', protocol_date: '', protocol_status: '', protocol_notes: '',
  protocol_file_url: '',
};

const EMPTY_GENERATED_DOCUMENT = {
  template_type: 'contrato_suspensao',
  contract_object: '',
  amount: '',
  payment_terms: '',
};

const GENERATED_DOCUMENT_CLIENT_FIELDS = [
  ['name', 'nome'],
  ['cpf', 'CPF'],
  ['cnh', 'CNH'],
  ['birth_date', 'data de nascimento'],
  ['first_cnh', 'primeira habilitação'],
  ['phone', 'telefone'],
  ['email', 'e-mail'],
  ['address', 'endereço'],
];

const getMissingGeneratedDocumentFields = (clientData, documentKind = 'contract') => (
  GENERATED_DOCUMENT_CLIENT_FIELDS
    .filter(([field]) => documentKind !== 'power_of_attorney' || field !== 'email')
    .filter(([field]) => !String(clientData?.[field] || '').trim())
    .map(([, label]) => label)
);

const parseBRLInput = (value) => {
  const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
  return Number(normalized);
};

// Sem "Pendente" (removido por spec)
const PROTOCOL_STATUS_OPTIONS = [
  { value: 'protocolado', label: 'Protocolado' },
  { value: 'concluido',   label: 'Concluído' },
  { value: 'indeferido',  label: 'Indeferido' },
];

// ─── Componente principal ────────────────────────────

export default function ClientDetail() {
  const router   = useRouter();
  const params   = useParams();
  const clientId = params?.id;

  const currentUser = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isAdmin = ['master','admin','super_admin'].includes(currentUser?.role);
  const canManageConsultant = ['master', 'supervisor'].includes(String(currentUser?.role || '').toLowerCase());

  const [client, setClient]             = useState(null);
  const [consultants, setConsultants]   = useState([]);
  const [services, setServices]         = useState([]);
  const [contractsMap, setContractsMap] = useState({});
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  // Editar dados do cliente
  const [editingClientData, setEditingClientData] = useState(false);
  const [clientForm, setClientForm]               = useState({});
  const [savingClient, setSavingClient]           = useState(false);

  // Modal de serviço
  const [showServiceModal, setShowServiceModal]     = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState('');

  // Modal de contrato/auto
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedService, setSelectedService]     = useState(null);
  const [editingContract, setEditingContract]     = useState(null);
  const [contractForm, setContractForm]           = useState(EMPTY_CONTRACT);
  const [savingContract, setSavingContract]       = useState(false);

  // Tipos de serviço (carregado da API)
  const [serviceTypesData, setServiceTypesData] = useState([]);

  // Documentos do cliente
  const [clientDocs, setClientDocs]         = useState([]);
  const [renamingDoc, setRenamingDoc]       = useState(null);
  const [renameDocOk, setRenameDocOk]       = useState(false);
  const [showDocModal, setShowDocModal]     = useState(false);
  const [docForm, setDocForm]               = useState({ name: '', type: '', description: '' });
  const [docFile, setDocFile]               = useState(null);
  const [savingDoc, setSavingDoc]           = useState(false);
  const [uploadingDoc, setUploadingDoc]     = useState(false);
  const [showDeleteDocModal, setShowDeleteDocModal] = useState(null);
  const [deleteDocReason, setDeleteDocReason]       = useState('');
  const [deletingDocRequest, setDeletingDocRequest] = useState(false);

  // Emissão automática de contrato a partir dos dados do cliente
  const [showGeneratedDocumentModal, setShowGeneratedDocumentModal] = useState(false);
  const [generatedTemplates, setGeneratedTemplates] = useState([]);
  const [generatedDocumentForm, setGeneratedDocumentForm] = useState(EMPTY_GENERATED_DOCUMENT);
  const [loadingGeneratedTemplates, setLoadingGeneratedTemplates] = useState(false);
  const [generatingDocument, setGeneratingDocument] = useState(false);
  const [generatedDocumentError, setGeneratedDocumentError] = useState('');

  // Protocolo expandido por contrato
  const [expandedProtocol, setExpandedProtocol] = useState(null); // fine id

  // Solicitação de exclusão (non-admin)
  const [showDeleteContractModal, setShowDeleteContractModal] = useState(null);
  const [deleteContractReason,    setDeleteContractReason]    = useState('');
  const [deletingContractRequest, setDeletingContractRequest] = useState(false);

  const loadAll = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const [clientData, servicesData] = await Promise.all([
        getClientById(clientId),
        getServicesByClient(clientId),
      ]);
      setClient(clientData);
      const svcs = servicesData || [];
      setServices(svcs);
      const entries = await Promise.all(
        svcs.map(async (s) => {
          try {
            const contracts = await getContractsByService(s.id, clientId) || [];
            return [s.id, contracts];
          } catch { return [s.id, []]; }
        })
      );
      setContractsMap(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadAll();
    loadClientDocs();
    getServiceTypes()
      .then(types => setServiceTypesData(types || []))
      .catch(() => {});
    if (canManageConsultant) {
      getConsultants()
        .then(rows => setConsultants(rows || []))
        .catch(() => setConsultants([]));
    }
  // eslint-disable-next-line
  }, [clientId]);

  // ── Edição do cliente ────────────────────────────

  const startEditClient = () => {
    setClientForm({
      name:       client.name       || '',
      birth_date: isoToDisplay(client.birth_date),
      cpf:        client.cpf        || '',
      cnh:        client.cnh        || '',
      first_cnh:  isoToDisplay(client.first_cnh),
      phone:      client.phone      || '',
      email:      client.email      || '',
      address:    client.address    || '',
      notes:      client.notes      || '',
      status:     client.status     || 'negociacao',
      consultant_id: client.created_by || '',
    });
    setEditingClientData(true);
  };

  const saveClient = async (e) => {
    e.preventDefault();
    try {
      setSavingClient(true);
      const { consultant_id, ...clientFields } = clientForm;
      const payload = {
        ...clientFields,
        birth_date: displayToIso(clientForm.birth_date),
        first_cnh:  displayToIso(clientForm.first_cnh),
      };
      if (canManageConsultant && client.status === 'fechado') {
        payload.consultant_id = consultant_id;
      }
      await updateClient(client.id, payload);
      setEditingClientData(false);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingClient(false);
    }
  };

  const setC = (field) => (e) => {
    let value = e.target.value;
    if (field === 'cpf') {
      value = value.replace(/\D/g, '').slice(0, 11);
    } else if (field === 'birth_date' || field === 'first_cnh') {
      value = normalizeDate(value);
    }
    setClientForm(prev => ({ ...prev, [field]: value }));
  };

  // ── Serviços ────────────────────────────────────

  const handleSelectServiceType = (e) => {
    e.preventDefault();
    if (!selectedServiceType) return;
    const val = selectedServiceType.toUpperCase();
    // Preferência: ID real da API; fallback: mapeamento estático
    const fromApi = serviceTypesData.find(t => t.code?.toUpperCase() === val);
    const id = fromApi?.id || SERVICE_TYPE_IDS[val] || '7';
    const fake = { id, name: selectedServiceType };
    setShowServiceModal(false);
    setSelectedServiceType('');
    openContractModal(fake);
  };

  const handleDeleteService = async (serviceId) => {
    if (!confirm('Excluir este serviço e todos os registros vinculados?')) return;
    try {
      await deleteService(serviceId, clientId);
      await loadAll();
    } catch (err) { setError(err.message); }
  };

  // ── Contratos / Autos ───────────────────────────

  const openContractModal = (service, contract = null) => {
    setSelectedService(service);
    setEditingContract(contract);
    setContractForm(contract ? {
      numero_multa:     contract.numero_multa     || '',
      vehicle_plate:    contract.vehicle_plate    || '',
      organ:            contract.organ            || '',
      status:           contract.status           || '',
      notes:            contract.notes            || '',
      infraction_type:  contract.infraction_type  || '',
      real_infractor_name: contract.real_infractor_name || '',
      due_date:         isoToDisplay(contract.due_date),
      protocol_number:  contract.protocol_number  || '',
      protocol_date:    contract.protocol_date    ? contract.protocol_date.substring(0, 10) : '',
      protocol_status:  contract.protocol_status  || '',
      protocol_notes:   contract.protocol_notes   || '',
      protocol_file_url: contract.protocol_file_url || '',
    } : EMPTY_CONTRACT);
    setShowContractModal(true);
  };

  const handleSaveContract = async (e) => {
    e.preventDefault();
    const name = selectedService.name?.toUpperCase() || '';
    if (!contractForm.status) { setError('Selecione o andamento'); return; }
    if ((name === 'MULTA' || name === 'TRI') && !contractForm.numero_multa.trim()) { setError('Informe o número do Auto de Infração'); return; }
    if (name === 'TRI' && !contractForm.vehicle_plate.trim()) { setError('Informe a placa do veículo'); return; }
    if (name === 'TRI' && !contractForm.real_infractor_name.trim()) { setError('Informe o nome do real infrator'); return; }
    const dueDate = displayToIso(contractForm.due_date);
    if (contractForm.due_date && !dueDate) { setError('Informe um prazo válido'); return; }
    if (dueDate && !isBusinessDay(dueDate)) {
      setError('O prazo deve ser salvo em dia útil (segunda a sexta-feira). Escolha o próximo dia útil.');
      return;
    }

    const payload = {
      client_id:       clientId,
      service_id:      selectedService.id,
      numero_multa:    contractForm.numero_multa    || null,
      vehicle_plate:   contractForm.vehicle_plate   || null,
      organ:           contractForm.organ           || 'DETRAN',
      status:          contractForm.status,
      notes:           contractForm.notes           || null,
      infraction_type: contractForm.infraction_type || null,
      real_infractor_name: contractForm.real_infractor_name.trim() || null,
      due_date:        dueDate,
    };

    try {
      setSavingContract(true);
      if (editingContract) {
        await updateContract(editingContract.id, payload);
      } else {
        await createContract(payload);
      }
      setShowContractModal(false);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingContract(false);
    }
  };

  const handleDeleteContract = async (serviceId, contractId) => {
    if (!confirm('Excluir este registro?')) return;
    try {
      await deleteContract(contractId);
      const updated = await getContractsByService(serviceId, clientId);
      setContractsMap(prev => ({ ...prev, [serviceId]: updated || [] }));
    } catch (err) { setError(err.message); }
  };

  const handleSolicitarExclusaoContrato = async (e) => {
    e.preventDefault();
    if (!showDeleteContractModal) return;
    try {
      setDeletingContractRequest(true);
      await requestDeletion({
        target_type:  'contract',
        target_id:    showDeleteContractModal.id,
        target_label: showDeleteContractModal.numero_multa || showDeleteContractModal.id,
        reason:       deleteContractReason,
      });
      setShowDeleteContractModal(null); setDeleteContractReason('');
      alert('Solicitação enviada. Aguarde aprovação do administrador.');
    } catch (err) { setError(err.message); }
    finally { setDeletingContractRequest(false); }
  };

  // ── Salvar protocolo no contrato (PATCH — preserva demais campos) ──
  const handleSaveProtocol = async (contractId, protocolData) => {
    try {
      await patchContractProtocol(contractId, protocolData);
      await loadAll();
      setExpandedProtocol(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Documentos do cliente ──
  const loadClientDocs = async () => {
    if (!clientId) return;
    try {
      const docs = await getDocumentsByClient(clientId);
      setClientDocs(docs || []);
    } catch { setClientDocs([]); }
  };

  const saveClientDoc = async (e) => {
    e.preventDefault();
    if (!docFile && !docForm.name) return;
    try {
      setSavingDoc(true);
      let fileUrl = '';
      let fileName = docForm.name;
      let mimeType = '';
      let fileSize = 0;

      if (docFile) {
        setUploadingDoc(true);
        const uploaded = await uploadFile(docFile);
        setUploadingDoc(false);
        fileUrl   = uploaded.url;
        fileName  = uploaded.originalName;
        mimeType  = uploaded.mimeType;
        fileSize  = uploaded.size;
      }

      if (!fileUrl) { setError('Selecione um arquivo para anexar.'); return; }

      await createDocument({
        client_id:   clientId,
        file_url:    fileUrl,
        file_name:   docForm.name || fileName,
        file_type:   mimeType,
        file_size:   fileSize,
        category:    docForm.type || 'outros',
        description: docForm.description || null,
      });

      setDocForm({ name: '', type: '', description: '' });
      setDocFile(null);
      setShowDocModal(false);
      await loadClientDocs();
    } catch (err) {
      setUploadingDoc(false);
      setError(err.message);
    } finally {
      setSavingDoc(false);
    }
  };

  const deleteClientDoc = async (id) => {
    if (!isAdmin) return;
    if (!confirm('Excluir documento?')) return;
    try {
      await deleteDocument(id);
      await loadClientDocs();
    } catch (err) { setError(err.message); }
  };

  const handleSolicitarExclusaoDoc = async (e) => {
    e.preventDefault();
    try {
      setDeletingDocRequest(true);
      await requestDeletion({
        target_type: 'document',
        target_id: showDeleteDocModal.id,
        target_label: showDeleteDocModal.file_name || 'Documento',
        reason: deleteDocReason,
      });
      setShowDeleteDocModal(null);
      setDeleteDocReason('');
      alert('Solicitação enviada. Aguarde aprovação do administrador.');
    } catch (err) { setError(err.message); }
    finally { setDeletingDocRequest(false); }
  };

  const openGeneratedDocumentModal = async () => {
    setGeneratedDocumentForm(EMPTY_GENERATED_DOCUMENT);
    setGeneratedDocumentError('');
    setShowGeneratedDocumentModal(true);
    if (generatedTemplates.length) return;
    try {
      setLoadingGeneratedTemplates(true);
      setGeneratedTemplates(await getGeneratedDocumentTemplates() || []);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os modelos de contrato.');
      setShowGeneratedDocumentModal(false);
    } finally {
      setLoadingGeneratedTemplates(false);
    }
  };

  const selectGeneratedTemplate = (templateType) => {
    setGeneratedDocumentForm((previous) => ({
      ...previous,
      template_type: templateType,
      contract_object: '',
      amount: '',
      payment_terms: '',
    }));
  };

  const handleGenerateDocument = async (event) => {
    event.preventDefault();
    const selectedTemplate = generatedTemplates.find((template) => template.id === generatedDocumentForm.template_type);
    const missingClientFields = getMissingGeneratedDocumentFields(client, selectedTemplate?.document_kind);
    if (missingClientFields.length) {
      setGeneratedDocumentError(`Complete os dados do cliente antes de emitir: ${missingClientFields.join(', ')}.`);
      return;
    }
    const requiresContractFields = selectedTemplate?.requires_contract_fields !== false;
    const amount = requiresContractFields ? parseBRLInput(generatedDocumentForm.amount) : null;
    if (requiresContractFields && (!Number.isFinite(amount) || amount <= 0)) {
      setGeneratedDocumentError('Informe um valor válido para o contrato.');
      return;
    }
    try {
      setGeneratingDocument(true);
      setGeneratedDocumentError('');
      await generateClientDocument(clientId, {
        ...generatedDocumentForm,
        amount,
      });
      setShowGeneratedDocumentModal(false);
      setGeneratedDocumentForm(EMPTY_GENERATED_DOCUMENT);
    } catch (err) {
      setGeneratedDocumentError(err.message || 'Não foi possível emitir o contrato.');
    } finally {
      setGeneratingDocument(false);
    }
  };

  // ── Render ───────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando cliente...</p>
    </div>
  );

  if (!client) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p style={{ color: '#ef4444', marginBottom: 16 }}>Cliente não encontrado.</p>
      <button onClick={() => router.back()} className="btn-secondary">← Voltar</button>
    </div>
  );

  const clientStatusLabel = CLIENT_STATUS_OPTIONS.find(o => o.value === client.status)?.label || 'Negociação';
  const selectedGeneratedTemplate = generatedTemplates.find((template) => template.id === generatedDocumentForm.template_type);
  const isPowerOfAttorney = selectedGeneratedTemplate?.document_kind === 'power_of_attorney';
  const missingGeneratedDocumentFields = getMissingGeneratedDocumentFields(client, selectedGeneratedTemplate?.document_kind);

  return (
    <div className="client-detail-page">

      {/* Breadcrumb */}
      <div className="cd-breadcrumb">
        <button onClick={() => router.push('/dashboard?module=multas&tab=clients')} className="cd-back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Clientes
        </button>
        <span className="cd-breadcrumb-sep">/</span>
        <span className="cd-breadcrumb-current">{client.name}</span>
      </div>

      {error && (
        <div className="error-message" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Header do cliente */}
      <div className="cd-client-card">
        <div className="cd-client-avatar">
          {client.name?.charAt(0).toUpperCase()}
        </div>
        <div className="cd-client-info">
          <div className="cd-client-title-row">
            <h1 className="cd-client-name">{client.name}</h1>
            <span className={`client-status-badge ${client.status || 'negociacao'}`}>
              {clientStatusLabel}
            </span>
          </div>
          <div className="cd-client-fields">
            {[
              { label: 'CPF',          value: formatCPF(client.cpf) },
              { label: 'CNH',          value: client.cnh || '—' },
              { label: 'Nascimento',   value: formatDate(client.birth_date) },
              { label: '1ª CNH',       value: formatDate(client.first_cnh) },
              { label: 'Telefone',     value: client.phone || '—' },
              { label: 'E-mail',       value: client.email || '—', className: 'cd-field cd-field-email' },
              { label: 'Consultor',    value: client.consultant_name || 'Não atribuído', className: 'cd-field cd-field-consultant' },
            ].map(({ label, value, className = 'cd-field' }) => (
              <div key={label} className={className}>
                <span className="cd-field-label">{label}</span>
                <span className="cd-field-value">{value}</span>
              </div>
            ))}
            {client.address && (
              <div className="cd-field" style={{ gridColumn: '1 / -1' }}>
                <span className="cd-field-label">Endereço</span>
                <span className="cd-field-value">{client.address}</span>
              </div>
            )}
            {client.notes && (
              <div className="cd-field" style={{ gridColumn: '1 / -1' }}>
                <span className="cd-field-label">Observações</span>
                <span className="cd-field-value" style={{ fontStyle: 'italic', color: '#64748b' }}>{client.notes}</span>
              </div>
            )}
          </div>
        </div>
        <button onClick={startEditClient} className="cd-edit-btn" title="Editar dados do cliente">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editar
        </button>
      </div>

      {/* Serviços / Contratações */}
      <div className="cd-services-section">
        <div className="cd-services-header">
          <div>
            <h2 className="cd-services-title">Serviços Contratados</h2>
            <p className="cd-services-sub">{services.length} tipo{services.length !== 1 ? 's' : ''} de serviço</p>
          </div>
          <div className="cd-services-actions">
            <button onClick={openGeneratedDocumentModal} className="cd-contract-generate-btn" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
              </svg>
              Novo Documento
            </button>
            <button onClick={() => setShowServiceModal(true)} className="btn-primary cd-add-service-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo Serviço
            </button>
          </div>
        </div>

        {services.length === 0 ? (
          <div className="cd-empty-services">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>Nenhum serviço contratado ainda.</p>
            <button onClick={() => setShowServiceModal(true)} className="btn-primary" style={{ marginTop: 12 }}>
              Adicionar primeiro serviço
            </button>
          </div>
        ) : (
          <div className="cd-services-list">
            {services.map((service) => {
              const contracts = contractsMap[service.id] || [];
              const name      = service.name?.toUpperCase();
              const label     = getServiceLabel(name);
              return (
                <div key={service.id} className="cd-service-block">
                  {/* Service header */}
                  <div className="cd-service-block-header">
                    <div className="cd-service-block-title">
                      <span className="cd-service-type-badge">{label}</span>
                      <span className="cd-service-count">
                        {contracts.length} registro{contracts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="cd-service-block-actions">
                      <button
                        onClick={() => openContractModal(service)}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: 13, borderRadius: 8 }}
                      >
                        + Adicionar
                      </button>
                      <button
                        onClick={() => handleDeleteService(service.id)}
                        className="btn-icon danger"
                        title="Excluir serviço"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Contracts table */}
                  {contracts.length === 0 ? (
                    <div className="cd-service-empty">
                      Nenhum registro neste serviço. Clique em &quot;+ Adicionar&quot;.
                    </div>
                  ) : (
                    <table className="data-table" style={{ border: 'none', borderRadius: 0 }}>
                      <thead>
                        <tr>
                          {name === 'MULTA' && <><th>Nº Auto de Infração</th><th>Placa</th><th>Enquadramento</th><th>Órgão</th></>}
                          {name === 'TRI' && <><th>Nº Auto de Infração</th><th>Placa</th><th>Enquadramento</th><th>Nome do Real Infrator</th><th>Órgão</th></>}
                          {(name === 'SUSPENSAO' || name === 'CASSACAO') && <><th>Nº Processo</th><th>Órgão</th></>}
                          {name === 'CRCI' && <th>Nº Processo</th>}
                          {name !== 'MULTA' && name !== 'TRI' && name !== 'SUSPENSAO' && name !== 'CASSACAO' && name !== 'CRCI' && <th>Serviço</th>}
                          <th>Prazo</th>
                          <th>Andamento</th>
                          <th>Observações</th>
                          <th style={{ width: 80 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contracts.map((contract) => (
                          <React.Fragment key={contract.id}>
                          <tr>
                            {name === 'MULTA' && (
                              <>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                  {contract.numero_multa || '—'}
                                </td>
                                <td>{contract.vehicle_plate || '—'}</td>
                                <td>{contract.infraction_type || '—'}</td>
                                <td>{contract.organ || '—'}</td>
                              </>
                            )}
                            {name === 'TRI' && (
                              <>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{contract.numero_multa || '—'}</td>
                                <td>{contract.vehicle_plate || '—'}</td>
                                <td>{contract.infraction_type || '—'}</td>
                                <td style={{ fontWeight: 600, color: '#751518' }}>{contract.real_infractor_name || '—'}</td>
                                <td>{contract.organ || '—'}</td>
                              </>
                            )}
                            {(name === 'SUSPENSAO' || name === 'CASSACAO') && (
                              <>
                                <td style={{ fontFamily: 'monospace' }}>{contract.numero_multa || '—'}</td>
                                <td>{contract.organ || '—'}</td>
                              </>
                            )}
                            {name === 'CRCI' && (
                              <td style={{ fontFamily: 'monospace' }}>{contract.numero_multa || '—'}</td>
                            )}
                            {name !== 'MULTA' && name !== 'TRI' && name !== 'SUSPENSAO' && name !== 'CASSACAO' && name !== 'CRCI' && (
                              <td>{label}</td>
                            )}
                            <td style={{ fontSize: 13, ...getPrazoStyle(contract.due_date) }}>
                              {formatDate(contract.due_date)}
                            </td>
                            <td>
                              <span className="service-status-badge" style={getStatusStyle(contract.status)}>
                                {getStatusLabel(contract.status)}
                              </span>
                            </td>
                            <td style={{ color: '#64748b', fontSize: 13 }}>
                              {contract.notes || '—'}
                            </td>
                            <td>
                              <div className="actions-cell">
                                <button
                                  onClick={() => setExpandedProtocol(prev => prev === contract.id ? null : contract.id)}
                                  className="btn-icon"
                                  title="Protocolo"
                                  style={{ color: contract.protocol_number ? '#751518' : undefined }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                  </svg>
                                </button>
                                <button onClick={() => openContractModal(service, contract)} className="btn-icon" title="Editar">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                                {isAdmin ? (
                                  <button onClick={() => handleDeleteContract(service.id, contract.id)} className="btn-icon danger" title="Excluir">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6"/>
                                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    </svg>
                                  </button>
                                ) : (
                                  <button onClick={()=>{ setShowDeleteContractModal(contract); setDeleteContractReason(''); }} className="btn-icon" title="Solicitar exclusão" style={{ color:'#f59e0b' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Painel de Protocolo inline */}
                          {expandedProtocol === contract.id && (
                            <tr>
                              <td colSpan="99" style={{ padding: 0, background: 'rgba(117,21,24,0.03)' }}>
                                <ProtocolPanel
                                  contract={contract}
                                  onSave={(data) => handleSaveProtocol(contract.id, data)}
                                  onClose={() => setExpandedProtocol(null)}
                                />
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Documentos do Cliente ── */}
      <div className="cd-services-section">
        <div className="cd-services-header">
          <div>
            <h2 className="cd-services-title">Documentos do Cliente</h2>
            <p className="cd-services-sub">{clientDocs.length} documento{clientDocs.length !== 1 ? 's' : ''} anexado{clientDocs.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowDocModal(true)} className="btn-primary cd-add-service-btn" style={{ background: '#475569', borderColor: '#475569' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Adicionar Documento
          </button>
        </div>

        {renameDocOk && <div style={{ margin: '0 0 12px', fontSize: 13, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}>Documento renomeado com sucesso.</div>}

        {clientDocs.length === 0 ? (
          <div className="cd-empty-services" style={{ background: '#fff', border: '1px dashed #e2e8f0' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>Nenhum documento cadastrado. Clique em &quot;Adicionar Documento&quot;.</p>
          </div>
        ) : (
          <div className="cd-doc-list">
            {clientDocs.map((doc) => (
              <div key={doc.id} className="cd-doc-item">
                <div className="cd-doc-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="cd-doc-info">
                  {doc.file_url
                    ? <a href={doc.file_url} target="_blank" rel="noreferrer" className="cd-doc-name" style={{ color: '#751518', textDecoration: 'none' }}>{doc.file_name || doc.name || 'Documento'}</a>
                    : <span className="cd-doc-name">{doc.file_name || doc.name || 'Documento'}</span>
                  }
                  <span className="cd-doc-meta">
                    {doc.category && doc.category !== 'outros' && <span>{doc.category}</span>}
                    {doc.description && <span>{doc.description}</span>}
                    {doc.uploaded_at && <span>{new Date(doc.uploaded_at).toLocaleDateString('pt-BR')}</span>}
                  </span>
                </div>
                <button onClick={() => setRenamingDoc(doc)} className="btn-icon" title="Renomear documento">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                {isAdmin ? (
                  <button onClick={() => deleteClientDoc(doc.id)} className="btn-icon danger" title="Excluir">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                  </button>
                ) : (
                  <button onClick={() => { setShowDeleteDocModal(doc); setDeleteDocReason(''); }} className="btn-icon" title="Solicitar exclusão" style={{ color: '#f59e0b' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {renamingDoc && (
        <RenameDocumentModal
          doc={renamingDoc}
          onClose={() => setRenamingDoc(null)}
          onRenamed={(updated) => {
            setClientDocs(prev => prev.map(d => (d.id === updated.id ? { ...d, file_name: updated.file_name } : d)));
            setRenameDocOk(true);
            setTimeout(() => setRenameDocOk(false), 3500);
          }}
        />
      )}

      {/* ── Modal: emitir contrato com dados automáticos do cliente ── */}
      {showGeneratedDocumentModal && (
        <div className="modal-overlay" onClick={() => !generatingDocument && setShowGeneratedDocumentModal(false)}>
          <div className="modal-content" style={{ maxWidth: 680 }} onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 750 }}>Novo documento</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>Preenchimento automático com os dados já cadastrados do cliente.</p>
              </div>
              <button onClick={() => setShowGeneratedDocumentModal(false)} className="btn-close" disabled={generatingDocument}>✕</button>
            </div>
            <form onSubmit={handleGenerateDocument} className="modal-form">
              <div className="cd-contract-client-preview">
                <div className="cd-contract-client-preview-icon">{client.name?.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{client.name}</strong>
                  <span>CPF {formatCPF(client.cpf)} · CNH {client.cnh || 'não informada'}</span>
                  <span>{client.phone || 'Telefone não informado'} · {client.email || 'E-mail não informado'}</span>
                </div>
              </div>

              {missingGeneratedDocumentFields.length > 0 && (
                <div className="cd-contract-validation-warning" role="alert">
                  <div>
                    <strong>Cadastro incompleto para emitir o contrato</strong>
                    <span>Preencha: {missingGeneratedDocumentFields.join(', ')}.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGeneratedDocumentModal(false);
                      setGeneratedDocumentError('');
                      startEditClient();
                    }}
                  >
                    Editar dados do cliente
                  </button>
                </div>
              )}

              {generatedDocumentError && (
                <div className="cd-contract-inline-error" role="alert">{generatedDocumentError}</div>
              )}

              <div className="form-group">
                <label>Modelo do documento *</label>
                <select value={generatedDocumentForm.template_type} onChange={event => selectGeneratedTemplate(event.target.value)} disabled={loadingGeneratedTemplates} required>
                  {loadingGeneratedTemplates && <option>Carregando modelos...</option>}
                  {generatedTemplates.map(template => (
                    <option key={template.id} value={template.id} disabled={!template.available}>
                      {template.label}{template.available ? '' : ' — aguardando modelo oficial'}
                    </option>
                  ))}
                </select>
              </div>

              {!isPowerOfAttorney && <div className="form-group">
                <label>Objeto do contrato *</label>
                <textarea
                  value={generatedDocumentForm.contract_object}
                  onChange={event => setGeneratedDocumentForm(previous => ({ ...previous, contract_object: event.target.value }))}
                  rows={4}
                  maxLength={2000}
                  placeholder="Descreva exatamente o serviço que foi fechado..."
                  required
                />
                <span className="cd-contract-field-help">Este texto entra na Cláusula 1ª. Revise antes de emitir.</span>
              </div>}

              {!isPowerOfAttorney && <div className="form-row">
                <div className="form-group">
                  <label>Valor do contrato (R$) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={generatedDocumentForm.amount}
                    onChange={event => setGeneratedDocumentForm(previous => ({ ...previous, amount: event.target.value }))}
                    placeholder="Ex.: 700,00"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Forma/condição de pagamento *</label>
                  <input
                    type="text"
                    value={generatedDocumentForm.payment_terms}
                    onChange={event => setGeneratedDocumentForm(previous => ({ ...previous, payment_terms: event.target.value }))}
                    placeholder="Ex.: À vista no ato da contratação"
                    required
                  />
                </div>
              </div>}

              <div className="cd-contract-signature-note">
                <strong>Assinatura</strong>
                <span>{isPowerOfAttorney ? 'A procuração sairá com a linha e a identificação do outorgante preenchidas.' : 'O PDF sairá com a linha de assinatura e a identificação do cliente preenchida. A assinatura fixa da contratada será adicionada quando a imagem oficial for enviada.'}</span>
              </div>

              <div className="cd-contract-field-help">O arquivo será apenas baixado. Ele não será incluído automaticamente em Documentos; o assinado poderá ser anexado depois.</div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowGeneratedDocumentModal(false)} disabled={generatingDocument}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={generatingDocument || loadingGeneratedTemplates || missingGeneratedDocumentFields.length > 0}>
                  {generatingDocument ? 'Emitindo PDF...' : 'Emitir e baixar PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Editar dados do cliente ── */}
      {editingClientData && (
        <div className="modal-overlay" onClick={() => setEditingClientData(false)}>
          <div className="modal-content" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Editar Cliente</h2>
              <button onClick={() => setEditingClientData(false)} className="btn-close">✕</button>
            </div>
            <form onSubmit={saveClient} className="modal-form">
              <div className="form-group">
                <label>Nome completo *</label>
                <input type="text" value={clientForm.name} onChange={setC('name')} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CPF</label>
                  <input type="text" value={clientForm.cpf} onChange={setC('cpf')} maxLength={11} placeholder="00000000000" inputMode="numeric" />
                </div>
                <div className="form-group">
                  <label>Nascimento</label>
                  <input type="text" value={clientForm.birth_date} onChange={setC('birth_date')} placeholder="ex: 11/09/2006 ou 11092006" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CNH</label>
                  <input type="text" value={clientForm.cnh} onChange={setC('cnh')} />
                </div>
                <div className="form-group">
                  <label>1ª Habilitação</label>
                  <input type="text" value={clientForm.first_cnh} onChange={setC('first_cnh')} placeholder="ex: 11/09/2006 ou 11092006" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Telefone</label>
                  <input type="text" value={clientForm.phone} onChange={setC('phone')} />
                </div>
                <div className="form-group">
                  <label>E-mail</label>
                  <input type="email" value={clientForm.email} onChange={setC('email')} />
                </div>
              </div>
              <div className="form-group">
                <label>Endereço</label>
                <input type="text" value={clientForm.address} onChange={setC('address')} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={clientForm.status} onChange={setC('status')}>
                  {CLIENT_STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {canManageConsultant && client.status === 'fechado' && (
                <div className="form-group">
                  <label>Consultor responsável</label>
                  <select value={clientForm.consultant_id || ''} onChange={setC('consultant_id')} required>
                    <option value="">Selecione...</option>
                    {client.created_by && !consultants.some(consultant => consultant.id === client.created_by) && (
                      <option value={client.created_by}>{client.consultant_name || 'Consultor atual'}</option>
                    )}
                    {consultants.map(consultant => (
                      <option key={consultant.id} value={consultant.id}>{consultant.name || 'Sem nome'}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Observações</label>
                <textarea value={clientForm.notes} onChange={setC('notes')} rows={3} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingClientData(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={savingClient}>
                  {savingClient ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Selecionar tipo de serviço ── */}
      {showServiceModal && (
        <div className="modal-overlay" onClick={() => setShowServiceModal(false)}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Novo Serviço</h2>
              <button onClick={() => setShowServiceModal(false)} className="btn-close">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                Selecione o tipo de serviço a ser adicionado para este cliente.
              </p>
              <form onSubmit={handleSelectServiceType}>
                <div className="form-group">
                  <label>Tipo de Serviço *</label>
                  <select value={selectedServiceType} onChange={e => setSelectedServiceType(e.target.value)} required>
                    <option value="">Selecione...</option>
                    {SERVICE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowServiceModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={!selectedServiceType}>Continuar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Adicionar/Editar registro (contrato/auto) ── */}
      {showContractModal && selectedService && (
        <div className="modal-overlay" onClick={() => setShowContractModal(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>
                  {editingContract ? 'Editar' : 'Novo'} — {getServiceLabel(selectedService.name?.toUpperCase())}
                </h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {editingContract ? 'Atualize o andamento do processo' : 'Adicione um novo registro para este serviço'}
                </p>
              </div>
              <button onClick={() => setShowContractModal(false)} className="btn-close">✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveContract}>
                {(() => {
                  const name = selectedService.name?.toUpperCase();
                  // CRCI possui um fluxo próprio, sem etapas APR. Aplicar o filtro de
                  // APR ao consultor esvaziava o seletor e impedia o cadastro.
                  const statusOp = name === 'CRCI'
                    ? getStatusOptions(name)
                    : filterStatusOptionsForRole(getStatusOptions(name), currentUser?.role);
                  return (
                    <>
                      {(name === 'MULTA' || name === 'TRI') && (
                        <>
                          <div className="form-group">
                            <label>Nº do Auto de Infração *</label>
                            <input
                              value={contractForm.numero_multa}
                              onChange={e => setContractForm({ ...contractForm, numero_multa: e.target.value })}
                              placeholder="Ex.: T123456789"
                              required
                            />
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Placa do Veículo{name === 'TRI' ? ' *' : ''}</label>
                              <input
                                value={contractForm.vehicle_plate}
                                onChange={e => setContractForm({ ...contractForm, vehicle_plate: e.target.value })}
                                placeholder="ABC-1234"
                                required={name === 'TRI'}
                              />
                            </div>
                            <div className="form-group">
                              <label>Enquadramento (art.)</label>
                              <input
                                value={contractForm.infraction_type}
                                onChange={e => setContractForm({ ...contractForm, infraction_type: e.target.value })}
                                placeholder="Ex.: 218, inc. I"
                              />
                            </div>
                            <div className="form-group">
                              <label>Órgão Autuador</label>
                              <select
                                value={contractForm.organ}
                                onChange={e => setContractForm({ ...contractForm, organ: e.target.value })}
                              >
                                <option value="">Selecione...</option>
                                {getOrganOptions(contractForm.organ).map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          </div>
                          {name === 'TRI' && (
                            <div className="form-group">
                              <label>Nome do Real Infrator *</label>
                              <input
                                value={contractForm.real_infractor_name}
                                onChange={e => setContractForm({ ...contractForm, real_infractor_name: e.target.value })}
                                placeholder="Nome completo da pessoa que receberá a nova multa"
                                required
                              />
                            </div>
                          )}
                        </>
                      )}
                      {(name === 'SUSPENSAO' || name === 'CASSACAO') && (
                        <>
                          <div className="form-group">
                            <label>Nº do Processo</label>
                            <input
                              value={contractForm.numero_multa}
                              onChange={e => setContractForm({ ...contractForm, numero_multa: e.target.value })}
                              placeholder="Ex.: 0001234-56.2024.1.00.0000"
                            />
                          </div>
                          <div className="form-group">
                            <label>Órgão</label>
                            <select
                              value={contractForm.organ}
                              onChange={e => setContractForm({ ...contractForm, organ: e.target.value })}
                            >
                              <option value="">Selecione...</option>
                              {ORGANS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          {name === 'SUSPENSAO' && (
                            <div className="form-group">
                              <label>Tipo de Suspensão *</label>
                              <select
                                value={contractForm.infraction_type}
                                onChange={e => setContractForm({ ...contractForm, infraction_type: e.target.value })}
                                required
                              >
                                <option value="">Selecione o tipo...</option>
                                {TIPO_SUSPENSAO_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                      {name === 'CRCI' && (
                        <div className="form-group">
                          <label>Nº do Processo</label>
                          <input
                            value={contractForm.numero_multa}
                            onChange={e => setContractForm({ ...contractForm, numero_multa: e.target.value })}
                            placeholder="Ex.: 0001234-56.2024.1.00.0000"
                          />
                        </div>
                      )}
                      <div className="form-group">
                        <label>Andamento *</label>
                        <select
                          value={contractForm.status}
                          onChange={e => setContractForm({ ...contractForm, status: e.target.value })}
                          required
                        >
                          <option value="">Selecione o andamento...</option>
                          {statusOp.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Prazo</label>
                        {/* Aceita colar/digitar dd/mm/aaaa, ddmmaaaa, yyyy-mm-dd; datepicker auxiliar à direita.
                            Estado guarda o texto exibido; converte para YYYY-MM-DD só ao salvar (sem new Date). */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={contractForm.due_date}
                            onChange={e => setContractForm({ ...contractForm, due_date: normalizeDate(e.target.value) })}
                            placeholder="dd/mm/aaaa"
                            inputMode="numeric"
                            style={{ flex: 1 }}
                          />
                          <input
                            type="date"
                            value={displayToIso(contractForm.due_date) || ''}
                            onChange={e => setContractForm({ ...contractForm, due_date: e.target.value ? isoToDisplay(e.target.value) : '' })}
                            title="Escolher no calendário"
                            aria-label="Escolher data no calendário"
                            style={{ width: 42, flexShrink: 0, padding: '0 4px' }}
                          />
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Somente segunda a sexta-feira.</span>
                      </div>
                      <div className="form-group">
                        <label>Observações</label>
                        <textarea
                          value={contractForm.notes}
                          onChange={e => setContractForm({ ...contractForm, notes: e.target.value })}
                          rows={2}
                          placeholder="Informações adicionais sobre este registro..."
                        />
                      </div>
                    </>
                  );
                })()}
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowContractModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={savingContract}>
                    {savingContract ? 'Salvando...' : editingContract ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Adicionar documento ── */}
      {showDocModal && (
        <div className="modal-overlay" onClick={() => { setShowDocModal(false); setDocFile(null); setDocForm({ name: '', type: '', description: '' }); }}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Novo Documento</h2>
              <button onClick={() => { setShowDocModal(false); setDocFile(null); setDocForm({ name: '', type: '', description: '' }); }} className="btn-close">✕</button>
            </div>
            <form onSubmit={saveClientDoc} className="modal-form">
              <div className="form-group">
                <label>Arquivo *</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f8fafc', border: docFile ? '1px solid #bbf7d0' : '1px dashed #cbd5e1', borderRadius: 8, cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={e => { setDocFile(e.target.files[0] || null); if (e.target.files[0] && !docForm.name) setDocForm(prev => ({ ...prev, name: e.target.files[0].name })); }}
                  />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={docFile ? '#16a34a' : '#94a3b8'} strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ fontSize: 13, color: docFile ? '#16a34a' : '#94a3b8' }}>
                    {docFile ? docFile.name : 'Selecionar PDF, JPG ou PNG (máx. 10 MB)'}
                  </span>
                </label>
              </div>
              <div className="form-group">
                <label>Nome do documento *</label>
                <input
                  type="text"
                  value={docForm.name}
                  onChange={e => setDocForm({ ...docForm, name: e.target.value })}
                  placeholder="Ex.: CNH, Comprovante de Residência, Procuração..."
                  required
                />
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select value={docForm.type} onChange={e => setDocForm({ ...docForm, type: e.target.value })}>
                  <option value="">Selecione o tipo...</option>
                  {['CNH', 'RG', 'CRLV', 'Comprovante de Residência', 'Comprovante de Pagamento', 'Procuração', 'Contrato', 'Auto de Infração', 'Outros'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <input
                  type="text"
                  value={docForm.description}
                  onChange={e => setDocForm({ ...docForm, description: e.target.value })}
                  placeholder="Observações sobre este documento..."
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowDocModal(false); setDocFile(null); setDocForm({ name: '', type: '', description: '' }); }}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={savingDoc || uploadingDoc}>
                  {uploadingDoc ? 'Enviando arquivo...' : savingDoc ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Solicitar exclusão de documento */}
      {showDeleteDocModal && (
        <div className="modal-overlay" onClick={()=>setShowDeleteDocModal(null)}>
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize:16, fontWeight:700 }}>Solicitar Exclusão</h2>
              <button onClick={()=>setShowDeleteDocModal(null)} className="btn-close">✕</button>
            </div>
            <form onSubmit={handleSolicitarExclusaoDoc} className="modal-form">
              <p style={{ fontSize:13, color:'#475569', marginBottom:12 }}>
                Solicitando exclusão de: <strong>{showDeleteDocModal.file_name || 'Documento'}</strong>
              </p>
              <div className="form-group">
                <label>Motivo da exclusão</label>
                <textarea value={deleteDocReason} onChange={e=>setDeleteDocReason(e.target.value)} rows={3} placeholder="Explique por que deseja excluir este documento..." />
              </div>
              <div className="form-actions">
                <button type="button" onClick={()=>setShowDeleteDocModal(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={deletingDocRequest} style={{ background:'#f59e0b', borderColor:'#f59e0b' }}>
                  {deletingDocRequest?'Enviando...':'Solicitar Exclusão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Solicitar exclusão de contrato */}
      {showDeleteContractModal && (
        <div className="modal-overlay" onClick={()=>setShowDeleteContractModal(null)}>
          <div className="modal-content" style={{ maxWidth:420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize:16, fontWeight:700 }}>Solicitar Exclusão</h2>
              <button onClick={()=>setShowDeleteContractModal(null)} className="btn-close">✕</button>
            </div>
            <form onSubmit={handleSolicitarExclusaoContrato} className="modal-form">
              <p style={{ fontSize:13, color:'#475569', marginBottom:12 }}>
                Solicitando exclusão do registro: <strong>{showDeleteContractModal.numero_multa||showDeleteContractModal.id}</strong>
              </p>
              <div className="form-group">
                <label>Motivo da exclusão</label>
                <textarea value={deleteContractReason} onChange={e=>setDeleteContractReason(e.target.value)} rows={3} placeholder="Explique por que deseja excluir..." />
              </div>
              <div className="form-actions">
                <button type="button" onClick={()=>setShowDeleteContractModal(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={deletingContractRequest} style={{ background:'#f59e0b', borderColor:'#f59e0b' }}>
                  {deletingContractRequest?'Enviando...':'Solicitar Exclusão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formulário de item de protocolo (fora do ProtocolPanel para evitar remount) ─
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

// ─── Componente de Protocolo inline (múltiplos protocolos) ─────────────────────

function ProtocolPanel({ contract, onSave, onClose }) {
  // Estado dos protocolos carregados da nova tabela
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

  // Carregar protocolos ao montar
  useEffect(() => {
    Promise.all([
      listByFine(contract.id).catch(() => []),
      getProtocolEmailHistory(contract.id).catch(() => []),
    ])
      .then(([protocolData, historyData]) => {
        setProtocols(protocolData || []);
        setEmailHistory(historyData || []);
      })
      .finally(() => setLoadingProto(false));
  }, [contract.id]);

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

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await createProtocol({ ...newForm, protocol_date: displayToIso(newForm.protocol_date), fine_id: contract.id });
      setProtocols(prev => [...prev, created]);
      setNewForm({ protocol_number:'', protocol_date:'', protocol_status:'protocolado', protocol_notes:'', protocol_file_url:'' });
      setShowAddForm(false);
    } catch (err) { setUploadError(err.message); }
    finally { setSaving(false); }
  };

  const handleUpdateItem = async (proto, field, value) => {
    try {
      const merged = { ...proto, [field]: value };
      const updated = await updateProtocol(proto.id, { ...merged, protocol_date: displayToIso(merged.protocol_date) });
      setProtocols(prev => prev.map(p => p.id===proto.id ? updated : p));
    } catch (err) { setUploadError(err.message); }
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
        ? `Este protocolo já possui um envio registrado (${r.status}).`
        : `E-mail enfileirado para ${r?.queued_for || 'o cliente'}. A entrega será atualizada aqui.`;
      setEmailFeedback({ id: protoId, type: 'success', msg });
      const history = await getProtocolEmailHistory(contract.id).catch(() => []);
      setEmailHistory(history || []);
    } catch (err) {
      setEmailFeedback({ id: protoId, type: 'error', msg: err.message || 'Falha ao enviar o e-mail.' });
    } finally {
      setEmailingId(null);
    }
  };

  // Protocolo legado (fines.protocol_*) — exibe como item read-only se tiver dados
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
          <button className="cd-protocol-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div style={{ padding:'8px 12px' }}>
        {loadingProto ? (
          <p style={{ fontSize:12, color:'#94a3b8', textAlign:'center', padding:'12px 0' }}>Carregando...</p>
        ) : (
          <>
            {/* Formulário novo protocolo */}
            {showAddForm && (
              <ProtocolItemForm
                form={newForm} setForm={setNewForm}
                onSubmit={handleAdd} onCancel={()=>setShowAddForm(false)}
                submitting={saving}
                uploadingId={uploadingId} uploadError={uploadError} handleFileUpload={handleFileUpload}
              />
            )}

            {/* Protocolo legado (fines.protocol_*) — somente leitura */}
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

            {/* Lista de protocolos novos */}
            {protocols.map(proto => (
              <div key={proto.id} style={{ padding:'10px 12px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:8 }}>
                {editingId === proto.id ? (
                  <ProtocolItemForm
                    form={proto}
                    setForm={updater => setProtocols(prev => prev.map(p =>
                      p.id === proto.id
                        ? (typeof updater === 'function' ? updater(p) : { ...p, ...updater })
                        : p
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
                {emailHistory.slice(0, 12).map(event => (
                  <div key={event.id} style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:7, marginBottom:6, fontSize:11 }}>
                    <span style={{ fontWeight:650, color:'#334155' }}>{event.message}</span>
                    <span style={{ color:'#64748b', whiteSpace:'nowrap' }}>{new Date(event.provider_created_at || event.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

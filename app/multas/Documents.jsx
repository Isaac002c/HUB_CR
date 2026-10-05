'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFines, getFineDocuments, addFineDocument, deleteFineDocument, DOCUMENT_CATEGORIES } from '../lib/finesAPI';
import { getClients } from '../lib/clientsAPI';

const CATEGORY_LABELS = {
  defesa: 'Defesa',
  recurso: 'Recurso',
  comprovante: 'Comprovante',
  outro: 'Outro'
};

const emptyForm = {
  fine_id: '',
  name: '',
  file_url: '',
  file_type: '',
  file_size: '',
  category: 'outro'
};

export default function MultasDocuments() {
  const [fines, setFines] = useState([]);
  const [clients, setClients] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [filterFineId, setFilterFineId] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const loadAllDocuments = useCallback(async (finesList) => {
    try {
      // Busca documentos de cada multa em paralelo
      const results = await Promise.all(
        finesList.map(async (fine) => {
          try {
            const docs = await getFineDocuments(fine.id);
            return (docs || []).map(doc => ({
              ...doc,
              fine_number: fine.fine_number,
              client_name: fine.client_name,
              fine_id: fine.id
            }));
          } catch {
            return [];
          }
        })
      );
      setDocuments(results.flat());
    } catch (err) {
      console.error('Erro ao carregar documentos:', err);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [finesData, clientsData] = await Promise.all([getFines(), getClients()]);
      setFines(finesData || []);
      setClients(clientsData || []);
      // Carregar todos os documentos de todas as multas
      await loadAllDocuments(finesData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadAllDocuments]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadDocumentsForFine = async (fineId) => {
    try {
      const fine = fines.find(f => f.id === fineId);
      const docs = await getFineDocuments(fineId, filterCategory || null);
      setDocuments((docs || []).map(doc => ({
        ...doc,
        fine_number: fine?.fine_number,
        client_name: fine?.client_name,
        fine_id: fineId
      })));
    } catch (err) {
      setError(err.message);
    }
  };

  const applyFilters = async () => {
    if (filterFineId) {
      await loadDocumentsForFine(filterFineId);
    } else {
      await loadAllDocuments(fines);
    }
  };

  const clearFilters = async () => {
    setFilterFineId('');
    setFilterCategory('');
    await loadAllDocuments(fines);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setFormData(prev => ({
      ...prev,
      name: file.name,
      file_type: file.type,
      file_size: file.size.toString()
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fine_id) {
      setError('Selecione uma multa');
      return;
    }
    setSaving(true);
    try {
      let fileUrl = formData.file_url;
      if (selectedFile) {
        // Converter para base64
        fileUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(selectedFile);
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
      }

      await addFineDocument(formData.fine_id, {
        name: formData.name,
        file_url: fileUrl,
        file_type: formData.file_type || null,
        file_size: formData.file_size ? parseInt(formData.file_size) : null,
        category: formData.category
      });

      setShowModal(false);
      setSelectedFile(null);
      setFormData(emptyForm);
      await loadInitial();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fineId, documentId) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      await deleteFineDocument(fineId, documentId);
      await loadInitial();
    } catch (err) {
      setError(err.message);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  // Filtro local por categoria (complementa o filtro do servidor)
  const filteredDocs = filterCategory
    ? documents.filter(d => d.category === filterCategory)
    : documents;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Carregando documentos...</p>
      </div>
    );
  }

  return (
    <div className="multas-documents">

      {/* Filtros */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Multa</label>
          <select value={filterFineId} onChange={(e) => setFilterFineId(e.target.value)}>
            <option value="">Todas as multas</option>
            {fines.map(f => (
              <option key={f.id} value={f.id}>
                {f.fine_number || f.id.substring(0, 8)} â€” {f.client_name || ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Categoria</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <button onClick={applyFilters} className="btn-filter">Filtrar</button>
        <button onClick={clearFilters} className="btn-reset">Limpar</button>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ Novo Documento</button>
      </div>

      {/* Erro */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>âœ•</button>
        </div>
      )}

      {/* Tabela */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Categoria</th>
              <th>Multa</th>
              <th>Cliente</th>
              <th>Tamanho</th>
              <th>Data</th>
              <th>AÃ§Ãµes</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">Nenhum documento encontrado</td>
              </tr>
            ) : (
              filteredDocs.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <div className="file-info">
                      <span className="file-icon">ðŸ“„</span>
                      <span className="file-name">{doc.name}</span>
                    </div>
                  </td>
                  <td><span className="category-badge">{CATEGORY_LABELS[doc.category] || doc.category}</span></td>
                  <td>{doc.fine_number || '-'}</td>
                  <td>{doc.client_name || '-'}</td>
                  <td>{formatFileSize(doc.file_size)}</td>
                  <td>{formatDate(doc.created_at)}</td>
                  <td className="actions-cell">
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="btn-icon" title="Visualizar">
                        ðŸ‘ï¸
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(doc.fine_id, doc.id)}
                      className="btn-icon danger"
                      title="Excluir"
                    >
                      ðŸ—‘ï¸
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Novo Documento</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">[X]</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label>Multa *</label>
                <select
                  value={formData.fine_id}
                  onChange={(e) => setFormData({ ...formData, fine_id: e.target.value })}
                  required
                >
                  <option value="">Selecione uma multa</option>
                  {fines.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.fine_number || f.id.substring(0, 8)} â€” {f.client_name || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Selecionar Arquivo</label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt"
                />
                {selectedFile && (
                  <div style={{ marginTop: 8, padding: 8, background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: 6 }}>
                    ðŸ“„ {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>
              {!selectedFile && (
                <div className="form-group">
                  <label>Ou URL Externa</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.file_url}
                    onChange={(e) => setFormData({ ...formData, file_url: e.target.value, name: formData.name || e.target.value })}
                  />
                </div>
              )}
              {(selectedFile || formData.file_url) && (
                <div className="form-group">
                  <label>Nome do arquivo *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="form-actions">
                <button type="button" onClick={() => { setShowModal(false); setSelectedFile(null); }} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

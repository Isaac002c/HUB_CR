
'use client';

import { useState } from 'react';
import leadsAPI from '../lib/leadsAPI';

export default function ExportReports() {
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [format, setFormat] = useState('csv');
  const [exportStatus, setExportStatus] = useState(null);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const data = await leadsAPI.getAll();
      setLeads(data || []);
    } catch (err) {
      console.error('Erro ao carregar leads:', err);
    } finally {
      setLoading(false);
    }
  };

  // Converter dados para CSV
  const convertToCSV = (data) => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Cabeçalho
    csvRows.push(headers.join(','));
    
    // Linhas
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        // Escapar vírgulas e aspas
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  };

  // Converter dados para JSON
  const convertToJSON = (data) => {
    return JSON.stringify(data, null, 2);
  };

  // Baixar arquivo
  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Exportar dados
  const handleExport = async () => {
    if (leads.length === 0) {
      await loadLeads();
    }
    
    try {
      setExportStatus('exporting');
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `leads_export_${timestamp}`;
      
      if (format === 'csv') {
        const csv = convertToCSV(leads);
        downloadFile(csv, `${filename}.csv`, 'text/csv');
      } else {
        const json = convertToJSON(leads);
        downloadFile(json, `${filename}.json`, 'application/json');
      }
      
      setExportStatus('success');
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      console.error('Erro ao exportar:', err);
      setExportStatus('error');
    }
  };

  // Preview dos dados
  const handlePreview = async () => {
    if (leads.length === 0) {
      await loadLeads();
    }
  };

  return (
    <div className="export-container">
      <div className="section-header">
        <h2>📥 Exportar Dados</h2>
      </div>

      <div className="export-options">
        <div className="export-card">
          <h3>Formato de Exportação</h3>
          <div className="format-selector">
            <button 
              className={`format-btn ${format === 'csv' ? 'active' : ''}`}
              onClick={() => setFormat('csv')}
            >
              📄 CSV
            </button>
            <button 
              className={`format-btn ${format === 'json' ? 'active' : ''}`}
              onClick={() => setFormat('json')}
            >
              📋 JSON
            </button>
          </div>
          
          <div className="export-info">
            {format === 'csv' ? (
              <p>CSV é ideal para importar no Excel, Google Sheets ou outros programas de planilhas.</p>
            ) : (
              <p>JSON é ideal para integrações com API ou backup de dados estruturados.</p>
            )}
          </div>

          <button 
            className="btn-primary export-btn"
            onClick={handleExport}
            disabled={exportStatus === 'exporting'}
          >
            {exportStatus === 'exporting' ? '⏳ Exportando...' : '📥 Baixar Arquivo'}
          </button>

          {exportStatus === 'success' && (
            <div className="success-message">
              ✅ Arquivo exportado com sucesso!
            </div>
          )}

          {exportStatus === 'error' && (
            <div className="error-message">
              ❌ Erro ao exportar arquivo. Tente novamente.
            </div>
          )}
        </div>

        <div className="export-card">
          <h3>Pré-visualização</h3>
          <p className="export-info">
            Visualize os dados antes de exportar. Total de {leads.length} leads carregados.
          </p>
          
          <button 
            className="btn-secondary"
            onClick={handlePreview}
            disabled={loading}
          >
            {loading ? '⏳ Carregando...' : '👁️ Carregar Dados'}
          </button>

          {leads.length > 0 && (
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Empresa</th>
                    <th>Status</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 5).map(lead => (
                    <tr key={lead.id}>
                      <td>{lead.name}</td>
                      <td>{lead.email}</td>
                      <td>{lead.company || '-'}</td>
                      <td>{lead.status}</td>
                      <td>R$ {Number(lead.value || 0).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leads.length > 5 && (
                <p className="preview-note">...e mais {leads.length - 5} registros</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Estatísticas da exportação */}
      <div className="export-stats">
        <h3>📊 Estatísticas dos Dados</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{leads.length}</div>
            <div className="stat-label">Total de Leads</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">
              {leads.filter(l => l.status === 'ganho').length}
            </div>
            <div className="stat-label">Leads Ganhos</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">
              R$ {leads.reduce((sum, l) => sum + (l.value || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </div>
            <div className="stat-label">Valor Total</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">
              {new Set(leads.map(l => l.source)).size}
            </div>
            <div className="stat-label">Fontes Únicas</div>
          </div>
        </div>
      </div>
    </div>
  );
}


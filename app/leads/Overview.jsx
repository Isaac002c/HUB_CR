'use client';

import { useState, useEffect } from 'react';
import leadsAPI from '../lib/leadsAPI';
import targetsAPI from '../lib/targetsAPI';
import forecastAPI from '../lib/forecastAPI';

export default function LeadsOverview() {
  const [currentRole] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return String(JSON.parse(localStorage.getItem('user') || '{}').role || '').toLowerCase(); }
    catch { return ''; }
  });
  const canManageCompanyTarget = currentRole === 'master';
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: [], bySource: [] });
  const [pipelineMetrics, setPipelineMetrics] = useState(null);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetForm, setTargetForm] = useState({ month: new Date().getMonth() + 1, target_value: 0 });
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [forecastConfig, setForecastConfig] = useState([]);
  const [forecastForm, setForecastForm] = useState([]);
  const [visibleKPIs, setVisibleKPIs] = useState({
    totalLeads: true,
    revenue: true,
    pipeline: true,
    forecast: true,
    conversion: true,
    target: true
  });
  const [showKPISettings, setShowKPISettings] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    value: 0,
    status: 'novo',
    source: 'site'
  });

  useEffect(() => {
    loadData();
    loadKPISettings();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [leadsData, statsData, targetsData, pipelineData] = await Promise.all([
        leadsAPI.getAll(),
        leadsAPI.getStats(),
        canManageCompanyTarget ? targetsAPI.getTargets() : Promise.resolve([]),
        leadsAPI.getPipelineMetrics().catch(() => null)
      ]);
      setLeads(leadsData);
      setStats(statsData);
      setTargets(targetsData);
      setPipelineMetrics(pipelineData);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      // Carrega dados básicos mesmo se alguns falharem
      try {
        const [leadsData, statsData] = await Promise.all([
          leadsAPI.getAll(),
          leadsAPI.getStats()
        ]);
        setLeads(leadsData);
        setStats(statsData);
      } catch (e) {
        console.error('Erro ao carregar dados básicos:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLead) {
        await leadsAPI.update(editingLead.id, formData);
        setMessage({ type: 'success', text: 'Lead atualizado com sucesso!' });
      } else {
        await leadsAPI.create(formData);
        setMessage({ type: 'success', text: 'Lead criado com sucesso!' });
      }
      setFormData({ name: '', email: '', phone: '', company: '', value: 0, status: 'novo', source: 'site' });
      setShowForm(false);
      setEditingLead(null);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleEdit = (lead) => {
    setFormData({
      name: lead.name,
      email: lead.email,
      phone: lead.phone || '',
      company: lead.company || '',
      value: lead.value || 0,
      status: lead.status,
      source: lead.source || 'site'
    });
    setEditingLead(lead);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este lead?');
    if (confirmed) {
      try {
        await leadsAPI.delete(id);
        setMessage({ type: 'success', text: 'Lead excluído com sucesso!' });
        loadData();
      } catch (err) {
        setMessage({ type: 'error', text: err.message });
      }
    }
  };

  const handleSaveTarget = async (e) => {
    e.preventDefault();
    if (!canManageCompanyTarget) return;
    try {
      await targetsAPI.createTarget({
        month: parseInt(targetForm.month),
        year: new Date().getFullYear(),
        target_value: parseFloat(targetForm.target_value)
      });
      setMessage({ type: 'success', text: 'Meta salva com sucesso!' });
      setShowTargetModal(false);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // ========== FORECAST CONFIG ==========
  const openForecastModal = async () => {
    try {
      const config = await forecastAPI.getConfig();
      setForecastConfig(config || []);
      setForecastForm(config || []);
      setShowForecastModal(true);
    } catch (err) {
      console.error('Erro ao carregar config de forecast:', err);
      // Usar valores padrão
      const defaultConfig = [
        { stage: 'novo', probability: 10 },
        { stage: 'contactado', probability: 20 },
        { stage: 'qualificado', probability: 30 },
        { stage: 'proposta', probability: 60 },
        { stage: 'negociacao', probability: 80 },
        { stage: 'ganho', probability: 100 }
      ];
      setForecastConfig(defaultConfig);
      setForecastForm(defaultConfig);
      setShowForecastModal(true);
    }
  };

  const handleSaveForecastConfig = async (e) => {
    e.preventDefault();
    try {
      await forecastAPI.updateConfig(forecastForm);
      setMessage({ type: 'success', text: 'Configuração de Forecast salva!' });
      setShowForecastModal(false);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleResetForecast = async () => {
    try {
      await forecastAPI.resetConfig();
      const config = await forecastAPI.getConfig();
      setForecastConfig(config || []);
      setForecastForm(config || []);
      setMessage({ type: 'success', text: 'Forecast resetado para padrão!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const updateForecastProbability = (stage, value) => {
    setForecastForm(forecastForm.map(f => 
      f.stage === stage ? { ...f, probability: parseInt(value) } : f
    ));
  };

  // ========== KPI VISIBILITY ==========
  const toggleKPI = (key) => {
    setVisibleKPIs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const saveKPISettings = () => {
    // Salvar no localStorage para persistência
    if (typeof window !== 'undefined') {
      localStorage.setItem('visibleKPIs', JSON.stringify(visibleKPIs));
    }
    setShowKPISettings(false);
  };

  const loadKPISettings = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('visibleKPIs');
      if (saved) {
        try {
          setVisibleKPIs(JSON.parse(saved));
        } catch (e) {
          console.error('Erro ao carregar configurações de KPI:', e);
        }
      }
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      novo: '#3B82F6',
      contactado: '#F59E0B',
      qualificado: '#8B5CF6',
      proposta: '#10B981',
      negociacao: '#06B6D4',
      ganho: '#22C55E',
      perdido: '#EF4444'
    };
    return colors[status] || '#6B7280';
  };

  // ========== SCORE AUTOMÁTICO DE LEAD ==========
  const calculateLeadScore = (lead) => {
    let score = 0;
    
    // Por valor
    if (lead.value > 5000) score += 20;
    else if (lead.value > 2000) score += 10;
    
    // Por estágio
    if (lead.status === 'proposta' || lead.status === 'negociacao') score += 15;
    else if (lead.status === 'qualificado') score += 10;
    else if (lead.status === 'contactado') score += 5;
    
    // Por canal
    if (lead.source === 'indicacao') score += 15;
    else if (lead.source === 'site') score += 10;
    else if (lead.source === 'google') score += 10;
    
    // Penalidade por tempo inativo
    const daysSinceCreation = Math.floor((Date.now() - new Date(lead.created_at)) / (1000 * 60 * 60 * 24));
    if (daysSinceCreation > 30) score -= 10;
    else if (daysSinceCreation < 7) score += 10;
    
    return score;
  };

  const getLeadTemperature = (score) => {
    if (score >= 30) return { label: 'Quente', color: '#EF4444' };
    if (score >= 15) return { label: 'Morno', color: '#F59E0B' };
    return { label: 'Frio', color: '#3B82F6' };
  };

  // ========== PROBABILIDADES POR ESTÁGIO ==========
  const stageProbabilities = {
    novo: 0.10,
    contactado: 0.20,
    qualificado: 0.30,
    proposta: 0.60,
    negociacao: 0.80,
    ganho: 1.00
  };

  // Calcular métricas estratégicas do Overview
  const calculateOverviewMetrics = () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const total = leads.length;
    
    // Leads ganhos no mês atual
    const gainedThisMonth = leads.filter(l => 
      l.status === 'ganho' && new Date(l.created_at) >= monthStart
    );
    
    // Leads ganhos no mês passado (para comparação)
    const gainedLastMonth = leads.filter(l => 
      l.status === 'ganho' && 
      new Date(l.created_at) >= lastMonthStart && 
      new Date(l.created_at) <= lastMonthEnd
    );
    
    // Pipeline total (leads em etapas ativas)
    const pipelineLeads = leads.filter(l => 
      ['novo', 'contactado', 'qualificado', 'proposta', 'negociacao'].includes(l.status)
    );
    
    // Calcular receita prevista REAL com valores dos leads
    let forecastValue = 0;
    const leadsByStage = {
      novo: [],
      contactado: [],
      qualificado: [],
      proposta: [],
      negociacao: [],
      ganho: []
    };
    
    leads.forEach(lead => {
      if (leadsByStage[lead.status]) {
        const leadValue = lead.value || 15000; // Usa valor real ou padrão
        leadsByStage[lead.status].push(lead);
        forecastValue += leadValue * (stageProbabilities[lead.status] || 0);
      }
    });
    
    // Receita FECHADA real (soma dos valores dos leads ganhos)
    const revenueThisMonth = gainedThisMonth.reduce((sum, l) => sum + (l.value || 15000), 0);
    const revenueLastMonth = gainedLastMonth.reduce((sum, l) => sum + (l.value || 15000), 0);
    
    // ========== META DO MÊS ==========
    const currentTarget = targets.find(t => t.month === currentMonth && t.year === currentYear);
    const companyTarget = currentTarget ? parseFloat(currentTarget.target_value) : 0;
    const targetProgress = companyTarget > 0 ? (revenueThisMonth / companyTarget * 100) : 0;
    const gapToTarget = Math.max(0, companyTarget - forecastValue);
    
    // ========== META ANUAL ==========
    const annualTarget = targets.reduce((sum, t) => sum + parseFloat(t.target_value || 0), 0);
    const projectedMonthly = forecastValue; // Projeção baseada em forecast
    
    // ========== PROJEÇÃO DE FECHAMENTO ==========
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    
    // Média diária de receita
    const avgDailyRevenue = dayOfMonth > 0 ? revenueThisMonth / dayOfMonth : 0;
    const projectedClose = avgDailyRevenue * daysInMonth; // Projeção simples
    const projectedCloseAdvanced = forecastValue + (avgDailyRevenue * daysRemaining); // Projeção com pipeline
    
    // ========== FORECAST DETALHADO POR ESTÁGIO ==========
    const forecastByStage = Object.keys(stageProbabilities).map(stage => ({
      stage,
      count: leadsByStage[stage].length,
      probability: (stageProbabilities[stage] * 100).toFixed(0),
      weightedValue: leadsByStage[stage].reduce((sum, l) => sum + ((l.value || 15000) * stageProbabilities[stage]), 0)
    }));
    
    // ========== CRESCIMENTO VS MÊS ANTERIOR ==========
    const growth = revenueLastMonth > 0 ? 
      (((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100).toFixed(1) : 
      revenueThisMonth > 0 ? 100 : 0;
    
    // ========== LEADS COM SCORE ==========
    const leadsWithScore = leads.map(lead => ({
      ...lead,
      score: calculateLeadScore(lead),
      temperature: getLeadTemperature(calculateLeadScore(lead))
    }));
    
    // Leads recentes (últimos 5)
    const recentLeads = [...leadsWithScore]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    return {
      total,
      pipelineLeads: pipelineLeads.length,
      pipelineValue: pipelineLeads.reduce((sum, l) => sum + (l.value || 15000), 0),
      revenueThisMonth,
      revenueLastMonth,
      gainedThisMonth: gainedThisMonth.length,
      gainedLastMonth: gainedLastMonth.length,
      // Meta
      companyTarget,
      annualTarget,
      targetProgress,
      gapToTarget,
      // Projeção
      projectedClose,
      projectedCloseAdvanced,
      daysRemaining,
      // Forecast
      forecastValue,
      forecastByStage,
      // Crescimento
      growth,
      // Leads
      leadsWithScore,
      recentLeads
    };
  };

  const metrics = calculateOverviewMetrics();

  // Formatar moeda
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Formatar data
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return <div className="loading">Carregando Visão Geral...</div>;
  }

  return (
    <div className="overview-container">
      {/* Mensagens */}
      {message.text && (
        <div className={`${message.type === 'error' ? 'error-message' : 'success-message'} message-banner`}>
          {message.text}
        </div>
      )}
      
      {/* ========== KPIs PRINCIPAIS - GESTÃO COMERCIAL ========== */}
      <div className="section-header">
        <h2>📊 Dashboard</h2>
        <button className="btn-small" onClick={() => setShowKPISettings(true)}>
          ⚙️ Personalizar KPIs
        </button>
      </div>
      
      <div className="kpi-grid">
        {visibleKPIs.totalLeads && (
          <div className="kpi-card">
            <div className="kpi-value">{metrics.total}</div>
            <div className="kpi-label">Total de Leads</div>
          </div>
        )}
        
        {visibleKPIs.revenue && (
          <div className="kpi-card success">
            <div className="kpi-value">{formatCurrency(metrics.revenueThisMonth)}</div>
            <div className="kpi-label">📊 Receita Fechada</div>
          </div>
        )}
        
        {visibleKPIs.pipeline && (
          <div className="kpi-card primary">
            <div className="kpi-value">{formatCurrency(metrics.pipelineValue)}</div>
            <div className="kpi-label">Pipeline Total</div>
          </div>
        )}
        
        {visibleKPIs.forecast && (
          <div className="kpi-card purple">
            <div className="kpi-value">{formatCurrency(metrics.forecastValue)}</div>
            <div className="kpi-label">📈 Receita Projetada</div>
          </div>
        )}
      </div>

      {/* ========== PAINEL DE METAS (somente Master) ========== */}
      {canManageCompanyTarget && <div className="section">
        <div className="section-header">
          <h3>🎯 Painel de Gestão Comercial</h3>
          <button className="btn-small" onClick={() => setShowTargetModal(true)}>
            Definir Meta
          </button>
        </div>
        
        <div className="target-panel">
          <div className="target-card large">
            <div className="target-label">Meta do Mês</div>
            <div className="target-value">{formatCurrency(metrics.companyTarget)}</div>
            <div className="target-progress">
              <div 
                className="target-progress-fill"
                style={{ 
                  width: `${Math.min(metrics.targetProgress, 100)}%`,
                  background: metrics.targetProgress >= 100 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #3b82f6, #2563eb)'
                }}
              />
            </div>
            <div className="target-stats">
              <span>{metrics.targetProgress.toFixed(1)}% atingido</span>
              <span>•</span>
              <span>{metrics.gainedThisMonth} deals fechados</span>
            </div>
          </div>
          
          <div className="target-card large">
            <div className="target-label">Meta Anual</div>
            <div className="target-value">{formatCurrency(metrics.annualTarget)}</div>
            <div className="target-progress">
              <div 
                className="target-progress-fill"
                style={{ 
                  width: `${metrics.annualTarget > 0 ? Math.min((metrics.revenueThisMonth * 12 / metrics.annualTarget) * 100, 100) : 0}%`,
                  background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)'
                }}
              />
            </div>
            <div className="target-stats">
              <span>Soma das metas mensais</span>
            </div>
          </div>
          
          <div className="target-card large">
            <div className="target-label">📌 Gap para Meta</div>
            <div className={`target-value ${metrics.forecastValue >= metrics.companyTarget ? 'positive' : 'negative'}`}>
              {metrics.forecastValue >= metrics.companyTarget 
                ? '✅ Meta Batida!' 
                : formatCurrency(metrics.gapToTarget)
              }
            </div>
            <div className="target-stats">
              <span>Faltam {formatCurrency(Math.max(0, metrics.companyTarget - metrics.revenueThisMonth))} em receita fechada</span>
            </div>
          </div>
        </div>
      </div>}

      {/* ========== PROJEÇÃO DE FECHAMENTO ========== */}
      <div className="section">
        <h3>🔮 Projeção de Fechamento do Mês</h3>
        <div className="projection-grid">
          <div className="projection-card">
            <div className="projection-label">Projeção Simples</div>
            <div className="projection-value">{formatCurrency(metrics.projectedClose)}</div>
            <div className="projection-sub">Média diária × dias do mês</div>
          </div>
          <div className="projection-card">
            <div className="projection-label">Projeção Avançada</div>
            <div className="projection-value">{formatCurrency(metrics.projectedCloseAdvanced)}</div>
            <div className="projection-sub">Forecast + tendência</div>
          </div>
          <div className="projection-card">
            <div className="projection-label">Dias Restantes</div>
            <div className="projection-value">{metrics.daysRemaining}</div>
            <div className="projection-sub">Para fechar o mês</div>
          </div>
        </div>
      </div>

      {/* ========== FORECAST - PREVISÃO DE RECEITA PROFISSIONAL ========== */}
      <div className="section">
        <div className="section-header">
          <h3>📊 Previsão de Receita (Forecast)</h3>
          <button className="btn-small" onClick={openForecastModal}>
            ⚙️ Configurar Probabilidades
          </button>
        </div>
        <div className="forecast-grid">
          <div className="forecast-card closed">
            <div className="forecast-label">Receita Fechada</div>
            <div className="forecast-value">{formatCurrency(metrics.revenueThisMonth)}</div>
          </div>
          <div className="forecast-card projected">
            <div className="forecast-label">Receita Projetada</div>
            <div className="forecast-value">{formatCurrency(metrics.forecastValue)}</div>
            <div className="forecast-sub">Σ (Valor × Probabilidade)</div>
          </div>
          {canManageCompanyTarget && <div className="forecast-card target">
            <div className="forecast-label">Meta do Mês</div>
            <div className="forecast-value">{formatCurrency(metrics.companyTarget)}</div>
          </div>}
          {canManageCompanyTarget && <div className={`forecast-card gap ${metrics.forecastValue >= metrics.companyTarget ? 'positive' : 'negative'}`}>
            <div className="forecast-label">Gap para Meta</div>
            <div className="forecast-value">
              {metrics.forecastValue >= metrics.companyTarget 
                ? '✅ Meta Batida!' 
                : formatCurrency(metrics.gapToTarget)
              }
            </div>
          </div>}
        </div>
      </div>

      {/* Detalhamento do Forecast por Estágio */}
      <div className="section">
        <h3>📋 Forecast por Estágio</h3>
        <div className="forecast-stages">
          {metrics.forecastByStage.map((item) => (
            <div key={item.stage} className="forecast-stage">
              <div className="stage-header">
                <span className="stage-name">{item.stage}</span>
                <span className="stage-count">{item.count} leads</span>
              </div>
              <div className="stage-bar">
                <div 
                  className="stage-fill"
                  style={{ 
                    width: `${item.probability}%`,
                    backgroundColor: getStatusColor(item.stage)
                  }}
                />
              </div>
              <div className="stage-footer">
                <span className="stage-prob">{item.probability}% prob.</span>
                <span className="stage-value">{formatCurrency(item.weightedValue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========== BOTÃO ADICIONAR ========== */}
      <button 
        className="btn-primary" 
        onClick={() => { 
          setShowForm(!showForm); 
          setEditingLead(null); 
          setFormData({ name: '', email: '', phone: '', company: '', value: 0, status: 'novo', source: 'site' }); 
        }}
        style={{ marginBottom: '20px' }}
      >
        {showForm ? '✕ Cancelar' : '+ Novo Lead'}
      </button>

      {/* ========== FORMULÁRIO ========== */}
      {showForm && (
        <form onSubmit={handleSubmit} className="lead-form">
          <h3>{editingLead ? 'Editar Lead' : 'Novo Lead'}</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Nome *</label>
              <input
                type="text"
                placeholder="Nome completo"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="email@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Telefone</label>
              <input
                type="tel"
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Empresa</label>
              <input
                type="text"
                placeholder="Nome da empresa"
                value={formData.company}
                onChange={(e) => setFormData({...formData, company: e.target.value})}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Valor da Oportunidade (R$)</label>
              <input
                type="number"
                placeholder="15000"
                value={formData.value}
                onChange={(e) => setFormData({...formData, value: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                <option value="novo">Novo</option>
                <option value="contactado">Contactado</option>
                <option value="qualificado">Qualificado</option>
                <option value="proposta">Proposta</option>
                <option value="negociacao">Negociação</option>
                <option value="ganho">Ganho</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Origem</label>
              <select value={formData.source} onChange={(e) => setFormData({...formData, source: e.target.value})}>
                <option value="site">Site</option>
                <option value="google">Google</option>
                <option value="indicacao">Indicação</option>
                <option value="linkedin">LinkedIn</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingLead ? 'Atualizar' : 'Criar'} Lead
            </button>
          </div>
        </form>
      )}

      {/* ========== LEADS RECENTES COM SCORE ========== */}
      <div className="section">
        <h3>Leads Recentes</h3>
        {metrics.recentLeads.length === 0 ? (
          <p className="no-data">Nenhum lead encontrado</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Temp.</th>
                <th>Nome</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Criado</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <span 
                      className="temperature-badge"
                      style={{ 
                        backgroundColor: lead.temperature.color,
                        color: '#fff'
                      }}
                      title={`Score: ${lead.score}`}
                    >
                      {lead.temperature.label}
                    </span>
                  </td>
                  <td>{lead.name}</td>
                  <td>{formatCurrency(lead.value || 0)}</td>
                  <td>
                    <span className="status-badge" style={{ backgroundColor: getStatusColor(lead.status) }}>
                      {lead.status}
                    </span>
                  </td>
                  <td>{lead.source || '-'}</td>
                  <td>{formatDate(lead.created_at)}</td>
                  <td>
                    <button onClick={() => handleEdit(lead)} className="btn-small">Editar</button>
                    <button onClick={() => handleDelete(lead.id)} className="btn-small btn-danger">Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ========== DISTRIBUIÇÃO POR STATUS ========== */}
      <div className="section">
        <h3>Distribuição por Status</h3>
        <div className="status-grid">
          {stats.byStatus?.map((s) => {
            const percentage = stats.total > 0 ? (s.count / stats.total * 100).toFixed(1) : 0;
            const totalValue = s.total_value || 0;
            return (
              <div key={s.status} className="status-card" style={{ borderLeftColor: getStatusColor(s.status) }}>
                <div className="status-name">{s.status}</div>
                <div className="status-count">{s.count} leads ({percentage}%)</div>
                <div className="status-value">{formatCurrency(totalValue)}</div>
                <div className="status-bar">
                  <div 
                    className="status-fill" 
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: getStatusColor(s.status)
                    }} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== MODAL DE META ========== */}
      {canManageCompanyTarget && showTargetModal && (
        <div className="modal-overlay" onClick={() => setShowTargetModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Definir Meta do Mês</h3>
            <form onSubmit={handleSaveTarget}>
              <div className="form-group">
                <label>Mês</label>
                <select 
                  value={targetForm.month} 
                  onChange={(e) => setTargetForm({...targetForm, month: e.target.value})}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1).toLocaleDateString('pt-BR', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Meta (R$)</label>
                <input
                  type="number"
                  value={targetForm.target_value}
                  onChange={(e) => setTargetForm({...targetForm, target_value: e.target.value})}
                  placeholder="Informe a meta do mês"
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowTargetModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Salvar Meta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL DE CONFIGURAÇÃO DE FORECAST ========== */}
      {showForecastModal && (
        <div className="modal-overlay" onClick={() => setShowForecastModal(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <h3>⚙️ Configurar Probabilidades de Forecast</h3>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
              Ajuste as probabilidades de fechamento para cada estágio do funil. 
              Isso afetará o cálculo da receita projetada.
            </p>
            
            <form onSubmit={handleSaveForecastConfig}>
              <div className="forecast-config-grid">
                {forecastForm.map((config) => (
                  <div key={config.stage} className="forecast-config-item">
                    <label className="forecast-config-label">
                      {config.stage.charAt(0).toUpperCase() + config.stage.slice(1)}
                    </label>
                    <div className="forecast-config-input-group">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={config.probability}
                        onChange={(e) => updateForecastProbability(config.stage, e.target.value)}
                        className="forecast-config-slider"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={config.probability}
                        onChange={(e) => updateForecastProbability(config.stage, e.target.value)}
                        className="forecast-config-number"
                      />
                      <span className="forecast-config-percent">%</span>
                    </div>
                    <div className="forecast-config-bar">
                      <div 
                        className="forecast-config-bar-fill"
                        style={{ 
                          width: `${config.probability}%`,
                          backgroundColor: getStatusColor(config.stage)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="form-actions" style={{ marginTop: '24px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={handleResetForecast}
                >
                  🔄 Resetar para Padrão
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowForecastModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  💾 Salvar Configuração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL DE CONFIGURAÇÃO DE KPIs ========== */}
      {showKPISettings && (
        <div className="modal-overlay" onClick={() => setShowKPISettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>⚙️ Personalizar KPIs</h3>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>
              Escolha quais indicadores deseja visualizar no seu dashboard.
            </p>
            
            <div className="kpi-settings-list">
              {canManageCompanyTarget && <label className="kpi-setting-item">
                <input
                  type="checkbox"
                  checked={visibleKPIs.totalLeads}
                  onChange={() => toggleKPI('totalLeads')}
                />
                <span>📊 Total de Leads</span>
              </label>}
              <label className="kpi-setting-item">
                <input
                  type="checkbox"
                  checked={visibleKPIs.revenue}
                  onChange={() => toggleKPI('revenue')}
                />
                <span>💰 Receita Fechada</span>
              </label>
              <label className="kpi-setting-item">
                <input
                  type="checkbox"
                  checked={visibleKPIs.pipeline}
                  onChange={() => toggleKPI('pipeline')}
                />
                <span>🔄 Pipeline Total</span>
              </label>
              <label className="kpi-setting-item">
                <input
                  type="checkbox"
                  checked={visibleKPIs.forecast}
                  onChange={() => toggleKPI('forecast')}
                />
                <span>📈 Receita Projetada</span>
              </label>
              <label className="kpi-setting-item">
                <input
                  type="checkbox"
                  checked={visibleKPIs.conversion}
                  onChange={() => toggleKPI('conversion')}
                />
                <span>⚡ Taxa de Conversão</span>
              </label>
              <label className="kpi-setting-item">
                <input
                  type="checkbox"
                  checked={visibleKPIs.target}
                  onChange={() => toggleKPI('target')}
                />
                <span>🎯 Meta do Mês</span>
              </label>
            </div>
            
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowKPISettings(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={saveKPISettings}>
                💾 Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

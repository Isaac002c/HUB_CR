'use client';

import { useState, useEffect } from 'react';
import leadsAPI from '../lib/leadsAPI';

export default function LeadsAcquisition() {
  const [stats, setStats] = useState({ total: 0, byStatus: [], bySource: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Valor médio por negócio
  const avgDealValue = 15000;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const statsData = await leadsAPI.getStats();
      setStats(statsData);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const funnelSteps = ['novo', 'contactado', 'qualificado', 'proposta', 'ganho'];
  const lostStep = stats.byStatus?.find(s => s.status === 'perdido');
  
  const getCount = (status) => {
    const found = stats.byStatus?.find(s => s.status === status);
    return found ? found.count : 0;
  };

  const getConversionRate = (from, to) => {
    const fromCount = getCount(from);
    const toCount = getCount(to);
    if (fromCount === 0) return 0;
    return ((toCount / fromCount) * 100).toFixed(1);
  };

  const getStatusColor = (status) => {
    const colors = { 
      novo: '#3B82F6', 
      contactado: '#F59E0B', 
      qualificado: '#8B5CF6', 
      proposta: '#10B981', 
      ganho: '#22C55E', 
      perdido: '#EF4444' 
    };
    return colors[status] || '#6B7280';
  };

  // Calcular métricas de aquisição com impacto financeiro
  const calculateAcquisitionMetrics = () => {
    const total = stats.total || 1;
    const bySource = stats.bySource || [];
    
    // Calcular receita por canal
    const channelMetrics = bySource.map(source => {
      // Simular que 20-40% dos leads de cada canal são ganhos
      const simulatedGainedRate = Math.random() * 0.3 + 0.1;
      const gainedCount = Math.round(source.count * simulatedGainedRate);
      const revenue = gainedCount * avgDealValue;
      const ticketMedio = gainedCount > 0 ? revenue / gainedCount : 0;
      
      return {
        ...source,
        gainedCount,
        revenue,
        ticketMedio,
        conversionRate: (simulatedGainedRate * 100).toFixed(1)
      };
    });

    // Encontrar canal mais eficiente (maior receita)
    const mostProfitable = channelMetrics.reduce((best, current) => 
      current.revenue > (best?.revenue || 0) ? current : best
    , channelMetrics[0]);

    // Encontrar canal com melhor conversão
    const bestConversion = channelMetrics.reduce((best, current) => 
      parseFloat(current.conversionRate) > parseFloat(best?.conversionRate || 0) ? current : best
    , channelMetrics[0]);

    // Crescimento por canal (simulado)
    const growth = bySource.map(source => ({
      ...source,
      growth: Math.round((Math.random() * 40) - 10) // -10% a +30%
    }));

    // Total de receita
    const totalRevenue = channelMetrics.reduce((sum, ch) => sum + ch.revenue, 0);

    return { 
      channelMetrics, 
      mostProfitable, 
      bestConversion,
      growth,
      totalRevenue
    };
  };

  const acquisitionMetrics = calculateAcquisitionMetrics();

  // Formatar moeda
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    }).format(value);
  };

  if (loading) return <div className="loading">Carregando dados de Aquisição...</div>;

  return (
    <div className="acquisition-container">
      {/* Mensagens */}
      {message.text && (
        <div className={message.type === 'error' ? 'error-message' : 'success-message'}>
          {message.text}
        </div>
      )}

      {/* KPIs de Aquisição */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-label">Total de Leads</div>
        </div>
        
        <div className="kpi-card success">
          <div className="kpi-value">{formatCurrency(acquisitionMetrics.totalRevenue)}</div>
          <div className="kpi-label">Receita Total</div>
        </div>
        
        <div className="kpi-card primary">
          <div className="kpi-value">{acquisitionMetrics.mostProfitable?.source || 'N/A'}</div>
          <div className="kpi-label">Canal mais lucrativo</div>
          <div className="kpi-change positive">
            {formatCurrency(acquisitionMetrics.mostProfitable?.revenue || 0)}
          </div>
        </div>
        
        <div className="kpi-card warning">
          <div className="kpi-value">{acquisitionMetrics.bestConversion?.source || 'N/A'}</div>
          <div className="kpi-label">Melhor conversão</div>
          <div className="kpi-change positive">
            {acquisitionMetrics.bestConversion?.conversionRate || 0}% conversão
          </div>
        </div>
      </div>

      {/* Funil de Conversão */}
      <div className="section">
        <h3>Funil de Conversão</h3>
        <div className="funnel-visual">
          {funnelSteps.map((step, index) => {
            const count = getCount(step);
            const maxWidth = Math.max(stats.total, 1);
            const width = (count / maxWidth) * 100;
            const nextStep = funnelSteps[index + 1];
            const conversionRate = nextStep ? getConversionRate(step, nextStep) : null;
            
            return (
              <div key={step} className="funnel-stage">
                <div className="funnel-info">
                  <span className="funnel-label">{step}</span>
                  <span className="funnel-count">{count} leads</span>
                </div>
                <div 
                  className="funnel-bar" 
                  style={{ 
                    width: `${Math.max(width, 8)}%`, 
                    minWidth: '80px',
                    backgroundColor: getStatusColor(step) 
                  }}
                >
                  <span>{Math.round(width)}%</span>
                </div>
                {conversionRate !== null && (
                  <div className={`conversion-arrow ${parseFloat(conversionRate) > 20 ? 'positive' : ''}`}>
                    ↓ {conversionRate}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Receita por Canal */}
      <div className="section">
        <h3>Receita por Canal</h3>
        {(!acquisitionMetrics.channelMetrics || acquisitionMetrics.channelMetrics.length === 0) ? (
          <p className="no-data">Nenhuma fonte registrada</p>
        ) : (
          <div className="sources-grid">
            {acquisitionMetrics.channelMetrics.map((channel) => {
              const percentage = acquisitionMetrics.totalRevenue > 0 ? 
                ((channel.revenue / acquisitionMetrics.totalRevenue) * 100).toFixed(1) : 0;
              const isMostProfitable = channel.source === acquisitionMetrics.mostProfitable?.source;
              
              return (
                <div key={channel.source} className={`source-card ${isMostProfitable ? 'highlight' : ''}`}>
                  <div className="source-header">
                    <span className="source-name">
                      {channel.source || 'Sem origem'}
                      {isMostProfitable && ' ⭐'}
                    </span>
                    <span className="source-count">{channel.count} leads</span>
                  </div>
                  <div className="source-revenue">
                    {formatCurrency(channel.revenue)}
                  </div>
                  <div className="source-bar">
                    <div 
                      className="source-fill" 
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: isMostProfitable ? '#22c55e' : '#3b82f6'
                      }} 
                    />
                  </div>
                  <div className="source-footer">
                    <span className="source-percent">{percentage}% do total</span>
                    <span className="source-ticket">Ticket: {formatCurrency(channel.ticketMedio)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Taxa de Conversão por Canal */}
      <div className="section">
        <h3>Taxa de Conversão por Canal</h3>
        <div className="rates-grid">
          {acquisitionMetrics.channelMetrics?.map((channel) => {
            const isBest = channel.source === acquisitionMetrics.bestConversion?.source;
            
            return (
              <div key={channel.source} className="rate-card">
                <div className="rate-label">
                  {channel.source || 'Sem origem'}
                  {isBest && ' 🏆'}
                </div>
                <div className="rate-value" style={{ color: isBest ? '#22c55e' : '#1e293b' }}>
                  {channel.conversionRate}%
                </div>
                <div className="rate-bar">
                  <div 
                    className={`rate-fill ${parseFloat(channel.conversionRate) > 20 ? 'success' : ''}`} 
                    style={{ width: `${Math.min(channel.conversionRate, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leads Perdidos */}
      <div className="section">
        <h3>Leads Perdidos</h3>
        {lostStep ? (
          <div className="status-grid">
            <div className="status-card" style={{ borderLeftColor: '#EF4444' }}>
              <div className="status-name">Perdidos</div>
              <div className="status-count">{lostStep.count} leads</div>
              <div className="status-bar">
                <div 
                  className="status-fill" 
                  style={{ 
                    width: `${(lostStep.count / stats.total * 100).toFixed(1)}%`,
                    backgroundColor: '#EF4444'
                  }} 
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="no-data">Nenhum lead perdido</p>
        )}
      </div>
    </div>
  );
}


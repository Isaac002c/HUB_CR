'use client';

import { useState, useEffect } from 'react';
import leadsAPI from '../lib/leadsAPI';
import sellersAPI from '../lib/sellersAPI';

export default function Leaderboard() {
  const [leads, setLeads] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rankingType, setRankingType] = useState('revenue');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [leadsData, sellersData] = await Promise.all([
        leadsAPI.getAll(),
        sellersAPI.getSellers()
      ]);
      setLeads(leadsData || []);
      setSellers(sellersData || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateSellerStats = (sellerId) => {
    const sellerLeads = leads.filter(lead => lead.seller_id === sellerId);
    const totalLeads = sellerLeads.length;
    const closedDeals = sellerLeads.filter(lead => lead.status === 'ganho');
    const closedCount = closedDeals.length;
    const revenue = closedDeals.reduce((sum, lead) => sum + (lead.value || 0), 0);
    const conversionRate = totalLeads > 0 ? ((closedCount / totalLeads) * 100) : 0;

    return {
      totalLeads,
      closedCount,
      revenue,
      conversionRate
    };
  };

  const getRanking = () => {
    const rankings = sellers.map(seller => {
      const stats = calculateSellerStats(seller.id);
      return {
        seller,
        ...stats
      };
    });

    if (rankingType === 'revenue') {
      return rankings.sort((a, b) => b.revenue - a.revenue);
    } else if (rankingType === 'conversion') {
      return rankings.sort((a, b) => b.conversionRate - a.conversionRate);
    } else {
      return rankings.sort((a, b) => b.closedCount - a.closedCount);
    }
  };

  const ranking = getRanking();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    }).format(value);
  };

  const getPositionColor = (position) => {
    if (position === 1) return '#FFD700';
    if (position === 2) return '#C0C0C0';
    if (position === 3) return '#CD7F32';
    return '#64748b';
  };

  const getPositionEmoji = (position) => {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return `#${position}`;
  };

  const maxRevenue = Math.max(...ranking.map(r => r.revenue), 1);
  const maxDeals = Math.max(...ranking.map(r => r.closedCount), 1);
  const maxConversion = Math.max(...ranking.map(r => r.conversionRate), 1);

  if (loading) {
    return <div className="loading">Carregando Ranking...</div>;
  }

  return (
    <div className="leaderboard-container">
      <div className="section-header">
        <h2>🏆 Ranking de Vendas</h2>
      </div>

      <div className="ranking-selector">
        <button 
          className={`ranking-btn ${rankingType === 'revenue' ? 'active' : ''}`}
          onClick={() => setRankingType('revenue')}
        >
          💰 Receita
        </button>
        <button 
          className={`ranking-btn ${rankingType === 'deals' ? 'active' : ''}`}
          onClick={() => setRankingType('deals')}
        >
          🤝 Deals Fechados
        </button>
        <button 
          className={`ranking-btn ${rankingType === 'conversion' ? 'active' : ''}`}
          onClick={() => setRankingType('conversion')}
        >
          📈 Conversão
        </button>
      </div>

      {sellers.length === 0 ? (
        <div className="no-data">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h3>Nenhum vendedor encontrado</h3>
          <p>Adicione vendedores para ver o ranking</p>
        </div>
      ) : (
        <div className="ranking-list">
          {ranking.map((item, index) => {
            const position = index + 1;
            const barWidth = rankingType === 'revenue' 
              ? (item.revenue / maxRevenue * 100)
              : rankingType === 'deals'
                ? (item.closedCount / maxDeals * 100)
                : (item.conversionRate / maxConversion * 100);

            return (
              <div 
                key={item.seller.id} 
                className={`ranking-card rank-${position}`}
              >
                <div className="ranking-position" style={{ color: getPositionColor(position) }}>
                  {getPositionEmoji(position)}
                </div>
                <div className="ranking-info">
                  <div className="ranking-name">{item.seller.name}</div>
                  <div className="ranking-stats">
                    <span>📊 {item.totalLeads} leads</span>
                    <span>🤝 {item.closedCount} fechados</span>
                    <span>📈 {item.conversionRate.toFixed(1)}%</span>
                  </div>
                  <div className="ranking-bar-container">
                    <div 
                      className="ranking-bar"
                      style={{ 
                        width: `${barWidth}%`,
                        background: rankingType === 'revenue' 
                          ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                          : rankingType === 'deals'
                            ? 'linear-gradient(90deg, #3b82f6, #2563eb)'
                            : 'linear-gradient(90deg, #8b5cf6, #7c3aed)'
                      }}
                    />
                  </div>
                </div>
                <div className="ranking-values">
                  <div className="ranking-revenue">
                    {rankingType === 'revenue' && formatCurrency(item.revenue)}
                    {rankingType === 'deals' && item.closedCount}
                    {rankingType === 'conversion' && `${item.conversionRate.toFixed(1)}%`}
                  </div>
                  <div className="ranking-label">
                    {rankingType === 'revenue' && 'Receita'}
                    {rankingType === 'deals' && 'Deals'}
                    {rankingType === 'conversion' && 'Conversão'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section" style={{ marginTop: '32px' }}>
        <h3>📊 Estatísticas do Time</h3>
        <div className="team-stats">
          <div className="team-stat-card">
            <div className="team-stat-value">{leads.length}</div>
            <div className="team-stat-label">Total de Leads</div>
          </div>
          <div className="team-stat-card">
            <div className="team-stat-value">
              {leads.filter(l => l.status === 'ganho').length}
            </div>
            <div className="team-stat-label">Deals Fechados</div>
          </div>
          <div className="team-stat-card">
            <div className="team-stat-value">
              {formatCurrency(leads.filter(l => l.status === 'ganho').reduce((sum, l) => sum + (l.value || 0), 0))}
            </div>
            <div className="team-stat-label">Receita Total</div>
          </div>
          <div className="team-stat-card">
            <div className="team-stat-value">
              {sellers.length}
            </div>
            <div className="team-stat-label">Vendedores Ativos</div>
          </div>
        </div>
      </div>
    </div>
  );
}


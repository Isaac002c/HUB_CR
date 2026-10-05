'use client';

import { useState, useEffect } from 'react';
import { getSubscription, getActivityLogs } from '../lib/saasAPI';

export default function SettingsPage() {
  const [subscription, setSubscription] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('subscription');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [subData, logsData] = await Promise.all([
        getSubscription(),
        getActivityLogs(1, 20)
      ]);
      setSubscription(subData);
      setActivityLogs(logsData.logs || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'active': { label: 'Ativo', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
      'trial': { label: 'Trial', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
      'cancelled': { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      'expired': { label: 'Expirado', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' }
    };
    return statusMap[status] || { label: status, color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' };
  };

  const getActionIcon = (action) => {
    const iconMap = {
      'login': '[L]',
      'create': '[+]',
      'update': '[>]',
      'delete': '[-]',
      'upload': '[U]',
      'download': '[D]'
    };
    return iconMap[action] || '[-]';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* Abas */}
      <div className="settings-tabs">
        <button 
          className={`settings-tab ${activeTab === 'subscription' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscription')}
        >
          [S] Assinatura
        </button>
        <button 
          className={`settings-tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          [A] Atividades
        </button>
      </div>

      {/* Conteúdo */}
      <div className="settings-content">
        {activeTab === 'subscription' && (
          <div className="subscription-section">
            <h3>Plano Atual</h3>
            {subscription ? (
              <div className="subscription-card">
                <div className="subscription-header">
                  <h4>{subscription.plan_name || 'Free'}</h4>
                  <span 
                    className="status-badge"
                    style={{ 
                      backgroundColor: getStatusBadge(subscription.status).bg,
                      color: getStatusBadge(subscription.status).color
                    }}
                  >
                    {getStatusBadge(subscription.status).label}
                  </span>
                </div>
                
                <div className="subscription-details">
                  <div className="detail-item">
                    <span className="detail-label">Início</span>
                    <span className="detail-value">{formatDate(subscription.start_date)}</span>
                  </div>
                  {subscription.end_date && (
                    <div className="detail-item">
                      <span className="detail-label">Vencimento</span>
                      <span className="detail-value">{formatDate(subscription.end_date)}</span>
                    </div>
                  )}
                  {subscription.monthly_price !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Valor Mensal</span>
                      <span className="detail-value">
                        {subscription.monthly_price > 0 
                          ? `R$ ${subscription.monthly_price.toFixed(2)}`
                          : 'Grátis'
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p>Nenhuma assinatura encontrada</p>
            )}

            <div className="plans-info">
              <h4>Planos Disponíveis</h4>
              <div className="plans-grid">
                <div className="plan-card">
                  <h5>Free</h5>
                  <p className="plan-price">R$ 0/mês</p>
                  <ul>
                    <li>Até 10 clientes</li>
                    <li>Até 10 contratos</li>
                    <li>1 usuário</li>
                  </ul>
                </div>
                <div className="plan-card">
                  <h5>Basic</h5>
                  <p className="plan-price">R$ 49,90/mês</p>
                  <ul>
                    <li>Até 100 clientes</li>
                    <li>Até 100 contratos</li>
                    <li>3 usuários</li>
                    <li>Relatórios</li>
                  </ul>
                </div>
                <div className="plan-card">
                  <h5>Professional</h5>
                  <p className="plan-price">R$ 99,90/mês</p>
                  <ul>
                    <li>Até 500 clientes</li>
                    <li>Até 500 contratos</li>
                    <li>10 usuários</li>
                    <li>API</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="activity-section">
            <h3>Histórico de Atividades</h3>
            {activityLogs.length > 0 ? (
              <div className="activity-list">
                {activityLogs.map((log) => (
                  <div key={log.id} className="activity-item">
                    <div className="activity-icon">{getActionIcon(log.action)}</div>
                    <div className="activity-content">
                      <div className="activity-header">
                        <span className="activity-action">{log.action}</span>
                        <span className="activity-entity">{log.entity_type}</span>
                      </div>
                      <p className="activity-description">{log.description}</p>
                      <span className="activity-date">{formatDate(log.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>Nenhuma atividade registrada ainda</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


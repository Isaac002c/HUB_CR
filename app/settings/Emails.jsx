'use client';

import { useCallback, useEffect, useState } from 'react';
import { getEmailDashboard, sendTestEmail, retryEmail } from '../lib/emailAPI';

const STATUS = {
  queued: ['Na fila', '#b45309', '#fef3c7'],
  processing: ['Processando', '#1d4ed8', '#dbeafe'],
  sent: ['Aceito pelo Resend', '#0369a1', '#e0f2fe'],
  delivered: ['Entregue', '#15803d', '#dcfce7'],
  delivery_delayed: ['Entrega atrasada', '#b45309', '#ffedd5'],
  bounced: ['Bounce', '#b91c1c', '#fee2e2'],
  complained: ['Spam', '#991b1b', '#fee2e2'],
  suppressed: ['Bloqueado', '#7f1d1d', '#fee2e2'],
  failed: ['Falhou', '#b91c1c', '#fee2e2'],
  cancelled: ['Cancelado', '#64748b', '#f1f5f9'],
};

const OPERATIONAL = {
  operational: ['Operacional', '#15803d', '#dcfce7'],
  test_only: ['Somente testes', '#0369a1', '#e0f2fe'],
  domain_pending: ['Domínio pendente de verificação', '#b45309', '#fef3c7'],
  invalid_sender: ['Remetente inválido', '#b91c1c', '#fee2e2'],
  provider_disabled: ['Provedor desativado', '#b91c1c', '#fee2e2'],
  not_configured: ['Configuração incompleta', '#64748b', '#f1f5f9'],
};

const maskEmail = (value) => {
  if (!value || !value.includes('@')) return '—';
  const [name, domain] = value.split('@');
  return `${name.slice(0, 2)}${name.length > 2 ? '•••' : ''}@${domain}`;
};
const formatDate = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';

export default function EmailSettings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setData(await getEmailDashboard());
      setError('');
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os e-mails.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const sendTest = async () => {
    setTesting(true); setError(''); setFeedback('');
    try {
      const result = await sendTestEmail();
      setFeedback(`Teste aceito pelo Resend. ID: ${result.provider_email_id || result.id}`);
      await load(true);
    } catch (err) {
      setError(err.message || 'Falha no teste de e-mail.');
      await load(true);
    } finally { setTesting(false); }
  };

  const retry = async (id) => {
    setRetrying(id); setError(''); setFeedback('');
    try {
      await retryEmail(id);
      setFeedback('Nova tentativa enfileirada.');
      await load(true);
    } catch (err) { setError(err.message || 'Não foi possível enfileirar a tentativa.'); }
    finally { setRetrying(null); }
  };

  if (loading) return <div className="loading-container"><div className="loading-spinner" /><p>Carregando e-mails...</p></div>;
  const config = data?.config || {};
  const stats = data?.stats || {};
  const op = OPERATIONAL[config.operational_status] || OPERATIONAL.not_configured;

  return (
    <div style={{ display:'grid', gap:18 }}>
      <section style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
          <div><h2 style={title}>E-mails transacionais</h2><p style={subtitle}>Fila persistente, entrega e falhas acompanhadas pelo Resend.</p></div>
          <span style={{ ...badge, color:op[1], background:op[2] }}>{op[0]}</span>
        </div>
        {config.operational_status === 'domain_pending' && (
          <div style={warning}>Domínio pendente de verificação. Os envios a clientes permanecem bloqueados até a confirmação dos registros DNS no Resend.</div>
        )}
        {error && <div className="error-message" style={{ marginTop:14 }}>{error}</div>}
        {feedback && <div style={{ marginTop:14, padding:'10px 12px', borderRadius:8, background:'#dcfce7', color:'#15803d', fontSize:13, fontWeight:600 }}>{feedback}</div>}
        <div style={configGrid}>
          <Info label="Provedor ativo" value={config.provider === 'resend' ? 'Resend' : config.provider} />
          <Info label="Automação" value={config.automation_enabled ? 'Ativada' : 'Desativada'} />
          <Info label="Nome do remetente" value={config.from_name || 'Não configurado'} />
          <Info label="Endereço remetente" value={config.from_address || 'Não configurado'} />
          <Info label="Reply-to" value={config.reply_to || 'Não configurado'} />
          <Info label="Chave da API" value={config.api_key_masked || 'Não configurada'} />
          <Info label="Webhook" value={config.webhook_secret_configured ? 'Assinatura configurada' : 'Não configurado'} />
          <Info label="Domínio" value={config.domain || 'Não configurado'} />
          <Info label="Destinatário de teste" value={maskEmail(config.test_recipient)} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginTop:16 }}>
          <p style={{ ...subtitle, margin:0 }}>O teste só pode ser enviado ao destinatário autorizado em <code>EMAIL_TEST_RECIPIENT</code>.</p>
          <button className="btn-primary" onClick={sendTest} disabled={testing || !config.api_key_configured || !config.test_recipient}>
            {testing ? 'Enviando teste...' : 'Enviar e-mail de teste'}
          </button>
        </div>
      </section>

      <section style={{ ...card, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px 4px' }}><h2 style={title}>Resumo operacional</h2></div>
        <div style={kpiGrid}>
          <Kpi label="Em fila" value={stats.queued || 0} color="#b45309" />
          <Kpi label="Aceitos" value={stats.sent || 0} color="#0369a1" />
          <Kpi label="Entregues" value={stats.delivered || 0} color="#15803d" />
          <Kpi label="Falhas" value={stats.failed || 0} color="#b91c1c" />
          <Kpi label="Bounces" value={stats.bounced || 0} color="#991b1b" />
        </div>
      </section>

      <section style={{ ...card, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid #e2e8f0' }}><h2 style={title}>Histórico recente</h2><p style={subtitle}>“Aceito” não significa “entregue”; a entrega é confirmada pelo webhook.</p></div>
        <div style={{ overflowX:'auto' }}>
          <table className="data-table" style={{ border:0, borderRadius:0, minWidth:900 }}>
            <thead><tr><th>Data</th><th>Assunto</th><th>Destinatário</th><th>Status</th><th>Tentativas</th><th>ID do provedor</th><th /></tr></thead>
            <tbody>
              {(data?.recent || []).map(item => {
                const s = STATUS[item.status] || STATUS.queued;
                return <tr key={item.id}>
                  <td style={{ whiteSpace:'nowrap' }}>{formatDate(item.created_at)}</td>
                  <td><div style={{ fontWeight:650 }}>{item.subject}</div>{item.last_error && <div style={{ color:'#b91c1c', fontSize:11, marginTop:3 }}>{item.last_error}</div>}</td>
                  <td>{maskEmail(item.recipient)}</td>
                  <td><span style={{ ...badge, color:s[1], background:s[2] }}>{s[0]}</span></td>
                  <td>{item.attempts}</td>
                  <td style={{ fontFamily:'monospace', fontSize:11 }}>{item.provider_email_id || '—'}</td>
                  <td>{['failed','delivery_delayed'].includes(item.status) && <button className="btn-secondary" style={{ padding:'5px 9px', fontSize:11 }} disabled={retrying===item.id} onClick={()=>retry(item.id)}>{retrying===item.id?'...':'Tentar novamente'}</button>}</td>
                </tr>;
              })}
              {(data?.recent || []).length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:30, color:'#94a3b8' }}>Nenhuma tentativa registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }) { return <div style={{ minWidth:0 }}><div style={infoLabel}>{label}</div><div style={{ fontSize:13, color:'#1e293b', fontWeight:650, overflowWrap:'anywhere' }}>{value}</div></div>; }
function Kpi({ label, value, color }) { return <div style={{ padding:'18px 20px', borderTop:`3px solid ${color}`, background:'#fff' }}><div style={{ fontSize:26, color:'#0f172a', fontWeight:800 }}>{value}</div><div style={infoLabel}>{label}</div></div>; }

const card = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20 };
const title = { margin:0, color:'#0f172a', fontSize:18, fontWeight:750 };
const subtitle = { margin:'4px 0 0', color:'#64748b', fontSize:13 };
const badge = { display:'inline-flex', alignItems:'center', borderRadius:14, padding:'4px 10px', fontSize:11, fontWeight:750, whiteSpace:'nowrap' };
const warning = { marginTop:14, padding:'11px 13px', borderRadius:8, background:'#fff7ed', border:'1px solid #fed7aa', color:'#9a3412', fontSize:13 };
const configGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))', gap:14, marginTop:18 };
const infoLabel = { fontSize:10, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:750, marginBottom:4 };
const kpiGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))', gap:1, background:'#e2e8f0', paddingTop:14 };

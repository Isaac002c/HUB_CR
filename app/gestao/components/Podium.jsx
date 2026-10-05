'use client';

import { formatBRL } from '../../lib/processConstants';

// Pódio / palanque do TOP 3 (1º ao centro e mais alto, 2º à esquerda, 3º à direita).
// Profissional e alinhado ao design do CRM. Abaixo, a classificação geral fica na
// tabela da própria página. Recebe `top` já ordenado (valor vendido desc + desempates).

const MEDAL = ['🥇', '🥈', '🥉'];
const HEIGHT = [128, 96, 80];         // alturas dos degraus (1º, 2º, 3º)
const ACCENT = ['#f59e0b', '#94a3b8', '#b45309'];
const ORDER = [1, 0, 2];              // render: 2º, 1º, 3º (posições no array)

function Avatar({ name, avatar, accent }) {
  const initials = (avatar && avatar.length <= 3)
    ? avatar
    : (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const isUrl = avatar && /^https?:\/\//.test(avatar);
  return (
    <div style={{
      width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isUrl ? '#fff' : `${accent}22`, color: accent,
      border: `2px solid ${accent}`, fontWeight: 800, fontSize: 18, overflow: 'hidden',
    }}>
      {isUrl
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={avatar} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </div>
  );
}

function Step({ row, place }) {
  const accent = ACCENT[place];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 90, maxWidth: 200 }}>
      <div style={{ fontSize: 30, lineHeight: 1 }}>{MEDAL[place]}</div>
      <div style={{ margin: '8px 0 6px' }}><Avatar name={row.seller_name} avatar={row.seller_avatar} accent={accent} /></div>
      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, textAlign: 'center', lineHeight: 1.2 }}>
        {row.seller_name || 'Vendedor'}
      </div>
      {row.team_name && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{row.team_name}</div>}
      <div style={{ fontSize: 15, fontWeight: 800, color: accent }}>{formatBRL(row.total_amount)}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>
        {row.sales_count} venda{Number(row.sales_count) !== 1 ? 's' : ''} · {formatBRL(row.total_commission)} com.
      </div>
      <div style={{
        marginTop: 10, width: '100%', height: HEIGHT[place],
        background: `linear-gradient(180deg, ${accent}26, ${accent}0d)`,
        borderTop: `3px solid ${accent}`, borderRadius: '8px 8px 0 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8,
        fontWeight: 800, color: accent, fontSize: 22,
      }}>
        {place + 1}º
      </div>
    </div>
  );
}

export default function Podium({ top = [] }) {
  const rows = top.slice(0, 3);
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0', fontSize: 14 }}>
        Sem vendas no período para montar o pódio.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, padding: '8px 4px' }}>
      {ORDER.map((idx) => rows[idx] ? <Step key={rows[idx].seller_id || idx} row={rows[idx]} place={idx} /> : <div key={idx} style={{ flex: 1, maxWidth: 200 }} />)}
    </div>
  );
}

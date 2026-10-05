'use client';

import { formatBRLShort } from '../../lib/processConstants';

// Gráfico de barras mês a mês (SVG puro, sem dependências, responsivo).
// data: [{ month:'YYYY-MM', total_amount, sales_count, ... }]
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function label(m) {
  const [, mm] = String(m).split('-');
  return MONTHS[(parseInt(mm, 10) || 1) - 1] || m;
}

export default function MiniBarChart({ data = [], valueKey = 'total_amount', accent = '#751518' }) {
  if (!data.length) return <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>Sem dados.</div>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  const W = Math.max(data.length * 54, 320);
  const H = 180, pad = 24, bw = 26;
  const bandW = (W - pad * 2) / data.length;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + 34}`} style={{ width: '100%', minWidth: W, height: 'auto', display: 'block' }}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={pad} x2={W - pad} y1={pad + (H - pad) * (1 - g)} y2={pad + (H - pad) * (1 - g)}
                stroke="#eef2f7" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const v = Number(d[valueKey]) || 0;
          const h = ((H - pad) - pad) * (v / max);
          const x = pad + i * bandW + (bandW - bw) / 2;
          const y = (H - pad) - h;
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={bw} height={Math.max(h, 1)} rx="4" fill={accent} opacity={0.85}>
                <title>{`${label(d.month)}: ${formatBRLShort(v)}`}</title>
              </rect>
              {v > 0 && (
                <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">
                  {formatBRLShort(v)}
                </text>
              )}
              <text x={x + bw / 2} y={H + 2} textAnchor="middle" fontSize="10" fill="#94a3b8">{label(d.month)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

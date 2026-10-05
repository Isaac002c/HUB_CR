'use client';

// Filtro de período: mês + ano (padrão = mês atual). Opcionalmente equipe/vendedor.
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const selStyle = { padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155' };

export default function PeriodFilter({ value, onChange, teams = [], sellers = [], showTeam = false, showSeller = false }) {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select style={selStyle} value={value.month} onChange={(e) => set({ month: parseInt(e.target.value, 10) })}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select style={selStyle} value={value.year} onChange={(e) => set({ year: parseInt(e.target.value, 10) })}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      {showTeam && teams.length > 0 && (
        <select style={selStyle} value={value.team_id || ''} onChange={(e) => set({ team_id: e.target.value || undefined })}>
          <option value="">Todas as equipes</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {showSeller && sellers.length > 0 && (
        <select style={selStyle} value={value.seller_id || ''} onChange={(e) => set({ seller_id: e.target.value || undefined })}>
          <option value="">Todos os vendedores</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </div>
  );
}

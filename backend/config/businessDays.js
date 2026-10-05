// Prazos operacionais usam datas civis (YYYY-MM-DD), sem conversão de fuso.
// Neste fluxo, dia útil significa segunda a sexta-feira. Feriados locais não
// são inferidos, pois o sistema ainda não possui um calendário por município.
function toDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) return false;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function validateBusinessDeadline(value) {
  const dateOnly = toDateOnly(value);
  if (dateOnly === null) return { ok: true, date: null };
  if (!dateOnly) return { ok: false, status: 400, error: 'Informe um prazo válido.' };

  const [year, month, day] = dateOnly.split('-').map(Number);
  const weekDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekDay === 0 || weekDay === 6) {
    return {
      ok: false,
      status: 400,
      error: 'O prazo deve ser salvo em dia útil (segunda a sexta-feira). Escolha o próximo dia útil.',
    };
  }
  return { ok: true, date: dateOnly };
}

module.exports = { toDateOnly, validateBusinessDeadline };

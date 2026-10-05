'use client';

import { useState, useEffect } from 'react';
import { getEvents, getEventsRange, createEvent, updateEvent, setEventStatus, deleteEvent } from '../lib/calendarAPI';
import EventFormModal, { typeInfo, fmtTime, isoToDisplay } from './components/EventFormModal';

// Turnos padrão (editáveis) — não há config de expediente no sistema.
const SHIFT_DEFAULTS = { manha: { start: '08:00', end: '12:00' }, tarde: { start: '12:00', end: '18:00' } };

const STATUS_LABEL = { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado' };
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DAY_STATUS = { livre: { label: 'Livre', color: '#22c55e' }, ocupado: { label: 'Ocupado', color: '#f59e0b' }, fechado: { label: 'Fechado', color: '#dc2626' } };

const pad = (n) => String(n).padStart(2, '0');
const localISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const parseDateOnly = (v) => { if (!v) return null; const [y, m, d] = String(v).substring(0, 10).split('-'); return (y && m && d) ? new Date(+y, +m - 1, +d, 12, 0, 0) : null; };
const fmtDateLong = (v) => { const dt = parseDateOnly(v); return dt ? dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '—'; };
const fmtMoney = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const SCOPES = [{ key: 'upcoming', label: 'Próximos' }, { key: 'past', label: 'Passados' }, { key: 'all', label: 'Todos' }];

export default function CalendarioEventos() {
  const todayDate = new Date();
  const todayStr = localISO(todayDate);

  const [view, setView]       = useState('mes');
  const [cursor, setCursor]   = useState({ y: todayDate.getFullYear(), m: todayDate.getMonth() });
  const [monthEvents, setMonthEvents] = useState([]);
  const [listEvents, setListEvents]   = useState([]);
  const [scope, setScope]     = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [dayDrawer, setDayDrawer] = useState(null);
  const [formModal, setFormModal] = useState(null);   // { event } (edição) | { initialData } (novo)
  const [viewEvent, setViewEvent] = useState(null);   // visualização (somente leitura) do agendamento

  // Modal de bloqueio (dia inteiro / manhã / tarde / personalizado)
  const [blockModal, setBlockModal] = useState(null); // { id?, date, mode, start, end }
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState(null);

  useEffect(() => { load(); }, [view, scope, cursor.y, cursor.m]);   // eslint-disable-line react-hooks/exhaustive-deps

  const monthRange = () => {
    const first = `${cursor.y}-${pad(cursor.m + 1)}-01`;
    const lastDay = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const last = `${cursor.y}-${pad(cursor.m + 1)}-${pad(lastDay)}`;
    return { first, last };
  };

  const load = async () => {
    try {
      setLoading(true); setError(null);
      if (view === 'mes') {
        const { first, last } = monthRange();
        setMonthEvents(await getEventsRange(first, last) || []);
      } else {
        setListEvents(await getEvents(scope) || []);
      }
    } catch (e) { setError('Não foi possível carregar os eventos.'); }
    finally { setLoading(false); }
  };

  // ── CRUD evento (form compartilhado em components/EventFormModal) ──
  const openNew = (dateStr) => setFormModal({ event: null, initialData: { event_date: dateStr || localISO(new Date()) } });
  const openEdit = (ev) => {
    if (ev.type === 'bloqueio') { openBlockEdit(ev); return; }   // bloqueios usam o modal próprio
    setFormModal({ event: ev });
  };
  const openView = (ev) => { setDayDrawer(null); setViewEvent(ev); };   // abre a visualização read-only (fecha o drawer do dia)
  const cancelEvent = async (ev) => { if (!confirm('Cancelar este evento?')) return; try { await setEventStatus(ev.id, 'cancelado'); load(); } catch (err) { setError(err.message); } };
  const removeEvent = async (ev) => { if (!confirm(ev.type === 'bloqueio' ? 'Remover este bloqueio?' : 'Excluir este evento?')) return; try { await deleteEvent(ev.id); load(); } catch (err) { setError(err.message); } };

  // ── Bloqueios (dia inteiro / manhã / tarde / personalizado) ──
  const openBlock = (dateStr) => { setBlockError(null); setBlockModal({ id: null, date: dateStr, mode: 'dia', start: '', end: '' }); };
  const openBlockEdit = (ev) => {
    setBlockError(null);
    setBlockModal({ id: ev.id, date: String(ev.event_date).substring(0, 10), mode: ev.start_time ? 'custom' : 'dia', start: fmtTime(ev.start_time), end: fmtTime(ev.end_time) });
  };
  const setBlockMode = (mode) => {
    setBlockModal(b => {
      if (mode === 'dia')   return { ...b, mode, start: '', end: '' };
      if (mode === 'manha') return { ...b, mode, ...SHIFT_DEFAULTS.manha };
      if (mode === 'tarde') return { ...b, mode, ...SHIFT_DEFAULTS.tarde };
      return { ...b, mode }; // custom mantém o que estiver
    });
  };
  const saveBlock = async () => {
    setBlockError(null);
    const { id, date, mode, start, end } = blockModal;
    let title, st = null, et = null;
    if (mode === 'dia') { title = 'Agenda fechada'; }
    else {
      if (!start || !end) { setBlockError('Informe início e fim.'); return; }
      if (start >= end)   { setBlockError('O horário inicial deve ser antes do final.'); return; }
      st = start; et = end;
      title = mode === 'manha' ? 'Agenda bloqueada — Manhã'
            : mode === 'tarde' ? 'Agenda bloqueada — Tarde'
            : `Agenda bloqueada — ${start} às ${end}`;
    }
    const payload = { title, event_date: date, type: 'bloqueio', status: 'agendado', start_time: st, end_time: et };
    try {
      setBlockSaving(true);
      if (id) await updateEvent(id, payload); else await createEvent(payload);
      setBlockModal(null); load();
    } catch (err) { setBlockError(err.message); }   // 409 = conflito com evento / bloqueio sobreposto
    finally { setBlockSaving(false); }
  };

  const eventsOn = (dateStr) => monthEvents.filter(e => String(e.event_date).substring(0, 10) === dateStr);
  const blocksOf = (evs) => evs.filter(e => e.type === 'bloqueio' && e.status !== 'cancelado');
  const isFullClosed = (evs) => blocksOf(evs).some(b => !b.start_time);
  const dayStatusOf = (evs) => {
    if (isFullClosed(evs)) return 'fechado';
    if (evs.some(e => e.status !== 'cancelado' && e.type !== 'bloqueio')) return 'ocupado';
    if (blocksOf(evs).length > 0) return 'ocupado';
    return 'livre';
  };

  const buildCells = () => {
    const startW = new Date(cursor.y, cursor.m, 1).getDay();
    const start = new Date(cursor.y, cursor.m, 1 - startW);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      return { date: localISO(d), inMonth: d.getMonth() === cursor.m, day: d.getDate() };
    });
  };
  const prevMonth = () => setCursor(c => { let m = c.m - 1, y = c.y; if (m < 0) { m = 11; y--; } return { y, m }; });
  const nextMonth = () => setCursor(c => { let m = c.m + 1, y = c.y; if (m > 11) { m = 0; y++; } return { y, m }; });
  const goToday   = () => setCursor({ y: todayDate.getFullYear(), m: todayDate.getMonth() });

  const showSpinner = loading && ((view === 'mes' && monthEvents.length === 0) || (view === 'lista' && listEvents.length === 0));

  const groups = {};
  for (const ev of listEvents) { const k = String(ev.event_date).substring(0, 10); (groups[k] = groups[k] || []).push(ev); }
  const listDates = Object.keys(groups).sort((a, b) => scope === 'past' ? b.localeCompare(a) : a.localeCompare(b));

  const blockLabel = (b) => b.start_time ? `Agenda bloqueada — ${fmtTime(b.start_time)}–${fmtTime(b.end_time)}` : 'Agenda fechada (dia inteiro)';

  return (
    <div className="ag-page">
      <div className="ag-head">
        <div>
          <h2 className="ag-head-title">Agenda</h2>
          <p className="ag-head-sub">Eventos e agendamentos da equipe.</p>
        </div>
        <div className="cal-toggle">
          <button className={view === 'mes' ? 'active' : ''} onClick={() => setView('mes')}>Mês</button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}>Lista</button>
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

      {showSpinner ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
          <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando agenda...</p>
        </div>
      ) : view === 'mes' ? (
        <>
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button className="cal-iconbtn" onClick={prevMonth} aria-label="Mês anterior"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
              <span className="cal-month">{MONTHS[cursor.m]} de {cursor.y}</span>
              <button className="cal-iconbtn" onClick={nextMonth} aria-label="Próximo mês"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg></button>
              <button className="btn-secondary" onClick={goToday} style={{ marginLeft: 4 }}>Hoje</button>
            </div>
            <button className="btn-primary" onClick={() => openNew(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, verticalAlign: '-2px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Novo evento
            </button>
          </div>

          <div className="cal-grid" style={{ marginBottom: 6 }}>
            {WEEKDAYS.map(w => <div key={w} className="cal-weekday">{w}</div>)}
          </div>
          <div className="cal-grid">
            {buildCells().map(cell => {
              const evs = eventsOn(cell.date);
              const st = dayStatusOf(evs);
              const fullClosed = isFullClosed(evs);
              const active = evs.filter(e => e.status !== 'cancelado' && e.type !== 'bloqueio');
              const partialBlocks = blocksOf(evs).filter(b => b.start_time);
              const visible = active.slice(0, 3);
              const extra = active.length - visible.length;
              const cls = `cal-cell${!cell.inMonth ? ' cal-cell--out' : ''}${cell.date === todayStr ? ' cal-cell--today' : ''}${fullClosed ? ' cal-cell--closed' : ''}`;
              return (
                <div key={cell.date} className={cls} onClick={() => setDayDrawer(cell.date)}>
                  <div className="cal-daynum">
                    <span>{cell.day}</span>
                    <span className="cal-status-dot" style={{ background: DAY_STATUS[st].color }} title={DAY_STATUS[st].label} />
                  </div>
                  {fullClosed ? (
                    <span className="cal-closed-tag">Fechada</span>
                  ) : (
                    <>
                      {partialBlocks.map(b => (
                        <span key={b.id} className="cal-chip" style={{ background: '#fee2e2', color: '#b91c1c' }} title={blockLabel(b)}>
                          🔒 {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                        </span>
                      ))}
                      {visible.map(ev => { const ti = typeInfo(ev.type); return (
                        <span key={ev.id} className="cal-chip" style={{ background: `${ti.color}18`, color: ti.color }}>
                          {fmtTime(ev.start_time) ? `${fmtTime(ev.start_time)} ` : ''}{ev.title}
                        </span>
                      ); })}
                      {extra > 0 && <span className="cal-more">+{extra} mais</span>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="md-layout">
          <div className="md-main">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SCOPES.map(s => (
                <button key={s.key} onClick={() => setScope(s.key)}
                  style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid ' + (scope === s.key ? '#751518' : '#e2e8f0'),
                    background: scope === s.key ? 'var(--cr-wine-light, rgba(117,21,24,0.10))' : '#fff',
                    color: scope === s.key ? '#751518' : '#64748b' }}>
                  {s.label}
                </button>
              ))}
            </div>
            {listDates.length === 0 ? (
              <div className="ag-card"><div className="ag-empty">Nenhum evento {scope === 'past' ? 'passado' : scope === 'upcoming' ? 'próximo' : ''}.</div></div>
            ) : listDates.map(date => (
              <div key={date} className="ag-card">
                <div className="ag-card-head" style={{ '--accent': '#751518', '--accent-soft': 'rgba(117,21,24,0.10)' }}>
                  <span className="ag-card-dot" />
                  <span className="ag-card-title" style={{ textTransform: 'capitalize' }}>{fmtDateLong(date)}</span>
                  <span className="ag-card-count">{groups[date].length}</span>
                </div>
                <div className="ag-list">
                  {groups[date].map(ev => <EventRow key={ev.id} ev={ev} onView={openView} onEdit={openEdit} onCancel={cancelEvent} onRemove={removeEvent} />)}
                </div>
              </div>
            ))}
          </div>
          <aside className="md-sidebar">
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openNew(null)}>+ Novo evento</button>
            <div className="ag-aside-card">
              <div className="ag-aside-title">Exibir</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SCOPES.map(s => (
                  <button key={s.key} onClick={() => setScope(s.key)}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid ' + (scope === s.key ? '#751518' : '#e2e8f0'),
                      background: scope === s.key ? 'var(--cr-wine-light, rgba(117,21,24,0.10))' : '#fff',
                      color: scope === s.key ? '#751518' : '#475569' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Drawer do dia ── */}
      {dayDrawer && (() => {
        const dayEvents = eventsOn(dayDrawer);
        const st = dayStatusOf(dayEvents);
        const fullClosed = isFullClosed(dayEvents);
        const blocks = blocksOf(dayEvents);
        const normal = dayEvents.filter(e => e.type !== 'bloqueio');
        return (
          <div className="modal-overlay" onClick={() => setDayDrawer(null)}>
            <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>{fmtDateLong(dayDrawer)}</h2>
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, background: `${DAY_STATUS[st].color}18`, color: DAY_STATUS[st].color, padding: '2px 10px', borderRadius: 999 }}>
                    {DAY_STATUS[st].label}
                  </span>
                </div>
                <button type="button" onClick={() => setDayDrawer(null)} className="btn-close">✕</button>
              </div>

              {fullClosed ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>Agenda fechada o dia inteiro. Novos eventos estão bloqueados.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={() => openNew(dayDrawer)}>+ Novo evento</button>
                  <button className="btn-secondary" onClick={() => openBlock(dayDrawer)}>Bloquear agenda</button>
                </div>
              )}

              {/* Bloqueios do dia */}
              {blocks.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Bloqueios</div>
                  <div className="ag-list" style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
                    {blocks.map(b => (
                      <div key={b.id} className="ag-item" style={{ borderLeft: '3px solid #dc2626' }}>
                        <div className="ag-ava" style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 14 }}>🔒</div>
                        <div className="ag-itembody">
                          <div className="ag-name">{blockLabel(b)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button className="btn-icon" title="Editar bloqueio" onClick={() => { setDayDrawer(null); openBlockEdit(b); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="btn-icon danger" title="Remover bloqueio" onClick={() => removeEvent(b)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {normal.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Nenhum evento neste dia.</p>
              ) : (
                <div className="ag-list" style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  {normal.map(ev => <EventRow key={ev.id} ev={ev} onView={openView} onEdit={openEdit} onCancel={cancelEvent} onRemove={removeEvent} />)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Modal de visualização (somente leitura) ── */}
      {viewEvent && (() => {
        const ev = viewEvent;
        const ti = typeInfo(ev.type);
        const cancelled = ev.status === 'cancelado';
        const horario = ev.start_time && ev.end_time ? `${fmtTime(ev.start_time)} às ${fmtTime(ev.end_time)}`
                      : ev.start_time ? fmtTime(ev.start_time) : 'Dia inteiro';
        return (
          <div className="modal-overlay" onClick={() => setViewEvent(null)}>
            <div className="modal-content" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, paddingRight: 8 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{ev.title}</h2>
                  <div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ti.color, background: `${ti.color}18`, padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{ti.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cancelled ? '#94a3b8' : ti.color, background: cancelled ? '#f1f5f9' : `${ti.color}18`, padding: '3px 10px', borderRadius: 999 }}>{STATUS_LABEL[ev.status] || 'Agendado'}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setViewEvent(null)} className="btn-close">✕</button>
              </div>

              {/* Corpo com padding compacto e consistente (o header já tem o seu próprio) */}
              <div style={{ padding: '16px 24px 18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 24px', marginBottom: 14 }}>
                  <DetailItem label="Data" value={fmtDateLong(ev.event_date)} capitalize />
                  <DetailItem label="Horário" value={horario} />
                  <DetailItem label="Serviço" value={ev.service_name} />
                  <DetailItem label="Consultor" value={ev.responsible_name} />
                  <DetailItem label="Cliente" value={ev.client_name} />
                  <DetailItem label="Telefone" value={ev.attendee_phone} />
                  {/* CPF exibido limpo (só dígitos), igual ao restante do sistema — sem máscara */}
                  <DetailItem label="CPF" value={String(ev.attendee_cpf || '').replace(/\D/g, '')} />
                  <DetailItem label="CNH" value={ev.attendee_cnh} />
                  <DetailItem label="Data de nascimento" value={isoToDisplay(ev.attendee_birth_date)} />
                  <DetailItem label="Primeira habilitação" value={isoToDisplay(ev.attendee_first_cnh)} />
                  <DetailItem label="Valor" value={fmtMoney(ev.value)} />
                  <DetailItem label="Forma de pagamento" value={ev.payment_method} />
                </div>

                {ev.description && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Observações</div>
                    <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '9px 12px', fontSize: 13, lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {ev.description}
                    </div>
                  </div>
                )}

                <div className="form-actions" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', marginTop: 0, paddingTop: 14 }}>
                  <button type="button" className="btn-secondary" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => { setViewEvent(null); removeEvent(ev); }}>
                    Excluir
                  </button>
                  {!cancelled && (
                    <button type="button" className="btn-secondary" style={{ color: '#f59e0b', borderColor: '#fde68a' }} onClick={() => { setViewEvent(null); cancelEvent(ev); }}>
                      Cancelar agendamento
                    </button>
                  )}
                  <button type="button" className="btn-primary" onClick={() => { setViewEvent(null); openEdit(ev); }}>Editar</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal criar/editar evento (compartilhado) ── */}
      {formModal && (
        <EventFormModal
          event={formModal.event}
          initialData={formModal.initialData}
          onClose={() => setFormModal(null)}
          onSaved={() => { setFormModal(null); load(); }}
        />
      )}

      {/* ── Modal de bloqueio (dia inteiro / manhã / tarde / personalizado) ── */}
      {blockModal && (
        <div className="modal-overlay" onClick={() => setBlockModal(null)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{blockModal.id ? 'Editar bloqueio' : 'Bloquear agenda'}</h2>
              <button type="button" onClick={() => setBlockModal(null)} className="btn-close">✕</button>
            </div>
            {blockError && <div className="error-message" style={{ margin: '0 0 12px', fontSize: 13 }}>{blockError}</div>}
            <div className="modal-form">
              <div className="form-group">
                <label>Período</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ k: 'dia', l: 'Dia inteiro' }, { k: 'manha', l: 'Manhã' }, { k: 'tarde', l: 'Tarde' }, { k: 'custom', l: 'Personalizado' }].map(o => (
                    <button key={o.k} type="button" onClick={() => setBlockMode(o.k)}
                      style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid ' + (blockModal.mode === o.k ? '#dc2626' : '#e2e8f0'),
                        background: blockModal.mode === o.k ? '#fee2e2' : '#fff',
                        color: blockModal.mode === o.k ? '#b91c1c' : '#64748b' }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              {blockModal.mode !== 'dia' && (
                <div className="form-row">
                  <div className="form-group"><label>Início</label><input type="time" value={blockModal.start} onChange={(e) => setBlockModal(b => ({ ...b, start: e.target.value }))} /></div>
                  <div className="form-group"><label>Fim</label><input type="time" value={blockModal.end} onChange={(e) => setBlockModal(b => ({ ...b, end: e.target.value }))} /></div>
                </div>
              )}
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 8px' }}>
                {blockModal.mode === 'dia'
                  ? 'Bloqueia o dia inteiro — nenhum novo evento poderá ser criado.'
                  : 'Bloqueia apenas o período informado. Eventos fora dele continuam permitidos. Os horários acima podem ser ajustados.'}
              </p>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setBlockModal(null)}>Cancelar</button>
                <button type="button" className="btn-primary" disabled={blockSaving} onClick={saveBlock} style={{ background: '#dc2626', borderColor: '#dc2626' }}>{blockSaving ? 'Salvando...' : 'Bloquear'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Linha de evento reutilizável (lista e drawer do dia)
function EventRow({ ev, onView, onEdit, onCancel, onRemove }) {
  const ti = typeInfo(ev.type);
  const cancelled = ev.status === 'cancelado';
  const isBlock = ev.type === 'bloqueio';
  const clickable = !isBlock && typeof onView === 'function';   // bloqueio não tem visualização
  return (
    <div className="ag-item"
      style={{ cursor: clickable ? 'pointer' : 'default', opacity: cancelled ? 0.55 : 1, borderLeft: `3px solid ${ti.color}` }}
      onClick={clickable ? () => onView(ev) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(ev); } } : undefined}
    >
      <div className="ag-ava" style={{ background: `${ti.color}18`, color: ti.color, fontSize: 12, fontWeight: 700 }}>
        {isBlock ? '🔒' : (fmtTime(ev.start_time) || '--:--')}
      </div>
      <div className="ag-itembody">
        <div className="ag-name" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{ev.title}</div>
        <div className="ag-meta" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: ti.color, background: `${ti.color}14`, padding: '1px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{ti.label}</span>
          {fmtTime(ev.start_time) && fmtTime(ev.end_time) && <span>{fmtTime(ev.start_time)}–{fmtTime(ev.end_time)}</span>}
          {ev.service_name && <span>· {ev.service_name}</span>}
          {ev.client_name && <span>· {ev.client_name}</span>}
          {ev.responsible_name && <span style={{ color: '#cbd5e1' }}>· resp.: {ev.responsible_name}</span>}
          {ev.description && <span style={{ color: '#94a3b8' }}>· {ev.description}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {!isBlock && (cancelled
          ? <span className="ag-pill" style={{ background: '#f1f5f9', color: '#94a3b8' }}>Cancelado</span>
          : <span className="ag-pill" style={{ background: `${ti.color}18`, color: ti.color }}>{STATUS_LABEL[ev.status] || 'Agendado'}</span>)}
        <button className="btn-icon" title="Editar" onClick={(e) => { e.stopPropagation(); onEdit(ev); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        {!isBlock && !cancelled && (
          <button className="btn-icon" title="Cancelar" onClick={(e) => { e.stopPropagation(); onCancel(ev); }} style={{ color: '#f59e0b' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </button>
        )}
        <button className="btn-icon danger" title={isBlock ? 'Remover bloqueio' : 'Excluir'} onClick={(e) => { e.stopPropagation(); onRemove(ev); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    </div>
  );
}

// Bloco label/valor do modal de visualização — oculto quando não há valor
function DetailItem({ label, value, capitalize }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', wordBreak: 'break-word', textTransform: capitalize ? 'capitalize' : 'none' }}>{value}</div>
    </div>
  );
}

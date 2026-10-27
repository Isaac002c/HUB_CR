import assert from 'node:assert/strict';
import test from 'node:test';
import { toProtocolDateDisplay, toProtocolDateIso } from '../app/lib/protocolDates.mjs';

test('preserva a data ISO serializada pelo PostgreSQL ao salvar sem alteração', () => {
  const savedDate = '2026-10-23T00:00:00.000Z';
  assert.equal(toProtocolDateDisplay(savedDate), '23/10/2026');
  assert.equal(toProtocolDateIso(savedDate), '2026-10-23');
});

test('aceita datas ISO, digitadas e escolhidas no calendário', () => {
  assert.equal(toProtocolDateIso('2026-10-23'), '2026-10-23');
  assert.equal(toProtocolDateIso('23/10/2026'), '2026-10-23');
  assert.equal(toProtocolDateIso('23102026'), '2026-10-23');
});

test('preserva a data de um objeto Date vindo do banco', () => {
  assert.equal(toProtocolDateIso(new Date('2026-10-23T00:00:00.000Z')), '2026-10-23');
  assert.equal(toProtocolDateDisplay(new Date('2026-10-23T00:00:00.000Z')), '23/10/2026');
});

test('mantém valores vazios ou inválidos vazios para não gravar uma data indevida', () => {
  assert.equal(toProtocolDateIso(''), null);
  assert.equal(toProtocolDateIso(null), null);
  assert.equal(toProtocolDateIso('data inválida'), null);
});

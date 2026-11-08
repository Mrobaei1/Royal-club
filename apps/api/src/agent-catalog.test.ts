import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TEMPLATES, gameAgentTemplateCode, getAgentTemplate } from './agent-catalog.js';

test('agent role catalog is unique and contains a parameterized game specialist', () => {
  const codes = AGENT_TEMPLATES.map((template) => template.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(getAgentTemplate('backgammon')?.gameScoped, false);
  assert.equal(getAgentTemplate('chess')?.gameScoped, false);
  assert.equal(getAgentTemplate('card_games')?.gameScoped, false);
  assert.equal(getAgentTemplate('game_operations')?.gameScoped, true);
  const infrastructure = getAgentTemplate('infrastructure_reliability');
  assert.equal(infrastructure?.gameScoped, false);
  assert.deepEqual(infrastructure?.defaultCapabilities, ['read', 'recommend']);
  assert.equal(gameAgentTemplateCode('uno'), 'game_operations:uno');
  assert.equal(gameAgentTemplateCode('poker'), 'game_operations:poker');
});

test('catalog defaults do not grant execute or approve capabilities', () => {
  for (const template of AGENT_TEMPLATES) {
    assert.ok(!template.defaultCapabilities.includes('execute'));
    assert.ok(!template.defaultCapabilities.includes('approve'));
  }
});

test('invalid game codes cannot produce game-scoped template identifiers', () => {
  assert.equal(gameAgentTemplateCode('../admin'), null);
  assert.equal(gameAgentTemplateCode(''), null);
});

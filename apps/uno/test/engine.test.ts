import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, startUnoGame, applyUnoAction, publicGameState, privateTurnState } from '../src/engine.js';
import { UnoError } from '../src/model.js';

test('deck has 108 unique cards and cryptographically generated ids', () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map(c => c.id)).size, 108);
  assert.equal(deck.filter(c => c.face === 'wild').length, 4);
  assert.equal(deck.filter(c => c.face === 'wild4').length, 4);
});
test('game starts with 2 to 6 players and seven private cards each', () => {
  const game = startUnoGame([{ id: 'a', username: 'alpha' }, { id: 'b', username: 'beta' }]);
  assert.equal(game.players[0]!.hand.length, 7);
  assert.equal(game.players[1]!.hand.length, 7);
  assert.equal(game.drawPile.length + game.discardPile.length + 14, 108);
  assert.throws(() => startUnoGame([{ id: 'a', username: 'a' }]), (e: unknown) => e instanceof UnoError && e.code === 'INVALID_PLAYER_COUNT');
  assert.throws(() => startUnoGame(Array.from({length:7},(_,i)=>({id:String(i),username:String(i)}))), /2 to 6/);
});
test('only the current player can draw and a drawn card must be played or passed', () => {
  let game = startUnoGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  assert.throws(() => applyUnoAction(game, 'b', {type:'draw'}), (e: unknown) => e instanceof UnoError && e.code === 'NOT_YOUR_TURN');
  game = applyUnoAction(game, 'a', {type:'draw'});
  assert.ok(game.drawnCardId);
  assert.throws(() => applyUnoAction(game, 'a', {type:'draw'}), /already drawn/);
  game = applyUnoAction(game, 'a', {type:'pass'});
  assert.equal(game.currentPlayerIndex, 1);
});
test('public state never exposes player hands', () => {
  const game = startUnoGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  const state = publicGameState(game) as unknown as Record<string, unknown>;
  assert.equal('hands' in state, false);
  assert.equal('hand' in (state.players as Array<Record<string,unknown>>)[0]!, false);
  assert.equal('drawnCardId' in state, false);
});

test('UNO can be called after the player has yielded the turn, and an opponent can catch it', () => {
  const base = startUnoGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  base.players[0]!.hand = [
    {id:'play-me',color:'red',face:3},
    {id:'keep-me',color:'blue',face:4},
  ];
  base.discardPile = [{id:'top',color:'red',face:1}];
  base.activeColor = 'red';
  base.currentPlayerIndex = 0;
  const played = applyUnoAction(base, 'a', {type:'play',cardId:'play-me'});
  assert.equal(played.unoPendingPlayerId, 'a');
  assert.equal(played.currentPlayerIndex, 1);
  const called = applyUnoAction(played, 'a', {type:'callUno'});
  assert.equal(called.unoPendingPlayerId, null);
  const caught = applyUnoAction(played, 'b', {type:'catchUno'});
  assert.equal(caught.players[0]!.hand.length, 3);
  assert.equal(caught.unoPendingPlayerId, null);
});

test('drawn-card identity is private to the active player', () => {
  let game = startUnoGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game = applyUnoAction(game, 'a', {type:'draw'});
  assert.ok(privateTurnState(game, 'a').drawnCardId);
  assert.equal(privateTurnState(game, 'b').drawnCardId, null);
  assert.equal('drawnCardId' in (publicGameState(game) as object), false);
});

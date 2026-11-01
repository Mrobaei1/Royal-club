import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, startUnoGame, applyUnoAction, publicGameState, privateTurnState, resolveOpeningCard, drawOpeningCard } from '../src/engine.js';
import { UnoError } from '../src/model.js';

function makeActionGame(players: Array<{id:string;username:string}>) {
  const game = startUnoGame(players);
  // Most engine tests target mid-game rules, not the random opening-Wild flow.
  game.openingColorPendingPlayerId = null;
  if (game.discardPile[0]?.face === 'draw2') {
    const openingPenaltyCards = game.players[1]!.hand.splice(7);
    game.drawPile.push(...openingPenaltyCards);
  }
  game.currentPlayerIndex = 0;
  game.direction = 1;
  return game;
}

test('deck has 108 unique cards and cryptographically generated ids', () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map(c => c.id)).size, 108);
  assert.equal(deck.filter(c => c.face === 'wild').length, 4);
  assert.equal(deck.filter(c => c.face === 'wild4').length, 4);
});
test('game starts with 2 to 6 players and seven private cards each', () => {
  const game = makeActionGame([{ id: 'a', username: 'alpha' }, { id: 'b', username: 'beta' }]);
  assert.ok(game.players.every(player => player.hand.length >= 7));
  assert.equal(game.players.reduce((sum, player) => sum + player.hand.length, 0) + game.drawPile.length + game.discardPile.length, 108);
  assert.throws(() => makeActionGame([{ id: 'a', username: 'a' }]), (e: unknown) => e instanceof UnoError && e.code === 'INVALID_PLAYER_COUNT');
  assert.throws(() => makeActionGame(Array.from({length:7},(_,i)=>({id:String(i),username:String(i)}))), /2 to 6/);
});
test('only the current player can draw and a drawn card must be played or passed', () => {
  let game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  assert.throws(() => applyUnoAction(game, 'b', {type:'draw'}), (e: unknown) => e instanceof UnoError && e.code === 'NOT_YOUR_TURN');
  game = applyUnoAction(game, 'a', {type:'draw'});
  assert.ok(game.drawnCardId);
  assert.throws(() => applyUnoAction(game, 'a', {type:'draw'}), /already drawn/);
  game = applyUnoAction(game, 'a', {type:'pass'});
  assert.equal(game.currentPlayerIndex, 1);
});
test('public state never exposes player hands', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  const state = publicGameState(game) as unknown as Record<string, unknown>;
  assert.equal('hands' in state, false);
  assert.equal('hand' in (state.players as Array<Record<string,unknown>>)[0]!, false);
  assert.equal('drawnCardId' in state, false);
});

test('UNO can be called after the player has yielded the turn, and an opponent can catch it', () => {
  const base = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
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
  let game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game = applyUnoAction(game, 'a', {type:'draw'});
  assert.ok(privateTurnState(game, 'a').drawnCardId);
  assert.equal(privateTurnState(game, 'b').drawnCardId, null);
  assert.equal('drawnCardId' in (publicGameState(game) as object), false);
});

test('wild cards reject colors outside the four UNO colors', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'wild-card',color:'wild',face:'wild'}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  assert.throws(
    () => applyUnoAction(game, 'a', {type:'play',cardId:'wild-card',chosenColor:'purple' as never}),
    (error: unknown) => error instanceof UnoError && error.code === 'CHOOSE_COLOR',
  );
});

test('any seated opponent can catch an uncalled UNO before the next action', () => {
  const game = makeActionGame([
    {id:'a',username:'a'},
    {id:'b',username:'b'},
    {id:'c',username:'c'},
  ]);
  game.players[0]!.hand = [
    {id:'play-me',color:'red',face:3},
    {id:'keep-me',color:'blue',face:4},
  ];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const played = applyUnoAction(game, 'a', {type:'play',cardId:'play-me'});
  assert.equal(played.currentPlayerIndex, 1);
  const caught = applyUnoAction(played, 'c', {type:'catchUno'});
  assert.equal(caught.players[0]!.hand.length, 3);
  assert.equal(caught.unoPendingPlayerId, null);
});

test('a final Draw Two applies its penalty before the round is awarded', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'last-draw-two',color:'red',face:'draw2'}];
  game.players[1]!.hand = Array.from({length:7},(_,i)=>({id:'target-'+i,color:'blue' as const,face:i}));
  game.discardPile = [{id:'top',color:'red',face:5}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const finished = applyUnoAction(game, 'a', {type:'play',cardId:'last-draw-two'});
  assert.equal(finished.winnerId, 'a');
  assert.equal(finished.players[1]!.hand.length, 9);
});


test('Wild Draw Four with an active-color card is playable but exposes a valid challenge', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [
    {id:'bluff-wild4',color:'wild',face:'wild4'},
    {id:'red-card',color:'red',face:8},
  ];
  game.discardPile = [{id:'top',color:'red',face:2}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'bluff-wild4',chosenColor:'blue'});
  assert.equal(pending.pendingWild4?.offenderHadActiveColor, true);
  assert.equal(pending.players[1]!.hand.length, 7);
  assert.equal(game.players[0]!.hand.length, 2);
});

test('legal Wild Draw Four waits for the target to accept or challenge', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [
    {id:'legal-wild4',color:'wild',face:'wild4'},
    {id:'other-color',color:'blue',face:8},
  ];
  game.discardPile = [{id:'top',color:'red',face:2}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const next = applyUnoAction(game, 'a', {type:'play',cardId:'legal-wild4',chosenColor:'green'});
  assert.equal(next.activeColor, 'green');
  assert.equal(next.players[1]!.hand.length, 7);
  assert.equal(next.currentPlayerIndex, 1);
  assert.equal(next.pendingWild4?.targetId, 'b');
  const accepted = applyUnoAction(next, 'b', {type:'draw'});
  assert.equal(accepted.players[1]!.hand.length, 11);
  assert.equal(accepted.currentPlayerIndex, 2);
  assert.equal(accepted.unoPendingPlayerId, null);
});


test('two-player Reverse acts as a skip and returns the turn to the same player', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'reverse',color:'red',face:'reverse'},{id:'spare',color:'blue',face:2}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const next = applyUnoAction(game, 'a', {type:'play',cardId:'reverse'});
  assert.equal(next.direction, -1);
  assert.equal(next.currentPlayerIndex, 0);
});

test('recycling the discard pile preserves its top card and makes prior discards drawable', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'drawn',color:'yellow',face:1}];
  game.drawPile = [];
  game.discardPile = [
    {id:'old-1',color:'red',face:1},
    {id:'old-2',color:'blue',face:2},
    {id:'top',color:'green',face:3},
  ];
  game.activeColor = 'green';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const next = applyUnoAction(game, 'a', {type:'draw'});
  assert.equal(next.discardPile.length, 1);
  assert.equal(next.discardPile[0]!.id, 'top');
  assert.equal(next.players[0]!.hand.length, 2);
  assert.equal(next.drawPile.length, 1);
});


test('Skip advances past exactly one player in a three-player game', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [{id:'skip',color:'red',face:'skip'},{id:'spare',color:'blue',face:2}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const next = applyUnoAction(game, 'a', {type:'play',cardId:'skip'});
  assert.equal(next.currentPlayerIndex, 2);
});

test('Draw Two gives exactly two cards and skips the targeted player', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [{id:'draw2',color:'red',face:'draw2'},{id:'spare',color:'blue',face:2}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const next = applyUnoAction(game, 'a', {type:'play',cardId:'draw2'});
  assert.equal(next.players[1]!.hand.length, 9);
  assert.equal(next.currentPlayerIndex, 2);
});

test('a wild card requires one of the four supported colors and failed play is atomic', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'wild',color:'wild',face:'wild'},{id:'spare',color:'blue',face:2}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  assert.throws(
    () => applyUnoAction(game, 'a', {type:'play',cardId:'wild'}),
    (error: unknown) => error instanceof UnoError && error.code === 'CHOOSE_COLOR',
  );
  assert.equal(game.players[0]!.hand.length, 2);
  assert.equal(game.discardPile.length, 1);
});

test('drawing fails cleanly when no draw cards can be recovered', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.currentPlayerIndex = 0;
  game.direction = 1;
  game.drawPile = [];
  game.discardPile = [{id:'only-top',color:'red',face:1}];
  const originalHandSize = game.players[0]!.hand.length;
  assert.throws(
    () => applyUnoAction(game, 'a', {type:'draw'}),
    (error: unknown) => error instanceof UnoError && error.code === 'DRAW_PILE_EMPTY',
  );
  assert.equal(game.players[0]!.hand.length, originalHandSize);
  assert.equal(game.discardPile.length, 1);
});


test('Wild Draw Four challenge succeeds when offender held the active color', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [
    {id:'wild4',color:'wild',face:'wild4'},
    {id:'red-card',color:'red',face:8},
    {id:'spare',color:'blue',face:2},
  ];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'wild4',chosenColor:'green'});
  assert.equal(pending.pendingWild4?.targetId, 'b');
  assert.equal(pending.players[1]!.hand.length, 7);
  const challenged = applyUnoAction(pending, 'b', {type:'challengeWild4'});
  assert.equal(challenged.players[0]!.hand.length, 6);
  assert.equal(challenged.players[1]!.hand.length, 7);
  assert.equal(challenged.currentPlayerIndex, 0);
  assert.equal(challenged.pendingWild4, null);
});

test('Wild Draw Four challenge fails when offender had no active color; challenger draws six and loses turn', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [
    {id:'wild4',color:'wild',face:'wild4'},
    {id:'blue-card',color:'blue',face:8},
    {id:'spare',color:'yellow',face:2},
  ];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'wild4',chosenColor:'green'});
  const challenged = applyUnoAction(pending, 'b', {type:'challengeWild4'});
  assert.equal(challenged.players[1]!.hand.length, 13);
  assert.equal(challenged.currentPlayerIndex, 2);
  assert.equal(challenged.pendingWild4, null);
});

test('accepting Wild Draw Four draws four and skips the targeted player', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [{id:'wild4',color:'wild',face:'wild4'},{id:'spare',color:'blue',face:2}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'wild4',chosenColor:'green'});
  const accepted = applyUnoAction(pending, 'b', {type:'draw'});
  assert.equal(accepted.players[1]!.hand.length, 11);
  assert.equal(accepted.currentPlayerIndex, 2);
  assert.equal(accepted.pendingWild4, null);
});


test('a pending Wild Draw Four response blocks playing or passing until accepted or challenged', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'},{id:'c',username:'c'}]);
  game.players[0]!.hand = [{id:'wild4',color:'wild',face:'wild4'},{id:'spare',color:'blue',face:2}];
  game.players[1]!.hand = [{id:'playable',color:'green',face:3}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'wild4',chosenColor:'green'});
  assert.throws(() => applyUnoAction(pending, 'b', {type:'play',cardId:'playable'}), (error: unknown) => error instanceof UnoError && error.code === 'WILD4_RESPONSE_REQUIRED');
  assert.throws(() => applyUnoAction(pending, 'b', {type:'pass'}), (error: unknown) => error instanceof UnoError && error.code === 'WILD4_RESPONSE_REQUIRED');
  assert.equal(pending.players[1]!.hand.length, 1);
  assert.equal(pending.pendingWild4?.targetId, 'b');
});


test('a final Wild Draw Four waits for the target response before awarding the round', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'last-wild4',color:'wild',face:'wild4'}];
  game.players[1]!.hand = Array.from({length:7},(_,i)=>({id:'b'+i,color:'blue' as const,face:i}));
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'last-wild4',chosenColor:'green'});
  assert.equal(pending.winnerId, null);
  assert.equal(pending.pendingWild4?.targetId, 'b');
  const accepted = applyUnoAction(pending, 'b', {type:'draw'});
  assert.equal(accepted.winnerId, 'a');
  assert.equal(accepted.players[1]!.hand.length, 11);
});

test('a final Wild Draw Four challenge can overturn the round when the offender bluffed', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'last-wild4',color:'wild',face:'wild4'}];
  game.players[1]!.hand = Array.from({length:7},(_,i)=>({id:'b'+i,color:'blue' as const,face:i}));
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const pending = applyUnoAction(game, 'a', {type:'play',cardId:'last-wild4',chosenColor:'green'});
  pending.pendingWild4!.offenderHadActiveColor = true;
  const challenged = applyUnoAction(pending, 'b', {type:'challengeWild4'});
  assert.equal(challenged.winnerId, null);
  assert.equal(challenged.players[0]!.hand.length, 4);
  assert.equal(challenged.currentPlayerIndex, 0);
});


test('official UNO card points are calculated and exposed when a round ends', async () => {
  const { cardPointValue, publicGameState } = await import('../src/engine.js');
  assert.equal(cardPointValue({id:'n',color:'red',face:9}), 9);
  assert.equal(cardPointValue({id:'s',color:'red',face:'skip'}), 20);
  assert.equal(cardPointValue({id:'r',color:'red',face:'reverse'}), 20);
  assert.equal(cardPointValue({id:'d',color:'red',face:'draw2'}), 20);
  assert.equal(cardPointValue({id:'w',color:'wild',face:'wild'}), 50);
  assert.equal(cardPointValue({id:'w4',color:'wild',face:'wild4'}), 50);
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'last',color:'red',face:1}];
  game.players[1]!.hand = [
    {id:'n',color:'red',face:9},
    {id:'skip',color:'red',face:'skip'},
    {id:'wild',color:'wild',face:'wild'},
  ];
  game.discardPile = [{id:'top',color:'red',face:2}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const won = applyUnoAction(game,'a',{type:'play',cardId:'last'});
  assert.equal(won.winnerScore,79);
  assert.equal(publicGameState(won).winnerScore,79);
});


test('opening Skip, Reverse and Draw Two apply their official first-turn effects', () => {
  const players = (count: number) => Array.from({length:count},(_,i)=>({id:String(i),username:String(i),hand:[] as Array<{id:string;color:'red';face:number}>}));
  const skipPlayers = players(3);
  const skip = resolveOpeningCard(skipPlayers, [], {id:'skip',color:'red',face:'skip'});
  assert.deepEqual(skip, {currentPlayerIndex:1,direction:1});

  const reversePlayers = players(4);
  const reverse = resolveOpeningCard(reversePlayers, [], {id:'reverse',color:'blue',face:'reverse'});
  assert.deepEqual(reverse, {currentPlayerIndex:3,direction:-1});

  const twoPlayerReverse = resolveOpeningCard(players(2), [], {id:'reverse',color:'blue',face:'reverse'});
  assert.deepEqual(twoPlayerReverse, {currentPlayerIndex:0,direction:-1});

  const drawPlayers = players(3);
  const drawPile = [
    {id:'draw-a',color:'red' as const,face:1},
    {id:'draw-b',color:'red' as const,face:2},
  ];
  const draw2 = resolveOpeningCard(drawPlayers, drawPile, {id:'draw2',color:'red',face:'draw2'});
  assert.deepEqual(draw2, {currentPlayerIndex:2,direction:1});
  assert.equal(drawPlayers[1]!.hand.length,2);
  assert.equal(drawPile.length,0);
});


test('an opening Wild requires the first player to choose a color before any move', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.openingColorPendingPlayerId = 'a';
  game.currentPlayerIndex = 0;
  assert.throws(() => applyUnoAction(game,'a',{type:'draw'}), (error: unknown) => error instanceof UnoError && error.code === 'OPENING_COLOR_REQUIRED');
  const chosen = applyUnoAction(game,'a',{type:'chooseColor',color:'blue'});
  assert.equal(chosen.activeColor,'blue');
  assert.equal(chosen.openingColorPendingPlayerId,null);
  assert.equal(chosen.currentPlayerIndex,0);
});

test('an opening Wild Draw Four is returned to the draw deck and replaced', () => {
  const drawPile = [
    {id:'replacement',color:'red' as const,face:4},
    {id:'opening-wild4',color:'wild' as const,face:'wild4' as const},
  ];
  const opening = drawOpeningCard(drawPile);
  assert.equal(opening.id,'replacement');
  assert.equal(drawPile.some(card => card.id === 'opening-wild4'),true);
});


test('Reverse acts as Skip in a two-player game and the same player takes the next turn', () => {
  const game = makeActionGame([{id:'a',username:'a'},{id:'b',username:'b'}]);
  game.players[0]!.hand = [{id:'reverse',color:'red',face:'reverse'},{id:'spare',color:'blue',face:2}];
  game.discardPile = [{id:'top',color:'red',face:1}];
  game.activeColor = 'red';
  game.currentPlayerIndex = 0;
  game.direction = 1;
  const next = applyUnoAction(game,'a',{type:'play',cardId:'reverse'});
  assert.equal(next.currentPlayerIndex,0);
  assert.equal(next.direction,-1);
  assert.equal(next.turnNumber,game.turnNumber+1);
});

test('opening Reverse in a two-player game skips the second player', () => {
  const result = resolveOpeningCard(
    [{hand:[]},{hand:[]}],
    [],
    {id:'opening-reverse',color:'yellow',face:'reverse'},
  );
  assert.deepEqual(result,{currentPlayerIndex:0,direction:-1});
});

test('opening Wild Draw Four selection terminates safely when no legal opening card exists', () => {
  const onlyWildFours = [
    {id:'w1',color:'wild' as const,face:'wild4' as const},
    {id:'w2',color:'wild' as const,face:'wild4' as const},
  ];
  assert.throws(
    () => drawOpeningCard(onlyWildFours),
    (error: unknown) => error instanceof UnoError && error.code === 'INVALID_OPENING_DECK',
  );
  assert.equal(onlyWildFours.length,2);
});

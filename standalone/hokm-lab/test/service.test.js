import test from "node:test";
import assert from "node:assert/strict";
import { HokmRoomService, InMemoryRoomRepository } from "../src/service.js";

const user = userId => ({ authenticated: true, userId });

function serviceFixture() {
  let clock = 1000;
  let nextId = 0;
  const repository = new InMemoryRoomRepository();
  return {
    repository,
    service: new HokmRoomService({
      repository,
      now: () => clock,
      id: () => `service-room-${++nextId}`
    }),
    setNow(value) { clock = value; }
  };
}

test("service rejects missing or unverified authentication principals", async () => {
  const { service } = serviceFixture();
  await assert.rejects(service.create({ userId: "u0" }), /verified authenticated principal/);
  await assert.rejects(service.create(null), /verified authenticated principal/);
  await assert.rejects(service.create({ authenticated: true, userId: "" }), /verified authenticated principal/);
});

test("service derives room membership from authenticated principal and gates private views", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  assert.equal(created.hostUserId, "u0");
  await assert.rejects(service.view(user("outsider"), created.roomId), /not a member/);
  const joined = await service.join(user("u1"), created.roomId, created.version);
  assert.equal(joined.players.length, 2);
  assert.equal(joined.version, 2);
});

test("service serializes competing writes and rejects the stale second transition", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  const outcomes = await Promise.allSettled([
    service.join(user("u1"), created.roomId, created.version),
    service.join(user("u2"), created.roomId, created.version)
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
  const latest = await service.view(user("u0"), created.roomId);
  assert.equal(latest.players.length, 2);
  assert.equal(latest.version, 2);
});

test("service enforces host-only start and server-side version checks", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  let version = created.version;
  for (const id of ["u1", "u2", "u3"]) {
    const joined = await service.join(user(id), created.roomId, version);
    version = joined.version;
  }
  for (const id of ["u0", "u1", "u2", "u3"]) {
    const ready = await service.ready(user(id), created.roomId, true, version);
    version = ready.version;
  }
  await assert.rejects(service.start(user("u2"), created.roomId, version), /Only the host/);
  const started = await service.start(user("u0"), created.roomId, version);
  assert.equal(started.status, "playing");
  await assert.rejects(
    service.command(user("u0"), created.roomId, { type: "choose_trump", suit: "hearts" }, version),
    /Stale room version/
  );
});

test("only trusted service principals can execute disconnect deadline jobs", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  await assert.rejects(
    service.processDisconnectTimeout(user("u0"), created.roomId, "u0", created.version),
    /trusted service principal/
  );
});

test("repository compare-and-swap rejects non-sequential versions", async () => {
  const repository = new InMemoryRoomRepository();
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  await repository.insert({ ...created, roomId: "cas-room", version: 1 });
  await assert.rejects(repository.compareAndSwap("cas-room", 1, { ...created, roomId: "cas-room", version: 3 }), /Invalid room compare-and-swap transition/);
  assert.equal((await repository.get("cas-room")).version, 1);
  void service;
});
test("service views expose only the authenticated seat hand", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  let version = created.version;
  for (const id of ["u1", "u2", "u3"]) {
    version = (await service.join(user(id), created.roomId, version)).version;
  }
  for (const id of ["u0", "u1", "u2", "u3"]) {
    version = (await service.ready(user(id), created.roomId, true, version)).version;
  }
  await service.start(user("u0"), created.roomId, version);
  for (let seat = 0; seat < 4; seat += 1) {
    const view = await service.view(user(`u${seat}`), created.roomId);
    assert.equal(view.game.ownSeat, seat);
    assert.equal(view.game.ownHand.length, 5);
    assert.equal("hands" in view.game, false);
    assert.equal("undealtDeck" in view.game, false);
  }
});


test("deadline and technical-failure jobs reject ordinary player principals", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  await assert.rejects(
    service.processTurnDeadline(user("u0"), created.roomId, created.version),
    /trusted service principal/
  );
  await assert.rejects(
    service.processAllDisconnectedDeadline(user("u0"), created.roomId, created.version),
    /trusted service principal/
  );
  await assert.rejects(
    service.cancelForTechnicalFailure(user("u0"), created.roomId, created.version, "test_failure"),
    /trusted service principal/
  );
});

test("appeal and cheating-report review reject ordinary player principals", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  await assert.rejects(
    service.reviewAppeal(user("u0"), created.roomId, "appeal-id", "confirmed", "", created.version),
    /authorized manager/
  );
  await assert.rejects(
    service.reviewCheating(user("u0"), created.roomId, "report-id", "", created.version),
    /authorized manager/
  );
});

test("manager report review returns a sanitized management projection", async () => {
  const { service } = serviceFixture();
  let room = await service.create(user("u0"));
  for (const id of ["u1", "u2", "u3"]) room = await service.join(user(id), room.roomId, room.version);
  for (const id of ["u0", "u1", "u2", "u3"]) room = await service.ready(user(id), room.roomId, true, room.version);
  room = await service.start(user("u0"), room.roomId, room.version);
  const reported = await service.reportCheating(user("u0"), room.roomId, "u1",
    "The opponent revealed hidden cards to another participant.", room.version);
  const managerView = await service.reviewCheating(
    { authenticated: true, userId: "manager-1", role: "manager" },
    room.roomId, "service-room-2", "Evidence reviewed.", reported.version
  );
  assert.equal(managerView.reports[0].status, "reviewed");
  assert.equal("round" in managerView, false);
  assert.equal("revealedHands" in managerView, false);
  assert.equal("game" in managerView, false);
});

test("appeal submission returns a participant-visible reference without exposing match state", async () => {
  const { service, repository } = serviceFixture();
  let room = await service.create(user("u0"));
  for (const id of ["u1", "u2", "u3"]) room = await service.join(user(id), room.roomId, room.version);
  for (const id of ["u0", "u1", "u2", "u3"]) room = await service.ready(user(id), room.roomId, true, room.version);
  room = await service.start(user("u0"), room.roomId, room.version);
  const persisted = await repository.get(room.roomId);
  const completed = { ...persisted, status: "completed", result: { winnerTeam: 0 }, version: persisted.version + 1 };
  assert.equal(await repository.compareAndSwap(room.roomId, persisted.version, completed), true);
  const appeal = await service.submitAppeal(user("u0"), room.roomId,
    "The match result does not match the server score record.", completed.version);
  assert.ok(appeal.submittedAppealId);
  assert.equal(appeal.status, "completed");
  assert.equal(appeal.game, null);
  assert.equal(Object.hasOwn(appeal, "round"), false);
});

test("only the host can start the next round after the full three-second reveal", async () => {
  const { service, repository, setNow } = serviceFixture();
  let room = await service.create(user("u0"));
  for (const id of ["u1", "u2", "u3"]) room = await service.join(user(id), room.roomId, room.version);
  for (const id of ["u0", "u1", "u2", "u3"]) room = await service.ready(user(id), room.roomId, true, room.version);
  room = await service.start(user("u0"), room.roomId, room.version);
  const persisted = await repository.get(room.roomId);
  const revealUntil = 4000;
  const roundCompleted = {
    ...persisted, status: "round_completed", handRevealUntil: revealUntil,
    version: persisted.version + 1
  };
  assert.equal(await repository.compareAndSwap(room.roomId, persisted.version, roundCompleted), true);
  await assert.rejects(
    service.nextRound(user("u1"), room.roomId, roundCompleted.version),
    /Only the host.*may start the next round/
  );
  await assert.rejects(
    service.nextRound(user("u0"), room.roomId, roundCompleted.version),
    /3-second end-of-hand reveal is still active/
  );
  setNow(revealUntil);
  const next = await service.nextRound(user("u0"), room.roomId, roundCompleted.version);
  assert.equal(next.status, "playing");
  assert.equal(next.handRevealUntil, null);
  assert.equal(next.turnDeadlineAt, revealUntil + 7000);
});

test("a player can join by room code without first reading a member-only room view", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  const joined = await service.join(user("u1"), created.roomId);
  assert.equal(joined.roomId, created.roomId);
  assert.equal(joined.players.length, 2);
  assert.equal(joined.version, created.version + 1);
});


test("service sends idempotent private text messages only between opposing teams", async () => {
  const { service } = serviceFixture();
  let room = await service.create(user("u0"));
  for (const id of ["u1", "u2", "u3"]) room = await service.join(user(id), room.roomId, room.version);
  for (const id of ["u0", "u1", "u2", "u3"]) room = await service.ready(user(id), room.roomId, true, room.version);
  room = await service.start(user("u0"), room.roomId, room.version);
  const sent = await service.sendChatMessage(user("u0"), room.roomId, "u1", "سلام 👋", "message-1", room.version);
  assert.equal(sent.chatMessages.length, 1);
  assert.equal(sent.chatMessages[0].text, "سلام 👋");
  const recipient = await service.view(user("u1"), room.roomId);
  const teammate = await service.view(user("u2"), room.roomId);
  assert.equal(recipient.chatMessages.length, 1);
  assert.equal(teammate.chatMessages.length, 0);
  const duplicate = await service.sendChatMessage(user("u0"), room.roomId, "u1", "سلام 👋", "message-1", sent.version);
  assert.equal(duplicate.version, sent.version);
  await assert.rejects(
    service.sendChatMessage(user("u0"), room.roomId, "u2", "هم‌تیمی", "message-2", sent.version),
    /opposing-team/
  );
});


test("manager review projection is role-gated and contains no private game state", async () => {
  const { service } = serviceFixture();
  let room = await service.create(user("u0"));
  for (const id of ["u1", "u2", "u3"]) room = await service.join(user(id), room.roomId, room.version);
  for (const id of ["u0", "u1", "u2", "u3"]) room = await service.ready(user(id), room.roomId, true, room.version);
  room = await service.start(user("u0"), room.roomId, room.version);
  room = await service.reportCheating(user("u0"), room.roomId, "u1",
    "The player disclosed a hidden card to an opponent.", room.version);
  await assert.rejects(service.managerView(user("u0"), room.roomId), /authorized manager/);
  const review = await service.managerView({ authenticated: true, userId: "manager", role: "manager" }, room.roomId);
  assert.equal(review.reports.length, 1);
  assert.equal(review.reports[0].status, "pending");
  assert.equal("round" in review, false);
  assert.equal("game" in review, false);
  assert.equal("chatMessages" in review, false);
});

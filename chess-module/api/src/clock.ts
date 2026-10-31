export type TimeControl = {
  id: string;
  name: "ultra_fast" | "rapid" | "classical" | string;
  baseMs: number;
  incrementMs: number;
  enabled: boolean;
};
export type ClockSnapshot = {
  whiteMs: number;
  blackMs: number;
  active: "white" | "black" | null;
  lastStartedAt: number | null;
  finished: boolean;
};

export function validateTimeControl(control: TimeControl): void {
  if (!control.id.trim() || !Number.isSafeInteger(control.baseMs) || control.baseMs < 1_000 ||
      !Number.isSafeInteger(control.incrementMs) || control.incrementMs < 0) {
    throw new RangeError("invalid_time_control");
  }
}
export function defaultTimeControls(): TimeControl[] {
  return [
    { id:"ultra_fast", name:"ultra_fast", baseMs:90_000, incrementMs:0, enabled:true },
    { id:"rapid", name:"rapid", baseMs:300_000, incrementMs:0, enabled:true },
    { id:"classical", name:"classical", baseMs:900_000, incrementMs:0, enabled:true }
  ];
}
export function snapshotClock(control: TimeControl, now: number): ClockSnapshot {
  validateTimeControl(control);
  if (!Number.isFinite(now)) throw new RangeError("invalid_timestamp");
  return { whiteMs:control.baseMs, blackMs:control.baseMs, active:null, lastStartedAt:null, finished:false };
}
export function startClock(clock: ClockSnapshot, side: "white"|"black", now: number): ClockSnapshot {
  if (clock.finished || clock.active !== null || !Number.isFinite(now)) throw new Error("clock_cannot_start");
  return { ...clock, active:side, lastStartedAt:now };
}
export function settleClock(clock: ClockSnapshot, control: TimeControl, now: number, moveCompleted: boolean): ClockSnapshot {
  if (clock.finished || clock.active === null || clock.lastStartedAt === null || now < clock.lastStartedAt) throw new Error("clock_not_running");
  const elapsed = now - clock.lastStartedAt;
  const field = clock.active === "white" ? "whiteMs" : "blackMs";
  const remaining = Math.max(0, clock[field] - elapsed);
  if (remaining === 0) return { ...clock, [field]:0, active:null, lastStartedAt:null, finished:true };
  return {
    ...clock,
    [field]: remaining + (moveCompleted ? control.incrementMs : 0),
    active: moveCompleted ? (clock.active === "white" ? "black" : "white") : clock.active,
    lastStartedAt: now
  };
}

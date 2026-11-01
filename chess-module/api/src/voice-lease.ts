export type VoiceLease = { roomId: string; userId: string; leaseId: string; expiresAt: number };
export type VoiceRequest = { granted: boolean; lease: VoiceLease | null; reason: "granted" | "occupied" | "disabled" | "invalid" };

export class VoiceLeaseManager {
  private readonly leases = new Map<string, VoiceLease>();
  constructor(private readonly leaseMs = 8_000) {
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000) throw new RangeError("invalid_lease_duration");
  }

  request(roomId: string, userId: string, leaseId: string, now: number, enabled: boolean): VoiceRequest {
    if (!roomId || !userId || !leaseId || !Number.isFinite(now)) return {granted:false,lease:null,reason:"invalid"};
    if (!enabled) { this.release(roomId, userId, leaseId); return {granted:false,lease:null,reason:"disabled"}; }
    const current=this.leases.get(roomId);
    if (current && current.expiresAt > now && current.userId !== userId) return {granted:false,lease:current,reason:"occupied"};
    const lease={roomId,userId,leaseId,expiresAt:now+this.leaseMs};
    this.leases.set(roomId,lease);
    return {granted:true,lease,reason:"granted"};
  }

  release(roomId: string, userId: string, leaseId?: string): boolean {
    const current=this.leases.get(roomId);
    if (!current || current.userId!==userId || (leaseId!==undefined && current.leaseId!==leaseId)) return false;
    this.leases.delete(roomId);
    return true;
  }

  expire(now: number): string[] {
    const expired:string[]=[];
    for(const [roomId,lease] of this.leases) if(lease.expiresAt<=now) {this.leases.delete(roomId);expired.push(roomId);}
    return expired;
  }

  disconnect(userId: string): string[] {
    const released:string[]=[];
    for(const [roomId,lease] of this.leases) if(lease.userId===userId) {this.leases.delete(roomId);released.push(roomId);}
    return released;
  }

  disableRoom(roomId: string): boolean { return this.leases.delete(roomId); }
}

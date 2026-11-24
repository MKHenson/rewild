import type { MovementSystem } from './MovementSystem';

/** Creatures that spawned together and share a home. */
export class CreatureGroup {
  readonly members: MovementSystem[] = [];
  homeX = 0;
  homeZ = 0;
  /** m/s the home is moving. */
  speed = 0;
  /** Where in their height range the group swims, 0 lowest to 1 highest. */
  level = 0.5;

  /** Whether the home is on the move, so members travel as one. */
  get moving(): boolean {
    return this.speed > 0;
  }

  join(member: MovementSystem): void {
    if (!this.members.includes(member)) this.members.push(member);
    member.group = this;
  }

  /** Lets every member go. */
  clear(): void {
    for (let i = 0; i < this.members.length; i++)
      if (this.members[i].group === this) this.members[i].group = null;
    this.members.length = 0;
  }
}

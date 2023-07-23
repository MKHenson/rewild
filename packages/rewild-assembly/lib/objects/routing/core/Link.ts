import { Portal } from "./Portal";

export class Link {
  sourcePortal: Portal | null;
  destinationPortal: Portal | null;

  constructor() {
    this.sourcePortal = null;
    this.destinationPortal = null;
  }

  connect(source: Portal, destination: Portal): void {
    this.sourcePortal = source;
    this.destinationPortal = destination;
    source.links.push(this);
  }
}

export function createLink(): Link {
  return new Link();
}

export function connectLink(
  link: Link,
  source: Portal,
  destination: Portal
): void {
  link.connect(source, destination);
}

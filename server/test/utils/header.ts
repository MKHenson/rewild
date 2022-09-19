import Agent from "./agent";

export class Header {
  guest: Agent;

  async init(host: string) {
    this.guest = new Agent(host);
  }
}

export const header = new Header();

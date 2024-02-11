import { Link } from './Link';
import { Portal } from './Portal';

describe('Link', () => {
  it('can connect two portals to a link', () => {
    const link = new Link();
    const source = new Portal('source');
    const destination = new Portal('destination');

    link.connect(source, destination);

    expect(link.sourcePortal).toBe(source);
    expect(link.destinationPortal).toBe(destination);
    expect(source.links.length).toBe(1);
    expect(destination.links.length).toBe(1);
    expect(source.links[0]).toBe(link);
    expect(destination.links[0]).toBe(link);
  });
});

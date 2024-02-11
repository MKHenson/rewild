import { Link } from './Link';
import { Portal } from './Portal';

describe('Portal', () => {
  it('defaults to not being disposed', () => {
    const source = new Portal('source');
    expect(source.disposed).toBe(false);
  });

  it('can be disposed', () => {
    const source = new Portal('source');
    source.dispose();
    expect(source.disposed).toBe(true);
  });

  it('will remove itself from a link when disposed as a destination portal', () => {
    const link = new Link();
    const source = new Portal('source');
    const destination = new Portal('destination');
    link.connect(source, destination);

    expect(destination.links.length).toBe(1);
    expect(source.links.length).toBe(1);

    destination.dispose();

    expect(destination.links.length).toBe(0);
    expect(source.links.length).toBe(0);
    expect(destination.disposed).toBe(true);
    expect(source.disposed).toBe(false);
  });

  it('will remove itself from a link when disposed as a source portal', () => {
    const link = new Link();
    const source = new Portal('source');
    const destination = new Portal('destination');
    link.connect(source, destination);

    expect(destination.links.length).toBe(1);
    expect(source.links.length).toBe(1);

    source.dispose();

    expect(destination.links.length).toBe(0);
    expect(source.links.length).toBe(0);
    expect(destination.disposed).toBe(false);
    expect(source.disposed).toBe(true);
  });
});

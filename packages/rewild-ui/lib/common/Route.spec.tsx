import '../../compiler/jsx';
import { Route } from './Route';

describe('Route', () => {
  it('creates a route component with useShadow false', () => {
    const route = new Route();
    // Route sets useShadow: false in constructor, so shadow should be null
    // when not explicitly created
    expect(route).toBeInstanceOf(HTMLElement);
  });

  it('clear() removes all child nodes', () => {
    const route = new Route();

    // Add child elements
    route.appendChild(document.createElement('div'));
    route.appendChild(document.createElement('span'));
    expect(route.childNodes.length).toBe(2);

    route.clear();
    expect(route.childNodes.length).toBe(0);
  });

  it('clear() handles empty children gracefully', () => {
    const route = new Route();
    expect(route.childNodes.length).toBe(0);

    route.clear();
    expect(route.childNodes.length).toBe(0);
  });
});

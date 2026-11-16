import { Example, ExampleRegistry } from './registry';

function make(part: string, name: string): Example {
  return { part, name, build: () => {} };
}

describe('ExampleRegistry', () => {
  it('lists parts in the order they were first added', () => {
    const registry = new ExampleRegistry();
    registry.add(make('Layout', 'Row'));
    registry.add(make('Boxes', 'Rounded'));
    registry.add(make('Layout', 'Column'));
    expect(registry.parts()).toEqual(['Layout', 'Boxes']);
  });

  it('keeps the examples of a part in order', () => {
    const registry = new ExampleRegistry();
    registry.add(make('Layout', 'Row'));
    registry.add(make('Layout', 'Column'));
    expect(registry.examples('Layout').map((e) => e.name)).toEqual([
      'Row',
      'Column',
    ]);
  });

  it('gives no examples for an unknown part', () => {
    expect(new ExampleRegistry().examples('Glass')).toEqual([]);
  });

  it('rejects a second example with the same name in a part', () => {
    const registry = new ExampleRegistry();
    registry.add(make('Layout', 'Row'));
    expect(() => registry.add(make('Layout', 'Row'))).toThrow();
    expect(() => registry.add(make('Boxes', 'Row'))).not.toThrow();
  });
});

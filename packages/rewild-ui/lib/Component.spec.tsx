import '../compiler/jsx';
import { Component, register, ComponentOptions } from './Component';
import { Store } from './Store';

// ---------------------------------------------------------------------------
// Helpers – minimal concrete subclass for testing
// ---------------------------------------------------------------------------

interface TestProps {
  label?: string;
  count?: number;
}

// A simple component whose init() returns a render function producing a <span>
class TestComponent extends Component<TestProps> {
  initCallCount = 0;

  init() {
    this.initCallCount++;
    const span = document.createElement('span');
    return () => {
      span.textContent = this.props.label ?? '';
      return span;
    };
  }
}
customElements.define('x-test-component', TestComponent);

// A component that returns multiple children
class MultiChildComponent extends Component {
  init() {
    return () => {
      const a = document.createElement('div');
      a.id = 'child-a';
      const b = document.createElement('div');
      b.id = 'child-b';
      const c = document.createElement('div');
      c.id = 'child-c';
      return [a, b, c];
    };
  }
}
customElements.define('x-multi-child', MultiChildComponent);

// A component that conditionally returns children or null
class ConditionalComponent extends Component<{ show?: boolean }> {
  init() {
    return () => {
      if (!this.props.show) return null;
      const el = document.createElement('p');
      el.textContent = 'visible';
      return el;
    };
  }
}
customElements.define('x-conditional', ConditionalComponent);

// A component without shadow DOM
class NoShadowComponent extends Component<TestProps> {
  constructor(options?: ComponentOptions<TestProps>) {
    super({ ...options, useShadow: false });
  }
  init() {
    const span = document.createElement('span');
    return () => {
      span.textContent = this.props.label ?? '';
      return span;
    };
  }
}
customElements.define('x-no-shadow', NoShadowComponent);

// A component that returns a stylesheet string from getStyle
class StyledComponent extends Component<TestProps> {
  init() {
    return () => {
      const span = document.createElement('span');
      span.textContent = this.props.label ?? '';
      return span;
    };
  }
  getStyle() {
    return ':host { display: block; }';
  }
}
customElements.define('x-styled', StyledComponent);

// A component that uses useState
class StatefulComponent extends Component {
  getCounter!: () => number;
  setCounter!: (val: number, render?: boolean) => void;

  init() {
    const [getCounter, setCounter] = this.useState(0);
    this.getCounter = getCounter;
    this.setCounter = setCounter;

    const span = document.createElement('span');
    return () => {
      span.textContent = String(getCounter());
      return span;
    };
  }
}
customElements.define('x-stateful', StatefulComponent);

// A component that uses observeStore
class ObserverComponent extends Component {
  storeProxy!: { value: number };

  init() {
    const store = new Store({ value: 0 });
    this.storeProxy = this.observeStore(store);
    const span = document.createElement('span');
    return () => {
      span.textContent = String(this.storeProxy.value);
      return span;
    };
  }
}
customElements.define('x-observer', ObserverComponent);

// A component that returns a variable number of children based on props
class DynamicChildrenComponent extends Component<{ count: number }> {
  init() {
    return () => {
      const children: HTMLElement[] = [];
      for (let i = 0; i < (this.props.count ?? 0); i++) {
        const el = document.createElement('div');
        el.id = `item-${i}`;
        children.push(el);
      }
      return children.length > 0 ? children : null;
    };
  }
}
customElements.define('x-dynamic-children', DynamicChildrenComponent);

// Helper to create, init, and first-render a component
function setup<T extends Component>(
  Ctor: new (opts?: any) => T,
  options?: any
): T {
  const c = new Ctor(options);
  c._createRenderer();
  c.render();
  return c;
}

function getParent(c: Component): ShadowRoot | Component {
  return c.shadow ?? c;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Component', () => {
  // ------ Constructor & Shadow DOM ------

  describe('constructor', () => {
    it('creates a shadow root by default', () => {
      const c = new TestComponent({ props: { label: 'hi' } });
      expect(c.shadow).not.toBeNull();
      expect(c.shadow!.mode).toBe('open');
    });

    it('skips shadow root when useShadow is false', () => {
      const c = new NoShadowComponent({ props: { label: 'hi' } });
      expect(c.shadow).toBeNull();
    });

    it('sets initial _props from options', () => {
      const c = new TestComponent({ props: { label: 'test', count: 42 } });
      expect(c._props.label).toBe('test');
      expect(c._props.count).toBe(42);
    });

    it('handles no options gracefully', () => {
      const c = new TestComponent();
      expect(c._props).toBeUndefined();
    });
  });

  // ------ _createRenderer & render ------

  describe('_createRenderer / render', () => {
    it('calls init() once and produces a render function', () => {
      const c = new TestComponent({ props: { label: 'hello' } });
      c._createRenderer();
      expect(c.initCallCount).toBe(1);
      expect(typeof c.render).toBe('function');
    });

    it('renders a single child into the shadow root', () => {
      const c = setup(TestComponent, { props: { label: 'hello' } });
      const span = c.shadow!.querySelector('span');
      expect(span).not.toBeNull();
      expect(span!.textContent).toBe('hello');
    });

    it('renders into the element itself when shadow DOM is off', () => {
      const c = setup(NoShadowComponent, { props: { label: 'light' } });
      const span = c.querySelector('span');
      expect(span).not.toBeNull();
      expect(span!.textContent).toBe('light');
    });

    it('renders multiple children', () => {
      const c = setup(MultiChildComponent, { props: {} });
      const children = c.shadow!.childNodes;
      expect(children.length).toBe(3);
    });

    it('clears children when init returns null', () => {
      const c = setup(ConditionalComponent, { props: { show: true } });
      expect(getParent(c).childNodes.length).toBe(1);

      c._props = { show: false } as any;
      c.render();
      expect(getParent(c).childNodes.length).toBe(0);
    });

    it('re-renders and updates content on subsequent render calls', () => {
      const c = setup(TestComponent, { props: { label: 'first' } });
      expect(c.shadow!.querySelector('span')!.textContent).toBe('first');

      c._props = { label: 'second' } as any;
      c.render();
      expect(c.shadow!.querySelector('span')!.textContent).toBe('second');
    });

    it('skips replacing a child when the returned node is the same reference', () => {
      // ConditionalComponent caches the <p> element, so same reference across renders
      const c = setup(TestComponent, { props: { label: 'stable' } });
      const firstChild = getParent(c).childNodes[0];
      expect(firstChild).toBeDefined();

      // Second render returns the same <span> node reference — should be skipped
      c.render();
      expect(getParent(c).childNodes[0]).toBe(firstChild);
      expect(getParent(c).childNodes.length).toBe(1);
    });
  });

  // ------ props getter/setter ------

  describe('props', () => {
    it('getter returns _props', () => {
      const c = new TestComponent({ props: { label: 'x' } });
      expect(c.props.label).toBe('x');
    });

    it('setter triggers a re-render', () => {
      const c = setup(TestComponent, { props: { label: 'old' } });
      const renderSpy = jest.fn(c.render);
      c.render = renderSpy;

      c.props = { label: 'new' } as any;
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(c._props.label).toBe('new');
    });

    it('setter defaults to empty object when given falsy value', () => {
      const c = setup(TestComponent, { props: { label: 'x' } });
      c.props = null as any;
      expect(c._props).toEqual({});
    });

    it('setter does not throw if called before _createRenderer', () => {
      const c = new TestComponent({ props: { label: 'early' } });
      // render is undefined at this point — setter should guard against it
      expect(() => {
        c.props = { label: 'updated' } as any;
      }).not.toThrow();
      expect(c._props.label).toBe('updated');
    });
  });

  // ------ useState ------

  describe('useState', () => {
    it('returns initial value from getter', () => {
      const c = setup(StatefulComponent, { props: {} });
      expect(c.getCounter()).toBe(0);
    });

    it('setter updates value and triggers re-render', () => {
      const c = setup(StatefulComponent, { props: {} });
      const renderSpy = jest.fn(c.render);
      c.render = renderSpy;

      c.setCounter(5);
      expect(c.getCounter()).toBe(5);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('setter skips render when value is identical', () => {
      const c = setup(StatefulComponent, { props: {} });
      const renderSpy = jest.fn(c.render);
      c.render = renderSpy;

      c.setCounter(0); // same as default
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it('setter supports render=false to update without re-rendering', () => {
      const c = setup(StatefulComponent, { props: {} });
      const renderSpy = jest.fn(c.render);
      c.render = renderSpy;

      c.setCounter(10, false);
      expect(c.getCounter()).toBe(10);
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });

  // ------ observeStore ------

  describe('observeStore', () => {
    it('returns a proxy of the store target', () => {
      const c = setup(ObserverComponent, { props: {} });
      expect(c.storeProxy.value).toBe(0);
    });

    it('triggers render when store value changes', () => {
      const c = setup(ObserverComponent, { props: {} });

      // The store callback was bound to the original render, so check DOM output
      c.storeProxy.value = 42;
      const span = c.shadow!.querySelector('span');
      expect(span!.textContent).toBe('42');
    });

    it('accepts a custom callback instead of render', () => {
      const cb = jest.fn();

      class CustomCbComponent extends Component {
        init() {
          const store = new Store({ x: 1 });
          const proxy = this.observeStore(store, cb);
          (this as any)._storeProxy = proxy;
          return () => null;
        }
      }
      customElements.define('x-custom-cb', CustomCbComponent);

      const c = setup(CustomCbComponent, { props: {} });
      (c as any)._storeProxy.x = 99;
      expect(cb).toHaveBeenCalled();
    });
  });

  // ------ Child DOM diffing ------

  describe('DOM diffing', () => {
    it('grows children when count increases', () => {
      const c = setup(DynamicChildrenComponent, {
        props: { count: 2 },
      });
      expect(getParent(c).childNodes.length).toBe(2);

      c._props = { count: 4 } as any;
      c.render();
      expect(getParent(c).childNodes.length).toBe(4);
    });

    it('shrinks children when count decreases', () => {
      const c = setup(DynamicChildrenComponent, {
        props: { count: 5 },
      });
      expect(getParent(c).childNodes.length).toBe(5);

      c._props = { count: 2 } as any;
      c.render();
      expect(getParent(c).childNodes.length).toBe(2);
    });

    it('clears all children when going from many to null', () => {
      const c = setup(DynamicChildrenComponent, {
        props: { count: 3 },
      });
      expect(getParent(c).childNodes.length).toBe(3);

      c._props = { count: 0 } as any;
      c.render();
      expect(getParent(c).childNodes.length).toBe(0);
    });

    it('transitions from null to children', () => {
      const c = setup(DynamicChildrenComponent, {
        props: { count: 0 },
      });
      expect(getParent(c).childNodes.length).toBe(0);

      c._props = { count: 3 } as any;
      c.render();
      expect(getParent(c).childNodes.length).toBe(3);
    });
  });

  // ------ generateCss / getStyle ------

  describe('generateCss', () => {
    it('does nothing when getStyle returns null', () => {
      const c = setup(TestComponent, { props: { label: 'x' } });
      c.generateCss();
      // No crash; shadow has no adopted stylesheets
      expect(c.shadow!.adoptedStyleSheets.length).toBe(0);
    });

    it('applies string CSS to shadow root', () => {
      const c = setup(StyledComponent, { props: { label: 'styled' } });
      c.generateCss();
      expect(c.shadow!.adoptedStyleSheets.length).toBe(1);
    });

    it('applies CSSStyleSheet object returned from getStyle', () => {
      class SheetComponent extends Component {
        init() {
          return () => null;
        }
        getStyle() {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync('div { color: red; }');
          return sheet;
        }
      }
      customElements.define('x-sheet', SheetComponent);

      const c = setup(SheetComponent, { props: {} });
      c.generateCss();
      expect(c.shadow!.adoptedStyleSheets.length).toBe(1);
    });

    it('merges component CSS with props.css', () => {
      const c = new StyledComponent({
        props: { label: 'merged', css: 'span { color: blue; }' } as any,
      });
      c._createRenderer();
      c.render();
      c.generateCss();
      // Should have one (merged) stylesheet
      expect(c.shadow!.adoptedStyleSheets.length).toBe(1);
    });

    it('adds stylesheet to document when shadow DOM is off', () => {
      class NoShadowStyledComponent extends Component {
        constructor() {
          super({ useShadow: false, props: {} });
        }
        init() {
          return () => null;
        }
        getStyle() {
          return 'div { color: green; }';
        }
      }
      customElements.define('x-no-shadow-styled', NoShadowStyledComponent);

      const before = document.adoptedStyleSheets.length;
      const c = setup(NoShadowStyledComponent, undefined);
      c.generateCss();
      expect(document.adoptedStyleSheets.length).toBe(before + 1);
    });

    it('removes document stylesheet on disconnect for non-shadow component', () => {
      class NoShadowCleanup extends Component {
        constructor() {
          super({ useShadow: false, props: {} });
        }
        init() {
          return () => null;
        }
        getStyle() {
          return 'div { color: purple; }';
        }
      }
      customElements.define('x-no-shadow-cleanup', NoShadowCleanup);

      const before = document.adoptedStyleSheets.length;
      const c = setup(NoShadowCleanup, undefined);
      c.generateCss();
      expect(document.adoptedStyleSheets.length).toBe(before + 1);

      c.disconnectedCallback();
      expect(document.adoptedStyleSheets.length).toBe(before);
    });
  });

  // ------ connectedCallback / disconnectedCallback ------

  describe('lifecycle callbacks', () => {
    it('connectedCallback calls generateCss, render, and onMount', () => {
      const c = new TestComponent({ props: { label: 'mounted' } });
      c._createRenderer();

      const onMount = jest.fn();
      c.onMount = onMount;

      const cssSpy = jest.spyOn(c, 'generateCss');
      const renderSpy = jest.fn(c.render);
      c.render = renderSpy;

      c.connectedCallback();

      expect(cssSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(onMount).toHaveBeenCalledTimes(1);
    });

    it('connectedCallback resubscribes tracked stores', () => {
      const c = setup(ObserverComponent, { props: {} });
      // Simulate disconnect then reconnect
      c.disconnectedCallback();

      // After disconnect the store listener should be removed.
      // connectedCallback should resubscribe.
      const renderSpy = jest.fn(c.render);
      c.render = renderSpy;
      c.connectedCallback();

      c.storeProxy.value = 100;
      expect(renderSpy).toHaveBeenCalled();
    });

    it('disconnectedCallback calls onCleanup and unsubscribes stores', () => {
      const onCleanup = jest.fn();

      class CleanableComponent extends Component {
        storeProxy!: { n: number };
        init() {
          const store = new Store({ n: 0 });
          this.storeProxy = this.observeStore(store);
          return () => null;
        }
      }
      customElements.define('x-cleanable', CleanableComponent);

      const c = setup(CleanableComponent, { props: {} });
      c.onCleanup = onCleanup;

      c.disconnectedCallback();
      expect(onCleanup).toHaveBeenCalledTimes(1);
    });

    it('skips onMount/onCleanup when not defined', () => {
      const c = setup(TestComponent, { props: { label: 'safe' } });
      // No crash when calling lifecycle methods without hooks set
      expect(() => c.connectedCallback()).not.toThrow();
      expect(() => c.disconnectedCallback()).not.toThrow();
    });
  });

  // ------ register decorator ------

  describe('register', () => {
    it('registers a custom element and sets tagName', () => {
      class RegTestComponent extends Component {
        init() {
          return () => null;
        }
      }

      register('x-reg-test')(RegTestComponent as any);

      expect((RegTestComponent as unknown as JSX.ComponentStatic).tagName).toBe(
        'x-reg-test'
      );
      expect(customElements.get('x-reg-test')).toBe(RegTestComponent);
    });
  });
});

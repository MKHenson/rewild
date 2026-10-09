## Location

The UI library code is maintained in the packages/rewild-ui/lib folder. The main application accessed via src/ makes use of this library code.

## Critical: Custom JSX System (NOT React)

This is the most important thing to understand. The JSX in this project is **not React**.

- `tsconfig.base.json` sets `"jsxFactory": "jsx"` — this calls `window.jsx()` defined in `rewild-ui/compiler/jsx.tsx`
- Components extend `HTMLElement` via `Component<T>` base class
- Components are registered as Custom Elements with the `@register('x-tag-name')` decorator
- There is **no virtual DOM**, no `React.createElement`, no `useState` from React
- The `useState` here is a custom hook on `Component` that returns a getter function and setter
- Styles use adopted stylesheets via the `getStyle()` method and `css` tagged template literal

### Component Pattern

```tsx
import { Component, register, jsx, css } from 'rewild-ui';

interface Props {
  title: string;
}

@register('x-my-component')
export class MyComponent extends Component<Props> {
  init() {
    const [count, setCount] = this.useState(0);

    // Return a render function
    return () => (
      <div>
        <h1>{this.props.title}</h1>
        <span>{count()}</span>
        <button onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
    );
  }

  getStyle() {
    return css`
      div {
        padding: 8px;
      }
    `;
  }
}
```

### Component Lifecycle

1. `constructor()` — Do not override; setup happens in `init()`
2. `init()` — **Abstract**. Set up state, subscriptions, return render function
3. `connectedCallback()` — Applies CSS, calls render, then `onMount?.()`
4. `disconnectedCallback()` — Calls `onCleanup?.()`, unsubscribes stores, removes stylesheets

### Store Pattern

Stores extend `Store<T>` from `rewild-ui`. State is mutated via `this.defaultProxy.property = value` which auto-notifies subscribers. Stores are exported as singletons.

```ts
import { Store } from 'rewild-ui';

interface IMyState {
  items: string[];
  loading: boolean;
}

export class MyStore extends Store<IMyState> {
  constructor() {
    super({ items: [], loading: false });
  }

  async fetchItems() {
    this.defaultProxy.loading = true;
    this.defaultProxy.items = await api.getItems();
    this.defaultProxy.loading = false;
  }
}

export const myStore = new MyStore();
```

Components subscribe with `this.observeStore(store, callback?)`.

### Routing

Routes are defined declaratively in JSX using `RouterSwitch` and `Route` from `rewild-ui`. Navigation uses `navigate('/path')`. Route params use `:param` syntax.

```tsx
<RouterSwitch>
  <Route path="/" onRender={() => <MainMenu />} />
  <Route path="/game" onRender={() => <InGame />} />
  <Route path="/editor" onRender={() => <ProjectEditorPage />} />
</RouterSwitch>
```

## Common Tasks

### Adding a new UI component

1. Create `MyComponent.tsx` in the appropriate `ui/` subdirectory
2. Import `Component`, `register`, `jsx`, `css` from `rewild-ui`
3. Decorate with `@register('x-my-component')`
4. Extend `Component<Props>` and implement `init()` returning a render function
5. Optionally implement `getStyle()` for scoped CSS

### Field style

Every text field, number field and dropdown is drawn the same way: no box, a bottom line that
darkens on hover, a thicker blue line while focused or open, and a dashed, dimmed line when
disabled. `underlineField(box, active, disabled)` in `rewild-ui` (`lib/common/fieldStyle.ts`)
returns that CSS for a component's own selectors. `Input`, `NumberInput`, `Select`, `Vec3` and the
editor's property grid all use it. A new field uses it too rather than drawing its own border. A
read-only value drops the line, so it reads as plain text.

`Switch` is for a setting that applies at once; a choice applied with Save or Apply is a checkbox.
It is as tall as a field, so switch rows line up with field rows. Off is an outlined, empty track
and on a filled blue one, so the state reads from shape as well as colour. It is a focusable
`role="switch"` that Space and Enter toggle, with the field's blue as its focus ring.

### Adding a new store

1. Create `MyStore.ts` in `src/ui/stores/`
2. Define state interface (e.g., `IMyState`)
3. Extend `Store<IMyState>` with initial state in `super()`
4. Add methods that mutate `this.defaultProxy`
5. Export singleton: `export const myStore = new MyStore()`

### Adding a new route

Add a `<Route>` inside the `<RouterSwitch>` in `Application.tsx`:

```tsx
<Route path="/my-path" onRender={(params) => <MyPage />} />
```

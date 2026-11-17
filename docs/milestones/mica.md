# Mica

Working doc. It is for planning this work, not a milestone write up. When the work ships, rewrite it as a guide, the same as Sinew.

## Goal

The game gets a UI that the GPU draws, for the screens a player uses in the game: the HUD, the in-game menu, game over and settings. They look like the glass panels of the editor. They work with a mouse, a keyboard and a gamepad.

The GPU draws them because a headset shows only what the renderer draws. VR, and devices such as the Steam Deck, are future goals. Mica lays the foundations for them and tests world UI on the desktop.

Mica replaces the GPU UI that the renderer has today. It keeps what is good in it (a tree, draw order by tree order, SDF corners, MSDF text, bubbling events) and adds what it lacks:

- **Layout**: flex, so nobody places a box by hand.
- **Style**: typed style properties, with theme values shared with the DOM.
- **Drawing**: one batched pass for boxes, text and icons, with clipping.
- **Text**: crisp MSDF text that can size its own box.
- **Input**: pointer, keyboard and gamepad events, with the same phases as the web.
- **Look**: the glass look of the DOM UI.
- **Place**: surfaces on the screen or in the world.

The API is a plain TypeScript builder API. It borrows web patterns where they are good and leaves them where they cost too much.

---

## Where each UI lives

The DOM stays the home of most of the UI. Mica is for the UI a player uses while they are in the game.

| UI                                  | Lives in | Stage |
| ----------------------------------- | -------- | ----- |
| Main menu, auth, project views      | DOM      | -     |
| Editor, admin                       | DOM      | -     |
| HUD: health, hunger, stamina, oxygen, temperature | Mica | 1 |
| In-game menu, game over             | Mica     | 2     |
| Settings, from the in-game menu     | Mica     | 3     |
| WorldPanel: a panel in the level that opens a portal | Mica | 4 |
| Hotbar, inventory, prompts          | Mica     | Later |

Both UIs read the same theme values, so they look like one product. See Theme.

---

## Stages

| Stage                  | What it gives                                                                                              | First users                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **1. Boxes and bars**  | The package and the UI inspector, nodes, surfaces, style, the batched pass, flex layout, meters, device pixel ratio. The old GPU UI goes | The HUD bars                    |
| **2. The menu**        | Text v2, icons, events, focus, gamepad, glass, theme, transitions. Button and Modal                         | In-game menu, game over         |
| **3. Settings**        | Popups, form controls: tabs, select, slider, switch, field                                                  | Settings in the game            |
| **4. In the world**    | World surfaces, the look-at pointer and crosshair, locked portals, actions, the WorldPanel asset            | An "Open Portal" WorldPanel     |

Each stage is playable on its own. Stage 1 looks the same as today on purpose: it proves the new parts against a UI we know. Until Stage 3 is done, Settings in the in-game menu opens the DOM panel.

---

## What we have today

The GPU UI lives in `packages/rewild-renderer/lib`. Its only user is the HUD in `src/core/routing/Player.ts`.

| Part      | Today                                                                                                  | Gap                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Tree      | `UIElement` is a component on a 3D `Transform`, under `renderer.ui`                                    | A 2D UI carries 3D matrices. No surface, so no world space                |
| Place     | Absolute `x`, `y`, `width`, `height`. One `percentageBasedCalculation` flag for all four               | No layout. `getX` and the others walk to the root on each call, with no cache |
| Style     | Background, border colour, radius                                                                      | Border width and softness fixed in the shader. No states, no shadow        |
| Variation | A material per look. The meter's fill is a per-material uniform                                        | Five `UIElementMeterPass` instances, one per bar                           |
| Drawing   | One `drawIndexed` per element. Text through render bundles, which reset pass state                    | Draw calls grow with elements                                              |
| Text      | `TextRenderer` per element, each with its own pipeline and buffers. Rebuilt on each change            | One ASCII font at 42 px. No line height, alignment, clipping or measuring  |
| Events    | Mouse only. Click, down and up bubble. Enter and leave                                                 | No pointer, touch, wheel, focus, keys, gamepad, capture or reticle         |
| Hit test  | Rectangles                                                                                             | Ignores corner radius and clipping                                         |
| Pixels    | `canvas.width = clientWidth` in `Pane3D.tsx`                                                           | No device pixel ratio, so UI and text draw at 1x on high DPI screens       |
| Dead code | Two "Hello, World!" elements in `Renderer.initialize`, never attached. Unused functions in `ui-element.wgsl` | Remove                                                              |

The MSDF shader is right in principle. It takes the median, finds the screen pixel range from derivatives, and its `pxRange` of 4 matches the atlas. The atlas loads with no colour conversion.

---

## Decisions

| Topic         | Decision                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope         | The in-game UI: HUD, in-game menu, game over, then settings. Main menu, project views, editor and admin stay in the DOM                                                  |
| First users   | The HUD bars (Stage 1), the in-game menu and game over (Stage 2), settings (Stage 3)                                                                                      |
| Language      | TypeScript. See Why not Rust                                                                                                                                             |
| Package       | Its own package, `rewild-gpu-ui`, from the start. It depends only on `rewild-common` and WebGPU. See The package                                                         |
| Layout        | Flex with absolute position, in TypeScript. See Why flex                                                                                                                 |
| API           | A builder API. No JSX                                                                                                                                                     |
| Style         | A typed style object per node. Names follow CSS where the meaning is the same. No CSS text, no classes, no cascade. Theme values are shared with the DOM. See Style       |
| Old GPU UI    | Replaced, not extended. `UIElement`, `GuiManager`, the UI passes and `TextRenderer` go when the HUD bars move in Stage 1                                                   |
| Drawing       | One primitive stream per surface, in tree order, drawn by one pipeline                                                                                                   |
| World UI      | Stage 4 adds the WorldPanel asset: a panel in the level that the player walks around and looks at to use. Its first job is to open a portal                             |
| Actions       | An asset type declares the actions it can do, in one TypeScript file that the game and the editor share. One `action` property holds a target and an action. See Actions |
| VR            | A future goal. No headset yet. World surfaces and ray pointers are the parts VR needs                                                                                   |

### Why not Rust

The renderer has Rust for the terrain worker, so Rust was a fair question.

- **The whole UI in Rust.** The UI's neighbours are the renderer, input, stores, game logic, and the code that builds components and handles clicks. They are all TypeScript. A Rust UI needs a bridge to each of them, both ways.
- **Only layout in Rust**, for example Taffy. Most nodes cross a thin bridge: styles in, rectangles out. Text does not. Its height depends on its wrap width, which comes from layout, so Rust must call back into TypeScript to measure text, or keep its own copy of the font metrics.
- **Speed.** A HUD, the menus and settings are a few hundred nodes. Flex layout for that many nodes in TypeScript takes microseconds, and runs only when something changes.

If a later UI has thousands of nodes and layout shows in the frame time, measure, then look again.

### Why flex

Game UIs use a few layout models. Each one does a part of the job:

| Model                  | Good at                                         | Weak at                                              |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Anchors (Unity, Godot) | HUD parts pinned to a screen edge or corner     | Lists, menus and forms. Each box is placed by hand   |
| Flex                   | Menus, lists, rows of controls, wrapped slots   | Two-way alignment, such as label and control columns |
| Grid                   | Forms in columns, inventories                   | More to build. Little else needs it                  |
| Constraints (Cassowary) | Any shape                                       | Slow to solve, hard to debug, too much for this UI   |

Flex with absolute position covers anchors as well: `position: 'absolute'` with `bottom`, `left` and percentage sizes pins the HUD the same way an anchor does. Settings rows get their columns from a fixed label width. Inventory slots are fixed-size items in a wrapped row. So flex with absolute position is enough, and grid can come later if a screen needs it.

---

## The package

Mica lives in `packages/rewild-gpu-ui`, a workspace next to `rewild-ui`. The packages have names that say what they are, so the package is `rewild-gpu-ui` and Mica is the milestone's name.

The dependencies go one way:

```
rewild-common  ←  rewild-gpu-ui  ←  rewild-renderer  ←  src (game, editor)
```

- **`rewild-gpu-ui`** depends only on `rewild-common` (`Dispatcher`, `Color`, vectors) and WebGPU. It runs on a bare `GPUDevice` and a canvas.
- **`rewild-renderer`** depends on it. The renderer calls Mica to draw screen surfaces after the frame compositor and world surfaces in the scene. It gives Mica its device, its canvas and, for glass, last frame.
- **Not `rewild-ui`.** Mica does not import the DOM package. It reads theme values from the document's CSS custom properties, which needs no import. Game code in `src` binds stores to components.

What the package holds:

- Nodes, surfaces, style, layout, drawing, text, icons, events and components.
- The MSDF font code, moved from `rewild-renderer/lib/fonts` and `lib/core/text-renderer`.
- The font and icon atlas build scripts. The `lucide` dev dependency is for the icon script.
- The UI inspector: its entry, its HTML page and its examples.

The old GPU UI (`UIElement`, `GuiManager`, the UI passes) is not moved. Ticket 4 deletes it.

---

## Nodes and surfaces

### Node

A `UINode` is a 2D box in a tree. It is not a `Transform` and carries no 3D matrix.

- **Children** are in order. Later children draw on top of earlier ones, the same as the web.
- **Style** sets its look and its layout. See Style.
- **Layout** writes its rectangle, in surface pixels, after each layout pass.
- **Events** reach it through `on` and `off`. See Events.
- **Dirty flags** mark a node whose layout or look changed, so work happens only for what changed.

`append`, `insertBefore`, `remove` and `replaceChildren` work the same as their DOM names.

### Surface

A `UISurface` owns one tree and says where it draws.

| Kind     | Draws                                                                  | Stage |
| -------- | ---------------------------------------------------------------------- | ----- |
| `screen` | Over the game, in screen pixels                                         | 1     |
| `world`  | On a quad in the scene, with a size in pixels and a size in metres     | 4     |

Surfaces draw in order. The HUD is one surface and the menu another, so the menu is always on top of the HUD. A select's popup opens on a surface above the menu. This takes the place of `z-index`. Inside a surface, tree order decides.

---

## The API

A sketch, to argue over, not a final shape:

```ts
const hud = ui.createSurface({ kind: 'screen', name: 'hud' });

const bars = ui.node({
  style: {
    position: 'absolute',
    bottom: 24,
    left: '30%',
    width: '40%',
    flexDirection: 'column',
    gap: 4,
  },
});

const health = new Meter({ value: 1, style: { height: 20, borderRadius: 20 } });
const hunger = new Meter({ value: 1, style: { height: 12, borderRadius: 12 } });
bars.append(health.node, hunger.node);
hud.root.append(bars);

health.value = 0.5; // marks the node for redraw, not for layout
bars.style.bottom = 32; // marks the surface for layout
```

```ts
const resume = new Button({ label: 'Resume', icon: 'play' });
resume.on('click', () => game.resume());
menu.append(resume.node);
```

---

## Style

A node has one `style` object with typed properties. Setting a property marks the node dirty.

- **Names.** Where a property means the same as in CSS, it has the CSS name in camel case, such as `flexDirection` or `borderRadius`. The names are familiar and CSS documents them. Where Mica needs something CSS does not have, it gets its own name.
- **Values.** Lengths are pixels as numbers, or percentages as strings. Colours are a theme value name or a colour. There are no units and no shorthand strings.
- **Sharing.** A shared style is a plain TypeScript object or function, the same as `glassSurface()` in `rewild-ui`. Spread it into a node's style. There are no classes.
- **States.** A component handles its own states. A `Button` sets its colours for hover, press, focus and disabled. The style system does not know about states.
- **Passed down.** Only `color`, `fontSize`, `fontWeight`, `lineHeight` and `textAlign` pass from a parent to its children, as in CSS.

### What we reuse from the DOM

The theme values, not the CSS. The DOM's components keep their styles as CSS text in `getStyle()`. Reusing that text needs a CSS parser and a cascade, which cost more than writing the few in-game styles again. The theme values are what make the two UIs look alike, and Mica reads them directly. See Theme.

### Properties

| Group      | Properties                                                                                                  | Stage |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ----- |
| Layout     | `display` (`flex`, `none`), `position` (`relative`, `absolute`), `top` `right` `bottom` `left`, `width` `height`, `minWidth` `maxWidth` `minHeight` `maxHeight`, `padding`, `margin`, `flexDirection`, `flexWrap`, `gap`, `flexGrow` `flexShrink` `flexBasis`, `justifyContent`, `alignItems`, `alignSelf` | 1 |
| Box        | `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius` (per corner), `opacity`, `overflow` (`visible`, `hidden`) | 1 |
| Text       | `color`, `fontSize`, `fontWeight`, `lineHeight`, `textAlign`, `whiteSpace`, `textOverflow` (`ellipsis`)       | 2 |
| Effects    | `boxShadow`, `backdrop` (`glass`), `transform` (translate, scale), `transition` (colours, opacity, `transform`) | 2 |
| Input      | `pointerEvents` (`auto`, `none`), `focusable`                                                                 | 2 |

---

## Layout

A flex subset in TypeScript, written to CSS semantics so its output can be checked against a browser's.

- **In.** The properties in the Layout row above.
- **Out.** No grid. No `order`, no `baseline` alignment, no `aspectRatio` in Stage 1.
- **Text.** A text node gives layout a measure function: given a width limit, it returns the wrapped width and height. Results are cached by text, style and width.
- **When.** Layout runs before drawing, only for surfaces with a dirty node, and only for the dirty subtree where it can.
- **Pixels.** Layout works in CSS pixels. Drawing scales by the device pixel ratio, so a layout is the same on any screen.
- **Defaults.** Each node is a flex container with `box-sizing: border-box`. `flexDirection` is `row`, `flexShrink` is 1 and `alignItems` is `stretch`, as in CSS. Min sizes are 0: there is no automatic minimum size from the content. The DOM mirror in the inspector sets `min-width: 0` and `min-height: 0` to match.
- **Absolute nodes** are placed in the padding box of their parent. With no inset on an axis, a node goes where it would go as the only flex item.
- **Browser rules.** Layout follows Chrome where the spec leaves room: a percentage height resolves only against a definite height, and a container sized by its content uses each item's content width only when the item's grow or shrink factor lets it move off its flex basis.

### Checking it

- **Unit tests** check rectangles worked out by hand for small trees, one per property.
- **The inspector** comes first, in ticket 1, so each part can be seen as it is built.
- **By eye**, in the UI inspector. Each layout example draws with Mica and, beside it, as DOM elements with the same styles. See The UI inspector.

---

## Drawing

One pipeline draws a surface. Each node adds primitives to one instance stream, in tree order:

| Primitive | What it is                                                                                  |
| --------- | ------------------------------------------------------------------------------------------- |
| `rect`    | A rounded box: SDF corners per corner, border width, fill, border colour, shadow, backdrop   |
| `glyph`   | One MSDF character                                                                          |
| `icon`    | One MSDF icon from the icon atlas                                                           |
| `custom`  | A rect drawn by a registered fragment function. See Effects                                 |

Each instance carries its rectangle, a clip rectangle, its colours and one `vec4` of parameters. A node with `overflow: hidden` sets the clip for its children.

- **Few draw calls.** Text and boxes share the stream, so a surface draws in one call, or a few if a custom effect needs its own pipeline.
- **Uploads.** The stream is rebuilt only for a surface with a dirty node. A meter's value changes one instance's parameters, not the stream.
- **Where.** Screen surfaces draw after the frame compositor, the same as today. World surfaces draw in the scene. See In the world.

---

## Text

MSDF stays. What changes:

- **One text system.** One pipeline and one glyph stream for all text, in place of a pipeline per element.
- **Font.** The DOM uses Roboto. Mica makes one Roboto atlas that holds regular and bold, so both UIs use the same face and all text shares one texture.
- **Atlas.** MTSDF, with a true distance in the alpha channel for outlines, glow and shadows. `distanceRange` 8. Latin-1 and common symbols.
- **Crisp.** Clamp the screen pixel range to at least 1. Size the canvas by the device pixel ratio.
- **Lines.** Line height, left, centre and right alignment, wrapping, clipping and ellipsis.
- **Measuring.** The same code measures text for layout and lays out glyphs for drawing, so they always agree.

## Icons

The DOM uses lucide icons. Mica makes an MSDF atlas from the same SVGs, so icons stay sharp at any size and tint like text. The atlas holds only the icons the game uses. A build script makes it, the same as the font.

---

## Events

The shape follows the DOM.

- **Types.** `pointerdown`, `pointerup`, `pointermove`, `pointerenter`, `pointerleave`, `click`, `wheel`, `focus`, `blur`, `keydown`, `keyup`.
- **Phases.** Capture down from the surface root, then bubble up from the target. `stopPropagation` and `preventDefault`. Enter and leave do not bubble.
- **Pointer capture.** A node that captures the pointer gets its moves and its up, even off the node. The slider needs this.
- **Hit test.** From layout rectangles, inside clip rectangles, with corner radius. `pointerEvents: 'none'` skips a node.
- **Taking input from the game.** An open menu surface takes pointer and key input, so a click on Resume does not also act in the game.

### Pointer sources

Every source turns into the same pointer events:

| Source           | Gives                                                       | Stage |
| ---------------- | ----------------------------------------------------------- | ----- |
| Mouse            | A screen point                                              | 2     |
| Touch            | A screen point per finger                                   | 2     |
| Look-at ray      | A ray from the eye through the screen centre, while the pointer is locked, tested against world surfaces | 4 |
| XR controller    | A ray from the controller, tested against world surfaces    | Later |

The look-at ray and the XR controller give the same thing: a ray. The surface turns a ray hit into a pixel, then into normal pointer events. So the look-at ray tests the controller's whole path except where the ray comes from.

### Focus and gamepad

- **Focus.** `focusable` nodes take focus. Tab and Shift+Tab move through them in tree order.
- **Spatial moves.** The d-pad, the thumbstick and the arrow keys move focus to the nearest focusable node in that direction, by rectangle.
- **Actions.** Enter or A clicks the focused node. Escape or B closes the top popup or modal.
- **Focus ring.** The `focus` state draws it, in the theme's primary colour, the same as the DOM's focus ring.

---

## Glass and effects

### Glass

The DOM's glass is `backdrop-filter: blur(18px) saturate(150%)` under a surface colour at 60%, with a 1 px edge in `glassEdge`. Mica draws the same:

- **The source.** The blur reads `renderer.sceneColorTarget`, the HDR scene that the tone map reads. It is there already, so there is no copy of the canvas.
- **The blur.** A downsample to a quarter resolution, then a dual Kawase blur. The last step applies the same tone map curve, so the blur matches the colours on screen.
- **The glass rect** samples the blur at its screen position, raises the saturation, then lays the surface colour over it.
- **Cost.** The blur runs once per frame for all glass nodes, and not at all when none is visible. At a quarter resolution it is a small part of the frame.
- **World surfaces** draw inside the scene, before this frame's blur exists, so they read last frame's blur. The one-frame lag cannot be seen.

Bloom's blur is not reused. It keeps only the light above its threshold, not the whole scene.

### Custom effects

A registered fragment function draws a `custom` rect, with the node's `vec4` of parameters. The meter is the first one:

```ts
ui.effects.register('meter', meterWgsl); // fill, full colour, empty colour
```

Per-node values live in the instance, not in a material. One meter effect serves all five bars.

### Transitions

`transition` eases a property from its old value to its new one, with a duration and an easing curve. Three things transition:

- **Colours**, for a button's hover and press.
- **Opacity**, for a modal or a crosshair that fades in and out.
- **`transform`**, a translate and a scale, for a modal that slides or grows in, or a button that shrinks a little when pressed.

`transform` is applied when the node draws, after layout, the same as in CSS. It does not move other nodes, so a transition never runs layout again. The hit test follows the transformed box.

Layout properties, such as `width` or `top`, do not transition. Each frame of such a transition would run layout.

---

## Theme

The DOM's theme values are CSS custom properties in `style.css`: colours, spacing, radius and font sizes, with light and dark sets.

- At start, and when the theme changes, Mica reads the computed values from the document and stores them as numbers.
- A Mica style names a theme value. It does not copy the colour.

So a colour changed in `style.css` changes both UIs.

---

## Components

Components are TypeScript classes that build a subtree, handle their own states, and expose a small API. They are not a framework.

| Component  | What it is                                                     | Stage |
| ---------- | -------------------------------------------------------------- | ----- |
| `Meter`    | A bar filled to a value, coloured from full to empty           | 1     |
| `Label`    | Text                                                           | 2     |
| `Icon`     | One icon from the atlas                                        | 2     |
| `Button`   | Label, optional icon, states, focusable, `click`               | 2     |
| `Modal`    | A glass panel on its own surface, with a dimmed backdrop. Escape and B close it | 2 |
| `Stack`    | A flex column or row with a theme gap                          | 2     |
| `Tabs`     | A row of tabs that picks one panel                             | 3     |
| `Select`   | A field that opens a list of options on a popup surface        | 3     |
| `Slider`   | A track and a handle, with pointer capture and gamepad steps   | 3     |
| `Switch`   | An on and off toggle, the same shape as the DOM's              | 3     |
| `Field`    | A label, a control and an optional description in a row        | 3     |
| `Divider`, `InfoBox` | A line, and a box of help text                       | 3     |

A component takes plain values and callbacks. It does not know about stores. Game code in `src` binds a `Store` from `rewild-ui` to a component, so game state drives it the same way it drives the DOM.

### Settings

The in-game settings use the same settings data as the DOM panel: render quality and its overrides, volumes, output device and theme. Only the view changes. Both panels read and write the same stores, so a change in one shows in the other.

---

## In the world (Stage 4)

A player walks up to a glass panel that stands in the level. It reads "Open Portal". They walk round it and see its back. They look at the button, a crosshair shows and the button lights up. They click, and the portal beside it starts to open.

The panel is a WorldPanel asset. A designer drags it into the level in the editor, the same as a portal, and points its action at the portal.

### World surfaces

- **The quad.** A surface on a quad with a size in metres. It draws in the scene with depth testing, so the world can hide it and the player can walk round it.
- **Pixels per metre.** A world surface lays out at 1,000 pixels per metre, so 1 pixel is 1 mm. A surface can set its own value.
  - A 0.8 m by 0.5 m panel lays out at 800 by 500 pixels, the size of a modal on the screen. So the same components and styles work on the screen and in the world.
  - 16 px text is 16 mm tall in the world, and a player reads it from 1 to 2 m.
  - MSDF text stays sharp at any size, so this value sets only how big things are, not how sharp.
- **The back.** From behind, the panel shows plain glass, not its UI mirrored. The back takes no input.
- **Crisp in the world.** Glyph size follows the screen pixel range from derivatives, so text stays sharp at any distance.

### Looking at it

- **The look-at ray.** Each frame, a ray from the eye through the screen centre is tested against world surfaces. A hit becomes a surface pixel, then normal pointer events, so the button gets hover and press with no new code.
- **Reach.** Only a hit within reach counts, for example 3 m. Past it, the panel is only something to look at.
- **Blocked.** A hit counts only if nothing in the scene is nearer along the ray.
- **The crosshair.** It shows only while the ray hits a node that takes input, within reach. It is a node on a screen surface, so Mica draws it too.
- **Using it.** A mouse click, E, or A on a gamepad clicks the node under the crosshair.

### The WorldPanel asset

A WorldPanel is a new asset type, `world-panel`. It is in the editor's Game group in `templates/actors-library.json`, next to Portal.

- **Placing it.** Drag it from the asset list into the level. It shows at once where it lands, as a 3D glass panel at its set size, with its text and its button. Where it stands and which way it faces are its transform.
- **In the editor.** The panel draws the same as in the game, but its button takes no input. A click selects the panel, the same as any asset, so the editor's picking must hit the panel's quad.
- **In the game.** The button works through the look-at pointer. A click calls the panel's action.
- **Code.** `WorldPanelAsset`, built the same way as `PortalAsset`. It owns a world surface with a `Label` and a `Button`.

| Property     | Value                          | Editor                               |
| ------------ | ------------------------------ | ------------------------------------ |
| `panelSize`  | Width and height in metres     | Number fields                        |
| `text`       | The panel's message            | Text field                           |
| `buttonText` | The button's label             | Text field                           |
| `action`     | A target asset and an action   | `action-select`. See Actions         |

The property names do not use `target` or `size`, because `target` is already a light's `vec3` property.

### Actions

An action is something an asset can do when another asset tells it to. Each asset type declares its own actions.

**Where they are defined.** One TypeScript file, `src/core/routing/actions.ts`, that the game and the editor both import:

```ts
// What each asset type can be told to do, with the label the editor shows.
export const PORTAL_ACTIONS = {
  unlock: 'Unlock',
  lock: 'Lock',
  toggle: 'Toggle',
} as const;

export const assetActions: Partial<Record<ResourceType, Record<string, string>>> = {
  portal: PORTAL_ACTIONS,
};
```

Actions are code, not data, so they are not in `actors-library.json`. The asset must do each one, and a TypeScript list lets the compiler check that it does.

**How an asset does them.** The asset implements `doAction`. Its type comes from the same list, so an action that is declared and not handled does not compile:

```ts
doAction(action: keyof typeof PORTAL_ACTIONS) {
  switch (action) {
    case 'unlock': this.locked = false; break;
    case 'lock':   this.locked = true;  break;
    case 'toggle': this.locked = !this.locked; break;
  }
}
```

**The `action` property.** One property holds both halves, as an `object` value, the same as `camera-transform`:

```ts
{ target: 'asset-id', action: 'unlock' }
```

**The editor.** A property whose value type is an action uses the `action-select` custom editor. It shows two dropdowns, and both must be set:

1. **Target**: the assets that have actions, in every container of the level.
2. **Action**: the actions of the chosen target's type, from `assetActions`. It is empty until a target is chosen, and it clears when the target changes.

A panel with a target and no action is incomplete, and the editor shows it as an error.

**In the game.** On a click, the WorldPanel finds its target by id, in any container of the level, and calls `doAction`. Today `Container` finds assets only by name, so the level gets a lookup by id across its containers. An id stays the same when an asset is renamed.

A target can be in a container that is not active. The action still changes the target's state, and the change shows when its container becomes active.

**Later.** Actions are the start of scripting. A script will listen for events and call these same actions, so the actions declared now become the API that scripts use.

### Portals

Today a portal opens when the player comes within `OPEN_RANGE` of it and closes past `CLOSE_RANGE` (`PortalOpening.ts`). Stage 4 adds a portal that waits for a panel:

- **Locked.** A portal can start locked. A locked portal stays closed, small and bobbing, however near the player comes.
- **The `locked` property.** A boolean on the portal, set in the editor. Off by default.
- **Unlocked.** The `unlock` action unlocks the portal. From then on the portal opens and closes by distance, the same as today. The `lock` action locks it again and it closes.
- **Default.** A portal with no panel works as today, so no level changes.
- **Saved.** The unlocked state is behaviour state, the same as `PortalTrigger`'s `armed`, so it survives a save and a load.

### Later

- An XR session, with the camera driven by the headset, and XR controllers as ray sources.
- A VR menu on a world surface in front of the player.
- Sizes and distances tuned on real hardware, in a headset and on handheld devices.

The renderer uses WebGPU. An XR session needs the browser to share WebXR with WebGPU, so that work starts with checking browser support.

---

## Quality and performance

- **Layout** runs only for dirty surfaces.
- **The stream** uploads only for dirty surfaces. A changed value updates one instance.
- **Draw calls.** One per surface, plus one per custom effect pipeline in use.
- **Blur** only when a glass node is visible.
- **Stats.** Add UI nodes, layout time and UI draw calls to the perf panel.

## The UI inspector

A small page for checking Mica by eye, like a much smaller Storybook.

```
npm run ui-inspector
```

- **Served** by esbuild, the same as the game, from its own entry and HTML page. It does not load the game, a level or the editor.
- **The list.** On the left, the parts of Mica to check: layout, boxes, text, icons, meters, buttons, focus, glass, and later the form controls and world surfaces.
- **The examples.** A click on a part loads its examples on the right, drawn by Mica on a WebGPU canvas. An example is a small function that builds a tree.
- **Side by side.** A layout example also draws as DOM elements with the same styles, next to the Mica version. The two must match.
- **Tools.** The layout overlay, a light and dark theme switch, and a device pixel ratio switch.
- **Input.** Examples take mouse, keyboard and gamepad input, so hover, focus and clicks can be checked by hand.
- **The backdrop.** Glass examples draw over a test image, so the blur shows.

Each ticket adds examples for what it builds. A part is done when its examples look right in the inspector.

Mica runs on a bare `GPUDevice` and a canvas. It does not need the game's `Renderer`, so the inspector starts fast. The game's `Renderer` gives Mica its device, its canvas and, for glass, its frame.

## Debug views and commands

- A view of node rectangles, padding and clip rectangles, like the browser's layout overlay.
- A console command to print a surface's tree with each node's rectangle and style.
- A console command to show the focus target and the pointer hit.

---

## Out of scope

- CSS text, selectors, classes and the cascade.
- JSX.
- Grid layout.
- Text input fields. Settings has none.
- Right-to-left text and complex scripts.
- Moving the main menu, project views or editor off the DOM.
- An XR session and XR controllers. World surfaces and the look-at ray are the parts they need.
- Actions on asset types other than the portal.
- Events that an asset fires, and more than one action per panel. Scripting adds these.

---

## Open questions

None at the moment.

## Answered questions

- **GPU or DOM.** Both. In-game UI on the GPU, the rest in the DOM.
- **First users.** The HUD bars, then the in-game menu and game over, then settings.
- **The in-game menu in VR.** It must be on the GPU. Escape opens it in the game.
- **Rust.** Not for the UI or its layout. See Why not Rust.
- **Layout model.** Flex with absolute position. See Why flex.
- **Style.** Typed properties with CSS names where they fit. Reuse the theme values, not the CSS.
- **JSX.** Not needed. A builder API is enough.
- **A headset.** None yet. Stage 4 builds world UI the player uses on the desktop.
- **Stage 4's first use.** A WorldPanel in the level that opens a portal.
- **Panel and portal.** The WorldPanel is a separate asset. Its `action` property names the portal and the action.
- **Target and action.** One `action` property holds both. The editor knows both halves must be set.
- **Where actions live.** In `src/core/routing/actions.ts`, shared by the game and the editor.
- **Glass in the world.** A world panel's blur uses last frame's image. The one-frame lag cannot be seen.
- **Closing a portal.** A second WorldPanel with the `lock` action, or one with `toggle`.
- **Which targets.** Any asset with actions in any container of the level, not only the panel's own container.
- **A package.** `rewild-gpu-ui`, from the start. See The package.
- **The blur source.** `renderer.sceneColorTarget`, blurred at a quarter resolution with the tone map applied. See Glass.
- **Fonts.** One Roboto atlas with regular and bold.
- **Font sizes in the world.** 1,000 pixels per metre by default, so 1 pixel is 1 mm. See World surfaces.
- **Transitions.** Colours, opacity and `transform`. No layout properties. See Transitions.
- **Pausing.** The in-game menu and settings do what the in-game menu does today.

---

## TODOs

Each TODO is one GitHub ticket in the Mica milestone. The order follows the dependencies. "Expect" is what is true when the ticket is done. From ticket 2 on, each ticket also adds its examples to the UI inspector.

### Stage 1: boxes and bars

- [x] **1. The package and the inspector**

  - Scope: the `rewild-gpu-ui` package: its workspace entry, `package.json`, `tsconfig.json`, Jest setup and a row in `docs/monorepo-structure.md`. `npm run ui-inspector` with the list, the example registry, a WebGPU canvas on a bare `GPUDevice` sized by the device pixel ratio, the DOM side by side view, and the theme and pixel ratio switches.
  - Expect: `npm test` and `npm run ts-check` run the package. The inspector opens, lists a first example, and shows its DOM side and a cleared Mica canvas.

- [x] **2. Nodes, surfaces and the UI pass**

  - Scope: `UINode`, `UISurface` (screen only), tree operations, dirty flags, the style object with the Box properties and absolute position. The primitive stream, the `rect` primitive with per-corner radius, border width and clipping, one pipeline per surface, surface order. Examples for boxes.
  - Expect: a test changes a style and only the changed nodes are dirty. In the inspector, nested, clipped, rounded boxes draw in one call, match their DOM versions, and are sharp on a high DPI screen.

- [ ] **3. Flex layout**

  - Scope: the flex subset and the rest of the Layout properties, percentages, min and max, measure functions. Unit tests with rectangles worked out by hand. The layout overlay in the inspector. Examples for layout.
  - Expect: the unit tests pass for a set of trees that cover each property. In the inspector, each layout example matches its DOM version.

- [ ] **4. Meters and the HUD**

  - Scope: custom effects, the meter effect, the `Meter` component. The HUD bars move to Mica. The old GPU UI and its dead code go.
  - Expect: the bars look and act as today. `UIElement`, `GuiManager`, the UI passes and `TextRenderer` are gone.

### Stage 2: the menu

- [ ] **5. Text v2**

  - Scope: the MSDF font code moved into the package. The Roboto MTSDF atlas and its build script, one text pipeline, the glyph primitive, line height, alignment, wrapping, clipping, ellipsis, text measuring for layout.
  - Expect: a label wraps and sizes its box, and is sharp at 12 px and 48 px.

- [ ] **6. Icons**

  - Scope: the MSDF icon atlas from lucide SVGs, its build script, the icon primitive, the `Icon` component.
  - Expect: the settings icon draws sharp and tinted at any size.

- [ ] **7. Events**

  - Scope: event types and phases, pointer capture, the hit test with clip and radius, mouse and touch sources, input taken from the game by an open surface.
  - Expect: a click on a nested node bubbles to its parent. A click on a menu does not reach the game.

- [ ] **8. Focus and gamepad**

  - Scope: focusable nodes, tab order, spatial moves, gamepad and keyboard actions, the focus ring.
  - Expect: the d-pad moves between buttons, A clicks, B closes the modal.

- [ ] **9. Theme and glass**

  - Scope: theme values from the document, light and dark. The backdrop blur from `sceneColorTarget` and glass rects. Box shadows. `transform` and transitions.
  - Expect: in the inspector, a Mica glass panel next to a DOM glass panel over the same test image looks the same, in light and dark.

- [ ] **10. The in-game menu and game over**

  - Scope: `Label`, `Button`, `Modal`, `Stack`. The in-game menu and game over move to Mica. Settings still opens the DOM panel.
  - Expect: Escape opens the menu. Resume, Settings and Quit work by mouse, keyboard and gamepad.

- [ ] **11. Stats and debug**

  - Scope: perf panel counts and times, the layout overlay in the game (shared with the inspector), the tree and focus console commands.
  - Expect: the perf panel shows UI cost, and the overlay shows each node's box.

### Stage 3: settings

- [ ] **12. Popups**

  - Scope: popup surfaces placed next to a node and kept on screen, closed by a click outside, Escape or B. Focus moves into the popup and back.
  - Expect: a test popup opens under a button, stays on screen at the edges, and closes with each of the three.

- [ ] **13. Form controls**

  - Scope: `Tabs`, `Select`, `Slider`, `Switch`, `Field`, `Divider`, `InfoBox`, each with mouse, keyboard and gamepad input.
  - Expect: each control works with the gamepad alone. The slider follows a drag off its track.

- [ ] **14. Settings in the game**

  - Scope: the in-game settings panel, bound to the same settings data as the DOM panel. Settings in the in-game menu opens it.
  - Expect: each setting in the DOM panel is in the in-game panel, and a change in one shows in the other.

### Stage 4: in the world

- [ ] **15. World surfaces**

  - Scope: surfaces on a quad, drawn in the scene with depth, a plain glass back, the glass backdrop.
  - Expect: a test panel stands in the world. The player walks round it and sees its back, and the terrain can hide it.

- [ ] **16. Look-at pointer and crosshair**

  - Scope: ray to surface pixel, the look-at ray source, reach, blocking by the scene, the crosshair, click by mouse, E and gamepad A.
  - Expect: looking at a button within reach shows the crosshair and lights the button. Past reach, or from behind, nothing shows.

- [ ] **17. Locked portals and actions**

  - Scope: `actions.ts` with the portal's actions. `doAction` on the portal. The `locked` property and its editor entry. The locked state saved as behaviour state. Find an asset by id across the level's containers.
  - Expect: a locked portal stays closed when the player walks up to it. A console call to `unlock` opens it as the player nears it, and it stays unlocked after a save and a load. A portal that is not locked works as today.

- [ ] **18. The `action-select` editor**

  - Scope: the custom editor with target and action dropdowns, filled from `assetActions`. The action clears when the target changes. An incomplete action shows as an error.
  - Expect: picking a portal as the target lists Unlock, Lock and Toggle, and the value saves as one `action` property.

- [ ] **19. The WorldPanel asset**

  - Scope: the `world-panel` resource type, its entry in `actors-library.json`, `WorldPanelAsset` with a label and a button on a world surface, its properties, editor picking on its quad. A click calls its action.
  - Expect: a WorldPanel dragged into the level shows as a glass panel with its text and button, in the editor and in the game. In the game, looking at "Open Portal" and clicking unlocks the portal beside it.

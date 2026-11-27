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
| Personal assistant: a menu on the player's hand that opens a portal | Mica | 4 |
| Library parts for slots: images, a grid, carrying items, shown in the inspector | Mica | 5 |
| Hotbar, inventory, prompts          | Mica     | Later |

Both UIs read the same theme values, so they look like one product. See Theme.

---

## Stages

| Stage                  | What it gives                                                                                              | First users                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **1. Boxes and bars**  | The package and the UI inspector, nodes, surfaces, style, the batched pass, flex layout, meters, device pixel ratio. The old GPU UI goes | The HUD bars                    |
| **2. The menu**        | Text v2, icons, events, focus, gamepad, glass, theme, transitions. Button and Modal                         | In-game menu, game over         |
| **3. Settings**        | Popups, form controls: tabs, select, slider, switch, field                                                  | Settings in the game            |
| **4. In the world**    | World surfaces, the look-at pointer and crosshair, locked portals, actions, the personal assistant         | The assistant's Portal tab      |
| **5. Carrying**        | Images, the `Grid` component, carrying items from slot to slot with pick up and place                      | The Images, Grid and Carry examples in the inspector |

Each stage is playable on its own. Stage 1 looks the same as today on purpose: it proves the new parts against a UI we know. From Stage 3, Settings in the in-game menu opens the Mica panel. The main menu's `/settings` route keeps the DOM panel. Stage 5 shows only in the inspector. The game's inventory uses its parts later.

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
| World UI      | Stage 4 adds the personal assistant: a menu on the player's hand, in 3D, that the player opens with I. It proves the VR use. Its first job is to open a portal            |
| Actions       | An asset type declares the actions it can do, in one TypeScript file that the game and the editor share. One `action` property holds a target and an action. See Actions |
| VR            | A future goal. No headset yet. World surfaces and ray pointers are the parts VR needs                                                                                   |
| Carrying      | Pick up and place, with no drag. A click exchanges the carried item and the slot's item. Slots take an amount, for stacks. See Why not drag and drop                   |
| Images        | Small images share an atlas. Large images get a texture each. One shader path. See Images                                                                               |
| Grid          | A `Grid` component over flex with wrap. No CSS grid layout. See Grid                                                                                                     |

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

Flex with absolute position covers anchors as well: `position: 'absolute'` with `bottom`, `left` and percentage sizes pins the HUD the same way an anchor does. Settings rows get their columns from a fixed label width. Inventory slots are fixed-size items in a wrapped row. So flex with absolute position is enough. Stage 5's `Grid` is a helper over flex, not grid layout. See Grid.

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
- The Roboto source fonts and the font atlas, in `fonts/`. The icon atlas, in `icons/`.
- The font and icon atlas build scripts. Both need msdf-atlas-gen. The `opentype.js` dev dependency is for both scripts. The `lucide` dev dependency is for the icon script and the inspector. See Text and Icons.
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
- **Values.** Lengths are pixels as numbers, or percentages as strings. Colours are a hex colour, a theme colour name such as `'surface'`, or a theme colour with an alpha, `{ theme: 'surface', alpha: 0.6 }`. There are no units and no shorthand strings.
- **Sharing.** A shared style is a plain TypeScript object or function, the same as `glassSurface()` in `rewild-ui`. Spread it into a node's style. There are no classes.
- **States.** A component handles its own states. A `Button` sets its colours for hover, press, focus and disabled. The style system does not know about states.
- **Passed down.** Only `color`, `fontSize`, `fontWeight`, `lineHeight` and `textAlign` pass from a parent to its children, as in CSS.

### What we reuse from the DOM

The theme values, not the CSS. The DOM's components keep their styles as CSS text in `getStyle()`. Reusing that text needs a CSS parser and a cascade, which cost more than writing the few in-game styles again. The theme values are what make the two UIs look alike, and Mica reads them directly. See Theme.

### Properties

| Group      | Properties                                                                                                  | Stage |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ----- |
| Layout     | `display` (`flex`, `none`), `position` (`relative`, `absolute`), `top` `right` `bottom` `left`, `width` `height`, `minWidth` `maxWidth` `minHeight` `maxHeight`, `padding`, `margin`, `flexDirection`, `flexWrap`, `gap`, `flexGrow` `flexShrink` `flexBasis`, `justifyContent`, `alignItems`, `alignSelf` | 1 |
| Box        | `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius` (per corner), `opacity`, `overflow` (`visible`, `hidden`, and `scroll` from Stage 3) | 1 |
| Text       | `color`, `fontSize`, `fontWeight`, `lineHeight`, `textAlign`, `whiteSpace`, `textOverflow` (`ellipsis`)       | 2 |
| Effects    | `boxShadow` (outer and inset, a list), `backdrop` (`glass`), `transform` (`x`, `y` and a uniform `scale`), `transition` (colours, opacity, `transform`) | 2 |
| Input      | `pointerEvents` (`auto`, `none`), `focusable`                                                                 | 2 |
| Image      | `objectFit` (`fill`, `contain`, `cover`)                                                                      | 5 |

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

### Scrolling

A node with `overflow: 'scroll'` is a scroll container. It clips the same as `hidden`, and its content scrolls on each axis where it is larger than the node.

- **Layout.** The items of a scroll container do not shrink, so they overflow it. In CSS, the automatic minimum size does this. Mica has none, so the rule is in the scroll container. The DOM mirror sets `flex-shrink: 0` on its items to match.
- **The content size.** `scrollWidth` and `scrollHeight` are the far edge of the children, with their margins and the end padding. A child's own overflow does not count. Give a child its content size, for example with `alignSelf: 'flex-start'`, to scroll across it.
- **Moving.** `scrollLeft`, `scrollTop`, `scrollTo` and `scrollBy` clamp to the content. Layout places the children, then moves them by the scroll. A scroll after that moves the children's rectangles again, with no layout, and the surface writes its stream. So each rectangle is where its node shows, and the hit test, focus moves and popups need no change.
- **Wheel.** Scrolling is the default action of a `wheel` event. The nearest scroll container that can move scrolls by the delta. Shift turns a vertical wheel into a horizontal one. A listener can prevent it. A wheel over a scroll container at its end does not scroll the page, as with CSS `overscroll-behavior: contain`.
- **Touch.** A touch that moves 8 px on an axis its scroll container scrolls drags the content. The node under the touch gets `pointercancel` and no click. A node that captured the pointer, such as a slider, keeps it.
- **Scrollbars.** A thumb 6 px wide on each axis that overflows, inside the right or bottom edge, in `onSurfaceLight` at 50 %. It is at 75 % while a mouse hovers it and 90 % while a pointer drags it. The mouse can drag it, and a press on the track off the thumb pages. The scrollbar takes the press, so the content gets no events.
- **Gutters.** Each scrollbar has a 10 px gutter that the content does not go into: on the right for a vertical bar and at the bottom for a horizontal one. Layout adds the gutter to the padding only on an axis that overflows. The node's own padding goes inside the gutter, as with CSS `scrollbar-gutter`. When a pass adds or removes a gutter, the tree is laid out again, up to three passes. So a parent that sizes to its content includes the gutter.
- **Redraws.** A scrollbar drag, hover or page and a touch pan send no events. `UIInput.onRedraw` tells an owner that draws only on input, such as the inspector, to draw again.
- **Focus.** Focus from a key or the gamepad scrolls the node into view, with a 4 px margin for the focus ring, after the surface's next layout. Focus from a pointer does not scroll. `node.scrollIntoView()` does it by hand.
- **The right stick.** It scrolls at up to 1,200 px a second, on a curve, with a dead zone of 0.2. It sends a `wheel` to the focused node. The nearest scroll container round that node scrolls, or else the first one in the focus scope that can move. So the stick scrolls a settings panel while focus is on its tab.

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
| `icon`    | One icon from the SDF icon atlas                                                            |
| `image`   | One image from the image atlas. See Images. Stage 5                                         |
| `custom`  | A rect drawn by a registered fragment function. See Effects                                 |

Each instance carries its rectangle, a clip rectangle, its colours and one `vec4` of parameters. A node with `overflow: hidden` sets the clip for its children.

- **Few draw calls.** Text and boxes share the stream, so a surface draws in one call, or a few if a custom effect needs its own pipeline.
- **Uploads.** The stream is rebuilt only for a surface with a dirty node. A meter's value changes one instance's parameters, not the stream.
- **Where.** Screen surfaces draw after the frame compositor, the same as today. World surfaces draw in the scene. See In the world.

---

## Text

MSDF stays. What changes:

- **One text system.** Glyphs are primitives in the surface's stream, in tree order: a node's box, then its text, then its children. The plain rect pipeline draws them, so boxes and text draw in one call.
- **Font.** The DOM uses Roboto. Mica makes one Roboto atlas that holds regular and bold, so both UIs use the same face and all text shares one texture. The source is the static Roboto 2.138, because Roboto 3's overlapping contours make holes in a distance field.
- **Atlas.** MTSDF, with a true distance in the alpha channel for outlines, glow and shadows. `distanceRange` 8, 40 texels per em. Latin-1, the rest of Windows-1252 and common symbols. A character the font does not have draws as "?".
- **Building the atlas.** `npm run ui-font` runs msdf-atlas-gen 1.4 and writes `fonts/roboto-msdf.png` and `.json` in the package. Both are committed, so only someone who changes the atlas needs the tool. It is found on the `PATH` or through `MSDF_ATLAS_GEN`. On macOS, `brew install msdf-atlas-gen`. On Windows, use the release from GitHub. On Linux, build it from source. When the tool is missing, the script prints the steps for the platform. msdf-atlas-gen reads kerning only from the old `kern` table, and Roboto keeps its kerning in `GPOS`, so the script adds it with `opentype.js`. The JSON is msdf-atlas-gen's, with `yOrigin: 'top'`.
- **Publishing the atlas.** The deploy caches files for a year, so the game build copies the atlas to `public/fonts` under names with a hash of its contents, such as `roboto-msdf.6b9b16549f.json`, and passes the URL to the game as `process.env.UI_FONT_URL`. A changed atlas gets new URLs, and the JSON and PNG share one hash. `scripts/atlas-files.mjs` does the hashing, for the font and the icons. The inspector serves the plain names.
- **Crisp.** The glyph's quad size gives the screen pixel range, clamped to at least 1. Baselines snap to device pixels. The canvas is sized by the device pixel ratio.
- **Lines.** Line height, left, centre and right alignment, wrapping at spaces, clipping and ellipsis. `whiteSpace` is `normal`, `nowrap` or `pre-line`. As in CSS, an ellipsis needs `overflow: 'hidden'`, and a line too long for its box aligns left.
- **Measuring.** The same code measures text for layout and lays out glyphs for drawing, so they always agree.

```ts
ui.font = await UIFont.load(device, '/fonts/roboto-msdf.json');
const label = new UINode({ text: 'Resume', style: { fontSize: 20, fontWeight: 'bold' } });
label.text = 'Continue'; // lays out again
```

A node with `text` measures from its text and does not lay out its children. Text style that passes down comes from the nearest parent that sets it. Until the surface has a font, text has no size. The DOM mirror in the inspector draws a text node as a block, so its text starts at the top left of the content box, the same as in Mica.

## Icons

The DOM uses lucide icons. Mica makes a distance field atlas from the same icons, so icons stay sharp at any size and tint like text. The atlas holds only the icons the game uses.

- **Building the atlas.** `npm run ui-icons` writes `icons/lucide-icons.png` and `.json` in the package. Both are committed. The icons are listed once, in `lib/iconNames.ts`, which gives the typed names and which the script imports. To add an icon, add its lucide name there and run the script again. The lucide version is the one `rewild-ui` uses.
- **Strokes to shapes.** Lucide draws 2-unit strokes with round caps and joins on a 24-unit grid. A distance field needs filled shapes, so the script flattens each stroke into line segments and fills each one as a capsule. The capsules go into a font made with `opentype.js`, one icon per private-use code point, and msdf-atlas-gen joins them with the non-zero rule.
- **SDF, not MSDF.** A round stroke has no sharp outer corners, so the extra MSDF channels keep nothing. And msdf-atlas-gen's MSDF has cracks where many contours overlap. So the icon atlas is a grey, single-channel SDF, 64 texels per icon, `distanceRange` 8. The shader reads it with the same median as text, because grey loads as equal red, green and blue.
- **Drawing.** `node.icon` draws the icon as the largest square that fits the content box, centred, after the node's box and before its text. Its top left snaps to device pixels. The colour is the text colour that passes down. The icon atlas has its own binding, and icons draw in the same pipeline and the same draw call as boxes and text.
- **Publishing.** The same as the font: the game build copies the atlas to `public/icons` under hashed names and passes the URL as `process.env.UI_ICONS_URL`.

```ts
ui.icons = await UIIcons.load(device, '/icons/lucide-icons.json');
const settings = new Icon({ icon: 'settings', size: 18 });
settings.icon = 'x'; // draws again, with no layout
```

---

## Events

The shape follows the DOM.

- **Types.** `pointerdown`, `pointerup`, `pointermove`, `pointercancel`, `pointerenter`, `pointerleave`, `click`, `wheel`, `focus`, `blur`, `keydown`, `keyup`.
- **Phases.** Capture down from the surface root, then bubble up from the target. At the target, capture listeners run first. `stopPropagation` and `preventDefault`. Enter and leave do not bubble. `node.on(type, listener, { capture })` and `node.off` add and remove listeners.
- **Click.** A click goes to the nearest node that holds both the down and the up, as in the DOM. Only the main button clicks.
- **Pointer capture.** A node that captures the pointer gets its moves, its up and its cancel, even off the node. The slider needs this. The capture ends when the pointer is up.
- **Hit test.** From layout rectangles, inside clip rectangles, with corner radius. `pointerEvents: 'none'` skips a node, but not its children.
- **Taking input from the game.** Each surface has an `input` mode:

  | Mode    | Takes                                                                          | Used by        |
  | ------- | ------------------------------------------------------------------------------ | -------------- |
  | `none`  | Nothing. Its nodes get no events                                               | The HUD        |
  | `nodes` | Pointer input over a node other than the root. The default                     | The assistant  |
  | `all`   | All pointer, key and gamepad input while its root shows. See Focus and gamepad | The menu       |

  A press that a surface takes stays taken until it is up, and a press that starts in the game stays in the game. `UIInput` listens on the window in the capture phase. When a surface takes a DOM event, the event stops there, so no listener of the game gets it. A click on Resume does not also act in the game. Keys typed in a DOM control are not taken.
- **The source.** `renderer.ui.input.attach(canvas)`. It sets `touch-action: none` on the canvas, so a touch points and does not scroll. A locked mouse has no screen point, so it gives no pointer events.

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

- **Focus.** `focusable` nodes take focus. `node.focus()` and `node.blur()`, with `focus` and `blur` events that do not bubble. A press focuses the nearest focusable node under it, unless a `pointerdown` listener prevents the default.
- **The focus scope.** Focus lives on the topmost open surface that takes all input. Each surface keeps its own focused node, so focus goes back to the menu when a popup over it closes. Keys go to the focused node, or to the scope's root, and bubble.
- **Tab order.** Tab and Shift+Tab move through the focusable nodes in tree order. They wrap, so focus stays in the scope.
- **Spatial moves.** The d-pad, the left stick and the arrow keys move focus to the nearest focusable node in that direction, by rectangle. A candidate must start past the focused box's edge. Its score is its gap along the move plus five times its gap across it, so a node in line wins over a nearer one to the side. With nothing focused, a move focuses the first node.
- **Scrolling.** The right stick scrolls, and focus from a key or the d-pad scrolls into view. See Scrolling.
- **Actions.** Enter or A clicks the focused node. A held key does not click again. Escape or B has no action of its own: a modal or popup listens for the `Escape` key down and closes. Tab, the arrows and Enter are default actions, so a `keydown` listener can prevent them.
- **The gamepad.** `GamepadReader` turns a pad with the standard mapping into keys: A is `Enter`, B is `Escape`, and the d-pad and the left stick are the arrow keys. The event's `code` names the control, such as `GamepadA` or `GamepadStickLeft`. The d-pad and the stick repeat while held, after 400 ms and then every 100 ms. The stick points past 0.5 on its stronger axis and stops below 0.3.
- **Who reads the pad.** A pad has no events, so the UI cannot stop a press before the game sees it. One owner reads the pads once per frame and gives them to one side. In the game, that owner is `Gamepad` in `src/core/input`, and `GameManager` routes it. While a focus scope is open, the pad goes to `ui.input.readGamepads`. Otherwise the player reads it. When the UI gets the pad, `syncGamepads` takes the controls already down as held, so a press that began in play does not act in the UI. The inspector reads the pads itself, for the card whose canvas has focus.
- **Focus ring.** It shows only when focus came from a key or the gamepad, as with `:focus-visible`. It is the DOM's `outline: 2px solid` in the theme's `primary400`, drawn over the node's children.

---

## Glass and effects

### Glass

The DOM's glass is `backdrop-filter: blur(18px) saturate(150%)` under a surface colour at 60%, with a 1 px edge in `glassEdge`. Mica draws the same:

- **The source.** `renderer.ui.backdrop` names the image to blur. The game sets it each frame to `renderer.sceneColorTarget`, the HDR scene that the tone map reads, with the camera's exposure. It is there already, so there is no copy of the canvas. The inspector sets it to a copy of its test image.
- **The blur.** A prefilter averages each 4 by 4 block into a quarter size image. Then a dual Kawase blur halves the image some times and doubles it back. The prefilter applies the exposure and the game's ACES curve to each tap, before the blur. A tone map after the blur lets a bright sun spread a glow that the screen does not show. `blurSteps` picks the levels and the tap offset from the pixel ratio, so the blur is a Gaussian of deviation 18 CSS pixels at any ratio. A simulation of the chain fitted the rule to within 5 %.
- **The glass rect** samples the blur at its screen position, raises the saturation with the CSS `saturate()` matrix, then lays its fill and border over it. `glassSurface(opacity)` gives the DOM's style: `backdrop: 'glass'` and the surface colour at 60 %.
- **Cost.** The blur runs once per frame for all glass nodes, and not at all when none is visible. At a quarter resolution it is a small part of the frame.
- **Not the same as the DOM.** The blur reads the whole screen, so a colour just outside a panel shows a little at its edge. Chrome mirrors the panel's own pixels at its edge. Glass does not see the UI under it, such as the HUD under the menu.
- **World surfaces** draw inside the scene, before this frame's blur exists, so they read last frame's blur. The one-frame lag cannot be seen.

Bloom's blur is not reused. It keeps only the light above its threshold, not the whole scene.

### Custom effects

A registered WGSL `effect` function draws a `custom` rect, with the node's `vec4` of parameters. The effect is a text block, not a full shader. Mica adds it to the end of the base shader, `ui.wgsl`, and compiles the two as one module:

```wgsl
fn effect(prim: Primitive, px: Pixel) -> vec4f
```

`px.local` is the pixel's position in the box, in CSS pixels. `px.edge` is the signed distance to the box's rounded edge, `px.outer` the coverage of the box and `px.inner` the coverage inside the border. The effect returns a premultiplied colour. The base shader applies the rounded edge, the clip and the opacity. A plain box uses the same contract, in `rect.wgsl`.

```ts
ui.effects.register('stripes', stripesWgsl);
const node = new UINode({ effect: 'stripes' });
node.setEffectParams(x, y, z, w); // `prim.effect` in WGSL
```

By default an effect colours only the inside of its box. The quad covers the box and one device pixel round it, and the base shader cuts everything outside the rounded edge. A node's `effectOutset` grows the quad by that many CSS pixels. Then the base does not cut the edge, and the effect draws a glow or a shadow from `px.edge` and covers what it draws itself.

### Box shadows

`boxShadow` takes one shadow or a list, with CSS's `x`, `y`, `blur`, `spread`, `color` and `inset`. The first shadow draws on top. Each shadow is its own primitive in the plain pipeline, so shadows add no draw calls.

- **Outer shadows** draw before the box, on a quad grown by the offset, the spread and three deviations of the blur. The blur is a Gaussian with half the CSS blur radius as its deviation. The shader integrates the blurred rounded box, after Evan Wallace's method. As in CSS, an outer shadow draws only outside the box, so a glass box does not show it, and a spread grows a round corner but keeps a square corner square.
- **Inset shadows** draw after the box, inside its padding box.

Each effect gets its own pipeline, made when a node first uses it. All the pipelines share one bind group layout. A surface draws in runs of primitives with the same effect, in tree order, so a surface with mixed effects takes a few draw calls.

`setEffectParams` writes the node's primitive in place and uploads only that primitive. The stream is not rebuilt.

The meter is the first effect. `UIRenderer` registers it. Its parameters are the value and the full and empty colours, each packed into one float as `r * 65536 + g * 256 + b`. Per-node values live in the instance, not in a material. One meter effect serves all five bars.

### Transitions

`transition` eases a property from its old value to its new one, with a duration and an easing curve. Three things transition:

- **Colours**, for a button's hover and press.
- **Opacity**, for a modal or a crosshair that fades in and out.
- **`transform`**, a translate and a scale, for a modal that slides or grows in, or a button that shrinks a little when pressed.

`transform` is applied when the node draws, after layout, the same as in CSS. It does not move other nodes, so a transition never runs layout again. The scale is uniform and about the centre of the box, so a rounded box stays a rounded box. The hit test follows the transformed box.

A transition is `{ property, duration, easing, delay }`, with times in milliseconds, CSS's easing keywords, and `all` for the five properties. A change starts from the value the node shows, so a change in the middle of a transition turns round with no jump. A node that has not drawn yet jumps, as in CSS. A node at opacity 0 counts as drawn, so a node kept at opacity 0 can fade and grow in. Colours mix with premultiplied alpha. While a transition runs, its surface writes its stream on each frame, and `renderer.ui.animating` is true.

Layout properties, such as `width` or `top`, do not transition. Each frame of such a transition would run layout.

---

## Theme

The DOM's theme values are CSS custom properties in `style.css`: colours, spacing, radius and font sizes, with light and dark sets.

- At start, and when the theme changes, Mica reads the computed values from the document and stores them as numbers. `UIRenderer` owns a `UITheme`. It watches the root's `data-theme`, `class` and `style`, which is how `applyUiTheme` switches the theme.
- A Mica style names a theme value. It does not copy the colour. The names are the colour names of `theme.colors` in `rewild-ui`, such as `surface`, `onSurface`, `primary400` and `glassEdge`.
- When the theme changes, each surface writes its stream again. Layout does not run.

So a colour changed in `style.css` changes both UIs.

---

## Components

Components are TypeScript classes that build a subtree, handle their own states, and expose a small API. They are not a framework.

| Component  | What it is                                                     | Stage |
| ---------- | -------------------------------------------------------------- | ----- |
| `Meter`    | A bar filled to a value, coloured from full to empty           | 1     |
| `Label`    | Text                                                           | 2     |
| `Icon`     | One icon from the atlas                                        | 2     |
| `Button`   | Label, optional icon, states, focusable, `click`. A `contained` or a `text` variant, as the DOM's | 2     |
| `Modal`    | A glass panel on its own surface, with a dimmed backdrop. Escape and B close it | 2 |
| `Stack`    | A flex column or row with a theme gap                          | 2     |
| `Popup`    | A small panel next to a node, on its own surface. See Popups   | 3     |
| `Tabs`     | A row of tabs that picks one panel                             | 3     |
| `Select`   | A field that opens a list of options on a popup surface        | 3     |
| `Slider`   | A track and a handle, with pointer capture and gamepad steps   | 3     |
| `Switch`   | An on and off toggle, the same shape as the DOM's              | 3     |
| `Field`    | A label, a control and an optional description in a row        | 3     |
| `Divider`, `InfoBox` | A line, and a box of help text                       | 3     |
| `Image`    | One image, small or large. See Images                          | 5     |
| `Grid`     | Cells of one size in columns and rows, over flex. See Grid     | 5     |

A closed `Modal` stays in its surface at opacity 0, and its surface takes no input. So it draws nothing, and it fades and shrinks in when it opens, as the DOM modal does. Game over keeps its title and its options at opacity 0 for the same reason.

A component takes plain values and callbacks. It does not know about stores. Game code in `src` binds a `Store` from `rewild-ui` to a component, so game state drives it the same way it drives the DOM.

### Popups

A `Popup` is a small panel on its own surface, next to a node, such as the list of a `Select`. Its surface draws at order 2, over a modal at 1.

```ts
const popup = new Popup(renderer.ui, { placement: 'bottom', align: 'start' });
popup.append(low, medium, high);
button.onClick = () => popup.open(button.node);
```

- **Placing it.** `placement` is the side of the anchor (`bottom`, `top`, `right` or `left`), and `align` lines the popup up with the anchor's `start`, `center` or `end`. `offset` is the gap to the anchor, 4 px by default.
- **On screen.** When the popup does not fit on its side and the other side has more room, it opens on the other side. Then it moves to stay `margin` in from each edge, 8 px by default. `placePopup` does this, from the anchor's rectangle and the panel's size.
- **After layout.** The panel's size comes from layout, so the popup places itself in the surface's `onLayout`, and the surface lays out again. Layout gives an absolute box only the room right of its left edge, so a panel squeezed against the right edge lays out again from the left edge first. A surface lays out at most three times in one update.
- **Closing.** A click outside, Escape or B closes the popup and calls `onClose`. The click outside does not reach the UI under it. `close()` closes it with no `onClose`.
- **Focus.** While the popup is open, its surface takes all input, so it is the focus scope. Focus moves to its first focusable node, with the ring when the anchor's surface shows the ring. When it closes, focus goes back to the node that had it, or else to the anchor.
- **Look.** The plain `surface` colour, a 1 px `glassEdge` border, a 4 px radius and a short shadow. It fades in and out over 150 ms. Glass is for modals and for panels over the scene. A popup over the scene can add it with `style: glassSurface()`.

### Form controls

The form controls copy the look of the DOM controls in `rewild-ui`. Each one works with a mouse, the keys and a gamepad. The gamepad's d-pad and left stick act as the arrow keys, so a control that uses an arrow takes it from focus moves.

```ts
const quality = new Select(renderer.ui, { options, value: 'high', onChange });
const volume = new Slider({ value: 80, onChange, onChangeComplete });
menu.append(
  new Field({ label: 'Render Quality', control: quality, description: 'Sets each section.' }),
  new Field({ label: 'Master', control: volume })
);
```

- **Values.** Each control takes a value and an `onChange`. `onChange` runs only for input from the player. A value set from outside, such as `select.value = 'low'`, changes the control with no `onChange`, so a store can drive it.
- **Disabled.** A disabled control fades, takes no input and no focus. A disabled `Select` closes its list.
- **`Switch`.** A click, Enter, Space or A turns it. Off is an outlined track and on is a filled one. The thumb slides with a `transform` transition.
- **`Slider`.** A press moves the thumb to the press, and the drag follows the pointer off the track until it is up, with pointer capture. Left and right step the value, Home and End go to the ends, and Page Up and Page Down take ten steps. Up and down do not step, as they do in the DOM, so on a gamepad they move focus between the rows of a form. `onChangeComplete` runs when a drag ends and after each key.
- **`Select`.** A click, Enter or A opens its list on a `Popup` under it, as wide as the field. Focus goes to the chosen option. The arrows move between options, and a click, Enter or A picks one. A click outside, Escape or B closes the list with no change. Focus then goes back to the field. A list taller than 256 px, the DOM's `16rem`, scrolls, and it opens scrolled to the chosen option. Mica has no rotation, so the arrow does not turn while the list is open.
- **`Tabs`.** A row of tabs over the panels, or a column beside them. Only the open tab takes focus. The arrows along the tabs open the next tab and move focus to it. They wrap and skip disabled tabs. The arrows across the tabs move focus into the panel. Hidden panels stay in the tree with `display: 'none'`, so their controls keep their state. Each panel is a scroll container.
- **`Field`.** A label in a column of fixed width, 200 px by default, then the control, with the description under the control. The control's column stretches a `Select` or a `Slider`. A `Switch` keeps its width.
- **`Divider` and `InfoBox`.** A 1 px line in `onSurfaceBorder`. A neutral box with an icon, an optional title and text, and the variant's colour as a bar down the left edge.
- **Lines with no border.** Mica has one border width for all sides. The field's bottom line and the info box's bar are inset shadows, so they add no size. The tab line is a 2 px node at the edge of the tab.

### Settings

The in-game settings use the same settings data as the DOM panel: render quality and its overrides, volumes, output device and theme. Only the view changes. Both panels read and write the same stores, so a change in one shows in the other.

- **The code.** `SettingsMenu` in `src/core/menus`. `settingsOptions.ts` holds the options and the help text, and both panels read it.
- **Opening.** Each open reads the stores again, so the panel shows a change made in the DOM panel. It opens on the Display tab.
- **Applying.** The Display tab is a draft. Apply writes it to the renderer's `quality` and closes. Cancel, Escape and B drop it. Audio and the theme change at once, as in the DOM.
- **The output device.** The panel lists the devices each time it opens and while a device connects or goes. A `Select` takes a new list through its `options`. With no named devices, a button asks the browser to name them.
- **The theme.** The app gives `GameManager` `getUiTheme` and `setUiTheme`, so `src/core` does not import `src/ui`.

---

## In the world (Stage 4)

A player walks up to a portal that stays closed. They press I. Their left arm comes up, and a glass panel comes out of the watch on its wrist and stops in front of them. It covers much of the view, and the level shows through it. The mouse is free. They click the Portal tab's Unlock button and press I again. The panel goes back into the watch, and the arm goes down. The portal opens as they near it.

The panel is the personal assistant. In VR it will be on a controller, and the controller's ray will point at it. On the desktop the mouse points at it. It is the first proof of the VR use: a menu that moves in 3D with the player, and takes a ray as its input.

### World surfaces

- **The quad.** A surface on a quad with a size in metres. It draws in the scene with depth testing, so the world can hide it and the player can walk round it.
- **Pixels per metre.** A world surface lays out at 1,000 pixels per metre, so 1 pixel is 1 mm. A surface can set its own value.
  - A 0.8 m by 0.5 m panel lays out at 800 by 500 pixels, the size of a modal on the screen. So the same components and styles work on the screen and in the world.
  - 16 px text is 16 mm tall in the world, and a player reads it from 1 to 2 m.
  - MSDF text stays sharp at any size, so this value sets only how big things are, not how sharp.
- **The back.** From behind, the panel shows plain glass, not its UI mirrored. The back takes no input.
- **Crisp in the world.** Glyph size follows the screen pixel range from derivatives, so text stays sharp at any distance.

```ts
const panel = renderer.ui.createSurface({
  kind: 'world',
  name: 'portal-panel',
  size: { width: 0.8, height: 0.5 },
});
panel.worldMatrix.set(transform.matrixWorld.elements);
```

- **In the scene.** `UISurface3D` in `rewild-renderer` owns a world surface and a transform, the same as `Sprite3D` owns a sprite. Add its transform to the scene to show the surface, and remove it to hide it. The renderer collects each `UISurface3D` in the scene each frame, gives its surface the transform's world matrix, and adds the surface to the UI or takes it out. A raycast hits its quad, from the front or the back.
- **Over the scene.** A world surface can skip the depth test, with `depthTest: false`, so walls and terrain do not hide it. The assistant does this, because it is close to the eye and must always show. It still draws in 3D, but in the screen UI's pass, under the screen surfaces. So it draws at the canvas's resolution, not at the scene's lower render scale, and its text is as sharp as screen text.
- **Surface effects.** A surface effect moves and colours a whole world surface, as a node effect colours one box. It is two WGSL functions, `surfacePlace` and `surfaceColor`, registered with `UIEffects.registerSurface` and named in the surface's `effect`. They read the surface's `effectValue`, a uniform, so a change needs no repaint. `surface.wgsl` is the plain one, which changes nothing.
- **The hologram.** The built-in surface effect `hologram`, in `hologram.wgsl`. As `effectValue` goes from 0 to 1, a dot of light stretches into a line, and the line opens into the surface with glowing top and bottom edges and drifting scanlines. The surface then flickers twice and settles. From 1 to 0 it turns off the same way. `surfacePlace` squeezes the surface toward its centre, so its transform and its layout do not change.
- **Placing it.** `worldMatrix` places the surface, column-major. The local origin is the centre of the surface, x points right, y points up and the front faces +z. `size` and `pixelsPerMetre` can change, and the surface lays out again.
- **Drawing.** `UIRenderer.renderWorld` draws the world surfaces, far ones first, once per frame before `render`. The renderer calls it after the tone map, into the frame at the scene size, so world UI has the same colours as screen UI. Rain and the overlays draw after it. It tests the scene depth and does not write it, because the boxes of a surface all lie in one plane. A surface wholly out of view lays out and does not draw.
- **One shader.** Screen and world surfaces share `ui.wgsl`. A uniform matrix maps the surface's pixels to clip space. A world surface works out its device pixels per CSS pixel from derivatives, for its edges, text and shadows, and grows each quad by one device pixel for the anti-aliased edge. Each effect has a second pipeline for world surfaces, with depth.
- **The back.** On a back face, the shader draws only the glass boxes, with their fill and border and no effect, and drops the rest. A panel with no glass shows nothing from behind.
- **Glass.** World glass samples the blur at its place on the screen, from last frame. A world surface with glass in view keeps the blur running.
- **Input.** Screen pointers and the focus scope skip world surfaces. Only a ray reaches them. See Looking at it.
- **Fog.** World UI draws after the atmosphere composite, so fog does not cover a far panel.

### Looking at it

- **The look-at ray.** Each frame, a ray from the eye through the screen centre is tested against world surfaces. A hit becomes a surface pixel, then normal pointer events, so the button gets hover and press with no new code.
- **Which surface.** The ray takes the nearest open world surface that takes input and whose front it meets. A surface's root blocks the surfaces behind it, also where it has no node. The back of a surface takes no input and blocks nothing.
- **Reach.** Only a hit within reach counts, 3 m by default. Past it, the panel is only something to look at.
- **Blocked.** A hit counts only if nothing in the scene is nearer along the ray. The player casts the ray into the physics world. A collider other than the player's own, nearer than the panel, blocks it.
- **The crosshair.** It shows only while the ray hits a focusable node, such as a button, within reach. Text on the panel does not show it. It is an 8 px white dot with a soft shadow, on its own screen surface, and it fades in and out over 120 ms.
- **Using it.** A mouse click, E, or A on a gamepad clicks the node under the crosshair. A press with no crosshair goes to the game, so A still jumps. A press that the crosshair takes holds the pointer down until it comes up, and the click goes to the node that holds both the down and the up, as with a mouse.
- **Capture.** A node that captures the ray, such as a slider, keeps it on the plane of its surface, even off the surface's edge.
- **Stopping.** When the pointer is free, such as when the menu opens, or the player dies, the pointer stops. The node under it gets `pointercancel` and `pointerleave`, and no click.

```ts
const look = new UILookPointer(renderer.ui);
look.aim(eye, forward, distanceToScene); // each frame, while the player looks round
look.press('mouse'); // true when the UI took the press
look.release('mouse'); // clicks when no other source holds the pointer
```

- **The code.** `UIInput.ray` turns a ray into pointer events, with `pointerType: 'ray'`. `rayToSurface` in `lib/world.ts` finds the surface pixel. `UILookPointer` owns the crosshair and the presses. `Player` in `src/core/routing` aims it, casts the blocking ray, and gives it the mouse, E and A. An XR controller can use `UIInput.ray` the same way.

### The personal assistant

A menu that the player wears, as a watch on the arm. Later it goes on a VR controller. It is not an asset, and the editor does not place it. The player always has it.

- **The rig.** A transform that is a child of the camera, so it moves with the view. It holds the arms and the panel. The arms and the panel are in the scene only while they show.
- **The arms.** The skinned model `first-person-arms`, posed for a camera at its origin, so it sits on the rig with no offset. It has three clips: `personal-inventory` brings the left arm up with the watch toward the eye, `personal-inventory-hold` loops the held pose, and `personal-inventory-lower` takes it back down. The `watch` bone sits at the watch face, with its +Z out of the face. The arms cast no shadow, because the body that would cast with them is not drawn. Without the model, the panel opens on the same timing from where the watch would be.
- **Opening.** I opens it. The arm plays its raise, then its hold. Once the raise is 60% through, the panel's hologram turns on over 0.7 s. As the hologram opens, the panel moves from the watch to its place, so the dot of light comes out of the watch and rises as it opens. The panel takes input only once the arm is up and the hologram is on. I again, or its Close button, closes it: the hologram turns off as the panel goes back into the watch, then the arm plays its lower, and then the arms and the panel leave the scene. Opened again on the way down, the arm comes up from where it is.
- **Breathing.** While the arm is raised, the rig sways as the player breathes: it rises and falls 8 mm over a 4 s breath, tilts a little with it, and drifts 3 mm to each side more slowly. So the panel feels held, not fixed to the screen.
- **Size and place.** The panel stands 0.5 m in front of the eye and covers 72% of the view's height and width. It sits 10% of the view's height up and 8% of its width right of the centre, so its lower left corner clears the raised watch. Its size and place come from the camera's field of view and aspect each time it opens. It lays out at 760 px tall at any size, so its text is the size of screen text.
- **The arm and the panel.** The arms draw in the scene, and the panel draws over the scene, so the panel would cover the arm. The panel's place keeps it clear of the hand.
- **Look.** The modal's glass, from the theme, with its white light on the glass and its edge that follows the pointer. The level shows through it. The glass is a node that fills the surface, not the root, because the root lets the pointer through.
- **The mouse.** Opening frees the mouse, so the player can point at the panel. A ray from the eye through the mouse goes to `UIInput.ray`, the same as a VR controller's ray will. While the panel is open, the mouse does not look round and the look-at pointer stops. The player can still move.
- **Closing.** I closes it and locks the mouse again. The Close button at the top right closes it, and the click that pressed it locks the mouse. Escape and the gamepad's Start close it and open the in-game menu, as they do in play. Death closes it too.
- **Not a pause.** Freeing the mouse for the assistant does not open the in-game menu. A click on the canvas does not lock the mouse while the assistant is open.
- **Tabs.** A column of tabs at the left. One tab for now, Portal. Later tabs add more of the game's UI.
- **The Portal tab.** The portal's name and whether it is locked, and one button for each portal action from `PORTAL_ACTIONS`: Unlock, Lock and Toggle. A level has at most one portal. The tab finds it in the level, in any container, and a click calls its `doAction`. With no portal in the level, the tab says so and shows no buttons.
- **The code.** `src/core/assistant`: `PersonalAssistant` owns the rig, the panel and the tabs, and drives the arms. `AssistantArms` names the clips and the watch bone, and wraps the skinned model. `PortalTab` is the Portal tab. `MouseRay` turns the free mouse into a ray. `Player` owns them, gives them I and the mouse, and updates the assistant each frame. `GameManager` closes it when Escape or Start opens the in-game menu.

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

A value with a target and no action is incomplete, and the editor shows it as an error. No asset uses the `action` property yet. It is ready for a later asset, such as a switch or a trigger.

**In the game.** A caller, such as the assistant's Portal tab, finds its target by id, in any container of the level, and calls `doAction`. Today `Container` finds assets only by name, so the level gets a lookup by id across its containers. An id stays the same when an asset is renamed.

A target can be in a container that is not active. The action still changes the target's state, and the change shows when its container becomes active.

**Later.** Actions are the start of scripting. A script will listen for events and call these same actions, so the actions declared now become the API that scripts use.

### Portals

Today a portal opens when the player comes within `OPEN_RANGE` of it and closes past `CLOSE_RANGE` (`PortalOpening.ts`). Stage 4 adds a portal that waits for the player to unlock it:

- **Locked.** A portal can start locked. A locked portal stays closed, small and bobbing, however near the player comes.
- **The `locked` property.** A boolean on the portal, set in the editor. Off by default.
- **Unlocked.** The `unlock` action unlocks the portal. From then on the portal opens and closes by distance, the same as today. The `lock` action locks it again and it closes.
- **Default.** A portal that is not locked works as today, so no level changes.
- **Saved.** The unlocked state is behaviour state, the same as `PortalTrigger`'s `armed`, so it survives a save and a load.

### Later

- An XR session, with the camera driven by the headset, and XR controllers as ray sources.
- The assistant on a VR controller, with the controller's ray pointing at it.
- Sizes and distances tuned on real hardware, in a headset and on handheld devices.

The renderer uses WebGPU. An XR session needs the browser to share WebXR with WebGPU, so that work starts with checking browser support.

---

## Images, grids and carrying (Stage 5)

Stage 5 adds three parts to the library: images, a grid, and a way to carry an item from one slot to another. The game's inventory, and other screens with slots, use them later.

The parts are library parts. Their API and the inspector's examples use no game words. Each example tests one API. The game's own rules, such as which items stack and how far, live in the game. The examples write small rules of their own to prove the API can hold them.

### Why not drag and drop

A web style drag and drop API is the wrong tool for slots. Mica uses pick up and place, as many games do.

- **A gamepad cannot drag.** A drag needs a pointer that moves while a button is down. A gamepad has no pointer. Its d-pad moves focus from slot to slot. To hold A down during those moves is awkward.
- **Pick up and place is common.** A click picks the item up, and the item follows the pointer. A second click puts it down. Players know this from many inventory screens.
- **The DOM's API is hard to use.** A target must prevent the default of `dragover` to accept a drop. The data goes as strings in `dataTransfer`. Mica gets nothing from a copy of this.
- **One model for each input.** Pick up and place works the same with a mouse, a touch, the keys, a gamepad and a ray. Only the place where the carried item shows changes: at the pointer, or over the focused slot.

There is no drag. A press that moves and comes up on another slot is a press with no click, as in the DOM. One way in keeps the rules small.

### Carry

`UICarry` carries one item at most. `UIRenderer` owns one, as `ui.carry`. A slot is a node that can give an item to the carry and take one from it. `UICarry` does not know what an item is.

```ts
const carry = renderer.ui.carry;

carry.slot<Item>(cell, {
  take: (amount) => items.take(i, amount), // removes and gives an item, or null when empty
  put: (item, amount) => items.put(i, item, amount), // gives what stays carried, or null
  accepts: (item) => true,
  ghost: (item) => new Image({ image: item.image, style: { width: 56, height: 56 } }).node,
  enter: () => (slot.lit = true),
  leave: () => (slot.lit = false),
});

carry.held; // the carried item, or null
carry.onChange = (held) => redraw();
carry.onReturn = (item, from) => items.stow(item, from); // Escape, B, cancel()
carry.cancel();
```

**The one rule.** A click on a slot exchanges the carried item and the slot's item:

| Carried | Slot  | A click                                                              |
| ------- | ----- | -------------------------------------------------------------------- |
| Nothing | Empty | Nothing. The click goes on as normal                                 |
| Nothing | Full  | `take` gives the slot's item, and it is carried                      |
| An item | Empty | `put` puts the item in. Nothing is carried                           |
| An item | Full  | `put` puts the item in and gives the slot's item, and it is carried  |

`UICarry` calls `take` when it carries nothing and `put` when it carries an item. What `put` gives back is carried. So the slot's code decides what a full slot does: swap, merge or refuse. `UICarry` has no idea of full or empty.

**Amounts.** `take` and `put` get an amount, so slots can hold stacks. `UICarry` passes the amount and does not read it.

| Input                                    | `take`   | `put`   |
| ---------------------------------------- | -------- | ------- |
| The main button, a tap, Enter, A         | `'all'`  | `'all'` |
| The right button, Shift+Enter, X         | `'half'` | `'one'` |

A slot that holds one item and ignores the amount works the same for each input. A stack slot merges in `put` and gives back what is left. So with a stack carried, a right click on a slot puts one item in it, and the rest stays carried. Each right click puts one more. With nothing carried, a right click on a stack takes half of it. The carried item shows its count through its ghost, which the slot builds. So counts need no API of their own.

- **Clicks.** When the carry acts, the slot gets no `click` event. A slot that does not accept the carried item takes no click, and the item stays carried. Over a slot, the right button opens no context menu.
- **Not a slot.** While an item is carried, a click on a node that is not a slot goes on as normal. So a Close button still works.
- **The ghost.** The slot that gives the item builds its ghost with `ghost`. After a `put` that gives back part of a stack, the slot builds the ghost again. The ghost draws on the carry surface, a screen surface at order 3, over popups. The carry surface takes no input, so the hit test finds the slots under the ghost.
- **Where the ghost shows.** With a pointer, centred on the pointer. With the keys or a gamepad, over the focused node, 12 px up and to the right. It slides from node to node over 80 ms. The ghost moves by its `transform`, so its surface does not lay out again.
- **The slot under the carry.** With a pointer, the hit node or its nearest parent that is a slot. With the keys or a gamepad, the focused node or its nearest parent that is a slot.
- **Enter and leave.** When the slot under the carry changes, the old slot gets `leave`. The new slot gets `enter` if it accepts the carried item. Over a slot that does not accept it, the ghost shows at 50 % opacity.
- **Returning.** Escape, B and `cancel()` give the carried item to `onReturn`, with the slot that it came from last. The owner puts it back, for example in that slot or the first empty one. A press off each surface, and the close of the slot's surface, do the same.
- **Escape first.** `UICarry` takes the Escape key down before the nodes of the focus scope, and prevents its default. So Escape returns a carried item and the modal round the slots stays open. A second Escape closes the modal.
- **The keys and the gamepad.** Each slot must be focusable. Focus moves as normal while an item is carried.
- **Touch.** A tap clicks. A tap has no right button, so touch takes only `'all'`. There is no drag, so a scroll container of slots pans as normal.
- **Across surfaces.** The carry surface is over each screen surface, so an item goes from a slot on one surface to a slot on another.
- **World surfaces.** Stage 5 carries on screen surfaces only. On a world surface, the ghost must draw on that surface, at the ray's point.
- **Debug.** `printUIFocus` also prints the carried item, the slot it came from and the slot under it.

### Room for later

Stage 5 does not build these. The API leaves room for each one, so none of them changes the slots of Stage 5.

- **Items that span cells**, such as an item 1 by 3. The carried item gets a size in cells. The slot under the carry is the cell under the ghost's top left cell, not under the pointer. `Grid` gives the rectangle of a range of cells, and the item draws over the cells there. `accepts` refuses a place where the item does not fit. `put` gives back the one item that the new item covers.
- **A press off each surface** returns the item in Stage 5. The game can give it a callback of its own, for example to drop the item in the world.
- **Drag** can come back as a second way to pick up, if players ask for it. It ends in the same state, so the slots do not change.

### Images

Mica needs two kinds of image:

- **Small images**, such as icons of items: many of them, at 32 to 256 px, often on one screen.
- **Large images**, such as pictures: up to 1024 by 1024 or more, many over a session, a few on one screen.

One atlas cannot serve both. A 1024 image fills a quarter of a 2048 layer. To grow the atlas, the renderer must copy each layer. Freed images leave holes. And one texture per image puts each small image in its own draw call. So Mica keeps the two apart, behind one API and one shader path.

```ts
// The usual way: the node loads the image, and holds it while it is on a surface.
const fox = new Image({ src: 'animals/fox', style: { width: 320 } });

// Images drawn by code have a name, not a key to load.
renderer.ui.images.add('circle', canvas);
const circle = new Image({ image: 'circle' });

// Load ahead, so a screen opens with its images ready. Release when done.
await renderer.ui.images.load('animals/fox');
renderer.ui.images.release('animals/fox');

// Each platform can load keys in its own way.
renderer.ui.images.loader = (key) => loadFromPackage(key);
```

**Keys, not URLs.** An image has a key, such as `animals/fox`. The images' `loader` turns a key into an image. Nodes and screens name only keys, so they do not change from one platform to another. Only the loader does:

- **The web.** The default loader takes the key as a URL, and fetches and decodes it. The game sets a loader that maps each key to its hashed file name. See Publishing.
- **Headsets and handhelds.** A loader can read a compressed texture made for the device, or a file in the app's package.
- **Code.** A loader can draw an image, as the inspector does.

A loader gives a source, and can also give a `pixelRatio` and a `url` for the DOM mirror. `UIImages` closes an `ImageBitmap` that a loader gives, after it copies it.

**`src` and `image`.** A node's `src` is a key. While the node is on a surface, it holds one count of its image, and its image loads if it is not loaded. When the node leaves the surface, or the surface leaves the renderer, it gives the count back. A node's `image` is a name, and holds nothing. Use it for an image that code added, or one that something else holds. Setting `src` also sets `image` to the same key.

- **Small images** fit a block of 512 texels with a border of 4 texels round them, so they are 504 texels or less on each side. They share an atlas: a texture array of 2048 by 2048 layers. A buddy allocator gives each image a square block of a power of two in size, 16 to 512 texels, with the border inside the block. A block is cleared before it takes an image, so the border is clear. When the four blocks that one block split into are all free, they join again, so the space is used again. When the layers are full, `UIImages` adds a layer. It makes a new array, copies the old layers on the GPU and makes the bind groups again. A layer with mips is 22 MB, and small images rarely fill one.
- **Large images** are larger than 504 texels on a side. Each one has its own texture, up to the device's `maxTextureDimension2D`. A 1024 by 1024 image with mips is 5.6 MB.
- **One shader path.** The shader samples a `texture_2d_array` in a second bind group. The atlas is that array. A large image is an array of one layer. The primitive holds the layer and the texture rectangle.
- **Draw calls.** A surface draws in runs of primitives with the same image texture, as with effects. All small images are in one run, so a screen of slots draws in one call. Each large image adds one draw call. A page of 12 pictures adds 12, which is small next to the scene.
- **Lifetime.** Each node with a `src` on a surface counts once for its key, and so does each `load` and `add`. Each `release` takes one away. A node whose image is not loaded draws nothing.
- **The cache.** At zero, an image is not freed at once. It goes into a cache of unused images, so a node that comes back, such as in a list that is built again, finds it ready. When the cache holds more than `cacheBytes`, 64 MB by default, the image that was used longest ago is freed. A large image's texture goes, and a small image's block is free again. `clearCache()` frees every unused image now. A node that names a cached image with `image` still draws it, until the cache frees it.
- **Loading.** The default loader decodes with `createImageBitmap`, off the main thread. `copyExternalImageToTexture` writes the image, and one render pass per level makes the mips. A second `load`, `add` or `src` of a key that is loaded, loading or cached only counts. `add` takes an `ImageBitmap`, a canvas or an `OffscreenCanvas`. For an `img` element, make an `ImageBitmap` of it first.
- **Decoding.** The decode uses `premultiplyAlpha: 'none'` and `colorSpaceConversion: 'none'`, because macOS zeroes the colour of clear texels in a premultiplied decode. The copy to the texture then premultiplies, with `premultipliedAlpha: true`. So filtering and mips work on premultiplied texels, and clear edges do not go dark.
- **Colour.** The textures are `rgba8unorm`, not `-srgb`. Mica blends sRGB values into a plain canvas format, and images must match the theme colours.
- **Mips.** Atlas layers have 3 levels: full, half and quarter size. A block of a power of two, on a multiple of its size, stays on whole texels at each level. The border is still one texel at the quarter level, so neighbours stay apart. The shader keeps texture coordinates half a texel inside the image. Large images have all levels. The shader picks the level from the image's size on the target.
- **Drawing.** `node.image` draws in the content box, after the node's box and before its icon and text. `objectFit` places it as in CSS: `fill`, `contain` (the default) or `cover`. `cover` crops by texture coordinates, so no texel outside the image shows. The image takes the node's rounded corners and its clip.
- **Size.** An image node with no width or height takes the image's size in CSS pixels. That is its texel size over its `pixelRatio`, a `load` and `add` option, 1 by default. With only a width or only a height, the other side keeps the image's aspect ratio. Padding and border go round the image. Before the image loads, it has no size. Give a size to a node that must not move when it loads.
- **Children.** An image node lays out its children, unlike a text node. The children draw over the image and do not size the node, so an image can hold a grid.
- **Stats.** `UIRenderer.stats` gives the image count and the image memory. `UIImages.stats` splits the count into small, large and cached, and gives the cached memory. The inspector shows them under each example.
- **The DOM mirror** draws an image node's image as a background in its content box, with the `background-size` that matches its `objectFit`. So its children draw over it, as in Mica.
- **Publishing.** The game build copies the game's images to `public/images` under hashed names, the same as the font. It writes a map from each key to its hashed URL, and the game's loader reads it. Nodes never see the hashed names. The inspector's images are drawn in code, so it needs none.
- **Later: compressed textures.** KTX2 files with BC7 on desktop and ASTC on headsets and handhelds cut a 1024 image to 1.4 MB with mips. Only the loader changes, and `UIImages` takes the compressed data it gives.

### Grid

`Grid` is a component over flex. It is not CSS grid.

```ts
const grid = new Grid({
  columns: 6,
  rows: 4,
  cellSize: 64,
  gap: 6,
  cell: (column, row, index) => new Cell(index).node,
});
grid.cell(2, 1); // the node in column 2, row 1
grid.cells; // all the nodes, row by row
grid.rect(1, 0, 3, 1); // the rectangle of 3 cells from column 1, row 0, from the grid's top left
```

- **Layout.** One row that wraps, `columns * cellSize + (columns - 1) * gap` wide. Each cell has a fixed width and height, with no grow and no shrink. So each row holds `columns` cells, and each cell is at its column and row. The grid sets its own size, padding, border, direction, wrap and gap, so its `style` leaves them out. It does not shrink.
- **Rectangles.** `rect` gives the rectangle of a range of cells, with the gaps inside it, from the arithmetic and not from layout. `cell` and `rect` throw outside the grid.
- **Cell size.** A number gives square cells. `{ width, height }` gives other shapes.
- **Focus.** Spatial focus moves work by rectangles, so the d-pad moves through the cells with no code in `Grid`. The cell's node decides if it is focusable.
- **Over an image.** Put the grid on an image with `position: 'absolute'`, `top` and `left`. The grid draws the cells and the image draws only what is behind them. So a change to the grid needs no new art.

**Why not CSS grid.** A grid of slots is a fixed lattice of equal cells. Flex with wrap gives that exactly. CSS grid is worth its cost for tracks of mixed sizes and for items that span cells. Items that span cells do not need grid layout either. They draw over the cells, at a rectangle that `Grid` works out. See Room for later.

### The inspector examples

Each example tests one API. The content is neutral: coloured shapes, numbered tiles and test images.

**Images**

- **Sizes.** Shapes at their size, at half and at a quarter, with a box, text and an icon. The counts show one draw call.
- **Object fit.** A wide image in wide and tall boxes, with each `objectFit`.
- **Corners and clips.** An image in a round box, in a box with a rounded border and padding, cut by a parent with `overflow: 'hidden'`, and at half opacity.
- **Natural size.** An image with no size, one with a pixel ratio of 2, one with only a width, and one with padding and children over it.
- **From a URL.** The inspector's test image, with its URL as the `src`, through the default loader. It is a large image.
- **Large images.** Six 1024 by 1024 test images with a `src` each, from a loader that draws them. Buttons show and hide the nodes, and clear the cache. The counts show one draw call more for each image, and the memory in use and in the cache.

**Grid**

- **Cells.** A 6 by 4 grid of square cells, next to its DOM version.
- **Cell shapes.** A grid of cells that are wider than they are tall.
- **Over an image.** A grid on a framed panel image, at an offset from its top left.
- **Focus.** Focusable cells. The arrow keys and the d-pad move through them.

**Carry**

- **Move.** Two rows of slots with shapes in some of them. A click shows each row of the one rule: take, put, exchange and nothing.
- **Accepts.** Slots with a coloured border take only shapes of their colour. Over a slot that refuses, the ghost fades and the slot does not light.
- **Stacks.** Numbered tiles that merge up to 10 in a slot. With nothing carried, the right button, Shift+Enter and X take half a stack. With a stack carried, they put one tile and the rest stays carried. The rule is about 20 lines in the example, not in the library. The ghost shows the count.
- **Return.** Slots in a `Modal`. Escape and B return the carried item, and the modal stays open. Buttons call `cancel()`. A line shows each call to `onReturn`.
- **Across surfaces.** Slots in a `Modal` and slots on the surface under it. An item goes both ways.
- **Together.** A grid of slots over a panel image, with shapes in the slots. It checks that the parts work together: the grid on the image, and the ghost over the modal.

Each Carry example has a line under the canvas that shows the carried item and its count, such as `Carried: 7 × tile`.

**The art.** Drawn in code at start, with `images.add` from a canvas: shapes in a few colours, numbered tiles, a framed panel and large test images with a gradient and their number. So the examples need no files, and they test `add`. Real art can replace them later as PNG files in `inspector/images`, with no change to the examples except the load.

---

## Quality and performance

- **Layout** runs only for dirty surfaces.
- **The stream** uploads only for dirty surfaces. A changed value updates one instance.
- **Draw calls.** One per surface, plus one per custom effect pipeline in use.
- **Blur** only when a glass node is visible.
- **Stats.** `UIRenderer.stats` holds what the last render cost: surfaces, nodes, primitives, draw calls, and the layouts and stream writes with their times. The renderer publishes them to the perf panel. `ui layout` and `ui stream` are under `cpu`, recorded only on frames where they run, so the panel shows how often they run. `ui nodes`, `ui primitives` and `ui draw calls` are under `counts`. `gpu · ui` times the world pass, the blur, from the start of its first pass to the end of its last, and the draw pass. The inspector shows the counts under each example.

## The UI inspector

A small page for checking Mica by eye, like a much smaller Storybook.

```
npm run ui-inspector
```

- **Served** by esbuild, the same as the game, from its own entry and HTML page. It does not load the game, a level or the editor.
- **The list.** On the left, the parts of Mica to check: layout, boxes, text, icons, meters, buttons, focus, glass, scrolling, form controls, world surfaces, the look-at pointer, images, grids and carrying.
- **The examples.** A click on a part loads its examples on the right, drawn by Mica on a WebGPU canvas. An example is a small function that builds a tree.
- **Side by side.** A layout example also draws as DOM elements with the same styles, next to the Mica version. The two must match.
- **Tools.** The layout overlay, a light and dark theme switch, and a device pixel ratio switch.
- **Input.** Examples take mouse, keyboard and gamepad input, so hover, focus and clicks can be checked by hand.
- **The backdrop.** Glass examples draw over a test image, so the blur shows.

Each ticket adds examples for what it builds. A part is done when its examples look right in the inspector.

Mica runs on a bare `GPUDevice` and a canvas. It does not need the game's `Renderer`, so the inspector starts fast. The game's `Renderer` gives Mica its device, its canvas and, for glass, its frame.

## Debug views and commands

| In the game                | Does                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `setUILayoutOverlay(true)` | Draws the layout overlay on each surface: border boxes, margins, padding and clip rectangles, like the browser's |
| `printUITree(name?)`       | Prints the tree of a surface, or of all surfaces: each node's path, rectangle, text, icon, effect and style       |
| `printUIFocus()`           | Prints the focus scope, the focused node of each surface, and the node under each pointer                         |
| `addUIWorldPanel()`        | Stands a test glass panel 2 m in front of the camera, facing it. Its button logs a click. `clearUIWorldPanels()` removes them |
| `listActionTargets()`      | Lists the assets of the level that have actions: id, name, type, actions, and whether a portal is locked          |
| `doAction(target, action)` | Tells an asset to do an action, such as `doAction('Portal', 'unlock')`. The target is an id or a name             |

- **One overlay.** `UIRenderer.showLayout` sets the overlay on all its surfaces, and on surfaces made later. The inspector's switch uses it too.
- **What shows.** The overlay leaves out a surface whose root is hidden, and a node at opacity 0 with its children. A closed modal stays in its tree at opacity 0, and its boxes would hide the boxes that show.
- **Names.** `printUITree` and `printUIFocus` show each node's path, the child index at each level, such as `root/0/2`, and its `name` after a `#`. `name` is for debug output only. A component names its node by its kind, such as `#button`, unless its options give a `name`. The HUD names its bars, such as `#health`.
- **Pointers.** A locked mouse has no screen point, so in play `printUIFocus` shows no mouse pointer. Open the menu first. The look-at ray shows as pointer -2, with its point in the pixels of the surface it hits.
- **The code.** `printTree` and `printFocus` in `lib/debug.ts` return text, so tests can check them. `src/core/debug/UIDebugCommands.ts` puts them on the window.

---

## Out of scope

- CSS text, selectors, classes and the cascade.
- JSX.
- CSS grid layout. `Grid` is a helper over flex.
- In Stage 5: drag, items that span cells, stack rules in the library, dropping an item into the world, carrying on world surfaces, and compressed textures.
- Text input fields. Settings has none.
- Right-to-left text and complex scripts.
- Moving the main menu, project views or editor off the DOM.
- An XR session and XR controllers. World surfaces and the look-at ray are the parts they need.
- Actions on asset types other than the portal.
- Events that an asset fires, and more than one action per `action` property. Scripting adds these.

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
- **Stage 4's first use.** The personal assistant, whose Portal tab opens the level's portal. It replaced a WorldPanel asset placed in the level, because a menu on the hand proves the VR use better.
- **Which portal.** A level has at most one portal, so the Portal tab needs no target picker.
- **Target and action.** One `action` property holds both. The editor knows both halves must be set.
- **Where actions live.** In `src/core/routing/actions.ts`, shared by the game and the editor.
- **Glass in the world.** A world surface's blur uses last frame's image. The one-frame lag cannot be seen.
- **Closing a portal.** The Portal tab's Lock or Toggle button.
- **Which targets.** Any asset with actions in any container of the level.
- **A package.** `rewild-gpu-ui`, from the start. See The package.
- **The blur source.** `renderer.sceneColorTarget`, blurred at a quarter resolution with the tone map applied. See Glass.
- **Fonts.** One Roboto atlas with regular and bold.
- **Font sizes in the world.** 1,000 pixels per metre by default, so 1 pixel is 1 mm. See World surfaces.
- **Transitions.** Colours, opacity and `transform`. No layout properties. See Transitions.
- **Pausing.** The in-game menu and settings do what the in-game menu does today.
- **Drag.** None. Pick up and place only, as it is more common and simpler.
- **A click on a full slot.** The carried item goes in and the slot's item is carried, as in Minecraft. The slot's `put` decides, so a slot can merge or refuse.
- **Stacks.** The API takes an amount now, so slots can hold stacks. The stack rules stay out of the library. The Stacks example proves the API holds them.
- **Items that span cells.** Not in Stage 5. The API leaves room for them. See Room for later.
- **Names.** Library words only, in the API and the inspector. `UICarry` and "carry", not "hand". No bags or game items in the examples.
- **Examples.** One example for each API, with neutral content, not one demo of a bag.
- **The art.** Drawn in code for Stage 5. Real art can replace it later.
- **Freeing images.** Automatic. A node with a `src` holds its image while it is on a surface. At zero, the image goes into a cache with a memory limit, and the image used longest ago is freed first. `load` and `release` stay, to load ahead and to hold an image.
- **Other platforms.** Images have keys, and a loader that each platform can set turns a key into an image. Nodes do not change from one platform to another.

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

- [x] **3. Flex layout**

  - Scope: the flex subset and the rest of the Layout properties, percentages, min and max, measure functions. Unit tests with rectangles worked out by hand. The layout overlay in the inspector. Examples for layout.
  - Expect: the unit tests pass for a set of trees that cover each property. In the inspector, each layout example matches its DOM version.

- [x] **4. Meters and the HUD**

  - Scope: custom effects, the meter effect, the `Meter` component. The HUD bars move to Mica. The old GPU UI and its dead code go.
  - Expect: the bars look and act as today. `UIElement`, `GuiManager`, the UI passes and `TextRenderer` are gone.

### Stage 2: the menu

- [x] **5. Text v2**

  - Scope: the MSDF font code moved into the package. The Roboto MTSDF atlas and its build script, one text pipeline, the glyph primitive, line height, alignment, wrapping, clipping, ellipsis, text measuring for layout.
  - Expect: a label wraps and sizes its box, and is sharp at 12 px and 48 px.

- [x] **6. Icons**

  - Scope: the icon atlas from lucide icons, its build script, the icon primitive, the `Icon` component.
  - Expect: the settings icon draws sharp and tinted at any size.

- [x] **7. Events**

  - Scope: event types and phases, pointer capture, the hit test with clip and radius, mouse and touch sources, input taken from the game by an open surface.
  - Expect: a click on a nested node bubbles to its parent. A click on a menu does not reach the game.

- [x] **8. Focus and gamepad**

  - Scope: focusable nodes, tab order, spatial moves, gamepad and keyboard actions, the focus ring.
  - Expect: the d-pad moves between buttons, A clicks, B closes the modal.

- [x] **9. Theme and glass**

  - Scope: theme values from the document, light and dark. The backdrop blur from `sceneColorTarget` and glass rects. Box shadows, with an outset quad and the distance to the edge in the base shader, which effects can also use. `transform` and transitions.
  - Expect: in the inspector, a Mica glass panel next to a DOM glass panel over the same test image looks the same, in light and dark.

- [x] **10. The in-game menu and game over**

  - Scope: `Label`, `Button`, `Modal`, `Stack`. The in-game menu and game over move to Mica. Settings still opens the DOM panel.
  - Expect: Escape opens the menu. Resume, Settings and Quit work by mouse, keyboard and gamepad.

- [ ] **11. Stats and debug**

  - Scope: perf panel counts and times, the layout overlay in the game (shared with the inspector), the tree and focus console commands.
  - Expect: the perf panel shows UI cost, and the overlay shows each node's box.

### Stage 3: settings

- [x] **12. Popups**

  - Scope: popup surfaces placed next to a node and kept on screen, closed by a click outside, Escape or B. Focus moves into the popup and back.
  - Expect: a test popup opens under a button, stays on screen at the edges, and closes with each of the three.

- [x] **13. Form controls**

  - Scope: `Tabs`, `Select`, `Slider`, `Switch`, `Field`, `Divider`, `InfoBox`, each with mouse, keyboard and gamepad input. Scrolling: `overflow: 'scroll'`, the wheel, touch, scrollbars, focus into view and the right stick.
  - Expect: each control works with the gamepad alone. The slider follows a drag off its track. A long tab panel and a long select list scroll with each input.

- [x] **14. Settings in the game**

  - Scope: the in-game settings panel, bound to the same settings data as the DOM panel. Settings in the in-game menu opens it.
  - Expect: each setting in the DOM panel is in the in-game panel, and a change in one shows in the other.

### Stage 4: in the world

- [x] **15. World surfaces**

  - Scope: surfaces on a quad, drawn in the scene with depth, a plain glass back, the glass backdrop.
  - Expect: a test panel stands in the world. The player walks round it and sees its back, and the terrain can hide it.

- [x] **16. Look-at pointer and crosshair**

  - Scope: ray to surface pixel, the look-at ray source, reach, blocking by the scene, the crosshair, click by mouse, E and gamepad A.
  - Expect: looking at a button within reach shows the crosshair and lights the button. Past reach, or from behind, nothing shows.

- [x] **17. Locked portals and actions**

  - Scope: `actions.ts` with the portal's actions. `doAction` on the portal. The `locked` property and its editor entry. The locked state saved as behaviour state. Find an asset by id across the level's containers.
  - Expect: a locked portal stays closed when the player walks up to it. A console call to `unlock` opens it as the player nears it, and it stays unlocked after a save and a load. A portal that is not locked works as today.

- [x] **18. The `action-select` editor**

  - Scope: the custom editor with target and action dropdowns, filled from `assetActions`. The action clears when the target changes. An incomplete action shows as an error.
  - Expect: picking a portal as the target lists Unlock, Lock and Toggle, and the value saves as one `action` property.

- [x] **19. The personal assistant**

  - Scope: `UISurface3D` and the renderer collecting it from the scene. `depthTest: false` on world surfaces. A mouse ray into `UIInput.ray`. `PersonalAssistant` with the hand, the open and close move, the hologram glass, the tab column, the Portal tab and the Close button. I, the mouse freed and locked again, and no pause while it is open.
  - Expect: in the game, I brings the panel up from the right side to cover most of the view, and the level shows through it. The mouse is free, and Unlock on the Portal tab unlocks the level's portal. I takes the panel down and locks the mouse. The Close button takes it down and locks the mouse. A wall in front of the player does not hide the panel.

- [x] **20. A model for the player's arm**

  - Scope: the `first-person-arms` model on the assistant's rig, with its raise, hold and lower clips. The panel comes out of the `watch` bone, and sits clear of the raised hand.
  - Expect: opening the assistant raises the left arm, and the panel comes out of the watch on its wrist. Closing puts the panel back into the watch, and then the arm goes down.

### Stage 5: carrying

- [x] **21. Images**

  - Scope: `UIImages`: `load`, `add` and `release` with counts. The atlas for small images, with the buddy allocator, the border, mips and new layers. A texture for each large image, with mips. The second bind group and runs by image texture. The unpremultiplied decode. The `image` primitive, `node.image`, `objectFit` and the image's size in layout. The `Image` component, the `img` in the DOM mirror, the stats, and hashed image files in the game build. The Images examples, with images drawn in code.
  - Expect: an image draws sharp at its size and does not shimmer at a quarter of it. Each `objectFit` matches its DOM version. A surface of boxes, text, icons and small images draws in one call. Six large images add six calls. Releasing them frees their memory, and the stats show it.
  - Then: keys and a loader that each platform can set, `src` on nodes and `Image`, counts that follow nodes on and off surfaces, and the cache of unused images. The hashed image files in the game build wait for the game's first image.

- [x] **22. Grid**

  - Scope: the `Grid` component, `cell` and `cells`. Unit tests for the cell rectangles. The Grid examples.
  - Expect: each Grid example matches its DOM version, and the d-pad moves to each cell.

- [ ] **23. Carry**

  - Scope: `UICarry`: slots with `take`, `put`, `accepts` and `ghost`, the one rule, amounts, the carry surface and the ghost, enter and leave, `onReturn`. The mouse, touch, the keys, the gamepad and Escape first. The carried item in `printUIFocus`. Unit tests for each row of the one rule, each amount and each way to return, with a fake input.
  - Expect: an item goes from slot to slot by the mouse, a tap and the gamepad. A click on a full slot exchanges the two items. Escape returns the item, and the modal stays open.

- [ ] **24. The Carry examples**

  - Scope: the Carry part in the inspector: Move, Accepts, Stacks, Return, Across surfaces and Together, each with its state line. The stack rule in the Stacks example.
  - Expect: each example works by each input. Tiles merge to 10, and the right button takes half and puts one. Together draws the grid on the image, and the ghost over the modal.

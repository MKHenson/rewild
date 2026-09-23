# Authored art

By default the tool makes its own bark, leaves, grass and fronds. To use your own images, put them in
a folder under `tools/scatter-forge/sources/` and name that folder in the config.

This art is not in git. A fresh clone has empty source folders, so it uses the generated art.

[Back to scatter-forge](README.md)

## The rules

- An empty list, such as `"bark": []`, uses the generated art. The run says so.
- A listed folder that is missing, or that has a problem, stops the run. The message tells you what
  is wrong. The tool never falls back to generated art for a folder that you named.

| Key | Folder | Types |
| --- | ------ | ----- |
| `bark` | `sources/bark/` | `tree`, `crown` |
| `leaves` | `sources/leaves/` | `tree` |
| `blades` | `sources/clump/` | `clump` |
| `fronds` | `sources/fronds/` | `crown` |
| `stamps` in `accents` | `sources/accents/` | `tree`, `clump`, `crown` |

## The files in a folder

A folder holds one or more image **sets**. The files of one set share a prefix, and the tool finds
each map by its suffix:

```
tools/scatter-forge/sources/leaves/oak/
  oak-a-diff.webp   the colour. The alpha is the cutout shape.
  oak-a-arm.webp    optional. Occlusion, roughness and metallic.
  oak-a-disp.png    optional. The height.
  oak-b-diff.webp   a second set
  source.json
```

| File | Format | Required |
| ---- | ------ | -------- |
| `-diff` | Lossless WebP, sRGB | Yes |
| `-arm` | Lossless WebP, linear | No |
| `-disp` | 16-bit greyscale PNG, linear. An 8-bit height is refused. | No |

### Maps made from the colour

If a set has no `-arm` or no `-disp`, the tool makes it from the `-diff`. It reads dark pixels as
low and bright pixels as high. A set with only a `-diff` is a full source. The run says which maps
it made.

This works well for most art. A dark mark on a flat surface is read as a hole, so for that case,
supply your own map.

### Pick some sets from a folder

A list entry can be `folder/pattern`. Then only the sets whose prefix matches the pattern are used.
`*` matches any run of characters and `?` matches one character:

```json
"fronds": ["palm/palm-01", "palm/palm-02", "palm/green-*"]
```

If a pattern matches nothing, the run stops and lists the prefixes in the folder.

## Bark

```json
"bark": ["oak/oak-01"]
```

- The list holds **one** entry. A bark is one tile.
- If the folder holds more than one set, name the one you want as `folder/set`.
- The tile must repeat with no seam on both edges.
- Draw the length of the bark **down** the image and the ring round the trunk **across** it.
- The tile keeps its shape. `textureSize` (or `barkTextureSize`) is the most its long edge can be.
  A larger tile is made smaller. A smaller tile is never made larger.

`source.json`:

```json
{ "widthMetres": 1.0, "depthMetres": 0.02 }
```

| Key | Required | What it means |
| --- | -------- | ------------- |
| `widthMetres` | Yes | How far round the trunk one tile goes, in metres. This keeps the bark at its real size. |
| `depthMetres` | Yes | How deep the bark's height map cuts, in metres. This sets the strength of the normal map. |

## Leaves

```json
"leaves": ["oak", "poplar"]
```

- The list can hold many folders. All their sets go into one leaf texture.
- Each set is one leaf. Draw the stem at the **bottom-middle** and the tip at the **top-middle**.
- The tool reads the leaf's size from its alpha, so the image can have space round the leaf.
- The image does not have to be square.

`source.json`:

```json
{ "lengthMetres": 0.09 }
```

| Key | Required | What it means |
| --- | -------- | ------------- |
| `lengthMetres` | Yes | The length of the leaf from stem to tip, in metres. |
| `depthMetres` | No | How deep the leaf's height cuts. Without it, the tool uses a standard strength. |

### How leaves fill a card

`leafSize` divided by `lengthMetres` is how many leaves fit on one card.

- Many leaves on a card: the tool makes a spray of leaves on each cell. The texture has a 4x4 grid.
- One leaf on a card: each cell holds one leaf. The texture has a 1x1 or 2x2 grid.

`leafGrid` sets the grid yourself. If the run says that it had to make a leaf image larger, give it
a larger source image.

## Clumps and fronds

```json
"blades": ["meadow", "clover"]
"fronds": ["palm/palm-01", "palm/palm-02"]
```

- Each set is one whole tuft or one whole frond. Each set gets one square cell in the texture.
- Draw the base at the **bottom-middle** and the top at the **top-middle**. The tool does not turn
  the picture.
- The grid is the smallest square that holds all the sets. For example, 4 sets make a 2x2 grid and
  10 sets make a 4x4 grid with 6 empty cells. The cards use only the filled cells.
- A frond uses only a column of its cell that is `cardAspect` wide. If the frond is wider, the card
  cuts its sides and the run tells you the `cardAspect` to use.

`source.json` for a clump:

```json
{ "heightMetres": 0.4 }
```

`source.json` for a frond or an accent:

```json
{ "lengthMetres": 3 }
```

`depthMetres` is optional in both.

## Colour-only art

The `cardinal-flower-01` template uses a `fronds` folder that holds only three `-diff` images. The
tool makes the other maps. Copy it for any plant that you have as a cut-out photograph.

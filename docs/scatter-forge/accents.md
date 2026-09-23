# Accents

An accent is a second group of cards on a model. Each accent uses its own art. Use accents for a
fern's spires, a poplar's catkins, fruit, or a palm's skirt of dead fronds.

Accents work on `tree`, `clump` and `crown`.

[Back to scatter-forge](README.md)

This page has no comparison images. Accents always need authored art, and that art is not in git.

## How an accent is different from a leaf

A leaf card follows its branch. An accent card points from **straight up**, whatever it hangs
from. `pitch` sets its angle from up. `0` stands straight up, like a spire. `180` hangs straight
down, like fruit.

## Where accents go

The type decides the places where accent cards attach:

| Type | Where the cards attach |
| ---- | ---------------------- |
| `tree` | Along the leaf branches (`attach: twigs`), or at the points where branches divide (`attach: forks`). |
| `crown` | At the top of the stem, or along a part of the stem that `depth` sets. |
| `clump` | At the centre of each tuft. |

Accent cards move with what they hang from, so fruit swings with its branch in the wind.

## Add an accent

`accents` is a list. Each entry is one group of cards:

```json
"accents": [
  { "stamps": ["poplar"], "count": 0.35, "pitch": 175, "length": 0.45 }
]
```

| Key | Default | What it does |
| --- | ------- | ------------ |
| `stamps` | required | The folders under `sources/accents/` for the art. You can also use `folder/pattern`. |
| `count` | required | How many cards go at each attach point. A fraction is a chance: `0.35` puts a card on about one in three points. `0` adds no cards. |
| `pitch` | required | The angle from straight up, in degrees. `0` stands up. `180` hangs down. |
| `length` | required | The card height, in metres. |
| `variance` | `10` | A random change to `pitch`, in degrees. |
| `aspect` | `0.5` | The card width as a fraction of its height. If the art is wider, the card cuts off its sides and the run tells you. |
| `segments` | `1` | How many segments go along the card. Use `1` for fruit. Use `4` for a spire or a frond that bends. |
| `curve` | `0` | How far the card bends toward the ground, in degrees. |
| `flutter` | `0.25` | How much the card moves in the wind. A heavy dead frond uses less. |
| `attach` | `twigs` | Tree only. `twigs` or `forks`. |
| `depth` | `[0, frondSpan]` | Crown only. The part of the stem to attach to, as two fractions down from the top. `[0, 0]` is the top only. |

Examples from the templates:

| Template | Accent |
| -------- | ------ |
| `poplar-01` | Catkins: `count 0.35`, `pitch 175`, `length 0.45` |
| `fern-02` | Spires: `count 3`, `pitch 8`, `curve 25` |
| `palm-03` | A skirt of dead fronds: `count 14`, `pitch 155`, `length 5.5`, `depth [0.3, 0.42]` |

## Cost

An accent adds no new draw call. Its cards go into the model's cutout piece, and its art goes into
the same texture as the leaves or fronds.

The cost is texture space. Each accent picture takes one cell of the texture. On a tree, this can
make every leaf cell smaller. The run prints the cell sizes.

A LOD tier keeps all of its model's accents.

## Accents and shared textures

A variant with `skipTextures` finds its accent art in the texture set that is already there. So the
config that **writes** the texture set must list every accent that the family uses. Use `count: 0`
if that config does not want the cards itself.

For example, `palm-01` writes the `palm` set. It lists the dead-frond accent at `count 0`, so that
`palm-03` can use it.

## The art

There is no generated accent art. `stamps` is required. If a folder is missing, the run stops.

An accent folder has the same layout as a frond folder. See
[Authored art](authored-art.md#clumps-and-fronds).

Draw each picture with its attach point at the **bottom-middle**. The top of the picture points away
from the attach point. So draw catkins that will hang with their twig at the bottom and the catkins
pointing up. The card turns the picture over when it hangs.

The tool reads the size of the picture from its alpha. Remove any stray pixels far from the main
shape, because they make the useful part smaller.

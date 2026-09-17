# Article export

`index.html` is the tutorial as semantic HTML, with every asset on a relative
path in `assets/`. No theme CSS, so it should inherit site styles on import.

```
article/
  index.html              the article
  article.md              the same text as markdown
  assets/                 videos and images, numbered in reading order
  featured-1200x900.jpg   featured image, 4:3
  hero-4x3.mp4            4:3 cut of the hero, for the Creative Hub
```

## Notes for import

- Code blocks are `<pre><code class="language-jsx">`, which is the Prism
  convention, so they should map onto Prismatic blocks.
- Videos are `<video autoplay loop muted playsinline controls>`. They are all
  short loops with no audio. Drop `controls` if the theme prefers.
- Every video carries a `poster` still of the same name, so nothing flashes
  empty before it loads.
- Assets are numbered in the order they appear.
- The `<h1>` is a comment at the top rather than a heading, since the CMS
  usually owns the title.

## Assets

| File | Section |
| --- | --- |
| `00-hero.mp4` | cover |
| `01-trail-field-raw.mp4` | The Trail Field |
| `02-flat-array-indexing.mp4` | Filling the grid |
| `03-v6-engraving.mp4` | Filling the grid |
| `04-v3-filmstrip.png` | Decay |
| `05-source-texture.mp4` | The source texture |
| `06-write-and-read.mp4` | Connecting the grid to a shader |
| `07-uv-warp.mp4` | Reading the flow |
| `08-brush-decomposition.mp4` | Creating the brush |
| `09-brush-swap.mp4` | Writing your own |
| `10-speed-color.mp4` | Coloring by speed |
| `11-mask-to-text.mp4` | Masking it to the letters |

Diagrams 02, 03, 06, 07 and 08 are rendered from animated SVG; the vector
sources live in the tutorial repo if larger or restyled versions are needed.

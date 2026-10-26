# Changelog

## 1.0.1 (2026-10-26)

- Fix: a zone label that wraps (long labels on the phone layout) now grows upward into the gap above its zone. It used to grow down over the first node. A test pins it.

## 1.0.0 (2026-10-26)

First release as a standalone library. The drawing engine was written for the system drawings on cadi27tech.github.io (case-study pages, October 2026); this release lifts it out of the site build.

- `sheet(spec, { mode, theme, fonts })`: finished SVG with ground, grid, frame, drawing number and revision; fonts can be embedded so they survive inside an `<img>`.
- `drawing` and `layout`: the wide (column grid) and phone (single column, side-channel edges) layouts, with layout rules that throw instead of drawing a crossing connector.
- `pixelWord` and `pixels`: a 5x7 dot-matrix face covering A to Z, 0 to 9 and `- . : /`; unknown characters throw.
- CLI: `bin/blueprint.mjs` renders spec files to `<name>.svg` and `<name>-m.svg`.
- 13 tests on `node:test`, run in CI.

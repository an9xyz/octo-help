# Mario theme: rendering research and implementation brief

Date: 2026-07-12

## Current product facts

- The extension already ships PixiJS 8 and `pixi-filters`; the production MAIN-world bundle is 739.78 kB raw and 192,924 bytes gzip-equivalent.
- The current production extension is 3.51 MB. Most of the asset weight is existing player PNGs and spin strips, not the Pixi runtime itself.
- The Pixi overlay already has the right performance foundations: a 1.8M backing-pixel budget, capped render ratio, stopped ticker while idle, disabled interaction hit testing, pooled particles, active-shot limits, and quality degradation under load.
- PixiJS 8 officially supports WebGL/WebGPU application initialization and a ticker that can be stopped when idle and capped with `maxFPS`.
- Matter.js 0.20.0 is a general-purpose 2D physics engine. It would add a second simulation loop and collision system for a sequence whose contacts and camera framing are known in advance.
- Rive's web runtime supports state machines and manual render-loop control, but adds a WASM/runtime and a `.riv` authoring pipeline. Its current Canvas Lite package is 2.38.5.
- Three.js is a 3D renderer. It would require 3D models, camera, lighting, materials, animation clips, and resource disposal for an effect whose target visual language is fundamentally 2D pixel art.

Sources:

- PixiJS Application: https://pixijs.com/8.x/guides/components/application
- PixiJS Ticker: https://pixijs.com/8.x/guides/components/ticker
- Matter.js API 0.20.0: https://brm.io/matter-js/docs/
- Rive Web runtime: https://rive.app/docs/runtimes/web/web-js
- Three.js fundamentals: https://threejs.org/manual/en/fundamentals.html
- Package versions and unpacked metadata: npm registry, checked 2026-07-12

## Recommendation

Use the existing PixiJS overlay. Do not add Matter.js, Rive, or Three.js for this theme.

Render the recognizable character, question block, and mushroom as tightly packed transparent WebP/PNG sprite sheets. Use Pixi primitives and the existing glow/particle textures only for non-branded effects such as dust, contact sparks, shadow, and impact rings. SVG is appropriate for the question block if it is intentionally crisp at arbitrary scale, but a hand-authored SVG character will look less faithful than a properly animated sprite sheet.

The motion should be deterministic and authored as a finite-state sequence, not delegated to a general physics engine. A fixed-step integrator can still provide gravity and velocity continuity while exact contact frames keep the animation readable and repeatable.

## Motion system

Narrative role: a short reward interaction attached to the Mario theme, not a persistent game layer.

Audience distance: laptop viewing at normal chat-app scale. The character must remain legible at roughly 96-144 CSS px tall.

Visual temperature: playful and energetic, with restrained screen effects so the chat surface remains usable.

Capacity: one character, one block, one mushroom, one ground shadow, and at most 24 pooled impact/dust particles. No full-screen decorative layer while idle.

Proposed 1.8-2.2 second sequence:

1. Anticipation, 80-110 ms: character crouches 6-8%, shadow widens, body leans opposite the jump.
2. Launch, 260-320 ms: vertical velocity drives the jump; one stretch frame at takeoff, then a compact airborne pose.
3. Contact, one authored frame: the head meets the underside exactly. The block moves up 8-12 px, the character compresses vertically, and a small four-direction contact burst appears.
4. Rebound, 220-280 ms: the block returns with a critically damped spring; the character reverses velocity and lands with a 2-3 px settle. The page itself does not shake.
5. Reward, 300-380 ms: the mushroom rises from behind the block with slight overshoot, preserving occlusion order.
6. Collect, 260-340 ms: the mushroom follows a short readable arc into the character. The character flashes for 2-3 frames and grows from 1.0 to about 1.32 with bottom-center anchoring, a brief overshoot, and final settle.
7. Rest: all transient nodes are returned to pools and the Pixi ticker stops.

## Theme integration

- Add `mario` as both a message skin and a whole-site color theme only if the user wants full replacement; otherwise ship it first as an independent effect selector to avoid coupling visual skin and animation state.
- Use sky blue, warm cloud white, brick red, coin gold, pipe green, and near-black outlines. Keep message cards quiet; concentrate the branded detail in dividers, selected states, the question block, and the character scene.
- Trigger once when the theme is selected, then replay only through an explicit click on the question block or character. Do not autoplay repeatedly and do not hijack every page click.
- `prefers-reduced-motion: reduce` should replace the sequence with a single block bump and static mushroom reveal, with no growth flash or particles.

## Performance acceptance criteria

- Zero ticker work while idle; one canvas shared with the current Pixi renderer.
- Maximum 60 FPS, with a 30 FPS fallback when measured frame time stays above 20 ms for several frames.
- No new full physics engine or 3D runtime.
- New branded raster assets target <= 350 kB total after sprite-sheet packing and WebP/PNG comparison.
- No more than 24 live particles, no bloom over the full viewport, and no shockwave displacement filter for this sequence.
- At 1440x900 and DPR 2, the existing 1.8M pixel budget remains in force.
- Verify idle CPU/GPU, repeated replay, resize, tab backgrounding, reduced motion, and WebGL context loss.

## Asset checkpoint

The supplied screenshot is a composition reference, not a production-ready character asset. A convincing result needs either:

- user-approved, properly licensed Mario/question-block/mushroom sprite assets, or
- an original red-capped platform-hero interpretation that avoids distributing extracted Nintendo game assets.

This is a product/IP decision rather than a rendering decision. Implementation should not begin until that asset direction is confirmed.

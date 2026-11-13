# Orbit Dice

A single-die space roller with a floating 3D die, the supplied pixel-art space background, and a moving rocket. Click or tap the scene, or press Space, to roll. The upward face is the result, and each roll is recorded in the hidden flight log.

Click the purple planet to open the hidden flight log. It shows the total roll count and how many times each face has appeared. The log survives refreshes in the same browser tab. Escape closes it. Reduced-motion preferences are respected.

Click or tap the moving rocket to open the achievements archive. All ten missions unlock silently. Open the archive to see progress and earned checkmarks. Close it with X, Escape, or a click outside. The modal blocks new rolls while open; a roll already spinning still completes normally.

The flight log and achievements belong to the current tab. Switching windows or refreshing keeps progress. Opening the game again after closing it starts a new session.

## Run locally

Serve the `dist` directory over HTTP, then open the address printed by your server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Then visit `http://localhost:8000`.

The page is plain HTML, CSS, and JavaScript, with no installation or build step. The supplied background is `dist/space-background-user.png`; `dist/rocket.png` contains the extracted rocket artwork. Assets and system fonts are included locally, so the scene also works without an internet connection when served locally.

## Check the die results

Run `python3 tools/verify-die.py` from the project folder. This checks all six landing poses against the actual mesh normals and counts the pips in the model's embedded texture. The model has a baked 22° rotation, which the landing poses account for.

With Node.js installed, run `node tools/test-achievements.mjs` to check all ten achievement rules, threshold timing, sequence resets, overlapping unique windows, persistence, corrupted saves, and duplicate-unlock prevention. Node.js is only needed for this optional check, not to run the game.

## Included 3D model

`dist/dice.glb` contains one red die mesh adapted from Grab3D's [Dice model](https://grab3d.com/models/toys/dice/). The source model is offered under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original download contained a set; this project includes only the red die, with a red body and white pips texture.

The model viewer runtime is [Google `<model-viewer>` 4.1.0](https://github.com/google/model-viewer), distributed under the Apache License 2.0. Its license is included as `MODEL-VIEWER-LICENSE.txt`.

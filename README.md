# Portfolio — Witold Korzeniewski

Live: https://witekko.github.io/Portfolio-site/

An immersive one-page portfolio:

- a signature written in particles turns into a 3D head (one photo + a depth map from Depth Anything V2),
- a robot arm, solved with inverse kinematics, hands over each project card (video in CSS3D),
- clicking a card brings it up close with the full story and links,
- at the end the robot takes a pen and signs.

Built with plain HTML, CSS and JavaScript + [Three.js](https://threejs.org) (no build step).

| Path | What |
|---|---|
| `index.html`, `src/` | the site |
| `assets/` | photo, depth map, project videos, thesis PDF |
| `legacy/` | the first, Bootstrap version of this portfolio |
| `prototype/hero-diffusion/` | an early hero experiment |
| `POMYSLY.md` | ideas and next steps |

Run locally with any static server from the repo root (the photo is read into a canvas, so `file://` won't work), e.g. `npx serve .`.

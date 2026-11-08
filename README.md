# City-Res

An interactive portfolio built as a small 3D city: districts are fields of work, buildings are projects, and a building's height and footprint come from the size of the project.

Live: https://hathomas3.github.io/City-Res/

## Stack

- Vite + TypeScript (strict)
- three.js (orthographic "table model" camera, procedural buildings)
- Plain HTML/CSS overlay for labels, cards and the project page (always upright, real fonts, RTL aware)
- GitHub Actions: validate → test → build → deploy to Pages

## Commands

```bash
npm install
npm run dev        # local dev server
npm run validate   # check content/city.json against the schema
npm test           # layout and routing tests
npm run build      # typecheck + production build into dist/
```

Handy URL parameters: `?time=day|dusk|night` forces the lighting, `?lang=he` opens in Hebrew.

## Adding or editing a project

All content lives in **`content/city.json`**. The engine never needs to change.

> Everything in `content/city.json` is public once pushed. Do not put client names, private repo names, keys or personal data in it.

```jsonc
{
  "id": "my-project",               // URL slug: #/project/my-project
  "district": "ai",                 // one of the district ids
  "tier": "featured",               // featured | more | optional  (base height)
  "access": "public",               // public | private  (private = no source link)
  "title": "My Project",
  "tagline": { "en": "One line.", "he": "שורה אחת." },
  "description": { "en": "...", "he": "..." },
  "goals": { "en": ["..."], "he": ["..."] },
  "myRole": "What I personally built (team projects)",
  "stack": ["Python", "FastAPI"],
  "metrics": [{ "value": "68", "label": "tests" }],
  "links": { "github": "https://github.com/...", "demo": "https://...", "video": "https://..." },
  "gallery": [{ "src": "projects/my-project/shot1.webp", "caption": "..." }],
  "floors": [{ "name": "Parser", "detail": "..." }],   // one floor per module, bottom first
  "size": { "linesOfCode": 6900, "tests": 68, "months": 3, "teamSize": 2 },
  "heightOverride": 7,              // optional, 1–12 floors
  "place": { "angle": 30, "radius": 12 }, // optional, pin a building in place
  "sign": "NEON"                    // optional rooftop sign, ≤ 14 chars
}
```

Any text field can be a plain string (English only) or `{ "en": ..., "he": ... }`.

Gallery images go in `public/projects/<id>/`. The validator checks that they exist.

### How a building is sized

- **Height:** tier base + lines of code (log) + tests + months + number of floors, rounded and clamped to 1–12. `heightOverride` wins.
- **Footprint:** grows with team size.
- **Placement:** automatic. Each district gets a wedge sized by its content, and buildings fill rings from the plaza outward. `place` pins one by hand.

## Structure

```
content/city.json      data (owner, districts, projects)
src/data/              schema validation, layout model, static list renderer
src/engine/            three.js: scene, camera rig, controls, buildings, world, daylight
src/ui/                side card, project page, 3D building viewer, about, list
src/router.ts          hash routes: #/project/<id>, #/about, #/list
vite.config.ts         validates content and prerenders the list into index.html at build time
```

# Wildshape Bestiary

A [Foundry VTT](https://foundryvtt.com/) module for the **dnd5e** system (v14+) that gives Druids a proper interface for tracking and using their Wild Shape forms.

Foundry has no native way of tracking which forms a Druid knows. This module solves that — letting the GM and player maintain a persistent bestiary of known forms, prepare a subset of them, and invoke Wild Shape directly from the character sheet with full stat block application and revert support.

---

## Features

- **Known Forms list** — a dedicated section in the Features tab listing all forms the druid knows
- **Drag-and-drop** to add forms from the Actor list or any Compendium
- **Prepare toggle** — mark up to the allowed number of forms as prepared (sun icon, matching the sheet's own style)
- **Wild Shape invocation** — click a form's portrait or name to transform:
  - Deducts a Wild Shape use automatically
  - Applies physical ability scores (STR, DEX, CON) from the beast
  - Applies all movement speeds from the beast
  - Sets Temp HP to `max(druid level, moon subclass level × 3)`
  - Preserves current HP and max HP
  - Dequips all equipment (removing equipment effects)
  - Merges skill and save proficiencies (takes highest)
  - Updates portrait and token image (including placed tokens on the canvas)
- **Revert** — restores the druid's original stats, images, equipment, and clears the active form
- **Active form indicator** — gold paw icon and row highlight while a form is active
- **Uses counter** in the section header, pulled live from the Wild Shape feature item
- **CR and fly speed warnings** — invalid forms are greyed out and cannot be prepared
- **Delete confirmation** before removing a known form
- **Persistent storage** — all data stored in actor flags, survives reloads and server restarts

---

## Compatibility

| Foundry VTT | dnd5e system | Status |
|-------------|--------------|--------|
| v14 (build 363+) | 5.3.x | ✅ Verified |
| v13 | — | ⚠️ Untested |

---

## Installation

### From the Foundry package browser
Search for **Wildshape Bestiary** in Add-on Modules.

### Manual install
Paste this manifest URL into Foundry's module installer:
```
https://github.com/RedNeckSnailSpit/wildshape-bestiary/releases/latest/download/module.json
```

---

## Usage

1. Open a Druid's character sheet and navigate to the **Features** tab.
2. Scroll to the **Known Forms** section at the bottom.
3. Drag any beast actor from the Actor sidebar or a Compendium onto the drop zone.
4. Click the **sun icon** to prepare a form (up to your allowed maximum).
5. Click the beast's **portrait or name** to invoke Wild Shape — confirm the dialog, and the sheet updates automatically.
6. Click **Revert** (shown when a form is active) to return to humanoid form.

---

## Wild Shape Rules (2024, RAW)

This module implements the 2024 D&D rules for Wild Shape:

- **Kept from druid:** creature type, HP and Hit Dice, INT/WIS/CHA scores, class features, languages, feats, skill and save proficiencies (where higher than beast's)
- **Taken from beast:** STR/DEX/CON scores, movement speeds, skill and save proficiencies (where higher than druid's)
- **Temp HP:** `max(druid level, moon subclass level × 3)` — when this runs out, revert manually
- **Equipment:** all gear is dequipped on transform and re-equipped on revert
- **Duration:** no time limit — revert via the Revert button or when Temp HP reaches 0

> **Note:** Temp HP reaching 0 does not auto-revert — the GM or player should click Revert when that happens.

---

## Known Limitations

- Spell lists are not modified on transform (the sheet's spell tab remains visible)
- Active effects from equipment are dropped via dequipping, but active effects from other sources are not modified
- Movement speeds are stored at drop time — if the beast actor is later edited, stored values won't update automatically (remove and re-add the form to refresh)

---

## AI Disclosure

This module's code was developed with AI assistance (Claude by Anthropic). Per [Foundry VTT's AI Content Policy](https://foundryvtt.com/article/ai-policy/), the author understands, can explain, and is able to maintain all submitted code.

---

## License

**Non-commercial use:** GNU General Public License v3.0 — free to use, modify, and distribute for non-commercial purposes.

**Commercial use:** requires a separate written agreement.

Full license details: [legal.rednecksnailspit.co.za](https://legal.rednecksnailspit.co.za)

© 2026 [RedNeckSnailSpit](https://rednecksnailspit.co.za/)

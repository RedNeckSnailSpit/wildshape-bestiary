// known-forms.js — Wildshape Bestiary
// Single-file module. No import/export — loaded as a classic Foundry script.
// Targets dnd5e v14 ApplicationV2 sheet (renderCharacterActorSheet hook).

(function () {
  "use strict";

  const MODULE_ID       = "wildshape-bestiary";
  const FLAG_KEY        = "knownForms";
  const ACTIVE_FORM_KEY = "activeForm";
  const ORIGINAL_KEY    = "originalForm";

  // ── Helpers ────────────────────────────────────────────────────────────────

  function parseCR(cr) {
    if (typeof cr === "number") return cr;
    if (typeof cr === "string" && cr.includes("/")) {
      const parts = cr.split("/");
      return Number(parts[0]) / Number(parts[1]);
    }
    return parseFloat(cr) || 0;
  }

  function crLabel(cr) {
    const n = parseCR(cr);
    if (n === 0.125) return "1/8";
    if (n === 0.25)  return "1/4";
    if (n === 0.5)   return "1/2";
    return String(n);
  }

  function actorHasWildShape(actor) {
    return actor.items.some(
      (i) => i.type === "feat" && i.name.toLowerCase().includes("wild shape")
    );
  }

  function getWildShapeItem(actor) {
    return actor.items.find(
      (i) => i.type === "feat" && i.name.toLowerCase().includes("wild shape")
    ) ?? null;
  }

  function getUses(actor) {
    const ws = getWildShapeItem(actor);
    if (!ws) return { value: null, max: null };
    return {
      value: ws.system?.uses?.value ?? null,
      max:   ws.system?.uses?.max   ?? null,
    };
  }

  function getLimits(actor) {
    const druidScale = actor.system?.scale?.druid ?? {};

    let maxCR = druidScale["wild-shape"]?.value ?? 0.25;
    if (typeof maxCR === "string" && maxCR.includes("/")) {
      const parts = maxCR.split("/");
      maxCR = Number(parts[0]) / Number(parts[1]);
    }
    maxCR = Number(maxCR) || 0.25;

    const druidLevel =
      actor.system?.classes?.druid?.levels ??
      actor.items.find(
        (i) => i.type === "class" && i.name.toLowerCase().includes("druid")
      )?.system?.levels ??
      0;

    const flyAllowed = druidLevel >= 8;

    let maxKnown = druidScale["known-forms"]?.value ?? null;
    if (maxKnown === null) {
      if      (druidLevel >= 18) maxKnown = 10;
      else if (druidLevel >= 14) maxKnown = 8;
      else if (druidLevel >= 10) maxKnown = 6;
      else if (druidLevel >= 6)  maxKnown = 5;
      else if (druidLevel >= 2)  maxKnown = 4;
      else                       maxKnown = 0;
    }

    return { maxCR, flyAllowed, maxKnown, druidLevel };
  }

  // ── Transform logic ────────────────────────────────────────────────────────

  async function transformInto(actor, form, beast) {
    const druidLevel =
      actor.system?.classes?.druid?.levels ??
      actor.items.find(
        (i) => i.type === "class" && i.name.toLowerCase().includes("druid")
      )?.system?.levels ?? 0;

    // Moon Druid subclass levels — used in temp HP formula
    // formula: max(druidLevel, moonLevel * 3)
    const moonLevel =
      actor.system?.subclasses?.moon?.levels ??
      actor.items.find(
        (i) => i.type === "subclass" && i.system?.identifier?.toLowerCase() === "moon"
      )?.system?.levels ?? 0;

    const tempHPAmount = Math.max(druidLevel, moonLevel * 3);

    const beastSys = beast.system ?? {};
    const beastAbi = beastSys.abilities ?? {};
    const beastMov = beastSys.attributes?.movement ?? {};
    const beastSkills = beastSys.skills ?? {};
    const beastSaves  = beastSys.abilities ?? {};

    const druidAbi    = actor.system?.abilities ?? {};
    const druidSkills = actor.system?.skills ?? {};

    // ── 1. Snapshot original state ──────────────────────────────────────────
    const equippedItems = actor.items
      .filter((i) => i.system?.equipped === true)
      .map((i) => i.id);

    const original = {
      img:   actor.img,
      token: actor.prototypeToken?.texture?.src ?? actor.img,
      abilities: {
        str: { value: actor.system.abilities.str?.value ?? 10 },
        dex: { value: actor.system.abilities.dex?.value ?? 10 },
        con: { value: actor.system.abilities.con?.value ?? 10 },
      },
      movement: { ...actor.system?.attributes?.movement },
      hp: {
        temp: actor.system?.attributes?.hp?.temp ?? 0,
      },
      // Per-skill: store the current proficiency value so we can restore it
      skills: Object.fromEntries(
        Object.entries(druidSkills).map(([k, v]) => [k, { value: v.value ?? 0 }])
      ),
      // Per-save proficiency
      saves: Object.fromEntries(
        Object.entries(druidAbi).map(([k, v]) => [k, { proficient: v.proficient ?? 0 }])
      ),
      equippedItems,
    };

    await actor.setFlag(MODULE_ID, ORIGINAL_KEY, original);

    // ── 2. Build the update object ──────────────────────────────────────────
    const update = {};

    // Portrait and token images
    update["img"] = beast.img;
    update["prototypeToken.texture.src"] =
      beast.prototypeToken?.texture?.src ?? beast.img;

    // Physical ability scores from beast
    for (const ability of ["str", "dex", "con"]) {
      update[`system.abilities.${ability}.value`] =
        beastAbi[ability]?.value ?? 10;
    }

    // Movement — all types from beast
    const movTypes = ["walk", "fly", "swim", "climb", "burrow"];
    for (const mv of movTypes) {
      update[`system.attributes.movement.${mv}`] =
        beastMov[mv] ?? 0;
    }
    if (beastMov.units) {
      update["system.attributes.movement.units"] = beastMov.units;
    }

    // Temp HP = max(druidLevel, moonLevel * 3). Explicitly preserve current
    // HP value and max so changing CON doesn't cause dnd5e to recalculate them.
    update["system.attributes.hp.temp"]  = tempHPAmount;
    update["system.attributes.hp.value"] = actor.system.attributes.hp.value;
    update["system.attributes.hp.max"]   = actor.system.attributes.hp.max;

    // ── 3. Skills — take highest modifier ──────────────────────────────────
    // We write proficiency level (0 = none, 1 = proficient, 2 = expertise)
    // to nudge the derived modifier up when the beast has a higher total.
    // We only ever increase, never decrease, since the druid keeps their own profs.
    for (const [key, beastSkill] of Object.entries(beastSkills)) {
      const druidSkill = druidSkills[key];
      if (!druidSkill) continue;
      // Beast proficient and has higher total mod than druid
      if (beastSkill.prof > 0 && beastSkill.mod > druidSkill.total) {
        // Grant at least proficiency so the bonus applies
        const newProf = Math.max(druidSkill.value ?? 0, beastSkill.prof);
        update[`system.skills.${key}.value`] = newProf;
      }
    }

    // ── 4. Saves — take highest for physical abilities ──────────────────────
    for (const ability of ["str", "dex", "con"]) {
      const beastSave = beastSaves[ability]?.save?.value ?? beastSaves[ability]?.mod ?? 0;
      const druidSave = druidAbi[ability]?.save?.value ?? druidAbi[ability]?.mod ?? 0;
      if (beastSave > druidSave && (beastSaves[ability]?.proficient ?? 0) > 0) {
        update[`system.abilities.${ability}.proficient`] = 1;
      }
    }

    // ── 5. Apply actor update ───────────────────────────────────────────────
    await actor.update(update);

    // ── 5a. Update any placed linked tokens on the canvas ──────────────────
    const beastTokenSrc = beast.prototypeToken?.texture?.src ?? beast.img;
    for (const scene of game.scenes.contents) {
      const linkedTokens = scene.tokens.contents.filter(
        (t) => t.actorLink && t.actor?.id === actor.id
      );
      if (linkedTokens.length > 0) {
        await scene.updateEmbeddedDocuments(
          "Token",
          linkedTokens.map((t) => ({
            _id: t.id,
            "texture.src": beastTokenSrc,
          }))
        );
      }
    }

    // ── 6. Dequip all equipped items ────────────────────────────────────────
    if (equippedItems.length > 0) {
      const itemUpdates = equippedItems.map((id) => ({
        _id: id,
        "system.equipped": false,
      }));
      await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }

    // ── 7. Mark active form ─────────────────────────────────────────────────
    await actor.setFlag(MODULE_ID, ACTIVE_FORM_KEY, {
      uuid: form.uuid,
      name: form.name,
      img:  form.img ?? "icons/svg/mystery-man.svg",
    });

    ui.notifications.info(`Wild Shape: transformed into ${form.name}.`);
  }

  async function revertTransform(actor) {
    const original = actor.getFlag(MODULE_ID, ORIGINAL_KEY);
    if (!original) {
      ui.notifications.warn("Wildshape Bestiary: No original form data found.");
      return;
    }

    // ── 1. Build revert update ──────────────────────────────────────────────
    const update = {};

    // Images
    update["img"] = original.img;
    update["prototypeToken.texture.src"] = original.token;

    // Physical abilities
    for (const ability of ["str", "dex", "con"]) {
      update[`system.abilities.${ability}.value`] =
        original.abilities[ability]?.value ?? 10;
    }

    // Movement
    for (const [mv, val] of Object.entries(original.movement ?? {})) {
      update[`system.attributes.movement.${mv}`] = val;
    }

    // Temp HP
    update["system.attributes.hp.temp"] = original.hp?.temp ?? 0;

    // Skills
    for (const [key, val] of Object.entries(original.skills ?? {})) {
      update[`system.skills.${key}.value`] = val.value;
    }

    // Saves
    for (const [ability, val] of Object.entries(original.saves ?? {})) {
      update[`system.abilities.${ability}.proficient`] = val.proficient;
    }

    // ── 2. Apply revert ─────────────────────────────────────────────────────
    await actor.update(update);

    // ── 2a. Restore placed linked tokens on the canvas ──────────────────────
    for (const scene of game.scenes.contents) {
      const linkedTokens = scene.tokens.contents.filter(
        (t) => t.actorLink && t.actor?.id === actor.id
      );
      if (linkedTokens.length > 0) {
        await scene.updateEmbeddedDocuments(
          "Token",
          linkedTokens.map((t) => ({
            _id: t.id,
            "texture.src": original.token,
          }))
        );
      }
    }

    // ── 3. Re-equip all previously equipped items ───────────────────────────
    if (original.equippedItems?.length > 0) {
      const itemUpdates = original.equippedItems.map((id) => ({
        _id: id,
        "system.equipped": true,
      }));
      await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }

    // ── 4. Clear flags ───────────────────────────────────────────────────────
    await actor.unsetFlag(MODULE_ID, ACTIVE_FORM_KEY);
    await actor.unsetFlag(MODULE_ID, ORIGINAL_KEY);

    ui.notifications.info("Wild Shape reverted.");
  }

  // ── Section HTML ───────────────────────────────────────────────────────────

  function buildSectionHtml(forms, limits, actorId, actor) {
    const preparedCount = forms.filter((f) => f.prepared).length;
    const { maxKnown, maxCR, flyAllowed } = limits;
    const uses       = getUses(actor);
    const activeForm = actor.getFlag(MODULE_ID, ACTIVE_FORM_KEY) ?? null;

    const usesHtml = uses.max !== null
      ? `&nbsp;|&nbsp; Uses: ${uses.value}/${uses.max}`
      : "";

    const revertHtml = activeForm
      ? `<button type="button" class="unbutton wsb-revert-btn" title="Revert Wild Shape">
           <i class="fa-solid fa-person"></i> Revert (${activeForm.name})
         </button>`
      : "";

    const rows = forms.map((form, idx) => {
      const crNum   = parseCR(form.cr);
      const overCR  = crNum > maxCR;
      const overFly = !flyAllowed && (form.movement?.fly ?? 0) > 0;
      const invalid = overCR || overFly;
      const isActive = activeForm?.uuid === form.uuid;

      const rowClass = [
        "wsb-form-row",
        invalid  ? "wsb-invalid" : "",
        isActive ? "wsb-active"  : "",
      ].filter(Boolean).join(" ");

      const img = form.img ?? "icons/svg/mystery-man.svg";

      const prepBtn = invalid
        ? `<span class="wsb-form-controls-spacer"></span>`
        : form.prepared
          ? `<button type="button" class="unbutton config-button item-control item-action wsb-prepare-btn active"
                     data-idx="${idx}" aria-label="Prepared" title="Click to unprepare">
               <i class="fa-solid fa-sun" inert=""></i>
             </button>`
          : `<button type="button" class="unbutton config-button item-control item-action wsb-prepare-btn"
                     data-idx="${idx}" aria-label="Not Prepared" title="Click to prepare">
               <i class="fa-regular fa-sun" inert=""></i>
             </button>`;

      const flyBadge = (form.movement?.fly ?? 0) > 0
        ? `<span class="wsb-badge wsb-fly" title="Has fly speed (${form.movement.fly} ft)">
             <i class="fa-solid fa-dove"></i>
           </span>`
        : "";

      const warnTitle = overCR
        ? `Exceeds max CR (${crLabel(maxCR)})`
        : overFly ? "Fly speed not yet allowed" : "";

      const warn = invalid
        ? `<i class="fas fa-exclamation-triangle wsb-warn" title="${warnTitle}"></i>`
        : "";

      const activeIndicator = isActive
        ? `<i class="fa-solid fa-paw wsb-active-icon" title="Currently active form"></i>`
        : "";

      return `
        <div class="${rowClass}" data-form-idx="${idx}">
          <img class="wsb-form-img item-image gold-icon wsb-invoke-btn"
               src="${img}" alt="${form.name}" draggable="false"
               data-idx="${idx}" title="Click to Wild Shape into ${form.name}">
          <span class="wsb-form-name wsb-invoke-btn" data-idx="${idx}"
                title="Click to Wild Shape into ${form.name}">${form.name}</span>
          ${activeIndicator}
          ${flyBadge}
          <span class="wsb-form-cr">CR ${crLabel(form.cr)}</span>
          ${warn}
          <div class="wsb-form-controls">
            ${prepBtn}
            <button type="button" class="unbutton config-button item-control item-action wsb-remove-btn"
                    data-idx="${idx}" title="Remove form">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join("");

    const emptyMsg = forms.length === 0
      ? '<p class="wsb-empty">Drag a beast actor here to add a known form.</p>'
      : "";

    return `
      <div class="wildshape-bestiary-section" data-actor-id="${actorId}">
        <div class="wsb-header">
          <h3>Known Forms</h3>
          <span class="wsb-counts">
            Prepared: ${preparedCount}/${maxKnown}
            &nbsp;|&nbsp; Max CR: ${crLabel(maxCR)}
            ${flyAllowed ? "&nbsp;|&nbsp; <i class='fa-solid fa-dove'></i> Fly" : ""}
            ${usesHtml}
          </span>
        </div>
        ${revertHtml}
        <div class="wsb-drop-zone">
          ${rows}
          ${emptyMsg}
        </div>
      </div>`;
  }

  // ── Event bindings ─────────────────────────────────────────────────────────

  function bindEvents(element, actor, limits) {

    // Invoke — click beast image or name
    element.querySelectorAll(".wsb-invoke-btn").forEach((el) => {
      el.addEventListener("click", async function () {
        const idx   = Number(this.dataset.idx);
        const forms = actor.getFlag(MODULE_ID, FLAG_KEY) ?? [];
        const form  = forms[idx];
        if (!form) return;

        // Warn if no uses remaining (don't block)
        const ws = getWildShapeItem(actor);
        if (ws) {
          const remaining = ws.system?.uses?.value ?? 0;
          if (remaining <= 0) {
            const proceed = await foundry.applications.api.DialogV2.confirm({
              window: { title: "No Uses Remaining" },
              content: `<p>You have no Wild Shape uses remaining. Invoke anyway?</p>`,
            });
            if (!proceed) return;
          }
        }

        // Confirm transform
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Wild Shape" },
          content: `<p>Transform into <strong>${form.name}</strong>?</p>`,
        });
        if (!confirmed) return;

        // Resolve beast actor
        let beast;
        try {
          beast = await fromUuid(form.uuid);
        } catch (e) {
          ui.notifications.error(`Wildshape Bestiary: Could not resolve ${form.name}.`);
          return;
        }

        if (!beast) {
          ui.notifications.error(`Wildshape Bestiary: ${form.name} not found.`);
          return;
        }

        // Deduct a use
        if (ws) {
          await ws.update({ "system.uses.spent": (ws.system?.uses?.spent ?? 0) + 1 });
        }

        await transformInto(actor, form, beast);
      });
    });

    // Prepare toggle
    element.querySelectorAll(".wsb-prepare-btn").forEach((btn) => {
      btn.addEventListener("click", async function () {
        const idx   = Number(this.dataset.idx);
        const forms = actor.getFlag(MODULE_ID, FLAG_KEY) ?? [];
        const form  = forms[idx];
        if (!form) return;

        if (!form.prepared) {
          const preparedCount = forms.filter((f) => f.prepared).length;
          if (preparedCount >= limits.maxKnown) {
            ui.notifications.warn(
              `You can only prepare ${limits.maxKnown} forms. Unprepare one first.`
            );
            return;
          }
        }

        forms[idx].prepared = !form.prepared;
        await actor.setFlag(MODULE_ID, FLAG_KEY, forms);
      });
    });

    // Remove — with confirmation
    element.querySelectorAll(".wsb-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async function () {
        const idx   = Number(this.dataset.idx);
        const forms = actor.getFlag(MODULE_ID, FLAG_KEY) ?? [];
        const form  = forms[idx];
        if (!form) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Remove Known Form" },
          content: `<p>Remove <strong>${form.name}</strong> from known forms?</p>`,
        });
        if (!confirmed) return;

        forms.splice(idx, 1);
        await actor.setFlag(MODULE_ID, FLAG_KEY, forms);
      });
    });

    // Revert
    const revertBtn = element.querySelector(".wsb-revert-btn");
    if (revertBtn) {
      revertBtn.addEventListener("click", async function () {
        const activeForm = actor.getFlag(MODULE_ID, ACTIVE_FORM_KEY);
        if (!activeForm) return;

        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Revert Wild Shape" },
          content: `<p>Revert from <strong>${activeForm.name}</strong> back to your normal form?</p>`,
        });
        if (!confirmed) return;

        await revertTransform(actor);
      });
    }
  }

  // ── Drop handler ───────────────────────────────────────────────────────────

  function attachDropHandler(element, actor) {
    const dropZone = element.querySelector(".wsb-drop-zone");
    if (!dropZone) return;

    dropZone.addEventListener("dragover", (ev) => ev.preventDefault());

    dropZone.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      let dragData;
      try {
        dragData = JSON.parse(ev.dataTransfer.getData("text/plain"));
      } catch (e) {
        ui.notifications.error("Wildshape Bestiary: Could not read drag data.");
        return;
      }

      if (!dragData.uuid) {
        ui.notifications.warn("Wildshape Bestiary: No UUID in drag data.");
        return;
      }

      let beast;
      try {
        beast = await fromUuid(dragData.uuid);
      } catch (e) {
        ui.notifications.error("Wildshape Bestiary: Could not resolve dropped document.");
        return;
      }

      if (!(beast instanceof Actor)) {
        ui.notifications.warn("Wildshape Bestiary: Dropped item is not an actor.");
        return;
      }

      const sys      = beast.system ?? {};
      const details  = sys.details ?? {};
      const movement = sys.attributes?.movement ?? {};

      const existing = actor.getFlag(MODULE_ID, FLAG_KEY) ?? [];
      if (existing.some((f) => f.uuid === beast.uuid)) {
        ui.notifications.warn(`${beast.name} is already in your known forms.`);
        return;
      }

      const newForm = {
        uuid:     beast.uuid,
        name:     beast.name,
        img:      beast.img,
        cr:       details.cr ?? 0,
        prepared: false,
        movement: {
          walk:   movement.walk   ?? 0,
          fly:    movement.fly    ?? 0,
          swim:   movement.swim   ?? 0,
          climb:  movement.climb  ?? 0,
          burrow: movement.burrow ?? 0,
        },
      };

      await actor.setFlag(MODULE_ID, FLAG_KEY, [...existing, newForm]);
      ui.notifications.info(`${beast.name} added to known forms.`);
    });
  }

  // ── Main render hook ───────────────────────────────────────────────────────

  function onRenderCharacterActorSheet(app, element, _context, _options) {
    const actor = app.actor;
    if (!actor) return;
    if (!actorHasWildShape(actor)) return;

    element.querySelectorAll(".wildshape-bestiary-section").forEach((el) => el.remove());

    const forms      = actor.getFlag(MODULE_ID, FLAG_KEY) ?? [];
    const limits     = getLimits(actor);
    const featureTab = element.querySelector('.tab[data-tab="features"]');

    if (!featureTab) return;

    featureTab.insertAdjacentHTML(
      "beforeend",
      buildSectionHtml(forms, limits, actor.id, actor)
    );

    const section = featureTab.querySelector(".wildshape-bestiary-section");
    if (!section) return;

    bindEvents(section, actor, limits);
    attachDropHandler(section, actor);
  }

  // ── Register ───────────────────────────────────────────────────────────────

  Hooks.once("init", () => {
    console.log("Wildshape Bestiary | Initialised");
  });

  Hooks.on("renderCharacterActorSheet", (app, element, context, options) => {
    onRenderCharacterActorSheet(app, element, context, options);
  });

})();

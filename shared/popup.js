const api = typeof browser !== "undefined" ? browser : chrome;
let editingRuleId = null;
const openRuleIds = new Set();
let draggedRuleId = null;
const {
    generateId,
    normalizeImportedRules,
    assignImportedIds,
    readRules,
    writeRules: saveRules,
} = globalThis.core;
const layoutAnimations = new WeakMap();

const elements = {
    form: document.getElementById("rule-form"),
    formTitle: document.getElementById("form-title"),
    formCopy: document.getElementById("form-copy"),
    saveButton: document.getElementById("save-button"),
    cancelEdit: document.getElementById("cancel-edit"),
    name: document.getElementById("name"),
    input: document.getElementById("input"),
    matchType: document.getElementById("match-type"),
    actionType: document.getElementById("action-type"),
    output: document.getElementById("output"),
    enabled: document.getElementById("enabled"),
    toggleAll: document.getElementById("toggle-all"),
    exportData: document.getElementById("export-data"),
    importData: document.getElementById("import-data"),
    importFile: document.getElementById("import-file"),
    rulesList: document.getElementById("rules-list"),
    ruleCount: document.getElementById("rule-count"),
    enabledCount: document.getElementById("enabled-count"),
};

const FORM_DEFAULTS = {
    matchType: "contains",
    actionType: "replace",
    enabled: true,
};

function escapeHtml(value) {
    return (value + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getFormValues() {
    return {
        name: elements.name.value.trim(),
        input: elements.input.value.trim(),
        matchType: elements.matchType.value,
        actionType: elements.actionType.value,
        output: elements.output.value.trim(),
        enabled: elements.enabled.checked,
    };
}

function setFormValues(rule) {
    elements.name.value = rule.name;
    elements.input.value = rule.input;
    elements.matchType.value = rule.matchType;
    elements.actionType.value = rule.actionType;
    elements.output.value = rule.output;
    elements.enabled.checked = rule.enabled;
}

async function writeRules(rules) {
    await saveRules(rules);
    await load();
}

function setFormMode(isEditing) {
    elements.formTitle.textContent = isEditing ? "Edit rule" : "New rule";
    elements.formCopy.textContent = isEditing
        ? "Adjust the route and save when ready."
        : "Create a compact URL rule in a few fields.";
    elements.saveButton.textContent = isEditing ? "Update rule" : "Save rule";
    elements.cancelEdit.hidden = !isEditing;
}

function resetForm() {
    editingRuleId = null;
    elements.form.reset();
    elements.enabled.checked = FORM_DEFAULTS.enabled;
    elements.matchType.value = FORM_DEFAULTS.matchType;
    elements.actionType.value = FORM_DEFAULTS.actionType;
    setFormMode(false);
}

function renderRule(rule) {
    const stateLabel = rule.enabled ? "Live" : "Paused";
    const stateClass = rule.enabled ? "tag-live" : "tag-paused";
    const cardClass = rule.enabled ? "rule-card" : "rule-card is-disabled";
    const name = rule.name || "Untitled route";

    return `
        <details class="${cardClass}" data-id="${rule.id}" draggable="true" title="Drag to reorder" ${openRuleIds.has(rule.id) ? "open" : ""}>
            <summary class="rule-summary">
                <div class="rule-head">
                    <p class="rule-name">${escapeHtml(name)}</p>
                    <div class="rule-tags">
                        <span class="tag inert-tag">${escapeHtml(rule.matchType)}</span>
                        <span class="tag inert-tag">${escapeHtml(rule.actionType)}</span>
                        <button type="button" data-id="${rule.id}" data-action="toggle-state" class="tag tag-state ${stateClass} state-toggle">${stateLabel}</button>
                    </div>
                    <span class="summary-chevron" aria-hidden="true"></span>
                </div>
            </summary>
            <div class="rule-details">
                <div class="rule-flow">
                    <p><span>When URL is</span> <strong>${escapeHtml(rule.matchType)}</strong></p>
                    <code>${escapeHtml(rule.input)}</code>
                </div>
                <div class="rule-flow">
                    <p><span>Then</span> <strong>${escapeHtml(rule.actionType)}</strong></p>
                    <code>${escapeHtml(rule.output)}</code>
                </div>
                <div class="rule-actions">
                    <button type="button" data-id="${rule.id}" data-action="duplicate" class="duplicate">Duplicate</button>
                    <button type="button" data-id="${rule.id}" data-action="edit" class="edit">Edit</button>
                    <button type="button" data-id="${rule.id}" data-action="remove" class="remove danger">Delete</button>
                </div>
            </div>
        </details>
    `;
}

async function exportRules() {
    const rules = await readRules();
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        rules,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `redirector-3000-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function importRules(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const existingRules = await readRules();
    const importedRules = normalizeImportedRules(parsed);
    const safeImportedRules = assignImportedIds(existingRules, importedRules);

    await writeRules([...existingRules, ...safeImportedRules]);
}

function updateRuleSummary(rules) {
    elements.ruleCount.textContent = String(rules.length);
    elements.enabledCount.textContent = String(rules.filter((rule) => rule.enabled).length);
    const anyRules = rules.length > 0;
    const allDisabled = anyRules && rules.every((rule) => !rule.enabled);
    elements.toggleAll.textContent = allDisabled ? "Live all" : "Pause all";
    elements.toggleAll.disabled = !anyRules;
}

async function load() {
    const rules = await readRules();
    const validIds = new Set(rules.map((rule) => rule.id));

    for (const id of Array.from(openRuleIds)) {
        if (!validIds.has(id)) {
            openRuleIds.delete(id);
        }
    }

    updateRuleSummary(rules);
    elements.rulesList.innerHTML = rules.map(renderRule).join("");
}

function getRuleCard(target) {
    return target instanceof Element ? target.closest(".rule-card[data-id]") : null;
}

function getRuleCards() {
    return Array.from(elements.rulesList.querySelectorAll(".rule-card[data-id]"));
}

function captureRulePositions(excludeId = null) {
    const excludedId = excludeId == null ? null : String(excludeId);
    const positions = new Map();

    for (const card of getRuleCards()) {
        if (excludedId && card.dataset.id === excludedId) continue;
        positions.set(card.dataset.id, card.getBoundingClientRect());
    }

    return positions;
}

function animateRulePositions(previousRects, excludeId = null) {
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!previousRects?.size || reduceMotion) return;

    const excludedId = excludeId == null ? null : String(excludeId);

    for (const card of getRuleCards()) {
        if (excludedId && card.dataset.id === excludedId) continue;

        const previousRect = previousRects.get(card.dataset.id);
        if (!previousRect) continue;

        const nextRect = card.getBoundingClientRect();
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;

        if (!deltaX && !deltaY) continue;
        if (typeof card.animate !== "function") continue;

        const previousAnimation = layoutAnimations.get(card);
        if (previousAnimation) {
            previousAnimation.cancel();
        }

        const animation = card.animate(
            [
                { transform: `translate(${deltaX}px, ${deltaY}px)` },
                { transform: "translate(0, 0)" },
            ],
            {
                duration: 180,
                easing: "cubic-bezier(0.2, 0, 0, 1)",
            },
        );

        layoutAnimations.set(card, animation);
        const clearAnimation = () => {
            if (layoutAnimations.get(card) === animation) {
                layoutAnimations.delete(card);
            }
        };

        animation.addEventListener("finish", clearAnimation, { once: true });
        animation.addEventListener("cancel", clearAnimation, { once: true });
    }
}

function clearDragState() {
    draggedRuleId = null;
    for (const card of getRuleCards()) {
        card.classList.remove("is-dragging", "is-drop-target");
        const animation = layoutAnimations.get(card);
        if (animation) {
            animation.cancel();
            layoutAnimations.delete(card);
        }
    }
}

function getRuleOrderFromDom(rules) {
    const byId = new Map(rules.map((rule) => [String(rule.id), rule]));

    return getRuleCards()
        .map((card) => byId.get(card.dataset.id))
        .filter(Boolean);
}

function setDropTarget(targetCard) {
    for (const card of getRuleCards()) {
        card.classList.toggle("is-drop-target", card === targetCard);
    }
}

function moveDraggedRuleWithinDom(targetCard, clientY) {
    const draggedCard = elements.rulesList.querySelector(`.rule-card[data-id="${draggedRuleId}"]`);
    if (!draggedCard || !targetCard || draggedCard === targetCard) return;

    const rect = targetCard.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    const shouldMoveBefore = before && targetCard.previousElementSibling !== draggedCard;
    const shouldMoveAfter = !before && targetCard.nextElementSibling !== draggedCard;

    if (!shouldMoveBefore && !shouldMoveAfter) return;

    const previousRects = captureRulePositions(draggedRuleId);

    if (shouldMoveBefore) {
        elements.rulesList.insertBefore(draggedCard, targetCard);
    } else {
        targetCard.after(draggedCard);
    }

    animateRulePositions(previousRects, draggedRuleId);
}

elements.rulesList.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!(details instanceof Element) || !details.classList.contains("rule-card")) return;

    const id = Number(details.dataset.id);
    if (!id) return;

    if (details.hasAttribute("open")) {
        openRuleIds.add(id);
    } else {
        openRuleIds.delete(id);
    }
}, true);

elements.rulesList.addEventListener("dragstart", (event) => {
    const card = getRuleCard(event.target);
    if (!card) return;

    draggedRuleId = card.dataset.id;
    card.classList.add("is-dragging");
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedRuleId);
    }
});

elements.rulesList.addEventListener("dragover", (event) => {
    if (!draggedRuleId) return;

    const targetCard = getRuleCard(event.target);
    const draggedCard = elements.rulesList.querySelector(`.rule-card[data-id="${draggedRuleId}"]`);

    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }

    if (!draggedCard) return;

    if (targetCard) {
        setDropTarget(targetCard === draggedCard ? null : targetCard);
        moveDraggedRuleWithinDom(targetCard, event.clientY);
        return;
    }

    setDropTarget(null);
    elements.rulesList.appendChild(draggedCard);
});

elements.rulesList.addEventListener("drop", async (event) => {
    if (!draggedRuleId) return;

    event.preventDefault();

    const rules = await readRules();
    const nextRules = getRuleOrderFromDom(rules);
    const orderChanged = nextRules.length === rules.length && nextRules.some((rule, index) => rule.id !== rules[index].id);

    clearDragState();

    if (!orderChanged) {
        return;
    }

    await writeRules(nextRules);
});

elements.rulesList.addEventListener("dragend", () => {
    if (!draggedRuleId) return;

    clearDragState();
    load();
});

elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nextRule = {
        id: editingRuleId ?? generateId(),
        ...getFormValues(),
    };

    const rules = await readRules();
    const updates = editingRuleId
        ? rules.map((rule) => (rule.id === editingRuleId ? nextRule : rule))
        : [...rules, nextRule];

    await writeRules(updates);
    resetForm();
});

elements.cancelEdit.addEventListener("click", resetForm);

elements.exportData.addEventListener("click", async () => {
    await exportRules();
});

elements.importData.addEventListener("click", () => {
    elements.importFile.click();
});

elements.toggleAll.addEventListener("click", async () => {
    const rules = await readRules();
    if (!rules.length) return;

    const enableAll = rules.every((rule) => !rule.enabled);
    await writeRules(rules.map((rule) => ({ ...rule, enabled: enableAll })));
});

elements.importFile.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";

    if (!file) return;

    try {
        await importRules(file);
    } catch (error) {
        console.error(error);
    }
});

elements.rulesList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const inertChip = target.closest(".inert-tag");
    if (inertChip) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const btn = target.closest("button[data-id]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    if (!id) return;

    const action = btn.dataset.action;
    if (!action) return;

    const rules = await readRules();

    switch (action) {
        case "toggle-state": {
            event.preventDefault();
            event.stopPropagation();
            const updates = rules.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule);
            await writeRules(updates);
            return;
        }
        case "remove": {
            if (!window.confirm("Are you sure you want to delete this rule? This action cannot be undone.")) {
                return;
            }

            openRuleIds.delete(id);
            await writeRules(rules.filter((rule) => rule.id !== id));

            if (editingRuleId === id) {
                resetForm();
            }
            return;
        }
        case "duplicate": {
            const sourceRule = rules.find((rule) => rule.id === id);
            if (!sourceRule) return;

            await writeRules([
                ...rules,
                {
                    ...sourceRule,
                    id: generateId(),
                    name: sourceRule.name ? `${sourceRule.name} Copy` : "Untitled route Copy",
                },
            ]);
            return;
        }
        case "edit": {
            const rule = rules.find((item) => item.id === id);
            if (!rule) return;

            editingRuleId = rule.id;
            setFormValues(rule);
            setFormMode(true);
            elements.name.focus();
            return;
        }
        default:
            return;
    }
});

resetForm();
load();

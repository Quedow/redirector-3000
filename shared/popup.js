const api = typeof browser !== "undefined" ? browser : chrome;
let editingRuleId = null;
const openRuleIds = new Set();

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

function generateId() {
    return Math.floor(Math.random() * 1e9);
}

function normalizeRule(rule) {
    return {
        id: rule.id,
        name: rule.name ?? "",
        input: rule.input ?? rule.pattern ?? "",
        output: rule.output ?? "",
        enabled: rule.enabled !== false,
        actionType: rule.actionType ?? "replace",
        matchType: rule.matchType ?? "contains",
    };
}

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

async function readRules() {
    const { rules = [] } = await api.storage.local.get({ rules: [] });
    return rules.map(normalizeRule);
}

async function writeRules(rules) {
    await api.storage.local.set({ rules });
    api.runtime.sendMessage({ type: "rebuild" });
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
        <details class="${cardClass}" data-id="${rule.id}" ${openRuleIds.has(rule.id) ? "open" : ""}>
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

function normalizeImportedRules(parsed) {
    const importedRules = Array.isArray(parsed) ? parsed : parsed?.rules;

    if (!Array.isArray(importedRules)) {
        throw new Error("Invalid backup format.");
    }

    return importedRules.map(normalizeRule);
}

function assignImportedIds(existingRules, importedRules) {
    const usedIds = new Set(existingRules.map((rule) => rule.id));

    return importedRules.map((rule) => {
        let id = rule.id;

        while (!id || usedIds.has(id)) {
            id = generateId();
        }

        usedIds.add(id);
        return { ...rule, id };
    });
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

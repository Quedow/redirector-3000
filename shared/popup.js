const api = typeof browser !== "undefined" ? browser : chrome;
let editingRuleId = null;
const openRuleIds = new Set();

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

function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function duplicateName(name) {
    return name ? `${name} Copy` : "Untitled route Copy";
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
    document.getElementById("form-title").textContent = isEditing ? "Edit rule" : "New rule";
    document.getElementById("form-copy").textContent = isEditing
        ? "Adjust the route and save when ready."
        : "Create a compact URL rule in a few fields.";
    document.getElementById("save-button").textContent = isEditing ? "Update rule" : "Save rule";
    document.getElementById("cancel-edit").hidden = !isEditing;
}

function resetForm() {
    editingRuleId = null;
    document.getElementById("rule-form").reset();
    document.getElementById("enabled").checked = true;
    document.getElementById("match-type").value = "contains";
    document.getElementById("action-type").value = "replace";
    setFormMode(false);
}

function renderRule(rule) {
    const stateLabel = rule.enabled ? "Live" : "Paused";
    const stateClass = rule.enabled ? "tag-live" : "tag-paused";
    const name = rule.name || "Untitled route";

    return `
        <details class="rule-card ${rule.enabled ? "" : "is-disabled"}" data-id="${rule.id}" ${openRuleIds.has(rule.id) ? "open" : ""}>
            <summary class="rule-summary">
                <div class="rule-head">
                    <p class="rule-name">${escapeHtml(name)}</p>
                    <div class="rule-tags">
                        <span class="tag inert-tag">${escapeHtml(titleCase(rule.matchType))}</span>
                        <span class="tag inert-tag">${escapeHtml(titleCase(rule.actionType))}</span>
                        <button type="button" data-id="${rule.id}" class="tag tag-state ${stateClass} state-toggle">${stateLabel}</button>
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
                    <button type="button" data-id="${rule.id}" class="duplicate">Duplicate</button>
                    <button type="button" data-id="${rule.id}" class="edit">Edit</button>
                    <button type="button" data-id="${rule.id}" class="remove danger">Delete</button>
                </div>
            </div>
        </details>
    `;
}

function trackOpenRuleState() {
    for (const details of document.querySelectorAll("#rules-list .rule-card")) {
        details.addEventListener("toggle", () => {
            const id = Number(details.dataset.id);
            if (!id) return;

            if (details.open) {
                openRuleIds.add(id);
            } else {
                openRuleIds.delete(id);
            }
        });
    }
}

function normalizeImportedRules(parsed) {
    const importedRules = Array.isArray(parsed) ? parsed : parsed.rules;

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

async function load() {
    const rules = await readRules();
    const rulesList = document.getElementById("rules-list");
    const enabledCount = rules.filter((rule) => rule.enabled).length;
    const validIds = new Set(rules.map((rule) => rule.id));

    for (const id of Array.from(openRuleIds)) {
        if (!validIds.has(id)) {
            openRuleIds.delete(id);
        }
    }

    document.getElementById("rule-count").textContent = String(rules.length);
    document.getElementById("enabled-count").textContent = String(enabledCount);

    if (!rules.length) {
        rulesList.innerHTML = "";
        return;
    }

    rulesList.innerHTML = rules.map(renderRule).join("");
    trackOpenRuleState();
}

document.getElementById("rule-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const input = document.getElementById("input").value.trim();
    const matchType = document.getElementById("match-type").value;
    const actionType = document.getElementById("action-type").value;
    const output = document.getElementById("output").value.trim();
    const enabled = document.getElementById("enabled").checked;

    const nextRule = {
        id: editingRuleId ?? generateId(),
        name,
        input,
        matchType,
        actionType,
        output,
        enabled,
    };

    const rules = await readRules();
    const updates = editingRuleId
        ? rules.map((rule) => rule.id === editingRuleId ? nextRule : rule)
        : [...rules, nextRule];

    await writeRules(updates);
    resetForm();
});

document.getElementById("cancel-edit").addEventListener("click", () => {
    resetForm();
});

document.getElementById("export-data").addEventListener("click", async () => {
    await exportRules();
});

document.getElementById("import-data").addEventListener("click", () => {
    document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";

    if (!file) return;

    try {
        await importRules(file);
    } catch (error) {
        console.error(error);
    }
});

document.getElementById("rules-list").addEventListener("click", async (event) => {
    const inertChip = event.target.closest(".inert-tag");
    if (inertChip) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const btn = event.target.closest("button");
    if (!btn || !btn.dataset.id) return;

    const id = Number(btn.dataset.id);
    const rules = await readRules();

    if (btn.classList.contains("state-toggle")) {
        event.preventDefault();
        event.stopPropagation();
        const updates = rules.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule);
        await writeRules(updates);
    } else if (btn.classList.contains("remove")) {
        if (!window.confirm("Are you sure you want to delete this rule? This action cannot be undone.")) {
            return;
        }

        const updates = rules.filter((rule) => rule.id !== id);
        openRuleIds.delete(id);
        await writeRules(updates);

        if (editingRuleId === id) {
            resetForm();
        }
    } else if (btn.classList.contains("duplicate")) {
        const sourceRule = rules.find((rule) => rule.id === id);
        if (!sourceRule) return;

        const duplicateRule = {
            ...sourceRule,
            id: generateId(),
            name: duplicateName(sourceRule.name),
        };

        await writeRules([...rules, duplicateRule]);
    } else if (btn.classList.contains("edit")) {
        const rule = rules.find((item) => item.id === id);
        if (!rule) return;

        editingRuleId = rule.id;
        document.getElementById("name").value = rule.name;
        document.getElementById("input").value = rule.input;
        document.getElementById("match-type").value = rule.matchType;
        document.getElementById("action-type").value = rule.actionType;
        document.getElementById("output").value = rule.output;
        document.getElementById("enabled").checked = rule.enabled;
        setFormMode(true);
        document.getElementById("name").focus();
        return;
    } else {
        return;
    }
});

resetForm();
load();

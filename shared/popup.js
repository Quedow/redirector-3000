const api = typeof browser !== "undefined" ? browser : chrome;
let editingRuleId = null;

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
    const name = rule.name || "Untitled route";

    return `
        <details class="rule-card ${rule.enabled ? "" : "is-disabled"}">
            <summary class="rule-summary">
                <div class="rule-head">
                    <div>
                        <p class="rule-name">${escapeHtml(name)}</p>
                        <div class="rule-tags">
                            <span class="tag">${escapeHtml(titleCase(rule.matchType))}</span>
                            <span class="tag">${escapeHtml(titleCase(rule.actionType))}</span>
                            <button type="button" data-id="${rule.id}" class="tag tag-state state-toggle">${stateLabel}</button>
                        </div>
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
                    <button type="button" data-id="${rule.id}" class="edit">Edit</button>
                    <button type="button" data-id="${rule.id}" class="remove danger">Delete</button>
                </div>
            </div>
        </details>
    `;
}

async function load() {
    const { rules = [] } = await api.storage.local.get({ rules: [] });
    const normalizedRules = rules.map(normalizeRule);
    const rulesList = document.getElementById("rules-list");
    const enabledCount = normalizedRules.filter((rule) => rule.enabled).length;

    document.getElementById("rule-count").textContent = String(normalizedRules.length);
    document.getElementById("enabled-count").textContent = String(enabledCount);

    if (!normalizedRules.length) {
        rulesList.innerHTML = "";
        return;
    }

    rulesList.innerHTML = normalizedRules.map(renderRule).join("");
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

    const { rules = [] } = await api.storage.local.get({ rules: [] });
    const normalizedRules = rules.map(normalizeRule);
    const updates = editingRuleId
        ? normalizedRules.map((rule) => rule.id === editingRuleId ? nextRule : rule)
        : [...normalizedRules, nextRule];

    await api.storage.local.set({ rules: updates });
    api.runtime.sendMessage({ type: "rebuild" });
    await load();
    resetForm();
});

document.getElementById("cancel-edit").addEventListener("click", () => {
    resetForm();
});

document.getElementById("rules-list").addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn || !btn.dataset.id) return;

    const id = Number(btn.dataset.id);
    const { rules = [] } = await api.storage.local.get({ rules: [] });
    const normalizedRules = rules.map(normalizeRule);

    if (btn.classList.contains("state-toggle")) {
        event.preventDefault();
        const updates = normalizedRules.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule);
        await api.storage.local.set({ rules: updates });
    } else if (btn.classList.contains("remove")) {
        const updates = normalizedRules.filter((rule) => rule.id !== id);
        await api.storage.local.set({ rules: updates });

        if (editingRuleId === id) {
            resetForm();
        }
    } else if (btn.classList.contains("edit")) {
        const rule = normalizedRules.find((item) => item.id === id);
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

    api.runtime.sendMessage({ type: "rebuild" });
    await load();
});

resetForm();
load();

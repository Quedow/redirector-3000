const api = typeof browser !== "undefined" ? browser : chrome;

function generateId() {
    return Math.floor(Math.random() * 1e9);
}

function escapeHtml(s) {
    return (s + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function load() {
    const { rules = [] } = await api.storage.local.get({ rules: [] });
    const tbody = document.querySelector("#rules-table tbody");
    tbody.innerHTML = "";
    for (const rule of rules) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHtml(rule.name)}</td>
            <td><code>${escapeHtml(rule.pattern)}</code></td>
            <td><code>${escapeHtml(rule.output)}</code></td>
            <td>${rule.enabled ? "✅" : "❌"}</td>
            <td>
                <button data-id="${rule.id}" class="toggle">${rule.enabled ? "Disable" : "Enable"}</button>
                <button data-id="${rule.id}" class="edit">Edit</button>
                <button data-id="${rule.id}" class="remove">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

document.getElementById("rule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = generateId();
    const name = document.getElementById("name").value.trim();
    const pattern = document.getElementById("pattern").value.trim();
    const output = document.getElementById("output").value;
    const enabled = document.getElementById("enabled").checked;

    const { rules = [] } = await api.storage.local.get({ rules: [] });
    rules.push({ id, name, pattern, output, enabled });
    await api.storage.local.set({ rules });

    api.runtime.sendMessage({ type: "rebuild" });
    await load();
    event.target.reset();
});

document.querySelector("#rules-table").addEventListener("click", async (event) => {
    const btn = event.target;
    if (!btn.dataset.id) return;
    const id = Number(btn.dataset.id);
    const { rules = [] } = await api.storage.local.get({ rules: [] });
    let updates = [...rules];

    if (btn.classList.contains("remove")) {
        updates = rules.filter(rule => rule.id !== id);
    } else if (btn.classList.contains("toggle")) {
        updates = rules.map(rule => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule);
    } else if (btn.classList.contains("edit")) {
        const rule = rules.find(rule => rule.id === id);
        if (!rule) return;
        document.getElementById("name").value = rule.name;
        document.getElementById("pattern").value = rule.pattern;
        document.getElementById("output").value = rule.output;
        document.getElementById("enabled").checked = rule.enabled;
        updates = rules.filter(rule => rule.id !== id);
    }
    await api.storage.local.set({ rules: updates });
    api.runtime.sendMessage({ type: "rebuild" });
    await load();
});

load();

(function (root) {
    const api = typeof browser !== "undefined" ? browser : chrome;

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

    async function readRules() {
        const { rules = [] } = await api.storage.local.get({ rules: [] });
        return rules.map(normalizeRule);
    }

    async function writeRules(rules) {
        await api.storage.local.set({ rules });
        api.runtime.sendMessage({ type: "rebuild" });
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

    root.core = {
        assignImportedIds,
        generateId,
        normalizeImportedRules,
        normalizeRule,
        readRules,
        writeRules,
    };
})(globalThis);

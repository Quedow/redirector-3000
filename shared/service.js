const api = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined" && typeof browser.runtime?.getBrowserInfo === "function";
let cachedRules = [];

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

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegexFilter(rule) {
    const escapedInput = escapeRegex(rule.input);
    return rule.matchType === "equal" ? `^${escapedInput}$` : escapedInput;
}

function replaceFirstLiteral(value, input, output) {
    const index = value.indexOf(input);
    if (index === -1) {
        return null;
    }

    return value.slice(0, index) + output + value.slice(index + input.length);
}

function resolveRedirectUrl(url, rule) {
    const matches = rule.matchType === "equal"
        ? url === rule.input
        : url.includes(rule.input);

    if (!matches) {
        return null;
    }

    if (rule.actionType === "redirect" || rule.matchType === "equal") {
        return rule.output;
    }

    return replaceFirstLiteral(url, rule.input, rule.output);
}

function buildDynamicRule(rule) {
    return {
        id: rule.id,
        priority: 1,
        action: {
            type: "redirect",
            redirect: rule.actionType === "redirect"
                ? { url: rule.output }
                : { regexSubstitution: rule.output },
        },
        condition: {
            regexFilter: buildRegexFilter(rule),
            resourceTypes: ["main_frame", "sub_frame"],
        },
    };
}

function webRequestHandler(details) {
    for (const rule of cachedRules) {
        if (!rule.enabled || !rule.input) continue;

        try {
            const redirectUrl = resolveRedirectUrl(details.url, rule);
            if (redirectUrl && redirectUrl !== details.url) {
                api.notifications.create({
                    type: "basic",
                    iconUrl: "./icons/icon-192.png",
                    title: "Redirection triggered",
                    message: `Redirected:\nfrom: ${details.url}\nto: ${redirectUrl}`,
                });

                return { redirectUrl };
            }
        } catch (e) {
            console.error(e);
        }
    }

    return {};
}

async function clearDynamicRules() {
    if (!api.declarativeNetRequest) return;

    const existing = await api.declarativeNetRequest.getDynamicRules();
    const ids = existing.map((rule) => rule.id);

    if (ids.length) {
        await api.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ids,
            addRules: [],
        });
    }
}

async function rebuildRules() {
    const { rules = [] } = await api.storage.local.get({ rules: [] });
    cachedRules = rules.map(normalizeRule);

    if (!isFirefox && api.declarativeNetRequest) {
        await clearDynamicRules();

        const newRules = cachedRules
            .filter((rule) => rule.enabled && rule.input)
            .map(buildDynamicRule);

        if (newRules.length) {
            await api.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [],
                addRules: newRules,
            });
        }

        if (api.declarativeNetRequest.onRuleMatchedDebug) {
            api.declarativeNetRequest.onRuleMatchedDebug.removeListener(handleRuleMatch);
            api.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatch);
        }
    } else if (api.webRequest) {
        try {
            await clearDynamicRules();

            if (api.webRequest.onBeforeRequest.hasListener(webRequestHandler)) {
                api.webRequest.onBeforeRequest.removeListener(webRequestHandler);
            }

            api.webRequest.onBeforeRequest.addListener(
                webRequestHandler,
                { urls: ["<all_urls>"] },
                ["blocking"]
            );
        } catch (e) {
            console.error(e);
        }
    }
}

function handleRuleMatch(info) {
    const { request } = info;
    api.notifications.create({
        type: "basic",
        iconUrl: "./icons/icon-192.png",
        title: "Redirection triggered",
        message: `Url: ${request.url}`,
    });
}

api.runtime.onInstalled.addListener(() => {
    rebuildRules().catch(console.error);
});

if (isFirefox) {
    rebuildRules().catch(console.error);
}

api.runtime.onMessage.addListener((msg) => {
    if (msg.type === "rebuild") {
        rebuildRules().catch(console.error);
    }
});

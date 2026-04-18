if (!globalThis.core || !globalThis.engine) {
    if (typeof importScripts === "function") {
        importScripts("./rule-core.js", "./rule-engine.js");
    }
}

const api = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined" && typeof browser.runtime?.getBrowserInfo === "function";
const { readRules } = globalThis.core;
const { buildDynamicRule, resolveRedirectUrl } = globalThis.engine;
let cachedRules = [];

const scheduleRebuild = () => rebuildRules().catch(console.error);

function getRuleLabel(rule) {
    return rule?.name?.trim() || "Untitled rule";
}

function notifyRedirect(rule, sourceUrl, targetUrl) {
    api.notifications.create({
        type: "basic",
        iconUrl: "./icons/icon-192.png",
        title: "Redirect applied",
        message: `${getRuleLabel(rule)}\n${sourceUrl} -> ${targetUrl}`,
    });
}

function webRequestHandler(details) {
    for (const rule of cachedRules) {
        if (!rule.enabled || !rule.input) continue;

        try {
            const redirectUrl = resolveRedirectUrl(details.url, rule);
            if (redirectUrl && redirectUrl !== details.url) {
                notifyRedirect(rule, details.url, redirectUrl);
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

    const ids = (await api.declarativeNetRequest.getDynamicRules()).map((rule) => rule.id);
    if (!ids.length) return;

    await api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ids,
        addRules: [],
    });
}

async function rebuildRules() {
    cachedRules = await readRules();

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
            api.webRequest.onBeforeRequest.removeListener(webRequestHandler);

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
    const requestUrl = info.request?.url;
    const rule = cachedRules.find((item) => item.id === info.rule?.ruleId) ?? null;

    if (!requestUrl) {
        return;
    }

    const redirectUrl = rule ? resolveRedirectUrl(requestUrl, rule) || requestUrl : requestUrl;
    notifyRedirect(rule, requestUrl, redirectUrl);
}

api.runtime.onInstalled.addListener(() => {
    scheduleRebuild();
});

if (isFirefox) {
    scheduleRebuild();
}

api.runtime.onMessage.addListener((msg) => {
    if (msg.type === "rebuild") {
        scheduleRebuild();
    }
});

const api = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined" && typeof browser.runtime?.getBrowserInfo === "function";
let cachedRules = [];

function webRequestHandler(details) {
    for (const rule of cachedRules) {
        if (!rule.enabled) continue;
        try {
            const regex = new RegExp(rule.pattern);
            if (regex.test(details.url)) {
                const redirectUrl = details.url.replace(regex, rule.output);

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
    cachedRules = rules;

    if (!isFirefox && api.declarativeNetRequest) { // Chrome
        await clearDynamicRules();

        const newRules = rules.filter((rule) => rule.enabled).map((rule) => ({
            id: rule.id,
            priority: 1,
            action: {
                type: "redirect",
                redirect: {
                    regexSubstitution: rule.output,
                },
            },
            condition: {
                regexFilter: rule.pattern,
                resourceTypes: ["main_frame", "sub_frame"],
            },
        }));

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
    } else if (api.webRequest) { // Firefox
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

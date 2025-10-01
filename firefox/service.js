const api = typeof browser !== "undefined" ? browser : chrome;

const { rules = [] } = await api.storage.local.get({ rules: [] });

function webRequestHandler(details) {
    for (const rule of rules) {
        if (!rule.enabled) continue;
        try {
            const regex = new RegExp(rule.pattern);
            if (regex.test(details.url)) {
                api.notifications.create({
                    type: "basic",
                    iconUrl: "icons/icon-128.png",
                    title: "URL Redirected",
                    message: `From:\n${details.url}\nTo:\n${newUrl}`
                });
                return { redirectUrl: details.url.replace(regex, rule.output) };
            }
        } catch(e) {
            console.error(e);
        }
    }
    return {};
}

async function rebuildRules() {
    if (api.declarativeNetRequest) { // Chrome
        const existing = await api.declarativeNetRequest.getDynamicRules();
        const ids = existing.map(r => r.id);
        
        if (ids.length) {
            await api.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: ids,
                addRules: [],
            });
        }

        const newRules = rules.filter(rule => rule.enabled).map(rule => ({
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
                resourceTypes: [
                    "main_frame","sub_frame","xmlhttprequest",
                    "script","image","stylesheet","font","ping","other",
                ],
            },
        }));

        if (newRules.length) {
            await api.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [],
                addRules: newRules,
            });
        }
    } else if (api.webRequest) { // Firefox
        try {
            if (api.webRequest.onBeforeRequest.hasListener(webRequestHandler)) {
                api.webRequest.onBeforeRequest.removeListener(webRequestHandler);
            }

            api.webRequest.onBeforeRequest.addListener(
                webRequestHandler,
                { urls: ["<all_urls>"] },
                ["blocking"]
            );
        } catch(e) {
            console.error(e);
        }
    }
}

api.runtime.onInstalled.addListener(() => {
    rebuildRules();
});

// api.storage.onChanged.addListener((changes, area) => {
//     if (area === "local" && changes.rules) {
//         rebuildRules();
//     }
// });

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "rebuild") {
        rebuildRules();
    }
});
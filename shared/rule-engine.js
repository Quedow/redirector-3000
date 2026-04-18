(function (root) {
    const chromeResourceTypes = [
        "main_frame",
        "sub_frame",
        "stylesheet",
        "script",
        "image",
        "font",
        "object",
        "xmlhttprequest",
        "ping",
        "csp_report",
        "media",
        "websocket",
        "webtransport",
        "webbundle",
        "other",
    ];

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
        if (rule.matchType === "equal") {
            return url === rule.input ? rule.output : null;
        }

        if (!url.includes(rule.input)) {
            return null;
        }

        return rule.actionType === "redirect"
            ? rule.output
            : replaceFirstLiteral(url, rule.input, rule.output);
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
                resourceTypes: chromeResourceTypes,
            },
        };
    }

    root.engine = {
        buildDynamicRule,
        resolveRedirectUrl,
    };
})(globalThis);

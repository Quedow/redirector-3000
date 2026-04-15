const view = new URLSearchParams(window.location.search).get("view");

document.documentElement.dataset.view = view === "popup" ? "popup" : "full";

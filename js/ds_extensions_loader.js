// Deathshot Arsenal frontend-extension bridge.
//
// Node-specific JavaScript stays in ./js and is loaded normally through
// WEB_DIRECTORY. Canvas/application-level features live in the sibling
// ./extensions directory. The Python module exposes that directory through
// /ds_extensions/DeathshotArsenal, and this tiny bridge imports the feature.


const DS_EXTENSION_BASE = "/ds_extensions/DeathshotArsenal/";

async function loadDsExtension(name) {
    try {
        await import(`${DS_EXTENSION_BASE}${name}?v=2.0.0&t=${Date.now()}`);
        console.log(`[DeathshotArsenal] Loaded frontend extension: ${name}`);
    } catch (error) {
        console.error(`[DeathshotArsenal] Failed to load frontend extension: ${name}`, error);
    }
}

loadDsExtension("ds_group.js");
loadDsExtension("ds_gear_menu.js");
loadDsExtension("ds_reminder_global.js");
loadDsExtension("ds_snap.js");

// Theme Manager is kept in a nested UI folder. Load it explicitly so its
// extension registration does not depend on frontend directory scanning.
(async () => {
    try {
        await import("./Theme Manager/ds_theme_manager.js");
        console.log("[DeathshotArsenal] Loaded Theme Manager frontend");
    } catch (error) {
        console.error("[DeathshotArsenal] Failed to load Theme Manager frontend:", error);
    }
    try {
        await import("./Controller/ds_controller.js");
        console.log("[DeathshotArsenal] Loaded DS Controller frontend");
    } catch (error) {
        console.error("[DeathshotArsenal] Failed to load DS Controller frontend:", error);
    }
})();


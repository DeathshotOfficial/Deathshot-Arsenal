// Deathshot Arsenal frontend-extension bridge.
//
// Node-specific JavaScript stays in ./js and is loaded normally through
// WEB_DIRECTORY. Canvas/application-level features live in the sibling
// ./extensions directory. The Python module exposes that directory through
// /ds_extensions/DeathshotArsenal, and this tiny bridge imports the feature.

const DS_EXTENSION_BASE = "/ds_extensions/DeathshotArsenal/";

async function loadDsExtension(name) {
    try {
        await import(`${DS_EXTENSION_BASE}${name}`);
        console.log(`[DeathshotArsenal] Loaded frontend extension: ${name}`);
    } catch (error) {
        console.error(`[DeathshotArsenal] Failed to load frontend extension: ${name}`, error);
    }
}

loadDsExtension("ds_group.js");
loadDsExtension("ds_gear_menu.js");
loadDsExtension("ds_reminder_global.js");

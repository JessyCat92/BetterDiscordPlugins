/**
 * @name Game Activity Toggle Erweiterung
 * @author Jessi
 * @version 1.1.3
 * @description Schaltet die Spielaktivitätsanzeige nach einem lokalen Wochenzeitplan aus und stellt danach den vorherigen Zustand wieder her.
 * @authorLink https://github.com/JessyCat92
 * @website https://github.com/JessyCat92/BetterDiscordPlugins
 * @source https://github.com/JessyCat92/BetterDiscordPlugins/blob/main/GameActivityToggleExtension.plugin.js
 */

const DATA_KEY = "GameActivityToggleExtension";
const DEFAULTS = {enabled: false, days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00"};

module.exports = class GameActivityToggleExtension {
    static minutes(value) {
        if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
        return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    }

    static isActive(options, now = new Date()) {
        if (!options.enabled) return false;
        return this.schedule(options).some(row => this.rowActive(row, now));
    }

    static schedule(options) {
        if (Array.isArray(options.schedule)) return options.schedule;
        return (options.days ?? DEFAULTS.days).map(day => ({day,
            start: options.start ?? DEFAULTS.start, end: options.end ?? DEFAULTS.end}));
    }

    static rowActive(row, now) {
        const start = this.minutes(row.start), end = this.minutes(row.end);
        if (start === null || end === null || start === end) return false;
        const minute = now.getHours() * 60 + now.getMinutes();
        const day = now.getDay();
        if (start < end) return row.day === day && minute >= start && minute < end;
        // For overnight windows the selected weekday is the day they START.
        return (row.day === day && minute >= start) ||
            (row.day === (day + 6) % 7 && minute < end);
    }

    loadOptions() {
        const saved = BdApi.Data.load(DATA_KEY, "options") || {};
        const legacy = {
            enabled: saved.enabled === true,
            days: Array.isArray(saved.days) ? saved.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [...DEFAULTS.days],
            start: this.constructor.minutes(saved.start) !== null ? saved.start : DEFAULTS.start,
            end: this.constructor.minutes(saved.end) !== null ? saved.end : DEFAULTS.end
        };
        const options = {enabled: legacy.enabled, schedule: this.constructor.schedule(
            Array.isArray(saved.schedule) ? saved : legacy
        ).filter(row => row && Number.isInteger(row.day) && row.day >= 0 && row.day <= 6 &&
            this.constructor.minutes(row.start) !== null && this.constructor.minutes(row.end) !== null
        ).map(({day, start, end}) => ({day, start, end}))};
        // Persist the migration once, including empty selections and the pause choice.
        if (!Array.isArray(saved.schedule)) BdApi.Data.save(DATA_KEY, "options", options);
        return options;
    }

    start() {
        if (this.running) return;
        this.options = this.loadOptions();
        this.running = true;
        BdApi.DOM.addStyle(DATA_KEY, `
            .gat-extension-button:hover,
            .gat-extension-button:focus-visible {
                --gat-extension-background: var(--background-modifier-hover, var(--background-mod-subtle, rgba(255, 255, 255, 0.1)));
            }
        `);
        this.mountButton();
        this.observer = new MutationObserver(() => this.mountButton());
        this.observer.observe(document.body, {childList: true, subtree: true});
        this.wake = () => this.tick();
        window.addEventListener("focus", this.wake);
        this.timer = setInterval(this.wake, 5000);
        this.tick();
    }

    stop() {
        this.running = false;
        this.observer?.disconnect();
        this.tooltip?.hide();
        this.tooltip = null;
        this.button?.remove();
        this.button = null;
        BdApi.DOM.removeStyle(DATA_KEY);
        clearInterval(this.timer);
        if (this.wake) window.removeEventListener("focus", this.wake);
        // If a write is in flight, its finally block performs the restoration.
        if (this.busy) this.restoreAfterWrite = true;
        else this.tick(true);
    }

    saveOptions() {
        BdApi.Data.save(DATA_KEY, "options", this.options);
        this.updateButton();
        this.refreshSettings?.();
        this.tick();
    }

    mountButton() {
        if (!this.running) return;
        // BDFDB CustomClassModules.GameActivityToggle uses camelCase classes.
        // Both markers are specific to processAccount, unlike generic voice-panel buttons.
        const anchor = document.querySelector('[class*="gameActivityToggleAdded_"] [class*="gameActivityToggleButton_"]');
        if (!anchor) {
            this.tooltip?.hide();
            this.button?.remove();
            return;
        }
        if (!this.button) {
            this.button = document.createElement("button");
            this.button.type = "button";
            this.button.className = "gat-extension-button";
            this.button.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15H8l-3 3a2 2 0 0 1-3.3-1.8l1.5-8A4 4 0 0 1 6.1 5h10.8a4 4 0 0 1 3.9 3.2l.4 2"/><path d="M7 8v5m-2.5-2.5h5"/><circle cx="15" cy="8.5" r=".9" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r=".9" fill="currentColor" stroke="none"/><circle cx="17.5" cy="17.5" r="5"/><path d="M17.5 14.5v3l2 1.2"/><path class="pause-mark" d="M2 2l20 20" stroke-width="2.4"/></svg>';
            this.button.addEventListener("click", () => {
                this.options.enabled = !this.options.enabled;
                this.saveOptions();
                BdApi.UI.showToast(this.options.enabled ? "Zeitsteuerung aktiviert" : "Zeitsteuerung pausiert – manuelle Steuerung frei", {type: "info"});
            });
            this.tooltip = BdApi.UI.createTooltip(this.button, "", {side: "top", disabled: false});
            this.button.addEventListener("focus", () => this.tooltip?.show());
            this.button.addEventListener("blur", () => this.tooltip?.hide());
            this.updateButton();
        }
        if (!this.button.dataset.placement) {
            this.button.dataset.placement = "inline";
            this.button.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;flex-shrink:0;border:0;border-radius:8px;cursor:pointer;background:var(--gat-extension-background,transparent);" +
                "position:relative;margin:0 3px;";
            this.updateButton();
        }
        // Move the existing node; never append a duplicate or float over the voice panel.
        if (anchor.nextElementSibling !== this.button) anchor.after(this.button);
    }

    updateButton() {
        if (!this.button) return;
        const enabled = this.options.enabled;
        const label = enabled ? "Zeitsteuerung aktiv – klicken zum Pausieren" : "Zeitsteuerung pausiert – klicken zum Aktivieren";
        if (this.tooltip) this.tooltip.labelElement.textContent = enabled ? "Zeitsteuerung pausieren" : "Zeitsteuerung aktivieren";
        this.button.setAttribute("aria-label", label);
        this.button.setAttribute("aria-pressed", String(enabled));
        this.button.style.color = enabled ? "#fff" : "var(--status-danger,#f23f43)";
        this.button.querySelector(".pause-mark").style.display = enabled ? "none" : "block";
    }

    resolveModules() {
        this.users = BdApi.Webpack.getStore("UserStore");
        this.settings = BdApi.Webpack.getStore("UserSettingsProtoStore");
        const matches = value => typeof value?.updateAsync === "function" &&
            value?.ProtoClass?.typeName?.endsWith(".PreloadedUserSettings");
        this.writer = BdApi.Webpack.getModule(matches, {searchExports: true});
        if (!this.writer) this.writer = BdApi.Webpack.getModule(matches);
        // Same action type and protobuf path as the installed BDFDB/GameActivityToggle.
        this.actionTypes = BdApi.Webpack.getModule(value => value != null &&
            typeof value.INFREQUENT_USER_ACTION === "number", {searchExports: true});
        if (!this.users || !this.settings || !this.writer) throw new Error("Discord-Einstellungsmodule sind noch nicht verfügbar.");
    }

    currentValue() {
        return this.settings?.settings?.status?.showCurrentGame?.value;
    }

    async tick(restoring = false) {
        if (this.busy || (!this.running && !restoring)) return;
        this.busy = true;
        try {
            if (!this.writer || !this.users || !this.settings) this.resolveModules();
            const id = this.users.getCurrentUser()?.id;
            const current = this.currentValue();
            // Never infer a state before the account settings are available.
            if (!id || typeof current !== "boolean") return;
            const key = `restore_${id}`;
            let pending = BdApi.Data.load(DATA_KEY, key);
            if (typeof pending?.previous !== "boolean") pending = null;
            const active = !restoring && this.constructor.isActive(this.options);
            if (active && !pending) {
                pending = {previous: current};
                // Save BEFORE changing Discord, so an interrupted process can recover.
                BdApi.Data.save(DATA_KEY, key, pending);
            }
            if (!active && !pending) return;
            const target = active ? false : pending.previous;
            if (current !== target) {
                await this.writer.updateAsync("status", status => {
                    // Discord may defer invoking this callback; do not write into a different account.
                    if (this.users.getCurrentUser()?.id !== id) return;
                    if (!status.showCurrentGame) status.showCurrentGame = {};
                    status.showCurrentGame.value = target;
                }, this.actionTypes?.INFREQUENT_USER_ACTION ?? 0);
            }
            // Keep the journal until the store confirms restoration, including failed writes.
            if (!active && this.users.getCurrentUser()?.id === id && this.currentValue() === target) {
                BdApi.Data.delete(DATA_KEY, key);
            }
            this.reportedError = false;
        }
        catch (error) {
            if (!this.reportedError) {
                console.error(`[${DATA_KEY}]`, error);
                BdApi.UI.showToast("Aktivitäts-Automatik: Einstellung nicht erreichbar. Wiederherstellung bleibt gespeichert; bei aktivem Plugin wird erneut versucht.", {type: "error"});
                this.reportedError = true;
            }
        }
        finally {
            this.busy = false;
            if (this.restoreAfterWrite) {
                this.restoreAfterWrite = false;
                this.tick(!this.running);
            }
        }
    }

    getSettingsPanel() {
        this.options ??= this.loadOptions();
        const plugin = this;
        const React = BdApi.React;
        const h = React.createElement;
        const Button = BdApi.Components.Button;
        const weekdays = [[1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"], [4, "Donnerstag"], [5, "Freitag"], [6, "Samstag"], [0, "Sonntag"]];
        return h(function ScheduleSettings() {
            const [, redraw] = React.useState(0);
            React.useEffect(() => {
                const refresh = () => redraw(value => value + 1);
                plugin.refreshSettings = refresh;
                return () => { if (plugin.refreshSettings === refresh) delete plugin.refreshSettings; };
            }, []);
            const change = (index, key, value) => {
                const row = {...plugin.options.schedule[index], [key]: value};
                if (PluginTimeInvalid(row)) {
                    BdApi.UI.showToast("Bitte unterschiedliche, gültige Start- und Endzeiten wählen.", {type: "error"});
                    redraw(value => value + 1);
                    return;
                }
                plugin.options.schedule[index] = row;
                plugin.saveOptions();
            };
            const PluginTimeInvalid = row => plugin.constructor.minutes(row.start) === null ||
                plugin.constructor.minutes(row.end) === null || row.start === row.end;
            const rows = plugin.options.schedule.map((row, index) => h("tr", {key: index},
                h("td", null, h("select", {className: "gat-schedule-input gat-schedule-day", value: row.day, "aria-label": `Wochentag Zeile ${index + 1}`,
                    onChange: event => change(index, "day", Number(event.target.value))},
                    weekdays.map(([day, name]) => h("option", {key: day, value: day}, name)))),
                ...["start", "end"].map(key => h("td", {key}, h("input", {type: "time", required: true, className: "bd-text-input gat-schedule-input gat-schedule-time",
                    value: row[key], "aria-label": `${key === "start" ? "Beginn" : "Ende"} Zeile ${index + 1}`,
                    onChange: event => change(index, key, event.target.value)}))),
                h("td", null, h(Button, {type: "button", className: "gat-schedule-remove", color: Button.Colors.RED, look: Button.Looks.FILLED, size: Button.Sizes.SMALL, grow: false,
                    "aria-label": `Zeitfenster ${index + 1} entfernen`, onClick: () => {
                        plugin.options.schedule.splice(index, 1);
                        plugin.saveOptions();
                    }}, "Entfernen"))));
            return h("div", {className: "gat-schedule-settings", style: {color: "var(--text-normal)", padding: 16}},
                h("style", null, `
                    .gat-schedule-settings .gat-schedule-input {
                        box-sizing: border-box; min-height: 38px; width: 100%;
                        padding: 8px 10px; border-radius: 6px; font: inherit;
                        color: var(--text-normal, #f2f3f5);
                        background: var(--input-background, var(--background-base-low, #1e1f22));
                        border: 1px solid var(--input-border, rgba(128,128,128,.6));
                        color-scheme: dark;
                    }
                    .theme-light .gat-schedule-settings .gat-schedule-input { color-scheme: light; }
                    .gat-schedule-settings .gat-schedule-day { min-width: 132px; cursor: pointer; appearance: auto; }
                    .gat-schedule-settings .gat-schedule-day option { background: var(--background-secondary, #2b2d31); color: var(--text-normal, #f2f3f5); }
                    .gat-schedule-settings .gat-schedule-time { min-width: 122px; }
                    .gat-schedule-settings .gat-schedule-input:hover { border-color: var(--interactive-hover, #b5bac1); }
                    .gat-schedule-settings .gat-schedule-input:focus-visible,
                    .gat-schedule-settings .bd-button:focus-visible {
                        outline: 2px solid var(--focus-primary, #00a8fc); outline-offset: 2px;
                    }
                    .gat-schedule-settings input[type=time]::-webkit-calendar-picker-indicator {
                        opacity: 1; cursor: pointer; padding: 3px; border-radius: 4px;
                    }
                    .gat-schedule-settings input[type=time]::-webkit-calendar-picker-indicator:hover {
                        background: var(--background-modifier-hover, rgba(128,128,128,.25));
                    }
                    .gat-schedule-settings .gat-schedule-remove { min-height: 38px; min-width: 96px; }
                    .gat-schedule-settings .gat-schedule-add { width: auto; min-width: 208px; min-height: 38px; padding: 0 18px; margin: 12px 0 16px; }
                    .gat-schedule-settings th { padding-bottom: 4px; font-weight: 600; }
                `),
                BdApi.UI.buildSettingsPanel({settings: [{type: "switch", id: "enabled",
                    name: "Automatik aktivieren", note: "Pausieren gibt den manuellen Game-Activity-Schalter frei. Die Wahl bleibt nach Neustarts erhalten.",
                    value: plugin.options.enabled}], onChange: (_category, id, value) => {
                        if (id === "enabled") { plugin.options.enabled = value === true; plugin.saveOptions(); }
                    }}),
                h("p", null, "Lokale Rechnerzeit; Prüfung alle 5 Sekunden. Mehrere Zeitfenster je Tag sind möglich. Bei Zeitfenstern über Mitternacht gilt der Tag als Starttag. Überlappende und direkt anschließende Fenster bleiben durchgehend aktiv."),
                h("div", {style: {overflowX: "auto"}}, h("table", {style: {width: "100%", borderSpacing: "8px"}, "aria-label": "Zeitplan"},
                    h("thead", null, h("tr", null, ...["Wochentag", "Beginn", "Ende", "Aktion"].map(label => h("th", {key: label, scope: "col", style: {textAlign: "left"}}, label)))),
                    h("tbody", null, ...rows))),
                !rows.length && h("p", null, "Keine Zeitfenster: Die Aktivitätsanzeige wird nicht automatisch ausgeschaltet."),
                h(Button, {type: "button", className: "gat-schedule-add", color: Button.Colors.BRAND, look: Button.Looks.FILLED, size: Button.Sizes.MEDIUM, grow: false, onClick: () => {
                    plugin.options.schedule.push({day: 1, start: "09:00", end: "18:00"});
                    plugin.saveOptions();
                }}, "Zeitfenster hinzufügen"),
                h("p", null, "Die Uhr erscheint unmittelbar neben dem sichtbaren Game Activity Toggle im Benutzerbereich. Fehlt dieser Schalter, lässt sich die Automatik hier bedienen."));
        });
    }
};

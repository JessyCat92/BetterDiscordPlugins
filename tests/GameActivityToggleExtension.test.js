const {test, beforeEach} = require("node:test");
const assert = require("node:assert/strict");
const Plugin = require("../GameActivityToggleExtension.plugin.js");
const RealDate = Date;
let clock, data, store, users, writer, writes, plugin, failWrite;
global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
};
const at = (day, hour, minute = 0) => new RealDate(2026, 8, day, hour, minute);
const options = {enabled: true, days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00"};

beforeEach(() => {
    clock = at(21, 10);
    data = new Map();
    store = {settings: {status: {showCurrentGame: {value: true}}}};
    users = {getCurrentUser: () => ({id: "alice"})};
    writes = [];
    failWrite = false;
    writer = {
        ProtoClass: {typeName: "discord.PreloadedUserSettings"},
        async updateAsync(category, callback) {
            if (failWrite) throw new Error("simulated offline write");
            callback(store.settings[category]);
            writes.push(store.settings.status.showCurrentGame.value);
        }
    };
    global.BdApi = {
        Components: {Button: Object.assign(function Button() {}, {Colors: {RED: "red", BRAND: "brand"}, Looks: {FILLED: "filled"}, Sizes: {SMALL: "small", MEDIUM: "medium"}})},
        DOM: {addStyle() {}, removeStyle() {}},
        Data: {
            load: (_, key) => data.has(key) ? structuredClone(data.get(key)) : undefined,
            save: (_, key, value) => data.set(key, structuredClone(value)),
            delete: (_, key) => data.delete(key)
        },
        Webpack: {
            getStore: name => name === "UserStore" ? users : store,
            getModule: filter => [writer, {INFREQUENT_USER_ACTION: 0}].find(filter)
        },
        UI: {showToast() {}, createTooltip: () => ({labelElement: {}, show() {}, hide() {}})}
    };
    plugin = new Plugin();
    plugin.options = structuredClone(options);
    plugin.running = true;
});

test("weekday boundaries, excluded weekend and local wall clock", () => {
    for (const [date, expected] of [[at(21, 8, 59), false], [at(21, 9), true], [at(21, 17, 59), true], [at(21, 18), false], [at(26, 12), false]]) {
        assert.equal(Plugin.isActive(options, date), expected);
    }
});

test("overnight windows belong to starting day, including Sunday rollover", () => {
    const night = {...options, days: [5], start: "22:00", end: "06:00"};
    assert.equal(Plugin.isActive(night, at(25, 23)), true);
    assert.equal(Plugin.isActive(night, at(26, 5, 59)), true);
    assert.equal(Plugin.isActive(night, at(26, 6)), false);
    assert.equal(Plugin.isActive(night, at(26, 23)), false);
    assert.equal(Plugin.isActive({...night, days: [0]}, at(28, 3)), true);
});

test("paused, empty days, invalid and identical times are inactive", () => {
    for (const changes of [{enabled: false}, {days: []}, {start: "25:00"}, {start: "9:00"}, {end: "09:00"}]) {
        assert.equal(Plugin.isActive({...options, ...changes}, at(21, 10)), false);
    }
});

test("defaults are opt-in and saved preferences are sanitized", () => {
    assert.deepEqual(plugin.loadOptions(), {enabled: false, schedule: Plugin.schedule(options)});
    data.set("options", {enabled: true, days: [-1, 2, 8, "3"], start: "bad", end: "20:30"});
    assert.deepEqual(plugin.loadOptions(), {enabled: true, schedule: [{day: 2, start: "09:00", end: "20:30"}]});
});

for (const initial of [true, false]) {
    test(`restores original ${initial} after the window and does not write repeatedly`, async () => {
        store.settings.status.showCurrentGame.value = initial;
        await plugin.tick();
        assert.equal(store.settings.status.showCurrentGame.value, false);
        assert.deepEqual(data.get("restore_alice"), {previous: initial});
        await plugin.tick();
        assert.equal(writes.length, initial ? 1 : 0);
        clock = at(21, 18);
        await plugin.tick();
        assert.equal(store.settings.status.showCurrentGame.value, initial);
        assert.equal(data.has("restore_alice"), false);
    });
}

test("restart inside then outside window retains original state", async () => {
    await plugin.tick();
    plugin = Object.assign(new Plugin(), {running: true, options: structuredClone(options)});
    await plugin.tick();
    assert.deepEqual(data.get("restore_alice"), {previous: true});
    clock = at(22, 1);
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, true);
});

test("pause restores immediately and frees the manual toggle; resume snapshots anew", async () => {
    await plugin.tick();
    plugin.options.enabled = false;
    plugin.saveOptions();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.settings.status.showCurrentGame.value, true);
    assert.equal(data.get("options").enabled, false);
    store.settings.status.showCurrentGame.value = false;
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, false);
    plugin.options.enabled = true;
    await plugin.tick();
    assert.deepEqual(data.get("restore_alice"), {previous: false});
});

test("manual enabling during window is corrected without replacing snapshot", async () => {
    await plugin.tick();
    store.settings.status.showCurrentGame.value = true;
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, false);
    assert.deepEqual(data.get("restore_alice"), {previous: true});
});

test("account recovery records are isolated", async () => {
    await plugin.tick();
    users.getCurrentUser = () => ({id: "bob"});
    store.settings.status.showCurrentGame.value = false;
    await plugin.tick();
    clock = at(21, 18);
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, false);
    assert.equal(data.has("restore_bob"), false);
    assert.equal(data.has("restore_alice"), true);
    users.getCurrentUser = () => ({id: "alice"});
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, true);
});

test("unloaded setting does not fabricate a snapshot", async () => {
    delete store.settings.status.showCurrentGame;
    await plugin.tick();
    assert.equal(data.size, 0);
    assert.deepEqual(writes, []);
});

test("failed restoration keeps journal and retries", async () => {
    await plugin.tick();
    clock = at(21, 18);
    failWrite = true;
    const originalError = console.error;
    console.error = () => {};
    try { await plugin.tick(); } finally { console.error = originalError; }
    assert.equal(data.has("restore_alice"), true);
    failWrite = false;
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, true);
    assert.equal(data.has("restore_alice"), false);
});

test("stop during pending write restores after the write completes", async () => {
    global.window = {removeEventListener() {}};
    let finish;
    const normalWrite = writer.updateAsync;
    writer.updateAsync = (...args) => new Promise(resolve => {
        finish = async () => { await normalWrite(...args); resolve(); };
    });
    const pending = plugin.tick();
    plugin.stop();
    writer.updateAsync = normalWrite;
    await finish();
    await pending;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.settings.status.showCurrentGame.value, true);
    assert.equal(data.has("restore_alice"), false);
});

test("deferred callback cannot alter another account", async () => {
    writer.updateAsync = async (_, callback) => {
        users.getCurrentUser = () => ({id: "bob"});
        callback(store.settings.status);
    };
    await plugin.tick();
    assert.equal(store.settings.status.showCurrentGame.value, true);
    assert.equal(data.has("restore_alice"), true);
});

test("icon toggles persistently, follows its anchor, and is removed on stop", async () => {
    class Element {
        constructor() { this.style = {}; this.dataset = {}; this.attributes = {}; this.events = {}; this.mark = {style: {}}; }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(key, callback) { this.events[key] = callback; }
        querySelector() { return this.mark; }
        append(child) { child.parentElement = this; }
        remove() { this.parentElement = null; }
    }
    const body = new Element(), parent = new Element();
    const makeAnchor = () => ({parentElement: parent, after(child) { child.parentElement = parent; this.nextElementSibling = child; }});
    let anchor = makeAnchor();
    global.document = {body, createElement: () => new Element(), querySelector: selector => {
        assert.equal(selector, '[class*="gameActivityToggleAdded_"] [class*="gameActivityToggleButton_"]');
        return anchor;
    }};
    global.window = {removeEventListener() {}};
    plugin.mountButton();
    const button = plugin.button;
    assert.equal(button.parentElement, parent);
    assert.equal(button.attributes["aria-pressed"], "true");
    button.events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.attributes["aria-pressed"], "false");
    assert.equal(button.mark.style.display, "block");
    assert.equal(new Plugin().loadOptions().enabled, false);
    anchor = null;
    plugin.mountButton();
    assert.equal(button.parentElement, null);
    anchor = makeAnchor();
    plugin.mountButton();
    assert.equal(button.parentElement, parent);
    assert.equal(plugin.button, button);
    plugin.stop();
    assert.equal(button.parentElement, null);
    assert.equal(plugin.button, null);
});

test("legacy preferences migrate losslessly and empty schedules stay empty", () => {
    data.set("options", {...options, enabled: false, days: [0, 2], start: "22:30", end: "06:00"});
    const expected = {enabled: false, schedule: [{day: 0, start: "22:30", end: "06:00"}, {day: 2, start: "22:30", end: "06:00"}]};
    assert.deepEqual(plugin.loadOptions(), expected);
    assert.deepEqual(data.get("options"), expected);
    data.set("options", {enabled: true, schedule: []});
    assert.deepEqual(plugin.loadOptions(), {enabled: true, schedule: []});
});

test("multiple daily windows leave gaps and keep different weekday hours", () => {
    const config = {enabled: true, schedule: [{day: 1, start: "09:00", end: "10:00"},
        {day: 1, start: "12:00", end: "13:00"}, {day: 2, start: "15:00", end: "16:00"}]};
    for (const [date, expected] of [[at(21, 9), true], [at(21, 10), false], [at(21, 12), true], [at(22, 12), false], [at(22, 15), true]]) {
        assert.equal(Plugin.isActive(config, date), expected);
    }
});

test("overlapping and touching rows keep one original snapshot without intermediate enabling", async () => {
    plugin.options = {enabled: true, schedule: [{day: 1, start: "09:00", end: "11:00"},
        {day: 1, start: "10:00", end: "12:00"}, {day: 1, start: "12:00", end: "13:00"}]};
    for (const hour of [9, 10, 11, 12]) {
        clock = at(21, hour);
        await plugin.tick();
        assert.deepEqual(writes, [false]);
        assert.deepEqual(data.get("restore_alice"), {previous: true});
    }
    clock = at(21, 13);
    await plugin.tick();
    assert.deepEqual(writes, [false, true]);
});

test("overnight and next-day adjacent rows stay active at boundary", () => {
    const config = {enabled: true, schedule: [{day: 0, start: "22:00", end: "06:00"}, {day: 1, start: "06:00", end: "09:00"}]};
    assert.equal(Plugin.isActive(config, at(28, 5, 59)), true);
    assert.equal(Plugin.isActive(config, at(28, 6)), true);
    assert.equal(Plugin.isActive(config, at(28, 9)), false);
});

test("settings use native switch and allow adding, editing, removing independent rows", () => {
    plugin.options = plugin.loadOptions();
    plugin.running = false;
    global.BdApi.React = {
        createElement: (type, props, ...children) => ({type, props: props || {}, children}),
        useState: () => [0, () => {}], useEffect: callback => callback()
    };
    global.BdApi.UI.buildSettingsPanel = props => ({type: "native-settings", props, children: []});
    const component = plugin.getSettingsPanel();
    const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === "object" ? [node, ...(node.children ?? []).flatMap(flatten)] : [];
    const render = () => flatten(component.type());
    let nodes = render();
    const native = nodes.find(node => node.type === "native-settings");
    assert.equal(native.props.settings[0].type, "switch");
    assert.equal(native.props.settings[0].value, false);
    native.props.onChange(null, "enabled", true);
    assert.equal(data.get("options").enabled, true);
    nodes.find(node => node.children.includes("Zeitfenster hinzufügen")).props.onClick();
    assert.equal(plugin.options.schedule.length, 6);
    nodes = render();
    nodes.find(node => node.props["aria-label"] === "Wochentag Zeile 6").props.onChange({target: {value: "1"}});
    nodes.find(node => node.props["aria-label"] === "Beginn Zeile 6").props.onChange({target: {value: "19:00"}});
    nodes.find(node => node.props["aria-label"] === "Ende Zeile 6").props.onChange({target: {value: "20:00"}});
    assert.deepEqual(plugin.options.schedule[5], {day: 1, start: "19:00", end: "20:00"});
    assert.equal(plugin.options.schedule[0].start, "09:00");
    nodes.find(node => node.props["aria-label"] === "Zeitfenster 6 entfernen").props.onClick();
    assert.equal(data.get("options").schedule.length, 5);
});

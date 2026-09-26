const test = require("node:test");
const assert = require("node:assert/strict");
const VoiceIcon = require("../ServerVoiceCounter.plugin.js");

test("product name matches metadata and remains identical in both languages", () => {
    const source = require("node:fs").readFileSync(require.resolve("../ServerVoiceCounter.plugin.js"), "utf8");
    assert.match(source, /@name Server Voice Counter\r?\n/);
    const state = setup("de");
    const plugin = new VoiceIcon();
    assert.equal(plugin.getName(), "Server Voice Counter");
    assert.match(plugin.t("readError"), /^Server Voice Counter:/);
    state.locale = "en";
    assert.equal(plugin.getName(), "Server Voice Counter");
    assert.match(plugin.t("readError"), /^Server Voice Counter:/);
});

function setup(locale = "en-US") {
    const state = {locale, saved: true, updates: 0, toasts: [], listeners: new Set(), domLanguage: "en"};
    const store = {
        getLocale: () => state.locale,
        addChangeListener: fn => state.listeners.add(fn),
        removeChangeListener: fn => state.listeners.delete(fn)
    };
    global.BdApi = {
        Webpack: {getStore: () => store, getModule: () => null},
        Data: {load: () => state.saved, save: (name, key, value) => {
            assert.equal(name, "voiceIcon"); assert.equal(key, "showCount"); state.saved = value;
        }},
        UI: {buildSettingsPanel: config => config, showToast: message => state.toasts.push(message)},
        React: {
            createElement: (type, props, ...children) => ({type, props, children}),
            useState: () => [0, () => state.updates++],
            useEffect: effect => { state.effect = effect; }
        }
    };
    global.document = {documentElement: {getAttribute: () => state.domLanguage}};
    global.window = {addEventListener: (_event, fn) => {state.focus = fn;}, removeEventListener: () => {state.focus = null;}};
    global.MutationObserver = class {
        constructor(fn) {state.observer = fn;}
        observe() {}
        disconnect() {state.disconnected = true;}
    };
    return state;
}

test("German, English and unsupported locale fallback cover every text", () => {
    const state = setup();
    const plugin = new VoiceIcon();
    for (const [locale, expected] of [["de", "de"], ["de-DE", "de"], ["DE_at", "de"], ["en-US", "en"], ["en-GB", "en"], ["fr", "en"], ["", "en"]]) {
        state.locale = locale;
        assert.equal(plugin.language(), expected);
        const settings = plugin.buildSettingsPanel().settings[0];
        assert.equal(settings.type, "switch");
        assert.equal(settings.name, expected === "de" ? "Personenzahl anzeigen" : "Show participant count");
        assert.match(settings.note, expected === "de" ? /einschließlich dir selbst/ : /including yourself/);
        assert.match(plugin.getDescription(), expected === "de" ? /Lautsprecher/ : /speaker/);
        assert.match(plugin.t("modulesError"), expected === "de" ? /nicht verfügbar/ : /unavailable/);
        assert.match(plugin.t("readError"), expected === "de" ? /Konsole/ : /console/);
    }
});

test("chosen Discord locale and document fallback; module failure stays English", () => {
    const state = setup();
    BdApi.Webpack.getStore = () => null;
    const module = {_chosenLocale: "de"};
    BdApi.Webpack.getModule = () => module;
    const plugin = new VoiceIcon();
    assert.equal(plugin.language(), "de");
    module._chosenLocale = "es"; assert.equal(plugin.language(), "en");
    module._chosenLocale = ""; state.domLanguage = "de-DE"; assert.equal(plugin.language(), "de");
    BdApi.Webpack.getStore = () => {throw new Error("unavailable");};
    assert.equal(new VoiceIcon().language(), "en");
});

test("open settings refresh on language change and detach on unmount", () => {
    const state = setup("de");
    const plugin = new VoiceIcon();
    const element = plugin.getSettingsPanel();
    let rendered = element.type();
    assert.equal(rendered.props.lang, "de");
    const cleanup = state.effect();
    assert.equal(state.listeners.size, 1);
    state.locale = "en-US";
    for (const fn of state.listeners) fn();
    assert.equal(state.updates, 1);
    rendered = element.type();
    assert.equal(rendered.props.lang, "en");
    assert.equal(rendered.children[0].settings[0].name, "Show participant count");
    state.observer(); state.focus(); assert.equal(state.updates, 3);
    cleanup(); assert.equal(state.listeners.size, 0); assert.equal(state.disconnected, true); assert.equal(state.focus, null);
});

test("setting retains storage key and updates live; errors use current language", () => {
    const state = setup("de");
    const plugin = new VoiceIcon();
    plugin.running = true;
    let scheduled = 0; plugin.schedule = () => scheduled++;
    assert.equal(plugin.buildSettingsPanel().settings[0].value, true);
    plugin.buildSettingsPanel().onChange(null, "showCount", false);
    assert.equal(state.saved, false); assert.equal(plugin.showCount, false); assert.equal(scheduled, 1);
    state.locale = "en";
    assert.equal(plugin.buildSettingsPanel().settings[0].value, false);
    plugin.stop = () => {};
    const log = console.error; console.error = () => {};
    try {
        plugin.fail(new Error("test")); state.locale = "de"; plugin.fail(new Error("test"));
    } finally {console.error = log;}
    assert.match(state.toasts[0], /console/); assert.match(state.toasts[1], /Konsole/);
});

test("participant counting still deduplicates and filters hidden/non-voice channels", () => {
    setup();
    const plugin = new VoiceIcon();
    const channels = {a: {guild_id: "1", type: 2}, b: {guild_id: "1", type: 13}, hidden: {guild_id: "2", type: 2}, text: {guild_id: "1", type: 0}};
    plugin.channels = {getChannel: id => channels[id]};
    plugin.permissions = {can: (_, channel) => channel.guild_id !== "2"};
    plugin.voice = {getAllVoiceStates: () => ({a: {u: {userId: "u", channelId: "a"}}, b: [
        {userId: "v", channelId: "b"}, {userId: "u", channelId: "a"},
        {userId: "w", channelId: "hidden"}, {userId: "x", channelId: "text"}
    ]})};
    assert.deepEqual([...plugin.voiceCounts()], [["1", 2]]);
});

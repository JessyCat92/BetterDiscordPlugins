const {test} = require('node:test');
const assert = require('node:assert/strict');
const Plugin = require('../FriendVoiceNotify.plugin.js');

function fixture(locale = 'en-US') {
    const state = {locale, domLocale: 'en', messages: [], notifications: [], redraws: 0, effects: [], data: new Map(), events: new Map(), listeners: new Set()};
    const dispatcher = {dispatch() {}, subscribe: (key, fn) => state.events.set(key, fn), unsubscribe: key => state.events.delete(key)};
    const stores = {
        LocaleStore: {getLocale: () => state.locale, addChangeListener: fn => state.listeners.add(fn), removeChangeListener: fn => state.listeners.delete(fn)},
        VoiceStateStore: {getAllVoiceStates: () => ({}), _dispatcher: dispatcher},
        UserStore: {getCurrentUser: () => ({id: 'self'}), getUser: () => ({globalName: 'Alex {guild}'})},
        ChannelStore: {getChannel: () => ({guild_id: 'g', type: 2, name: 'Lobby'})},
        GuildStore: {getGuild: () => ({name: 'Server'})}, PermissionStore: {can: () => true}
    };
    state.stores = stores;
    global.BdApi = {
        Webpack: {getStore: key => stores[key], getModule: filter => [state.localeModule, dispatcher].find(filter)},
        Data: {load: (_, key) => state.data.get(key), save: (_, key, value) => state.data.set(key, value)},
        ContextMenu: {patch: (_, fn) => {state.patch = fn; return () => {state.patch = null;};}, buildItem: props => ({props})},
        UI: {showToast: text => state.messages.push(text), buildSettingsPanel: props => props},
        React: {createElement: (type, props, ...children) => ({type, props, children}),
            useState: () => [0, () => state.redraws++], useEffect: fn => state.effects.push(fn())}
    };
    global.document = {documentElement: {getAttribute: () => state.domLocale}};
    global.MutationObserver = class {
        constructor(fn) {state.observer = this; this.callback = fn;}
        observe() {} disconnect() {this.disconnected = true;}
    };
    global.Notification = class {
        static permission = 'granted';
        constructor(title, options) {this.title = title; this.body = options.body; state.notifications.push(this);}
        close() {this.closed = true; this.onclose?.();}
    };
    state.plugin = new Plugin();
    state.cleanup = () => {
        state.plugin.stop();
        for (const key of ['BdApi', 'document', 'MutationObserver', 'Notification']) delete global[key];
    };
    return state;
}

test('German, English and unsupported locales localize settings, menu, toasts and desktop alerts', () => {
    for (const [locale, german] of [['de', true], ['de-DE', true], ['de_AT', true], ['en-US', false], ['fr', false]]) {
        const f = fixture(locale);
        try {
            const p = f.plugin;
            p.start();
            assert.equal(p.running, true);
            const tree = {props: {navId: 'user-context', children: []}};
            f.patch(tree, {user: {id: 'friend'}});
            const item = tree.props.children[0].props;
            assert.equal(item.label, german ? 'Voice-Benachrichtigung' : 'Voice notifications');
            assert.equal(item.type, 'toggle');
            item.action();
            assert.equal(f.messages.at(-1), german ? 'Voice-Benachrichtigung aktiviert.' : 'Voice notifications enabled.');
            assert.deepEqual(f.data.get('users-self'), ['friend']);
            p.process([{guildId: 'g', userId: 'friend', channelId: 'c'}]);
            assert.equal(f.notifications[0].title, german ? 'Voice-Benachrichtigung' : 'Voice notification');
            assert.equal(f.notifications[0].body, `Alex {guild} ${german ? 'betritt' : 'joined'} Server → Lobby`);
            p.notify('friend', {name: 'Server'}, {name: 'Lobby'}, true);
            assert.match(f.messages.at(-1), german ? /wechselt in/ : /moved to/);
            const settings = p.buildSettingsPanel();
            assert.equal(settings.settings[0].name, german ? 'Desktop-Benachrichtigungen' : 'Desktop notifications');
            assert.equal(settings.settings[1].name, german ? 'Auch Channelwechsel melden' : 'Notify on channel changes');
            assert.match(settings.settings[0].note, german ? /Benötigt/ : /Requires/);
            settings.onChange(null, 'moves', true);
            assert.equal(f.data.get('options').moves, true);
            assert.match(p.getDescription(), german ? /Benachrichtigt/ : /Get notified/);
            p.toggle('friend');
            assert.equal(f.messages.at(-1), german ? 'Voice-Benachrichtigung deaktiviert.' : 'Voice notifications disabled.');
        } finally {f.cleanup();}
    }
});

test('Locale priority, module and DOM fallbacks, unavailable locale modules', () => {
    const f = fixture('en-US');
    try {
        f.domLocale = 'de';
        assert.equal(f.plugin.language(), 'en');
        f.locale = 'de';
        assert.equal(f.plugin.language(), 'de');
        delete f.stores.LocaleStore;
        f.localeModule = {_chosenLocale: 'en-GB'};
        const modulePlugin = new Plugin();
        assert.equal(modulePlugin.language(), 'en');
        f.localeModule._chosenLocale = 'de';
        assert.equal(modulePlugin.language(), 'de');
        BdApi.Webpack.getStore = () => {throw new Error('unavailable');};
        BdApi.Webpack.getModule = () => {throw new Error('unavailable');};
        const fallback = new Plugin();
        assert.equal(fallback.language(), 'de');
        f.domLocale = '';
        assert.equal(fallback.language(), 'en');
        assert.equal(fallback.t('missingModule', {method: 'subscribe'}), 'Missing Discord module: subscribe');
    } finally {f.cleanup();}
});

test('Open settings refresh on locale changes and listeners are removed on stop/unmount', () => {
    const f = fixture('en');
    try {
        const p = f.plugin;
        p.start();
        const component = p.getSettingsPanel();
        const first = component.type();
        assert.equal(first.props.lang, 'en');
        f.locale = 'de';
        for (const callback of f.listeners) callback();
        assert.equal(f.redraws, 1);
        assert.equal(p.buildSettingsPanel().settings[0].name, 'Desktop-Benachrichtigungen');
        f.observer.callback();
        assert.equal(f.redraws, 2);
        p.stop();
        assert.equal(f.listeners.size, 0);
        assert.equal(f.events.size, 0);
        assert.equal(f.observer.disconnected, true);
        for (const cleanup of f.effects) cleanup();
        assert.equal(p.localePanelCleanups.size, 0);
    } finally {f.cleanup();}
});

test('Localized failure notification and dispatcher error', () => {
    for (const locale of ['de', 'en']) {
        const f = fixture(locale);
        const originalError = console.error;
        try {
            console.error = () => {};
            BdApi.Webpack.getModule = () => undefined;
            assert.throws(() => f.plugin.findDispatcher(), locale === 'de' ? /Ereignisverteiler/ : /dispatcher/);
            f.plugin.fail(new Error('test'));
            assert.match(f.messages.at(-1), locale === 'de' ? /konnte nicht/ : /could not run/);
        } finally {console.error = originalError; f.cleanup();}
    }
});

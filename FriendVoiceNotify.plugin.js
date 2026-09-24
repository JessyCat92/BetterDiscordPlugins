/**
 * @name FriendVoiceNotify
 * @author Jessi
 * @version 1.0.4
 * @description Get notified when selected users join visible voice channels on shared servers, including server and channel names.
 * @authorLink https://github.com/JessyCat92
 * @website https://github.com/JessyCat92/BetterDiscordPlugins
 * @source https://github.com/JessyCat92/BetterDiscordPlugins/blob/main/FriendVoiceNotify.plugin.js
 */

module.exports = class FriendVoiceNotify {
    start() {
        this.stop();
        this.cleanups = [];
        this.notifications = new Set();
        try {
            this.voice = BdApi.Webpack.getStore("VoiceStateStore");
            this.channels = BdApi.Webpack.getStore("ChannelStore");
            this.guilds = BdApi.Webpack.getStore("GuildStore");
            this.users = BdApi.Webpack.getStore("UserStore");
            this.permissions = BdApi.Webpack.getStore("PermissionStore");
            this.dispatcher = this.findDispatcher();
            for (const [object, method] of [[this.voice, "getAllVoiceStates"],
                [this.channels, "getChannel"], [this.guilds, "getGuild"],
                [this.users, "getCurrentUser"], [this.users, "getUser"],
                [this.permissions, "can"], [this.dispatcher, "subscribe"],
                [this.dispatcher, "unsubscribe"]]) {
                if (typeof object?.[method] !== "function") throw new Error(`Missing Discord module: ${method}`);
            }
            this.options = {desktop: true, moves: false, ...BdApi.Data.load("FriendVoiceNotify", "options")};
            this.running = true;
            this.reset();
            const generation = this.generation;
            const later = callback => queueMicrotask(() => {
                if (!this.running || generation !== this.generation) return;
                try { callback(); }
                catch (error) { this.fail(error); }
            });
            const subscribe = (event, handler) => {
                this.dispatcher.subscribe(event, handler);
                this.cleanups.push(() => this.dispatcher.unsubscribe(event, handler));
            };
            // Run after Flux stores have processed the event. Only actual voice
            // updates trigger alerts, never a newly loaded guild snapshot.
            subscribe("VOICE_STATE_UPDATES", event => {
                const states = (event.voiceStates ?? []).map(state => ({...state}));
                later(() => this.process(states));
            });
            subscribe("CONNECTION_OPEN", () => later(() => this.reset()));
            subscribe("CONNECTION_RESUMED", () => later(() => this.reset()));
            this.cleanups.push(BdApi.ContextMenu.patch("user-context", (tree, props, instance) => {
                this.patchUserMenu(tree, props, instance);
            }));
        }
        catch (error) { this.fail(error); }
    }

    findDispatcher() {
        const isDispatcher = value => value != null &&
            ["dispatch", "subscribe", "unsubscribe"].every(key => typeof value[key] === "function");
        // Prefer the dispatcher used by the stores we actually observe.
        for (const store of [this.voice, this.users, this.guilds]) {
            if (isDispatcher(store?._dispatcher)) return store._dispatcher;
        }
        // Discord can expose the instance under a named/minified export.
        // The default getByKeys search does not inspect all of those exports.
        for (const searchExports of [true, false]) {
            const candidate = BdApi.Webpack.getModule(isDispatcher, {searchExports});
            if (isDispatcher(candidate)) return candidate;
        }
        throw new Error("Discord dispatcher not found (dispatch/subscribe/unsubscribe).");
    }

    patchUserMenu(tree, props, instance) {
        // BetterDiscord may pass a wrapper whose child is the actual Menu.
        // Appending to that wrapper puts the item outside Discord's menu parser.
        const nodes = [];
        const visited = new WeakSet();
        const visit = (node, depth = 0) => {
            if (!node || typeof node !== "object" || depth > 20 || visited.has(node)) return;
            visited.add(node);
            if (Array.isArray(node)) {
                for (const child of node) visit(child, depth + 1);
                return;
            }
            if (!node.props) return;
            nodes.push(node);
            visit(node.props.children, depth + 1);
        };
        visit(tree);
        const menu = nodes.find(node => node.props.navId === "user-context") ?? tree;
        if (!menu?.props) return;
        const sources = [props, instance?.props, menu.props, ...nodes.map(node => node.props)];
        const userId = sources.map(source => source?.user?.id ?? source?.userId).find(Boolean);
        if (!userId || userId === this.users.getCurrentUser()?.id) return;
        if (this.accountId !== this.users.getCurrentUser()?.id) this.reset();
        if (nodes.some(node => node.props.id === "friend-voice-notify-toggle")) return;
        const item = BdApi.ContextMenu.buildItem({
            type: "toggle",
            id: "friend-voice-notify-toggle",
            label: "Voice notifications",
            checked: this.watched.has(userId),
            action: () => this.toggle(userId)
        });
        const children = menu.props.children;
        // Preserve the array reference for Discord versions that retain it.
        if (Array.isArray(children)) children.push(item);
        else menu.props.children = [children, item].filter(Boolean);
    }

    reset() {
        this.accountId = this.users.getCurrentUser()?.id;
        const saved = this.accountId ? BdApi.Data.load("FriendVoiceNotify", `users-${this.accountId}`) : [];
        this.watched = new Set(Array.isArray(saved) ? saved.filter(id => typeof id === "string") : []);
        this.previous = this.snapshot();
    }

    snapshot() {
        const result = new Map();
        const visited = new WeakSet();
        const visit = (value, key, depth = 0) => {
            if (!value || typeof value !== "object" || depth > 7 || visited.has(value)) return;
            visited.add(value);
            const channelId = value.channelId ?? value.channel_id;
            if (channelId) {
                const guildId = value.guildId ?? value.guild_id ?? this.channels.getChannel(channelId)?.guild_id;
                const userId = value.userId ?? value.user_id ?? key;
                if (guildId && userId) result.set(`${guildId}:${userId}`, channelId);
                return;
            }
            for (const [childKey, child] of value instanceof Map ? value.entries() : Object.entries(value)) {
                visit(child, childKey, depth + 1);
            }
        };
        visit(this.voice.getAllVoiceStates());
        return result;
    }

    toggle(userId) {
        if (!this.running || !this.accountId) return;
        if (this.accountId !== this.users.getCurrentUser()?.id) this.reset();
        if (!this.accountId) return;
        if (this.watched.has(userId)) this.watched.delete(userId);
        else {
            this.watched.add(userId);
            // Marking someone already in voice must not create an arrival alert.
            for (const [key, channelId] of this.snapshot()) {
                if (key.endsWith(`:${userId}`)) this.previous.set(key, channelId);
            }
        }
        BdApi.Data.save("FriendVoiceNotify", `users-${this.accountId}`, [...this.watched]);
        BdApi.UI.showToast(this.watched.has(userId) ? "Voice notifications enabled." : "Voice notifications disabled.", {type: "success"});
    }

    process(states) {
        if (this.accountId !== this.users.getCurrentUser()?.id) {
            this.reset();
            return;
        }
        for (const state of states) {
            const userId = state.userId ?? state.user_id;
            // Ignore partial updates without a channel field.
            if (!("channelId" in state) && !("channel_id" in state)) continue;
            const channelId = state.channelId ?? state.channel_id ?? null;
            const channel = channelId ? this.channels.getChannel(channelId) : null;
            const guildId = state.guildId ?? state.guild_id ?? channel?.guild_id;
            if (!userId || !guildId) continue; // Excludes private calls.
            const key = `${guildId}:${userId}`;
            const oldChannel = this.previous.get(key);
            if (channelId) this.previous.set(key, channelId);
            else this.previous.delete(key);
            if (!channelId || oldChannel === channelId || !this.watched.has(userId) ||
                userId === this.accountId || (oldChannel && !this.options.moves)) continue;
            const guild = this.guilds.getGuild(guildId);
            if (!guild || !channel || channel.guild_id !== guildId ||
                ![2, 13].includes(channel.type) || !this.permissions.can(1024n, channel)) continue;
            this.notify(userId, guild, channel, Boolean(oldChannel));
        }
    }

    notify(userId, guild, channel, moved) {
        const user = this.users.getUser(userId);
        const name = user?.globalName || user?.username || userId;
        const text = `${name} ${moved ? "moved to" : "joined"} ${guild.name} → ${channel.name}`;
        BdApi.UI.showToast(text, {type: "info", timeout: 8000});
        if (!this.options.desktop || typeof Notification === "undefined" || Notification.permission !== "granted") return;
        try {
            const notification = new Notification("Voice notification", {body: text});
            this.notifications.add(notification);
            notification.onclose = () => this.notifications.delete(notification);
            notification.onclick = () => { window.focus(); notification.close(); };
            notification.onerror = () => { notification.close(); this.notifications.delete(notification); };
        }
        catch (error) { console.warn("[FriendVoiceNotify] Desktop notification failed", error); }
    }

    getSettingsPanel() {
        const options = this.options ?? {desktop: true, moves: false, ...BdApi.Data.load("FriendVoiceNotify", "options")};
        return BdApi.UI.buildSettingsPanel({
            settings: [
                {type: "switch", id: "desktop", name: "Desktop notifications", value: options.desktop,
                    note: "Show desktop notifications in addition to in-app alerts. Requires notification permission for Discord."},
                {type: "switch", id: "moves", name: "Notify on channel changes", value: options.moves,
                    note: "Also notify when a selected user switches between voice or stage channels on the same server."}
            ],
            onChange: (_category, id, value) => {
                if (!["desktop", "moves"].includes(id)) return;
                options[id] = value === true;
                this.options = options;
                BdApi.Data.save("FriendVoiceNotify", "options", options);
            }
        });
    }

    fail(error) {
        console.error("[FriendVoiceNotify]", error);
        this.stop();
        BdApi.UI.showToast("FriendVoiceNotify could not run. See the console for details.", {type: "error"});
    }

    stop() {
        this.running = false;
        this.generation = (this.generation ?? 0) + 1;
        for (const cleanup of this.cleanups ?? []) {
            try { cleanup?.(); } catch (error) { console.warn("[FriendVoiceNotify]", error); }
        }
        this.cleanups = [];
        for (const notification of this.notifications ?? []) notification.close();
        this.notifications?.clear();
        this.previous?.clear();
    }
};

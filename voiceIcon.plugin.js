/**
 * @name voiceIcon
 * @author Jessi
 * @version 1.2.5
 * @description Show a green speaker indicator on servers with occupied visible voice or stage channels, with an optional participant count.
 * @authorLink https://github.com/JessyCat92
 * @website https://github.com/JessyCat92/BetterDiscordPlugins
 * @source https://github.com/JessyCat92/BetterDiscordPlugins/blob/main/voiceIcon.plugin.js
 */

module.exports = class VoiceIcon {
    // DisplayServersAsChannels 2.0.5 / BDFDB's dedicated class mapping.
    static channelNameSelector = ".styledGuildsAsChannels_71509e .name_71509e";

    getSettingsPanel() {
        return BdApi.UI.buildSettingsPanel({
            settings: [{
                type: "switch",
                id: "showCount",
                name: "Show participant count (- N)",
                note: "Count people in all visible voice and stage channels on the server, including yourself.",
                value: BdApi.Data.load("voiceIcon", "showCount") === true
            }],
            onChange: (_category, id, value) => {
                if (id !== "showCount") return;
                this.showCount = value === true;
                BdApi.Data.save("voiceIcon", "showCount", this.showCount);
                if (this.running) this.schedule();
            }
        });
    }

    start() {
        this.stop();
        this.api = new BdApi("voiceIcon");
        this.hosts = new Set();
        this.subscriptions = [];
        try {
            this.showCount = BdApi.Data.load("voiceIcon", "showCount") === true;
            this.voice = BdApi.Webpack.getStore("VoiceStateStore");
            this.channels = BdApi.Webpack.getStore("ChannelStore");
            this.permissions = BdApi.Webpack.getStore("PermissionStore");
            if (typeof this.voice?.getAllVoiceStates !== "function" ||
                typeof this.channels?.getChannel !== "function" ||
                typeof this.permissions?.can !== "function") {
                throw new Error("The required Discord data modules are unavailable.");
            }

            // A pseudo-element avoids inserting children into Discord's React tree.
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M3 9v6h4l5 4V5L7 9H3z"/><path fill="none" stroke="white" stroke-width="2" stroke-linecap="round" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
            const inlineSvg = svg.replace(/white/g, "#65f59a");
            this.api.DOM.addStyle(`
                .voiceIcon-inline::after {
                    content: "";
                    display: block;
                    position: static;
                    flex: 0 0 auto;
                    align-self: center;
                    width: var(--voiceIcon-size, 17px);
                    height: var(--voiceIcon-size, 17px);
                    margin-inline-start: 4px;
                    border-radius: 50%;
                    background: #000 url("data:image/svg+xml,${encodeURIComponent(inlineSvg)}") center / var(--voiceIcon-size, 17px) var(--voiceIcon-size, 17px) no-repeat;
                    pointer-events: none;
                }
                .voiceIcon-position { position: relative !important; }
                .voiceIcon-active::after {
                    content: "";
                    position: absolute;
                    left: var(--voiceIcon-x);
                    top: var(--voiceIcon-y);
                    width: 18px;
                    height: 18px;
                    box-sizing: border-box;
                    border: 2px solid var(--background-tertiary, #121214);
                    border-radius: 50%;
                    background: #238a50 url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 12px 12px no-repeat;
                    pointer-events: none;
                    z-index: 5;
                }
                .voiceIcon-inline.voiceIcon-count::after,
                .voiceIcon-active.voiceIcon-count::after {
                    content: attr(data-voiceicon-count);
                    width: auto;
                    min-width: 18px;
                    box-sizing: border-box;
                    padding: 0 6px 0 20px;
                    border-radius: 999px;
                    background-position: 2px center;
                    color: #fff;
                    font: 600 11px/18px var(--font-primary, sans-serif);
                    letter-spacing: normal;
                    white-space: nowrap;
                }
                .voiceIcon-active.voiceIcon-count::after {
                    left: calc(var(--voiceIcon-x) + 18px);
                    transform: translateX(-100%);
                    line-height: 14px;
                }
                .voiceIcon-inline.voiceIcon-count::after {
                    min-width: var(--voiceIcon-size, 17px);
                    padding: 0 calc(var(--voiceIcon-size, 17px) * .375) 0 calc(var(--voiceIcon-size, 17px) + 2px);
                    background-position: left center;
                    font-size: calc(var(--voiceIcon-size, 17px) * .75);
                    line-height: var(--voiceIcon-size, 17px);
                }
            `);

            this.running = true;
            this.schedule = () => {
                if (!this.running || this.timer != null) return;
                this.timer = setTimeout(() => {
                    this.timer = null;
                    if (!this.running) return;
                    try { this.refresh(); }
                    catch (error) { this.fail(error); }
                }, 100);
            };
            for (const store of [this.voice, this.channels, this.permissions]) {
                if (typeof store.addChangeListener === "function" &&
                    typeof store.removeChangeListener === "function") {
                    store.addChangeListener(this.schedule);
                    this.subscriptions.push(store);
                }
            }
            this.mutations = new MutationObserver(records => {
                // React can replace className without replacing the DOM node.
                // Ignore our own class additions/removals to avoid feedback loops.
                const externalClasses = value => (value ?? "").split(/\s+/)
                    .filter(name => name && !name.startsWith("voiceIcon-")).sort().join(" ");
                if (records.some(record => record.type !== "attributes" ||
                    record.attributeName !== "class" ||
                    externalClasses(record.oldValue) !== externalClasses(record.target.getAttribute("class")) ||
                    (this.hosts.has(record.target) &&
                        !record.target.classList.contains("voiceIcon-inline") &&
                        !record.target.classList.contains("voiceIcon-active")))) this.schedule();
            });
            this.mutations.observe(document.body, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ["data-list-item-id", "id", "class"], attributeOldValue: true
            });
            this.resize = new ResizeObserver(this.schedule);
            window.addEventListener("resize", this.schedule);
            this.refresh();
        }
        catch (error) { this.fail(error); }
    }

    voiceCounts() {
        const members = new Map();
        const visited = new WeakSet();
        // Discord versions may nest states by guild, channel or user.
        const visit = (value, depth = 0, entryKey = null) => {
            if (!value || typeof value !== "object" || depth > 6 || visited.has(value)) return;
            visited.add(value);
            const channelId = value.channelId ?? value.channel_id;
            if (channelId) {
                const channel = this.channels.getChannel(channelId);
                if (channel?.guild_id && (channel.type === 2 || channel.type === 13) &&
                    this.permissions.can(1024n, channel)) { // VIEW_CHANNEL
                    if (!members.has(channel.guild_id)) members.set(channel.guild_id, new Set());
                    // Count people once even if a store exposes multiple sessions.
                    members.get(channel.guild_id).add(value.userId ?? value.user_id ?? entryKey ?? value);
                }
                return;
            }
            const children = value instanceof Map ? value.entries() : Object.entries(value);
            for (const [key, child] of children) visit(child, depth + 1, key);
        };
        visit(this.voice.getAllVoiceStates());
        return new Map([...members].map(([guildId, users]) => [guildId, users.size]));
    }

    refresh() {
        const active = this.voiceCounts();
        const nextHosts = new Set();
        const inlineRows = new Set();
        for (const name of document.querySelectorAll(VoiceIcon.channelNameSelector)) {
            const id = this.guildIdFor(name);
            if (!id) continue; // Excludes Home, DMs and folder headings.
            const row = name.closest('[class*="listItem_"]');
            if (row) inlineRows.add(row);
            if (!active.has(id)) continue;
            // DSAC places the name and existing badges in this flex container.
            // Its ::after is an additional last item, reserving its own space.
            const content = name.parentElement;
            if (!content) continue;
            // Match DSAC's native badge scaling, plus 1px for visibility.
            const rowHeight = parseFloat(getComputedStyle(content).height);
            const badgeSize = (Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight / 2 : 16) + 1;
            content.style.setProperty("--voiceIcon-size", `${badgeSize}px`);
            content.classList.add("voiceIcon-inline");
            this.updateCount(content, active.get(id));
            nextHosts.add(content);
            if (!this.hosts.has(content)) this.resize.observe(content);
        }
        for (const icon of document.querySelectorAll('[data-list-item-id^="guildsnav___"]')) {
            const id = icon.getAttribute("data-list-item-id").match(/^guildsnav___(\d+)$/)?.[1];
            if (!id || !active.has(id)) continue;
            // Use the outer list item so the SVG mask cannot clip the badge.
            const host = icon.closest('[class*="listItem_"]');
            if (!host || !(host instanceof HTMLElement)) continue;
            if (inlineRows.has(host)) continue;
            const iconRect = icon.getBoundingClientRect();
            if (!iconRect.width || !iconRect.height) continue;
            if (getComputedStyle(host).position === "static") host.classList.add("voiceIcon-position");
            const hostRect = host.getBoundingClientRect();
            // Convert viewport coordinates back into CSS pixels for scaled themes.
            const scaleX = host.offsetWidth ? hostRect.width / host.offsetWidth : 1;
            const scaleY = host.offsetHeight ? hostRect.height / host.offsetHeight : 1;
            if (!scaleX || !scaleY) continue;
            host.style.setProperty("--voiceIcon-x", `${(iconRect.right - hostRect.left) / scaleX - host.clientLeft + host.scrollLeft - 16}px`);
            host.style.setProperty("--voiceIcon-y", `${(iconRect.bottom - hostRect.top) / scaleY - host.clientTop + host.scrollTop - 16}px`);
            host.classList.add("voiceIcon-active");
            this.updateCount(host, active.get(id));
            nextHosts.add(host);
            if (!this.hosts.has(host)) this.resize.observe(host);
        }
        for (const host of this.hosts) {
            if (!nextHosts.has(host)) {
                this.resize.unobserve(host);
                this.clearHost(host);
            }
        }
        this.hosts = nextHosts;
    }

    guildIdFor(element) {
        // DSAC preserves the numeric NavItem id, even when no guildsnav marker exists.
        for (let current = element; current && current !== document.body; current = current.parentElement) {
            const marker = current.getAttribute("data-list-item-id");
            const guildId = marker?.match(/^guildsnav___(\d+)$/)?.[1];
            if (guildId) return guildId;
            if (marker || current.getAttribute("data-folder-id")) return null;
            if (/^\d+$/.test(current.id ?? "")) return current.id;
        }
        return null;
    }

    updateCount(host, count) {
        host.classList.toggle("voiceIcon-count", this.showCount === true);
        if (this.showCount) host.setAttribute("data-voiceicon-count", `${count}`);
        else host.removeAttribute("data-voiceicon-count");
    }

    clearHost(host) {
        host.classList.remove("voiceIcon-active", "voiceIcon-position", "voiceIcon-inline", "voiceIcon-count");
        host.removeAttribute("data-voiceicon-count");
        host.style.removeProperty("--voiceIcon-x");
        host.style.removeProperty("--voiceIcon-y");
        host.style.removeProperty("--voiceIcon-size");
    }

    fail(error) {
        console.error("[voiceIcon]", error);
        this.stop();
        BdApi.UI.showToast("voiceIcon: Could not read Discord modules. See the console for details.", {type: "error"});
    }

    stop() {
        this.running = false;
        if (this.timer != null) clearTimeout(this.timer);
        this.timer = null;
        this.mutations?.disconnect();
        this.resize?.disconnect();
        if (this.schedule) {
            window.removeEventListener("resize", this.schedule);
            for (const store of this.subscriptions ?? []) store.removeChangeListener(this.schedule);
        }
        for (const host of this.hosts ?? []) this.clearHost(host);
        this.hosts?.clear();
        this.subscriptions = [];
        this.api?.DOM.removeStyle();
    }
};

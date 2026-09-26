# BetterDiscord Plugins

Plugins for the Discord desktop app with BetterDiscord for voice channel notifications, indicators, and scheduled game activity visibility. Each plugin can be used independently.

All three plugins automatically use **German when Discord is set to German, and English otherwise**. They follow Discord's language setting rather than the OS/browser language; unsupported or unavailable languages fall back to English. Settings, plugin-owned messages, and applicable tooltips and menu labels are localized. Existing configuration is retained, with no separate language preference to manage.

## Game Activity Toggle Erweiterung

Adds a weekly schedule for Discord game activity visibility, with a persistent automation pause switch. Version **1.2.0** automatically uses **German or English based on Discord's language setting**, with English as the fallback for other languages. Settings, weekdays, buttons, tooltips, notifications, and accessibility labels are translated. Language changes refresh the icon and open settings without changing your schedule; no separate language preference is stored. The plugin's identifying name and filename remain stable.

- Add, edit, and remove individual schedule rows, each with a weekday, start time, and end time. Multiple windows per day and different hours on different days are supported.
- Defaults to five rows: **Monday–Friday, 09:00–18:00**. Automation is **paused on first setup**; enable it in the plugin settings or with the frontend icon.
- Uses your computer's **local time**, including timezone and daylight-saving changes. For overnight windows, the selected weekday is the start day. Overlapping and directly adjacent windows keep activity disabled without briefly enabling it between windows.
- Remembers the previous activity setting per Discord account before disabling it. Restores that setting after the window ends, when automation is paused, or when the plugin is disabled. An originally disabled setting stays disabled.
- Saves pending restoration across restarts. Starting Discord inside a window applies the schedule; starting after it ends restores a saved previous state. Existing schedules from version 1.0.0 migrate automatically to individual rows.
- The **controller-and-clock icon** appears directly beside the existing Game Activity Toggle button: **white** means automation is enabled, **red with a slash** means paused. Hover highlights the button and shows its next action. The pause choice persists across restarts, for example during a vacation.
- The schedule takes priority during active windows: manual enabling is reversed at the next check. Pause automation first to use the manual Game Activity Toggle freely.

The scheduler works without another plugin or library. The frontend icon requires the visible user-panel button from **Game Activity Toggle** (integration checked with version 1.4.1, which uses BDFDB). If that button is absent, control automation through this plugin's settings instead.

Discord must be running to change the setting. Checks run every five seconds and on window focus, so changes are not instantaneous; after sleep, reconciliation resumes when Discord runs again. Failed restorations remain saved for retry while the plugin runs. An empty table has no active windows; identical start/end times are rejected. Discord updates can break the internal settings interface or icon integration.

**File:** [GameActivityToggleExtension.plugin.js](GameActivityToggleExtension.plugin.js)

## FriendVoiceNotify

Version **1.1.0** notifies you when a selected user joins a visible voice or stage channel on a shared server. Each notification includes the user's name, server name, and channel name. Context-menu labels, settings, in-app alerts, and desktop notifications follow Discord's language. User, server, and channel names remain unchanged.

- Right-click a user, for example in your friends list, and toggle the voice notification checkbox to enable or disable alerts for that user.
- Selected users are saved per Discord account and remain selected after a restart.
- Notifications appear inside Discord. Additional desktop notifications are enabled by default and require notification permission.
- Alerts for switching channels can be enabled in the plugin settings; they are disabled by default.

Discord must be running and connected. The plugin only uses voice state data received by your client. It does not notify you about private calls, hidden channels, mute changes, or users already in voice when the plugin starts.

**File:** [FriendVoiceNotify.plugin.js](FriendVoiceNotify.plugin.js)

## Server Voice Counter

Version **1.3.2** displays a **green speaker icon on the server icon** whenever at least one visible voice or stage channel on that server is occupied. This lets you spot active servers directly in the server list.

- An optional **participant count** can be enabled in the plugin settings. It counts people in visible voice and stage channels, including yourself.
- Also supports the server name layout provided by **DisplayServersAsChannels**, displaying the indicator next to the name.
- The indicator updates as channel occupancy changes.

**File:** [ServerVoiceCounter.plugin.js](ServerVoiceCounter.plugin.js) (formerly `voiceIcon.plugin.js`). German and English follow Discord's language, with English as fallback. Existing participant-count settings are preserved. For this filename change, close Discord, remove the old `voiceIcon.plugin.js` from the plugins folder, and place `ServerVoiceCounter.plugin.js` there before reopening Discord. Keep `voiceIcon.config.json`: the internal settings key is unchanged. Do not install both plugin files. Activation remains associated with `Server Voice Counter`; if upgrading from the older visible name `voiceIcon`, check the enabled switch. Old download/update URLs do not redirect automatically; switch to the new file link for future updates.

## Installation

Requires the Discord desktop app with BetterDiscord installed. All three plugins follow Discord's language (German or English, English fallback). No build step or additional plugin library is required for these plugins. DisplayServersAsChannels integration is optional; the Game Activity Toggle companion is only needed for the scheduler's frontend icon.

1. Download the desired `.plugin.js` file from this repository.
2. In Discord, go to **User Settings → BetterDiscord → Plugins → Open Plugins Folder**.
3. Copy the file into that folder and enable the plugin in Discord.
4. Adjust optional features in the settings for each plugin.

To update a plugin, replace its existing file and toggle the plugin off and on again if needed.

## Privacy and support

FriendVoiceNotify stores your selected user IDs per account and notification preferences locally through BetterDiscord's Data API. Selecting a user opts into saving that selection. Server Voice Counter stores its participant-count preference locally under the compatible legacy `voiceIcon` key. Game Activity Toggle Erweiterung stores its schedule, pause choice, and pending restoration states per account locally through the same API; activity-setting changes are sent through Discord. None of these plugins includes telemetry or keeps a history of voice activity. Desktop notifications may display names on your screen through the operating system.

For bugs, use this repository's Issues page and include the plugin version, reproduction steps, and relevant errors with private information removed. Discord updates can change internal modules and break compatibility.

## BetterDiscord submission status

Publishing files in this GitHub repository is separate from submission to the official BetterDiscord addon directory.

These plugins were generated with AI assistance and are **not approved BetterDiscord addons**. BetterDiscord's current [Plugin Guidelines](https://docs.betterdiscord.app/plugins/publishing/guidelines) exclude automatically generated plugins, including AI-generated code, from submissions. These implementations therefore are not eligible for official submission under that rule. Metadata, English text, or formatting changes do not remove this authorship restriction. No submission has been made.

The distributable files follow the documented [plugin structure](https://docs.betterdiscord.app/plugins/introduction/structure): one JavaScript file per plugin, a metadata header, an exported class, and start/stop lifecycle methods. Required metadata is present; source and author links are also provided. No optional Discord author ID or support-server invite has been invented.

Keep the plugin file paths stable when publishing updates, as described in [Distribution & Updates](https://docs.betterdiscord.app/plugins/publishing/distribution). Any future eligible submission would still require account authorization and a separate review through the official [Submission Process](https://docs.betterdiscord.app/plugins/publishing/submit). Compatibility and acceptance are not guaranteed.

Before distributing an update, check loading and disabling in Discord, the user-menu checkbox, notification delivery, visibility filtering, server indicators, participant counts, and cleanup after disabling. Static validation does not replace these live checks.

## Development checks

Run syntax checks and each test file separately (Node.js 25; tests mock Discord globals):

```powershell
node --check FriendVoiceNotify.plugin.js
node --check GameActivityToggleExtension.plugin.js
node --check ServerVoiceCounter.plugin.js
node --test --test-isolation=none tests/FriendVoiceNotify.test.js
node --test --test-isolation=none tests/GameActivityToggleExtension.test.js
node --test --test-isolation=none tests/ServerVoiceCounter.test.js
```

All **38 automated tests** pass: 28 for Game Activity Toggle Erweiterung, 4 for FriendVoiceNotify, and 6 for Server Voice Counter. They cover German/English and fallback behavior, language selection and refresh, settings persistence, notification text, participant counting and visibility filtering, scheduling, overlapping/adjacent/overnight windows, migration, pause/resume, account isolation, and restoration after simulated restarts or failed writes.

The user confirmed successful live functionality for all three current plugins and the new Server Voice Counter name. Additional live UI checks verified the scheduler icon, hover and tooltip, settings switch, readable table controls, dropdown options, focus styling, and add-button label. Automated locale/failure/restart scenarios use mocked Discord modules; these tests do not guarantee compatibility with future Discord updates.

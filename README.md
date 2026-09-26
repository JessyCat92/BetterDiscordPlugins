# BetterDiscord Plugins

Plugins for the Discord desktop app with BetterDiscord for voice channel notifications, indicators, and scheduled game activity visibility. Each plugin can be used independently.

## Game Activity Toggle Erweiterung

Adds a weekly schedule for Discord game activity visibility, with a persistent automation pause switch. Version **1.1.3** uses German interface labels.

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

Notifies you when a selected user joins a visible voice or stage channel on a shared server. Each notification includes the user's name, server name, and channel name.

- Right-click a user, for example in your friends list, and toggle the voice notification checkbox to enable or disable alerts for that user.
- Selected users are saved per Discord account and remain selected after a restart.
- Notifications appear inside Discord. Additional desktop notifications are enabled by default and require notification permission.
- Alerts for switching channels can be enabled in the plugin settings; they are disabled by default.

Discord must be running and connected. The plugin only uses voice state data received by your client. It does not notify you about private calls, hidden channels, mute changes, or users already in voice when the plugin starts.

**File:** [FriendVoiceNotify.plugin.js](FriendVoiceNotify.plugin.js)

## voiceIcon

Displays a **green speaker icon on the server icon** whenever at least one visible voice or stage channel on that server is occupied. This lets you spot active servers directly in the server list.

- An optional **participant count** can be enabled in the plugin settings. It counts people in visible voice and stage channels, including yourself.
- Also supports the server name layout provided by **DisplayServersAsChannels**, displaying the indicator next to the name.
- The indicator updates as channel occupancy changes.

**File:** [voiceIcon.plugin.js](voiceIcon.plugin.js)

## Installation

Requires the Discord desktop app with BetterDiscord installed. The voice plugins use English interface labels; Game Activity Toggle Erweiterung uses German labels. No build step or additional plugin library is required for these plugins. DisplayServersAsChannels integration is optional.

1. Download the desired `.plugin.js` file from this repository.
2. In Discord, go to **User Settings → BetterDiscord → Plugins → Open Plugins Folder**.
3. Copy the file into that folder and enable the plugin in Discord.
4. Adjust optional features in the settings for each plugin.

To update a plugin, replace its existing file and toggle the plugin off and on again if needed.

## Privacy and support

FriendVoiceNotify stores your selected user IDs per account and notification preferences locally through BetterDiscord's Data API. Selecting a user opts into saving that selection. voiceIcon stores its participant-count preference locally. Game Activity Toggle Erweiterung stores its schedule, pause choice, and pending restoration states per account locally through the same API; activity-setting changes are sent through Discord. None of these plugins includes telemetry or keeps a history of voice activity. Desktop notifications may display names on your screen through the operating system.

For bugs, use this repository's Issues page and include the plugin version, reproduction steps, and relevant errors with private information removed. Discord updates can change internal modules and break compatibility.

## BetterDiscord submission status

Publishing files in this GitHub repository is separate from submission to the official BetterDiscord addon directory.

These plugins were generated with AI assistance and are **not approved BetterDiscord addons**. BetterDiscord's current [Plugin Guidelines](https://docs.betterdiscord.app/plugins/publishing/guidelines) exclude automatically generated plugins, including AI-generated code, from submissions. These implementations therefore are not eligible for official submission under that rule. Metadata, English text, or formatting changes do not remove this authorship restriction. No submission has been made.

The distributable files follow the documented [plugin structure](https://docs.betterdiscord.app/plugins/introduction/structure): one JavaScript file per plugin, a metadata header, an exported class, and start/stop lifecycle methods. Required metadata is present; source and author links are also provided. No optional Discord author ID or support-server invite has been invented.

Keep the plugin file paths stable when publishing updates, as described in [Distribution & Updates](https://docs.betterdiscord.app/plugins/publishing/distribution). Any future eligible submission would still require account authorization and a separate review through the official [Submission Process](https://docs.betterdiscord.app/plugins/publishing/submit). Compatibility and acceptance are not guaranteed.

Before distributing an update, check loading and disabling in Discord, the user-menu checkbox, notification delivery, visibility filtering, server indicators, participant counts, and cleanup after disabling. Static validation does not replace these live checks.

## Development checks

For Game Activity Toggle Erweiterung (Node.js 25):

```powershell
node --check GameActivityToggleExtension.plugin.js
node --test --test-isolation=none tests/GameActivityToggleExtension.test.js
```

The 20 automated tests cover scheduling, overlaps, adjacent and overnight windows, configuration migration, pause/resume, restoration, simulated restarts, account isolation, failed writes, and settings controls. The user reported a successful functional test of the installed plugin. Live UI checks also verified icon placement, its hover and tooltip, the native settings switch, table controls, readable dropdown options, focus styling, and the full add-button label. Restart and failure recovery were tested with simulated Discord modules, not by restarting the live client.

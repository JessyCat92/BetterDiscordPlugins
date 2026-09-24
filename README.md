# BetterDiscord Plugins

Two plugins for the Discord desktop app with BetterDiscord that make voice channel activity easier to follow. Each plugin can be used independently.

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

Requires the Discord desktop app with BetterDiscord installed. Both plugins use English interface labels and notification text. No build step or additional plugin library is required. DisplayServersAsChannels integration is optional.

1. Download the desired `.plugin.js` file from this repository.
2. In Discord, go to **User Settings → BetterDiscord → Plugins → Open Plugins Folder**.
3. Copy the file into that folder and enable the plugin in Discord.
4. Adjust optional features in the settings for each plugin.

To update a plugin, replace its existing file and toggle the plugin off and on again if needed.

## Privacy and support

FriendVoiceNotify stores your selected user IDs per account and notification preferences locally through BetterDiscord's Data API. Selecting a user opts into saving that selection. voiceIcon stores its participant-count preference locally. Neither plugin uploads this data, includes telemetry, or keeps a history of voice activity. Desktop notifications may display names on your screen through the operating system.

For bugs, use this repository's Issues page and include the plugin version, reproduction steps, and relevant errors with private information removed. Discord updates can change internal modules and break compatibility.

## BetterDiscord submission status

These plugins were generated with AI assistance and are **not approved BetterDiscord addons**. BetterDiscord's current [Plugin Guidelines](https://docs.betterdiscord.app/plugins/publishing/guidelines) exclude automatically generated plugins, including AI-generated code, from submissions. These implementations therefore are not eligible for official submission under that rule. Metadata, English text, or formatting changes do not remove this authorship restriction. No submission has been made.

The distributable files follow the documented [plugin structure](https://docs.betterdiscord.app/plugins/introduction/structure): one JavaScript file per plugin, a metadata header, an exported class, and start/stop lifecycle methods. Required metadata is present; source and author links are also provided. No optional Discord author ID or support-server invite has been invented.

Keep the plugin file paths stable when publishing updates, as described in [Distribution & Updates](https://docs.betterdiscord.app/plugins/publishing/distribution). Any future eligible submission would still require account authorization and a separate review through the official [Submission Process](https://docs.betterdiscord.app/plugins/publishing/submit). Compatibility and acceptance are not guaranteed.

Before distributing an update, check loading and disabling in Discord, the user-menu checkbox, notification delivery, visibility filtering, server indicators, participant counts, and cleanup after disabling. Static validation does not replace these live checks.

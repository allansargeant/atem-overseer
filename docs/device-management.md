# Device management

The **Devices** button in the top bar opens the fleet manager.

## Managed devices

Every switcher Overseer is monitoring, with:

| Field | Source |
| --- | --- |
| Model | `productIdentifier` from the ATEM protocol |
| IP | the configured address |
| Host | reverse-DNS of the IP (or the hostname you entered) |
| Record | the switcher's record filename prefix |
| Protocol | the ATEM protocol/API version |

> **On "firmware version":** the ATEM UDP protocol does **not** report a firmware
> version string — only its protocol/API version, which is what's shown here. The
> true firmware version is visible in Blackmagic ATEM Setup.

**Remove** takes a device off the dashboard. **Add** (below) puts one on. Both
persist to `atem-overseer.config.json` and the tile grid re-syncs immediately.

## Discovery

Overseer runs a best-effort mDNS/DNS-SD scan and lists anything that looks like a
Blackmagic/ATEM/NMOS device, resolving each to an IP you can one-click **Add**.

**This will miss switchers.** Blackmagic doesn't publish a discovery service type,
and many ATEMs — especially older models — don't advertise on the network at all.
Manual add by IP or hostname is the reliable path (the same way ATEM Software
Control itself often needs a typed-in address).

## Add manually

Enter an **IP address or hostname** and an optional name. The id is derived from
the name (or address) if you don't set one.

## Launch external apps

Each managed device has buttons to open the Blackmagic tools:

| App | Device targeting |
| --- | --- |
| **ATEM Software Control** | launches the app; the device IP is copied to your clipboard to paste into its connect field |
| **ATEM Setup** | launches the app; IP copied to clipboard |
| **MixEffect** (`↳`) | opens via its URL scheme with the switcher address pre-filled |
| **ATEM Fleet Manager** | launches the app; IP copied to clipboard |

The Blackmagic desktop apps expose no public per-device deep link, so Overseer
launches them and copies the IP as a one-paste fallback. Apps that *do* support
targeting (MixEffect's URL scheme) are opened straight onto the device.

**Launching runs on the machine hosting the Overseer server** (spawned locally),
so it's most useful when you run Overseer on your operator workstation — e.g. via
the [desktop app](../launcher/). On a headless server there's nothing to open.

### Configuring / overriding launch commands

Every launch command is overridable per platform in `atem-overseer.config.json`,
so you can point a button at the exact binary/URL your setup uses (a working
MixEffect build, SKAARHOJ, your own fleet tool, etc.). Placeholders `{ip}`,
`{host}` and `{name}` are substituted:

```json
{
  "externalApps": {
    "mixeffect": {
      "label": "MixEffect",
      "autoSelect": true,
      "darwin": ["open", "mixeffect://switcher?address={ip}"]
    },
    "fleet": {
      "label": "Fleet Admin",
      "darwin": ["open", "-a", "ATEM Fleet Admin", "--args", "--connect", "{ip}"]
    }
  }
}
```

Set `autoSelect: true` when your command actually selects the device (so the UI
shows the `↳` and skips the clipboard copy).

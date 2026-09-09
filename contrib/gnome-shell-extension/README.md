# GNOME Shell Extension
Shows the position of the physical P-MODE button in the top bar.

| Button position | Top bar |
|---|---|
| `quiet`       | 🌿 |
| `balanced`    | ⚖️ |
| `performance` | 🚀 |

The drop-down repeats the three modes with their wattage and marks the active
one. Read-only — the button is physical, writing to the EC would need root.

GNOME's own Power Mode menu cannot show this: without an ACPI `platform_profile`
on this board, power-profiles-daemon only drives the `amd_pstate` EPP hint and
never touches the embedded controller.

### Installation & Usage
1. Make sure the module is loaded (`cat /sys/class/ec_su_axb35/apu/power_mode`),
   and load it at boot with
   `echo ec_su_axb35 | sudo tee /etc/modules-load.d/ec_su_axb35.conf`.
2. Copy the extension:
   `cp -r axb35-pmode@ec-su_axb35-linux ~/.local/share/gnome-shell/extensions/`
3. Log out and log back in. GNOME Shell only scans for extensions at session
   start, so a new one is invisible until then (and under Wayland the Shell
   cannot be restarted in place).
4. `gnome-extensions enable axb35-pmode@ec-su_axb35-linux`

### Wattage labels
The EC stores an ordinal (`0x00`=balanced, `0x01`=performance, `0x02`=quiet),
not a wattage. The 55 / 85 / 120 W figures are those of the GMKtec EVO-X2 and
are **not read from the hardware**. If your vendor ships different presets,
edit `MODES` at the top of `extension.js`.

### Notes
The driver does not call `sysfs_notify()`, so the extension polls
`/sys/class/ec_su_axb35/apu/power_mode` every 3 seconds with an asynchronous
read. Tested on GNOME Shell 50 (Ubuntu 26.04); the APIs used are unchanged
since GNOME 45.

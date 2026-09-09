import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Exposed by the ec_su_axb35 driver, which reads EC register 0x31 — the
// register the physical P-MODE button sets. The driver does not call
// sysfs_notify(), so no event is available and we have to poll.
const PMODE_PATH = '/sys/class/ec_su_axb35/apu/power_mode';
const POLL_SECONDS = 3;

// NOTE: the embedded controller stores an ordinal (0/1/2), not a wattage.
// The figures below are those of the GMKtec EVO-X2. Other vendors using the
// AXB35-02 board may ship different presets — adjust here if yours differ.
const MODES = {
    'quiet':       {label: 'Quiet',       watts: 55,  emoji: '🌿'},
    'balanced':    {label: 'Balanced',    watts: 85,  emoji: '⚖️'},
    'performance': {label: 'Performance', watts: 120, emoji: '🚀'},
};
const ORDER = ['quiet', 'balanced', 'performance'];

const PModeIndicator = GObject.registerClass(
class PModeIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'P-MODE Indicator');

        this._file = Gio.File.new_for_path(PMODE_PATH);
        this._mode = undefined;
        this._cancellable = null;

        // Emoji rather than a symbolic icon: the Adwaita power-profile icons
        // are already used by GNOME's own Power Mode menu, which shows a
        // different thing entirely (the amd_pstate EPP hint, not the EC budget).
        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'pmode-label',
        });
        this.add_child(this._label);

        this._items = new Map();
        for (const key of ORDER) {
            const {label, watts, emoji} = MODES[key];
            // Read-only: the button is physical, writing would need root.
            const item = new PopupMenu.PopupMenuItem(
                `${emoji}  ${label} — ${watts} W`, {reactive: false});
            this.menu.addMenuItem(item);
            this._items.set(key, item);
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._statusItem = new PopupMenu.PopupMenuItem('Reading…', {
            reactive: false,
            style_class: 'pmode-status-item',
        });
        this.menu.addMenuItem(this._statusItem);

        this._read();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
                this._read();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _read() {
        if (this._cancellable)
            return; // previous read still in flight
        this._cancellable = new Gio.Cancellable();
        this._file.load_contents_async(this._cancellable, (file, res) => {
            this._cancellable = null;
            let mode = null;
            try {
                const [ok, contents] = file.load_contents_finish(res);
                if (ok)
                    mode = new TextDecoder().decode(contents).trim();
            } catch (e) {
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    return;
                mode = null;
            }
            this._update(mode);
        });
    }

    _update(mode) {
        if (mode === this._mode)
            return;
        this._mode = mode;

        const info = MODES[mode];
        if (info) {
            this._label.text = info.emoji;
            this._statusItem.label.text =
                `P-MODE button: ${info.label} — ${info.watts} W`;
        } else {
            this._label.text = '?';
            this._statusItem.label.text = this._file.query_exists(null)
                ? 'Unexpected EC value'
                : 'ec_su_axb35 module not loaded';
        }

        for (const [key, item] of this._items) {
            item.setOrnament(key === mode
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NO_DOT);
        }
    }

    destroy() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
        super.destroy();
    }
});

export default class PModeIndicatorExtension extends Extension {
    enable() {
        this._indicator = new PModeIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}

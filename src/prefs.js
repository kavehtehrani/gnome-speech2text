import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Speech2TextPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.speech2text');

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Keyboard Shortcut Group
        const shortcutGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcut',
            description: 'Set the keyboard combination to toggle recording on/off',
        });
        page.add(shortcutGroup);

        const shortcutRow = new Adw.ActionRow({
            title: 'Toggle Recording',
            subtitle: 'Keyboard shortcut to start/stop recording',
        });

        const shortcutButton = new Gtk.Button({
            label: this._getShortcutLabel(settings),
            valign: Gtk.Align.CENTER,
        });

        shortcutButton.connect('clicked', () => {
            this._captureShortcut(window, settings, shortcutButton);
        });

        shortcutRow.add_suffix(shortcutButton);
        shortcutRow.activatable_widget = shortcutButton;
        shortcutGroup.add(shortcutRow);

        // Recording Duration Group
        const durationGroup = new Adw.PreferencesGroup({
            title: 'Recording Duration',
            description: 'Maximum recording time (10 seconds to 5 minutes)',
        });
        page.add(durationGroup);

        const durationRow = new Adw.ActionRow({
            title: 'Duration (seconds)',
            subtitle: 'Set how long the recording can last',
        });

        const durationAdjustment = new Gtk.Adjustment({
            lower: 10,
            upper: 300,
            step_increment: 10,
            page_increment: 30,
            value: settings.get_int('recording-duration'),
        });

        const durationSpinButton = new Gtk.SpinButton({
            adjustment: durationAdjustment,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });

        durationSpinButton.connect('value-changed', (widget) => {
            settings.set_int('recording-duration', widget.get_value());
        });

        durationRow.add_suffix(durationSpinButton);
        durationRow.activatable_widget = durationSpinButton;
        durationGroup.add(durationRow);

        // Clipboard Options Group
        const clipboardGroup = new Adw.PreferencesGroup({
            title: 'Clipboard Options',
            description: 'Configure whether transcribed text should be copied to clipboard',
        });
        page.add(clipboardGroup);

        const clipboardRow = new Adw.ActionRow({
            title: 'Copy to Clipboard',
            subtitle: 'Automatically copy transcribed text to clipboard',
        });

        const clipboardSwitch = new Gtk.Switch({
            active: settings.get_boolean('copy-to-clipboard'),
            valign: Gtk.Align.CENTER,
        });

        settings.bind(
            'copy-to-clipboard',
            clipboardSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        clipboardRow.add_suffix(clipboardSwitch);
        clipboardRow.activatable_widget = clipboardSwitch;
        clipboardGroup.add(clipboardRow);

        // Auto-Insert Mode Group (X11 only)
        const autoInsertGroup = new Adw.PreferencesGroup({
            title: 'Auto-Insert Mode (X11 Only)',
            description: 'Skip the preview dialog and insert text immediately after recording',
        });
        page.add(autoInsertGroup);

        const autoInsertRow = new Adw.ActionRow({
            title: 'Auto-Insert Text',
            subtitle: 'Automatically insert text without preview (X11 only)',
        });

        const autoInsertSwitch = new Gtk.Switch({
            active: settings.get_boolean('skip-preview-x11'),
            valign: Gtk.Align.CENTER,
        });

        settings.bind(
            'skip-preview-x11',
            autoInsertSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        autoInsertRow.add_suffix(autoInsertSwitch);
        autoInsertRow.activatable_widget = autoInsertSwitch;
        autoInsertGroup.add(autoInsertRow);
    }

    _getShortcutLabel(settings) {
        const shortcuts = settings.get_strv('toggle-recording');
        if (shortcuts.length > 0) {
            return shortcuts[0];
        }
        return 'Click to set';
    }

    _captureShortcut(window, settings, button) {
        const dialog = new Gtk.MessageDialog({
            transient_for: window,
            modal: true,
            buttons: Gtk.ButtonsType.CANCEL,
            message_type: Gtk.MessageType.INFO,
            text: 'Press a key combination',
            secondary_text: 'Press Escape to cancel',
        });

        const eventController = new Gtk.EventControllerKey();

        eventController.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            // Ignore modifier-only keys
            const modifierKeys = [
                Gtk.KEY_Shift_L, Gtk.KEY_Shift_R,
                Gtk.KEY_Control_L, Gtk.KEY_Control_R,
                Gtk.KEY_Alt_L, Gtk.KEY_Alt_R,
                Gtk.KEY_Super_L, Gtk.KEY_Super_R,
                Gtk.KEY_Meta_L, Gtk.KEY_Meta_R,
            ];

            if (modifierKeys.includes(keyval)) {
                return false;
            }

            // Check for Escape key
            if (keyval === Gtk.KEY_Escape) {
                dialog.close();
                return true;
            }

            // Build the shortcut string
            const modifiers = [];
            if (state & Gtk.ModifierType.CONTROL_MASK) modifiers.push('Control');
            if (state & Gtk.ModifierType.SHIFT_MASK) modifiers.push('Shift');
            if (state & Gtk.ModifierType.ALT_MASK) modifiers.push('Alt');
            if (state & Gtk.ModifierType.SUPER_MASK) modifiers.push('Super');

            const keyName = Gtk.accelerator_name(keyval, 0);
            const shortcut = `<${modifiers.join('><')}>${keyName}`;

            // Save the shortcut
            settings.set_strv('toggle-recording', [shortcut]);
            button.set_label(shortcut);

            dialog.close();
            return true;
        });

        dialog.add_controller(eventController);
        dialog.show();
    }
}

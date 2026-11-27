import type { SettingsStorage } from "@repo/notes/service";
import type { NotePlugin } from "./native";

export function createSettingsStorage(native: NotePlugin): SettingsStorage {
  return {
    async load() {
      try {
        const { value } = await native.loadSettings();
        if (!value) return null;
        const saved = JSON.parse(value);
        // Settings from before local folders were supported have no type.
        return { type: "webdav", ...saved };
      } catch (error) {
        // E.g. the Keystore key was lost: ask for the details again.
        console.error("Couldn't read the saved settings", error);
        return null;
      }
    },
    save: (connection) =>
      native.saveSettings({ value: JSON.stringify(connection) }),
    clear: () => native.clearSettings(),
    canSavePassword: async () => true,
  };
}

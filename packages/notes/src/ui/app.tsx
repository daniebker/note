import { useEffect, useState } from "react";
import type { SavedConnection } from "../api";
import { ConnectionForm } from "./connection-form";
import { saveAll } from "./flush";
import { NotesApp } from "./notes-app";

export function App({ canDownload = false }: { canDownload?: boolean }) {
  const [connection, setConnection] = useState<SavedConnection | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => window.noteApi.onBeforeClose(saveAll), []);

  useEffect(() => {
    void window.noteApi.getConnection().then((result) => {
      if (result.ok) setConnection(result.value);
    });
  }, []);

  if (!connection) return null;

  if (!connection.connected || editing) {
    return (
      <ConnectionForm
        connection={connection}
        onCancel={connection.connected ? () => setEditing(false) : undefined}
        onConnected={(next) => {
          setConnection(next);
          setEditing(false);
        }}
        onDisconnect={async () => {
          await window.noteApi.disconnect();
          setConnection({
            ...connection,
            url: "",
            username: "",
            connected: false,
          });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <NotesApp
      canDownload={canDownload}
      onOpenSettings={() => setEditing(true)}
    />
  );
}

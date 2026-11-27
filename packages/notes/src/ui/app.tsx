import { useEffect, useState } from "react";
import type { NoteCopy, SavedConnection } from "../api";
import { ConnectionForm } from "./connection-form";
import { saveAll } from "./flush";
import { NotesApp } from "./notes-app";

export function App({ canDownload = false }: { canDownload?: boolean }) {
  const [connection, setConnection] = useState<SavedConnection | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
        onConnected={({ copy, ...next }) => {
          setConnection(next);
          setEditing(false);
          if (copy !== undefined) setNotice(describeCopy(copy));
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
          setNotice(null);
        }}
      />
    );
  }

  return (
    <NotesApp
      canDownload={canDownload}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      onOpenSettings={() => setEditing(true)}
    />
  );
}

function describeCopy(copy: NoteCopy | null) {
  if (copy === null) {
    return "Notes in the old location weren't copied, as it wasn't connected.";
  }
  const notes = (n: number) => (n === 1 ? "1 note" : `${n} notes`);
  if (copy.copied === 0) return "All your notes were already here.";
  const renamed =
    copy.renamed > 0
      ? ` ${notes(copy.renamed)} differed from a note already here, so both were kept.`
      : "";
  return `Copied ${notes(copy.copied)} from the old location.${renamed}`;
}

import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { SettingsForm } from "../components/settings-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SettingsForm
      currentEmail={session.email}
      currentUsername={session.username}
    />
  );
}

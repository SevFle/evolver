export default function SettingsPage() {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage API keys and team settings
        </p>
      </div>

      <div className="mt-8 space-y-8">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            API keys are used to authenticate API requests.
          </p>
          <button className="mt-4 rounded-md border px-4 py-2 text-sm font-medium">
            Generate new API key
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite team members and manage roles.
          </p>
        </div>
      </div>
    </div>
  );
}

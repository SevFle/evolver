export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">ShipLens</h1>
          <div className="flex gap-4 text-sm text-gray-600">
            <span>Shipments</span>
            <span>Branding</span>
            <span>Notifications</span>
            <span>Settings</span>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Active Shipments</p>
            <p className="text-3xl font-bold text-gray-900">—</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Notifications Sent</p>
            <p className="text-3xl font-bold text-gray-900">—</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Pending Milestones</p>
            <p className="text-3xl font-bold text-gray-900">—</p>
          </div>
        </div>
      </main>
    </div>
  );
}

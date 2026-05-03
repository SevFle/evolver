# Wireframes

Low-fidelity pencil wireframes for the CargoTrack shipment-tracking platform.

Each screen has three companion files:

- **`.ep`** – Pencil project archive (zipped XML)
- **`.svg`** – Vector source used for rendering
- **`.png`** – Rasterised preview image

---

## Screens

- **[Login](login.png)**
  Authenticate forwarder staff and route them to their tenant workspace.
  Components: header, login form, forgot password link.

- **[Dashboard](dashboard.png)**
  Give operators an at-a-glance view of active shipments, recent milestones, and notification activity.
  Components: header, sidebar nav, stat cards, recent shipments table, notification activity feed.

- **[Shipment List](shipment-list.png)**
  Browse, search, and filter all tracked shipments across statuses and corridors.
  Components: header, sidebar nav, search bar, filter controls, shipment table, pagination.

- **[Shipment Detail](shipment-detail.png)**
  View a single shipment's full milestone timeline, customer info, and notification history.
  Components: header, sidebar nav, shipment info card, milestone timeline, customer contact card, notification log.

- **[Shipment Create](shipment-create.png)**
  Manually add a new shipment or bulk-import via CSV upload.
  Components: header, sidebar nav, shipment form, carrier selector, corridor template selector, CSV upload dropzone.

- **[Branding Settings](branding-settings.png)**
  Configure the forwarder's branded tracking page with logo, colors, and custom domain.
  Components: header, sidebar nav, logo uploader, color picker, domain config form, live preview panel.

- **[Notification Settings](notification-settings.png)**
  Define which milestones trigger email or SMS notifications and customise message templates.
  Components: header, sidebar nav, notification rule list, template editor, channel toggles, milestone trigger checkboxes.

- **[Customer Tracking Page](customer-tracking-page.png)**
  Public branded page that end-customers view to track their shipment status and milestones.
  Components: branded header with logo, shipment status summary card, milestone timeline, estimated delivery badge, carrier info block.

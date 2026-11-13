# Property Management Platform (UAE) — Frontend

A web frontend for managing a UAE property portfolio: properties and landlords,
tenants and KYC, rental agreements with Ejari and DEWA tracking, rent
collections, utility bills, documents, and WhatsApp / email reminders, with
separate portals for landlords and tenants.

> **Status: frontend prototype.** The app runs entirely in the browser on
> built-in sample data (AED, UAE emirates). Nothing is saved — **refreshing the
> page resets all data** — and no WhatsApp, email, SMS or payment is actually
> sent. A backend is needed for real logins, storage and messaging.

---

## Run it locally

### 1. Install the prerequisites

- **Node.js 20 or newer** — check with `node -v`. Download from <https://nodejs.org> if needed.
- **pnpm** (the package manager this project uses):

```bash
npm install -g pnpm
```

### 2. Get the code and install dependencies

```bash
git clone <this-repository-url>
cd <repository-folder>
pnpm install
```

### 3. Start the frontend

```bash
npx vite
```

Open the address it prints, usually **<http://localhost:5173>**.

> Use `npx vite`, not `pnpm dev`. `pnpm dev` also starts the original
> OpenProperty backend (Cloudflare Wrangler), which this frontend does not use.

### Build for production (optional)

```bash
pnpm build
```

The static site is written to `dist/` and can be served by any static host.
To preview the build locally:

```bash
npx vite preview
```

---

## Trying it out

### Switch between roles

There is no login screen yet. Click the **avatar in the top-right corner** and
pick a demo user to see the app as that role:

| Demo user | Role | What they see |
|---|---|---|
| Admin | Administrator | Everything |
| Fatima | Property Manager | Day-to-day operations (permissions set by the admin) |
| Yousef Karim, Nadia Brokers LLC | Broker | Only their assigned properties |
| Leena Das | Finance | Collections, utilities, settlements |
| Ahmed Al Mansoori, Priya Raman | Landlord | Landlord portal — their own properties only |
| Omar Haddad, Rahul Mehta | Tenant | Tenant portal — their own tenancy only |

The **sun / moon** buttons (top left) switch between light and dark mode.

### What's in the app

| Section | What it does |
|---|---|
| **Dashboard** | Occupancy, collection status, expiring agreements, overdue rent and KYC alerts. Every tile and card is clickable. **Import CSV** loads landlords, properties, tenants and agreements from a file. |
| **Properties / Landlords** | Property register (emirate, title deed, DEWA premise no.), landlord profiles and owner KYC. |
| **Tenants & KYC** | Tenant profiles, Emirates ID / passport / driving licence, KYC checklist and approval. |
| **Agreements** | Rental agreements with approval, automatic payment schedules (yearly, half-yearly, quarterly, monthly; prorating; custom amounts), renewals and move-out closure. |
| **Ejari & DEWA** | Ejari registration status (worked out automatically) and DEWA move-in activation. |
| **Collections** | Instalments, cheque receipts (cleared / bounced / replaced), payment links. |
| **Utilities** | Electricity and water bills: bulk PDF bill import, automatic "paid" from the next bill, tenant receipt upload and approval. |
| **Documents** | All uploaded files, with a built-in viewer. |
| **WhatsApp** | Due reminders, message templates per recipient type (tenant, landlord, broker, property manager, finance), communication history. |
| **Users & access** | Roles, per-module permissions, per-person exceptions and the approval matrix. |
| **Settings** | Reminder channels and schedule, VAT on commercial rent. |

### Sample files to try

- **CSV import:** Dashboard → Import CSV → *Download template* gives a ready
  example file for each record type.
- **Bill import:** Utilities → Import bills reads text PDF e-bills (DEWA, ADDC,
  AADC, SEWA, Etihad WE). Scanned bills and photos have to be filled in by hand.

---

## Project structure

```
src/client/
  main.tsx              Entry point (mounts the property-management app)
  pm/                   The property-management frontend
    app.tsx             Layout, navigation, role switching, routing
    data.ts             Types, sample data, rent and Ejari calculations
    store.tsx           In-memory data store and permissions
    nav.tsx             Role-aware links
    bills.ts            Utility bill PDF reader
    ui.tsx              Shared components (cards, tables, uploads, viewer)
    pages/              One file per area (dashboard, contracts, finance, ...)
  components/ui/        Base UI components (buttons, inputs, dialogs)
  styles.css            Theme (light and dark)
src/server/             Original OpenProperty backend (not used by this frontend)
```

To connect a real backend later, replace the in-memory store in
`src/client/pm/store.tsx` with API calls; the pages only talk to the store.

## Tech

React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, lucide icons, pdf.js.

## Credits

Built on top of [OpenProperty](https://github.com/clawnify/OpenProperty) by
Clawnify, released under the MIT License (see `LICENSE`).

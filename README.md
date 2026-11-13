# Hospital Dashboard

A front-desk and operations dashboard for a hospital: enquiries (leads) from ads, social media, WhatsApp and
phone calls, patients with unique IDs, appointments, follow-ups, IPD beds, doctors, billing with GST, campaigns
and Excel reports.

Plain PHP + MySQL + JavaScript. No build step, so it runs on Hostinger shared hosting as-is.

## Sections

| Area | What it does |
| --- | --- |
| Dashboard | Today's appointments, new enquiries, follow-ups due, beds, collections |
| Patient enquiries | All leads with **source** and **status** dropdowns, call / WhatsApp buttons, call notes |
| Inbox | Comments and messages from Facebook, Instagram, WhatsApp, YouTube |
| Patients | Patient records with ID, journey (OPD → surgery, or direct surgery), appointments and bills |
| Appointments | OPD and surgery bookings; date, time and doctor editable at any time |
| Follow-ups | Due list with one-click WhatsApp message |
| IPD & beds | Bed board, admit / discharge |
| Doctors | 5 sample doctors; availability: every day, only today, specific date, Mon–Sat, chosen weekdays |
| Departments, Staff & shifts | Simple lists |
| Billing & invoices | GST bill (CGST/SGST), separate OPD / surgery bill numbers, partial and full payments, print |
| Campaigns | Leads, bookings and cost per lead per campaign |
| Reports | Date-range summary, one Excel file with every sheet |
| Integrations, Users, Settings | Admin only |

Every list has a date range filter and an **Export Excel** button.

### Patient ID rule

`first 4 letters of name` + `last 4 digits of mobile`, e.g. Ramesh Kumar, 9876504321 → **RAME4321**
(a `-2` suffix is added if two patients would get the same ID).

An ID is created **only** when an enquiry is set to *Appointment / OPD booked* or *Direct surgery*
(the dashboard then asks for date, time and doctor). Fake callers, not-interested and just-an-enquiry leads
never get an ID.

## Try it without hosting (demo mode)

Open `index.html` through any static server (or GitHub Pages). With no PHP backend it starts in demo mode
with sample data stored in the browser only. *Integrations → Simulate* shows how incoming leads appear.

## Host on Hostinger

1. **Upload the files** to `public_html` (or a sub-folder / sub-domain): hPanel → *Websites → Git* to deploy this
   repository, or download the ZIP and upload with File Manager.
2. **Create a database**: hPanel → *Databases → MySQL Databases*. Note the database name, user and password.
3. **Configure**: copy `api/config.sample.php` to `api/config.php` and enter those three values.
4. Open the site. The first visit asks you to **create the admin account**. Tables, the 5 sample doctors,
   departments and beds are created automatically. Add receptionists under *User management*.
5. Make sure SSL (HTTPS) is on — Meta webhooks require it.

`api/config.php` is ignored by git, so the database password is never committed.

## Integrations

All keys are entered in the dashboard under **Integrations** (stored on the server, never shown again in the
browser). That page shows the exact webhook URLs and step-by-step instructions.

| Channel | How it arrives | Needs |
| --- | --- | --- |
| Meta lead ads | `api/webhook-meta.php` → enquiry with name, phone, campaign | Meta app, App secret, Page access token |
| Facebook / Instagram comments + messages | same webhook → Inbox + enquiry | same app, Instagram linked to the Page |
| WhatsApp messages | same webhook → Inbox + enquiry | WhatsApp Cloud API number |
| YouTube comments | polled every 5 min while the dashboard is open, or by cron `api/cron-youtube.php` | YouTube Data API key + channel ID |
| Office phone calls | `api/webhook-call.php?key=…` → enquiry with source "Phone call" | A cloud telephony / IVR number (Exotel, MyOperator, Knowlarity, Tata Smartflo …) |
| One-click WhatsApp follow-up | opens WhatsApp with the message filled in | Nothing — works with WhatsApp on the receptionist's phone/PC |

Notes:

- Meta requires the app to pass App Review (and business verification) before it delivers leads, comments and
  messages from real users. Until then it only works for the app's own admins/testers.
- A normal landline or mobile SIM cannot report calls to any software. Call capture needs a cloud telephony number.
- Sending WhatsApp from the dashboard through the Cloud API is only allowed within 24 hours of the patient's
  last message; outside that window use the one-click button.

## Files

```
index.html            app shell
assets/               styles, scripts, Excel library (SheetJS)
api/index.php         login, data sync, users, integration settings
api/webhook-meta.php  Meta lead ads, Facebook, Instagram, WhatsApp
api/webhook-call.php  incoming calls from a telephony provider
api/cron-youtube.php  optional cron for YouTube comments
api/config.sample.php database settings template
```

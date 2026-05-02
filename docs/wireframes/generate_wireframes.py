#!/usr/bin/env python3
"""Generate wireframe SVGs, PNGs, and .ep files for all screens."""

import os
import subprocess
import zipfile
import xml.etree.ElementTree as ET

OUT = os.path.dirname(os.path.abspath(__file__))

W, H = 1200, 900
BG = "#ffffff"
FILL_LIGHT = "#f5f5f5"
FILL_MID = "#e8e8e8"
FILL_DARK = "#d0d0d0"
STROKE = "#bbbbbb"
STROKE_DARK = "#999999"
TEXT_DARK = "#333333"
TEXT_MID = "#666666"
TEXT_LIGHT = "#999999"
ACCENT = "#4a90d9"
ACCENT_LIGHT = "#e3f0fc"
GREEN = "#5cb85c"
GREEN_LIGHT = "#eaf7ea"
RED = "#d9534f"
ORANGE = "#f0ad4e"
ORANGE_LIGHT = "#fef8e9"

def svg_head(title):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <style>
      text {{ font-family: 'Segoe UI', Arial, Helvetica, sans-serif; }}
    </style>
  </defs>
  <rect width="{W}" height="{H}" fill="{BG}"/>
  <title>{title}</title>
'''

NAV_BAR = f'''
  <!-- Top Navigation Bar -->
  <rect x="0" y="0" width="{W}" height="56" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <rect x="20" y="16" width="120" height="24" rx="4" fill="{ACCENT}"/>
  <text x="80" y="33" text-anchor="middle" fill="white" font-size="13" font-weight="bold">SecureFlow</text>
  <text x="200" y="35" fill="{TEXT_DARK}" font-size="13" font-weight="600">Dashboard</text>
  <text x="295" y="35" fill="{TEXT_MID}" font-size="13">Questionnaires</text>
  <text x="410" y="35" fill="{TEXT_MID}" font-size="13">Evidence</text>
  <text x="495" y="35" fill="{TEXT_MID}" font-size="13">Integrations</text>
  <rect x="1120" y="16" width="60" height="24" rx="12" fill="{FILL_MID}" stroke="{STROKE}" stroke-width="1"/>
  <text x="1150" y="33" text-anchor="middle" fill="{TEXT_MID}" font-size="11">User</text>
'''

def card(x, y, cw, ch, label="", sublabel="", fill=FILL_LIGHT, accent=False):
    s = f'''
  <rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="6" fill="{ACCENT_LIGHT if accent else fill}" stroke="{ACCENT if accent else STROKE}" stroke-width="1.5"/>
'''
    if label:
        s += f'  <text x="{x + cw//2}" y="{y + 28}" text-anchor="middle" fill="{TEXT_DARK}" font-size="14" font-weight="600">{label}</text>\n'
    if sublabel:
        s += f'  <text x="{x + cw//2}" y="{y + 50}" text-anchor="middle" fill="{TEXT_MID}" font-size="12">{sublabel}</text>\n'
    return s

def button(x, y, bw, bh, label, filled=True):
    btn_fill = ACCENT if filled else FILL_LIGHT
    txt_fill = "white" if filled else ACCENT
    s = f'''
  <rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="5" fill="{btn_fill}" stroke="{ACCENT}" stroke-width="1.5"/>
  <text x="{x + bw//2}" y="{y + bh//2 + 5}" text-anchor="middle" fill="{txt_fill}" font-size="12" font-weight="600">{label}</text>
'''
    return s

def placeholder_line(x, y, lw, lh=8):
    return f'  <rect x="{x}" y="{y}" width="{lw}" height="{lh}" rx="4" fill="{FILL_MID}"/>\n'

# ─── DASHBOARD ────────────────────────────────────────────────────────────────

def gen_dashboard():
    svg = svg_head("Dashboard")
    svg += NAV_BAR
    # Greeting header
    svg += f'\n  <text x="40" y="96" fill="{TEXT_DARK}" font-size="22" font-weight="bold">Good morning, Alex</text>\n'
    svg += f'  <text x="40" y="118" fill="{TEXT_MID}" font-size="13">Here is your compliance overview for today.</text>\n'

    # Summary stat cards (4)
    labels = [("Active\nQuestionnaires", "12"), ("Pending Tasks", "47"), ("Compliance\nScore", "87%"), ("Evidence\nArtifacts", "234")]
    for i, (lbl, val) in enumerate(labels):
        cx = 40 + i * 285
        svg += card(cx, 145, 260, 85, val, lbl.replace("\n", " "), accent=(i == 2))

    # Active Questionnaires table
    table_y = 260
    svg += f'\n  <text x="40" y="{table_y}" fill="{TEXT_DARK}" font-size="16" font-weight="bold">Active Questionnaires</text>\n'
    svg += f'  <rect x="40" y="{table_y + 12}" width="1120" height="36" rx="4" fill="{FILL_MID}"/>\n'
    headers = ["Name", "Framework", "Status", "Due Date", "Progress"]
    col_x = [60, 320, 510, 670, 840]
    for i, h in enumerate(headers):
        svg += f'  <text x="{col_x[i]}" y="{table_y + 36}" fill="{TEXT_MID}" font-size="12" font-weight="600">{h}</text>\n'

    rows = [
        ("SOC 2 Type II Assessment", "SOC 2", "In Progress", "May 15, 2026", "72%"),
        ("ISO 27001 Renewal", "ISO 27001", "Not Started", "Jun 1, 2026", "0%"),
        ("PCI-DSS Self-Assessment", "PCI-DSS", "Review", "May 22, 2026", "91%"),
        ("GDPR Data Mapping", "GDPR", "In Progress", "Jun 10, 2026", "45%"),
    ]
    for ri, (name, fw, status, due, prog) in enumerate(rows):
        ry = table_y + 48 + ri * 40
        svg += f'  <rect x="40" y="{ry}" width="1120" height="38" fill="{BG if ri % 2 == 0 else FILL_LIGHT}" stroke="{STROKE}" stroke-width="0.5"/>\n'
        svg += f'  <text x="60" y="{ry + 24}" fill="{TEXT_DARK}" font-size="12">{name}</text>\n'
        svg += f'  <text x="320" y="{ry + 24}" fill="{TEXT_MID}" font-size="12">{fw}</text>\n'
        # status badge
        badge_fill = ACCENT_LIGHT if status == "In Progress" else (GREEN_LIGHT if status == "Review" else ORANGE_LIGHT)
        badge_stroke = ACCENT if status == "In Progress" else (GREEN if status == "Review" else ORANGE)
        svg += f'  <rect x="510" y="{ry + 8}" width="80" height="22" rx="11" fill="{badge_fill}" stroke="{badge_stroke}" stroke-width="1"/>\n'
        svg += f'  <text x="550" y="{ry + 24}" text-anchor="middle" fill="{badge_stroke}" font-size="10" font-weight="600">{status}</text>\n'
        svg += f'  <text x="670" y="{ry + 24}" fill="{TEXT_MID}" font-size="12">{due}</text>\n'
        # progress bar
        bar_w = 120
        pct = int(prog.replace("%", ""))
        svg += f'  <rect x="840" y="{ry + 14}" width="{bar_w}" height="10" rx="5" fill="{FILL_MID}"/>\n'
        svg += f'  <rect x="840" y="{ry + 14}" width="{int(bar_w * pct / 100)}" height="10" rx="5" fill="{ACCENT}"/>\n'
        svg += f'  <text x="970" y="{ry + 24}" fill="{TEXT_MID}" font-size="11">{prog}</text>\n'

    # Quick action buttons
    btn_y = table_y + 48 + len(rows) * 40 + 30
    svg += f'\n  <text x="40" y="{btn_y}" fill="{TEXT_DARK}" font-size="16" font-weight="bold">Quick Actions</text>\n'
    svg += button(40, btn_y + 16, 170, 40, "+ Upload Questionnaire", filled=True)
    svg += button(230, btn_y + 16, 140, 40, "Browse Evidence", filled=False)
    svg += button(390, btn_y + 16, 160, 40, "View Integrations", filled=False)
    svg += button(570, btn_y + 16, 130, 40, "Generate Report", filled=False)

    svg += '</svg>'
    return svg

# ─── QUESTIONNAIRE UPLOAD ─────────────────────────────────────────────────────

def gen_questionnaire_upload():
    svg = svg_head("Questionnaire Upload")
    svg += NAV_BAR

    # Page header
    svg += f'\n  <text x="40" y="100" fill="{TEXT_DARK}" font-size="22" font-weight="bold">Upload Questionnaire</text>\n'
    svg += f'  <text x="40" y="122" fill="{TEXT_MID}" font-size="13">Upload a security questionnaire in PDF, DOCX, or XLSX format for AI processing.</text>\n'

    # Upload dropzone
    dz_y = 165
    dz_h = 300
    svg += f'''
  <rect x="40" y="{dz_y}" width="1120" height="{dz_h}" rx="8" fill="{FILL_LIGHT}" stroke="{ACCENT}" stroke-width="2" stroke-dasharray="8,4"/>
  <line x1="540" y1="{dz_y + 80}" x2="600" y2="{dz_y + 80}" stroke="{ACCENT}" stroke-width="3"/>
  <line x1="570" y1="{dz_y + 50}" x2="570" y2="{dz_y + 110}" stroke="{ACCENT}" stroke-width="3"/>
  <text x="600" y="{dz_y + 150}" text-anchor="middle" fill="{TEXT_MID}" font-size="15" font-weight="600">Drag and drop files here</text>
  <text x="600" y="{dz_y + 175}" text-anchor="middle" fill="{TEXT_LIGHT}" font-size="12">or click to browse</text>
  <text x="600" y="{dz_y + 210}" text-anchor="middle" fill="{TEXT_LIGHT}" font-size="11">Supports PDF, DOCX, XLSX (max 50 MB)</text>
'''
    # Browse button inside dropzone
    svg += button(510, dz_y + 230, 180, 36, "Browse Files", filled=False)

    # File list
    fl_y = dz_y + dz_h + 30
    svg += f'\n  <text x="40" y="{fl_y}" fill="{TEXT_DARK}" font-size="16" font-weight="bold">Uploaded Files</text>\n'

    files = [
        ("SOC2_TypeII_2026.pdf", "PDF", "2.4 MB", GREEN),
        ("vendor_security_questions.docx", "DOCX", "856 KB", GREEN),
        ("PCI-DSS_SAQ_v4.xlsx", "XLSX", "1.1 MB", ORANGE),
    ]
    for i, (name, ext, size, color) in enumerate(files):
        fy = fl_y + 20 + i * 52
        svg += f'''
  <rect x="40" y="{fy}" width="1120" height="44" rx="6" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <rect x="60" y="{fy + 10}" width="30" height="24" rx="3" fill="{FILL_MID}" stroke="{STROKE}" stroke-width="1"/>
  <text x="75" y="{fy + 27}" text-anchor="middle" fill="{TEXT_MID}" font-size="9" font-weight="600">{ext}</text>
  <text x="105" y="{fy + 27}" fill="{TEXT_DARK}" font-size="13">{name}</text>
  <text x="700" y="{fy + 27}" fill="{TEXT_MID}" font-size="12">{size}</text>
  <circle cx="950" cy="{fy + 22}" r="6" fill="{GREEN}" opacity="0.6"/>
  <text x="965" y="{fy + 27}" fill="{TEXT_MID}" font-size="11">Ready</text>
  <text x="1100" y="{fy + 27}" fill="{RED}" font-size="16" cursor="pointer">✕</text>
'''

    # Submit button
    sub_y = fl_y + 20 + len(files) * 52 + 30
    svg += button(40, sub_y, 220, 48, "Process Questionnaires", filled=True)

    svg += '</svg>'
    return svg

# ─── QUESTIONNAIRE RESPONDER ──────────────────────────────────────────────────

def gen_questionnaire_responder():
    svg = svg_head("Questionnaire Responder")
    svg += NAV_BAR

    # Progress header
    svg += f'''
  <rect x="0" y="56" width="{W}" height="52" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <text x="40" y="88" fill="{TEXT_DARK}" font-size="15" font-weight="bold">SOC 2 Type II Assessment</text>
  <rect x="400" y="74" width="400" height="14" rx="7" fill="{FILL_MID}"/>
  <rect x="400" y="74" width="288" height="14" rx="7" fill="{ACCENT}"/>
  <text x="820" y="86" fill="{TEXT_MID}" font-size="12">72% complete (36/50)</text>
'''

    # Question navigation sidebar
    sidebar_w = 260
    svg += f'''
  <rect x="0" y="108" width="{sidebar_w}" height="{H - 108}" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <text x="20" y="138" fill="{TEXT_DARK}" font-size="13" font-weight="bold">Questions</text>
'''
    questions = [
        ("1. Access Control Policy", True, True),
        ("2. User Authentication", True, True),
        ("3. Network Security", True, True),
        ("4. Data Encryption", True, False),
        ("5. Incident Response", False, False),
        ("6. Change Management", False, False),
        ("7. Backup &amp; Recovery", False, False),
        ("8. Vendor Management", False, False),
        ("9. Risk Assessment", False, False),
        ("10. Logging &amp; Monitoring", False, False),
    ]
    for i, (q, answered, current) in enumerate(questions):
        qy = 158 + i * 44
        fill = ACCENT_LIGHT if current else (GREEN_LIGHT if answered else "none")
        svg += f'  <rect x="8" y="{qy}" width="{sidebar_w - 16}" height="38" rx="4" fill="{fill}" '
        if current:
            svg += f'stroke="{ACCENT}" stroke-width="1.5"'
        svg += '/>\n'
        num_color = ACCENT if current else (GREEN if answered else TEXT_LIGHT)
        svg += f'  <text x="20" y="{qy + 24}" fill="{num_color}" font-size="12" '
        if current:
            svg += 'font-weight="bold"'
        svg += f'>{q}</text>\n'
        if answered:
            svg += f'  <text x="{sidebar_w - 25}" y="{qy + 24}" fill="{GREEN}" font-size="14">✓</text>\n'

    # Main content area
    mx = sidebar_w + 30
    mw = W - sidebar_w - 60

    # Question text block
    svg += f'''
  <rect x="{mx}" y="125" width="{mw}" height="90" rx="6" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <text x="{mx + 20}" y="152" fill="{ACCENT}" font-size="12" font-weight="600">Question #4</text>
  <text x="{mx + 20}" y="178" fill="{TEXT_DARK}" font-size="14">Describe the encryption standards used for data at rest and</text>
  <text x="{mx + 20}" y="198" fill="{TEXT_DARK}" font-size="14">in transit within your infrastructure.</text>
'''

    # AI-generated answer form
    ay = 235
    svg += f'''
  <text x="{mx}" y="{ay}" fill="{TEXT_DARK}" font-size="14" font-weight="bold">AI-Generated Answer</text>
  <text x="{mx + 170}" y="{ay}" fill="{GREEN}" font-size="12">● AI Draft</text>
  <rect x="{mx}" y="{ay + 12}" width="{mw}" height="180" rx="6" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <text x="{mx + 20}" y="{ay + 38}" fill="{TEXT_DARK}" font-size="12">All data at rest is encrypted using AES-256 encryption. Data in transit</text>
  <text x="{mx + 20}" y="{ay + 58}" fill="{TEXT_DARK}" font-size="12">is secured using TLS 1.3. Database-level encryption is managed through</text>
  <text x="{mx + 20}" y="{ay + 78}" fill="{TEXT_DARK}" font-size="12">AWS KMS with customer-managed keys. Additional encryption details:</text>
  <text x="{mx + 40}" y="{ay + 100}" fill="{TEXT_MID}" font-size="12">• S3 buckets: SSE-KMS encryption enabled</text>
  <text x="{mx + 40}" y="{ay + 120}" fill="{TEXT_MID}" font-size="12">• EBS volumes: AES-256 encrypted</text>
  <text x="{mx + 40}" y="{ay + 140}" fill="{TEXT_MID}" font-size="12">• RDS instances: TDE enabled</text>
  <text x="{mx + 40}" y="{ay + 160}" fill="{TEXT_MID}" font-size="12">• API endpoints: TLS 1.3 enforced</text>
  <text x="{mx + 40}" y="{ay + 180}" fill="{TEXT_MID}" font-size="12">• Internal services: mTLS between microservices</text>
'''

    # Evidence link tags
    ey = ay + 210
    svg += f'\n  <text x="{mx}" y="{ey}" fill="{TEXT_DARK}" font-size="13" font-weight="bold">Linked Evidence</text>\n'
    evidence_tags = [
        "AES-256 Encryption Policy",
        "AWS KMS Config",
        "TLS Certificate Report",
        "Network Architecture Diagram",
    ]
    tag_x = mx
    for tag in evidence_tags:
        tw = len(tag) * 8 + 24
        svg += f'  <rect x="{tag_x}" y="{ey + 10}" width="{tw}" height="28" rx="14" fill="{ACCENT_LIGHT}" stroke="{ACCENT}" stroke-width="1"/>\n'
        svg += f'  <text x="{tag_x + tw // 2}" y="{ey + 29}" text-anchor="middle" fill="{ACCENT}" font-size="10" font-weight="600">🔗 {tag}</text>\n'
        tag_x += tw + 10

    # Action buttons
    aby = ey + 55
    svg += button(mx, aby, 120, 38, "Approve", filled=True)
    svg += button(mx + 140, aby, 120, 38, "Edit Answer", filled=False)
    svg += button(mx + 280, aby, 130, 38, "Add Evidence", filled=False)
    svg += button(mx + 780, aby, 120, 38, "← Previous", filled=False)
    svg += button(mx + 920, aby, 120, 38, "Next →", filled=True)

    svg += '</svg>'
    return svg

# ─── EVIDENCE LIBRARY ─────────────────────────────────────────────────────────

def gen_evidence_library():
    svg = svg_head("Evidence Library")
    svg += NAV_BAR

    # Search header
    svg += f'''
  <text x="40" y="100" fill="{TEXT_DARK}" font-size="22" font-weight="bold">Evidence Library</text>
  <rect x="40" y="115" width="720" height="42" rx="6" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1.5"/>
  <text x="70" y="142" fill="{TEXT_LIGHT}" font-size="14">🔍 Search evidence, policies, diagrams...</text>
'''
    svg += button(780, 115, 120, 42, "Search", filled=True)
    svg += button(920, 115, 140, 42, "+ Add Evidence", filled=False)

    # Category filter tabs
    tab_y = 180
    tabs = ["All", "Policies", "Diagrams", "Certificates", "Reports", "Configs", "Audits"]
    tx = 40
    for i, tab in enumerate(tabs):
        tw = len(tab) * 12 + 28
        is_active = (i == 0)
        tab_fill = ACCENT if is_active else FILL_LIGHT
        tab_stroke = ACCENT if is_active else STROKE
        tab_text_fill = "white" if is_active else TEXT_MID
        svg += f'  <rect x="{tx}" y="{tab_y}" width="{tw}" height="32" rx="6" fill="{tab_fill}" stroke="{tab_stroke}" stroke-width="1.5"/>\n'
        svg += f'  <text x="{tx + tw // 2}" y="{tab_y + 22}" text-anchor="middle" fill="{tab_text_fill}" font-size="12" font-weight="600">{tab}</text>\n'
        tx += tw + 8

    # Evidence card grid (3 columns x 3 rows)
    card_data = [
        ("AES-256 Encryption Policy", "Policy", "Updated 2 days ago", "📄"),
        ("Network Architecture Diagram", "Diagram", "Updated 1 week ago", "🗺"),
        ("SOC 2 Type II Certificate", "Certificate", "Issued Jan 2026", "🏅"),
        ("Incident Response Plan v3.2", "Policy", "Updated 3 days ago", "📄"),
        ("AWS KMS Configuration", "Config", "Synced 1 hour ago", "⚙"),
        ("Penetration Test Report Q1", "Report", "Completed Mar 2026", "📊"),
        ("Vendor Risk Assessment", "Audit", "Updated 5 days ago", "🔍"),
        ("Access Control Matrix", "Policy", "Updated 1 day ago", "📄"),
        ("Backup &amp; Recovery Runbook", "Policy", "Updated 2 weeks ago", "📄"),
    ]
    cols = 3
    cw = 360
    ch = 140
    gap = 20
    for idx, (title, cat, updated, icon) in enumerate(card_data):
        col = idx % cols
        row = idx // cols
        cx = 40 + col * (cw + gap)
        cy = tab_y + 50 + row * (ch + gap)
        svg += f'''
  <rect x="{cx}" y="{cy}" width="{cw}" height="{ch}" rx="8" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1.5"/>
  <text x="{cx + 16}" y="{cy + 30}" fill="{TEXT_DARK}" font-size="13" font-weight="600">{icon} {title}</text>
  <rect x="{cx + 16}" y="{cy + 42}" width="{len(cat) * 9 + 16}" height="22" rx="11" fill="{ACCENT_LIGHT}" stroke="{ACCENT}" stroke-width="1"/>
  <text x="{cx + 16 + (len(cat) * 9 + 16) // 2}" y="{cy + 58}" text-anchor="middle" fill="{ACCENT}" font-size="10" font-weight="600">{cat}</text>
  <text x="{cx + 16}" y="{cy + 82}" fill="{TEXT_LIGHT}" font-size="11">{updated}</text>
  <rect x="{cx + 16}" y="{cy + 95}" width="80" height="26" rx="4" fill="{FILL_MID}" stroke="{STROKE}" stroke-width="1"/>
  <text x="{cx + 56}" y="{cy + 113}" text-anchor="middle" fill="{TEXT_MID}" font-size="10">View</text>
  <rect x="{cx + 106}" y="{cy + 95}" width="80" height="26" rx="4" fill="{FILL_MID}" stroke="{STROKE}" stroke-width="1"/>
  <text x="{cx + 146}" y="{cy + 113}" text-anchor="middle" fill="{TEXT_MID}" font-size="10">Download</text>
  <rect x="{cx + 196}" y="{cy + 95}" width="80" height="26" rx="4" fill="{FILL_MID}" stroke="{STROKE}" stroke-width="1"/>
  <text x="{cx + 236}" y="{cy + 113}" text-anchor="middle" fill="{TEXT_MID}" font-size="10">Link</text>
'''

    svg += '</svg>'
    return svg

# ─── INTEGRATIONS SETTINGS ────────────────────────────────────────────────────

def gen_integrations_settings():
    svg = svg_head("Integrations Settings")
    svg += NAV_BAR

    # Section header
    svg += f'''
  <text x="40" y="100" fill="{TEXT_DARK}" font-size="22" font-weight="bold">Integrations</text>
  <text x="40" y="122" fill="{TEXT_MID}" font-size="13">Connect your engineering tools for continuous automated evidence collection.</text>
'''

    # Integration card list
    integrations = [
        ("AWS (Amazon Web Services)", "Cloud Infrastructure", True, "Synced 5 min ago", GREEN),
        ("GitHub", "Source Code &amp; CI/CD", True, "Synced 2 min ago", GREEN),
        ("Jira", "Project Management", True, "Synced 15 min ago", GREEN),
        ("Okta", "Identity &amp; Access", False, "Not connected", TEXT_LIGHT),
        ("Datadog", "Monitoring &amp; Alerting", False, "Not connected", TEXT_LIGHT),
        ("Splunk", "SIEM &amp; Log Management", False, "Not connected", TEXT_LIGHT),
    ]

    for i, (name, desc, connected, sync, color) in enumerate(integrations):
        iy = 150 + i * 110
        svg += f'''
  <rect x="40" y="{iy}" width="1120" height="95" rx="8" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1.5"/>
  <rect x="60" y="{iy + 18}" width="50" height="50" rx="8" fill="{FILL_MID}" stroke="{STROKE}" stroke-width="1"/>
  <text x="85" y="{iy + 50}" text-anchor="middle" fill="{TEXT_MID}" font-size="18">⚡</text>
  <text x="130" y="{iy + 38}" fill="{TEXT_DARK}" font-size="15" font-weight="bold">{name}</text>
  <text x="130" y="{iy + 58}" fill="{TEXT_MID}" font-size="12">{desc}</text>
'''
        # Sync status indicator
        svg += f'  <circle cx="750" cy="{iy + 30}" r="5" fill="{color}"/>\n'
        svg += f'  <text x="762" y="{iy + 35}" fill="{TEXT_MID}" font-size="12">{sync}</text>\n'

        # Connect toggle
        toggle_x = 1040
        toggle_y_c = iy + 25
        if connected:
            svg += f'''
  <rect x="{toggle_x}" y="{toggle_y_c}" width="50" height="26" rx="13" fill="{GREEN}"/>
  <circle cx="{toggle_x + 37}" cy="{toggle_y_c + 13}" r="10" fill="white"/>
'''
        else:
            svg += f'''
  <rect x="{toggle_x}" y="{toggle_y_c}" width="50" height="26" rx="13" fill="{FILL_DARK}"/>
  <circle cx="{toggle_x + 13}" cy="{toggle_y_c + 13}" r="10" fill="white"/>
'''
        # Action buttons for connected
        if connected:
            svg += f'''
  <text x="750" y="{iy + 60}" fill="{ACCENT}" font-size="12" font-weight="600">Configure</text>
  <text x="840" y="{iy + 60}" fill="{RED}" font-size="12">Disconnect</text>
'''
        else:
            svg += f'  <text x="750" y="{iy + 60}" fill="{ACCENT}" font-size="12" font-weight="600">Connect</text>\n'

    svg += '</svg>'
    return svg

# ─── BILLING AND ACCOUNT ──────────────────────────────────────────────────────

def gen_billing_and_account():
    svg = svg_head("Billing and Account")
    svg += NAV_BAR

    # Settings navigation menu (left sidebar)
    sidebar_w = 240
    svg += f'''
  <rect x="0" y="56" width="{sidebar_w}" height="{H - 56}" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1"/>
  <text x="20" y="88" fill="{TEXT_DARK}" font-size="14" font-weight="bold">Settings</text>
'''
    menu_items = [
        ("Profile", True),
        ("Team Members", False),
        ("Billing", False),
        ("Notifications", False),
        ("Security", False),
        ("API Keys", False),
    ]
    for i, (item, active) in enumerate(menu_items):
        my = 108 + i * 44
        svg += f'  <rect x="8" y="{my}" width="{sidebar_w - 16}" height="36" rx="4" fill="{ACCENT_LIGHT if active else "none"}" '
        if active:
            svg += f'stroke="{ACCENT}" stroke-width="1.5"'
        svg += '/>\n'
        svg += f'  <text x="20" y="{my + 24}" fill="{ACCENT if active else TEXT_MID}" font-size="13" '
        if active:
            svg += 'font-weight="bold"'
        svg += f'>{item}</text>\n'

    # Main content area
    mx = sidebar_w + 30
    mw = W - sidebar_w - 60

    # Profile form
    svg += f'''
  <text x="{mx}" y="92" fill="{TEXT_DARK}" font-size="20" font-weight="bold">Profile</text>
  <rect x="{mx}" y="108" width="{mw}" height="200" rx="8" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1.5"/>
  <text x="{mx + 20}" y="140" fill="{TEXT_DARK}" font-size="13" font-weight="600">Full Name</text>
  <rect x="{mx + 20}" y="148" width="300" height="34" rx="4" fill="white" stroke="{STROKE}" stroke-width="1"/>
  <text x="{mx + 32}" y="170" fill="{TEXT_DARK}" font-size="12">Alex Johnson</text>

  <text x="{mx + 340}" y="140" fill="{TEXT_DARK}" font-size="13" font-weight="600">Email</text>
  <rect x="{mx + 340}" y="148" width="360" height="34" rx="4" fill="white" stroke="{STROKE}" stroke-width="1"/>
  <text x="{mx + 352}" y="170" fill="{TEXT_DARK}" font-size="12">alex@company.com</text>

  <text x="{mx + 20}" y="210" fill="{TEXT_DARK}" font-size="13" font-weight="600">Company</text>
  <rect x="{mx + 20}" y="218" width="300" height="34" rx="4" fill="white" stroke="{STROKE}" stroke-width="1"/>
  <text x="{mx + 32}" y="240" fill="{TEXT_DARK}" font-size="12">Acme Corp</text>

  <text x="{mx + 340}" y="210" fill="{TEXT_DARK}" font-size="13" font-weight="600">Role</text>
  <rect x="{mx + 340}" y="218" width="360" height="34" rx="4" fill="white" stroke="{STROKE}" stroke-width="1"/>
  <text x="{mx + 352}" y="240" fill="{TEXT_DARK}" font-size="12">Security Administrator</text>

  <rect x="{mx + 20}" y="265" width="100" height="30" rx="4" fill="{ACCENT}"/>
  <text x="{mx + 70}" y="285" text-anchor="middle" fill="white" font-size="12" font-weight="600">Save</text>
'''

    # Usage meter bar
    uy = 330
    svg += f'''
  <text x="{mx}" y="{uy}" fill="{TEXT_DARK}" font-size="16" font-weight="bold">Usage This Month</text>
  <rect x="{mx}" y="{uy + 15}" width="{mw}" height="70" rx="8" fill="{FILL_LIGHT}" stroke="{STROKE}" stroke-width="1.5"/>
  <text x="{mx + 20}" y="{uy + 40}" fill="{TEXT_MID}" font-size="12">Questionnaires Processed</text>
  <rect x="{mx + 20}" y="{uy + 48}" width="{mw - 40}" height="18" rx="9" fill="{FILL_MID}"/>
  <rect x="{mx + 20}" y="{uy + 48}" width="{int((mw - 40) * 0.72)}" height="18" rx="9" fill="{ACCENT}"/>
  <text x="{mx + mw - 20}" y="{uy + 62}" text-anchor="end" fill="{TEXT_DARK}" font-size="11" font-weight="600">36 / 50</text>
'''

    # Subscription pricing cards
    sy = uy + 110
    svg += f'\n  <text x="{mx}" y="{sy}" fill="{TEXT_DARK}" font-size="16" font-weight="bold">Subscription Plan</text>\n'

    plans = [
        ("Starter", "$49/mo", ["5 questionnaires/mo", "1 user", "Email support", "Basic evidence"], False),
        ("Professional", "$149/mo", ["50 questionnaires/mo", "10 users", "Priority support", "Advanced evidence", "API access"], True),
        ("Enterprise", "Custom", ["Unlimited questionnaires", "Unlimited users", "Dedicated support", "Custom integrations", "SLA guarantee", "SSO/SAML"], False),
    ]
    pw = (mw - 40) // 3
    for i, (plan_name, price, features, popular) in enumerate(plans):
        px = mx + i * (pw + 20)
        py = sy + 18
        ph = 250
        border_color = ACCENT if popular else STROKE
        border_w = 2.5 if popular else 1.5
        svg += f'  <rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="8" fill="{ACCENT_LIGHT if popular else FILL_LIGHT}" stroke="{border_color}" stroke-width="{border_w}"/>\n'
        if popular:
            svg += f'  <rect x="{px + pw // 2 - 40}" y="{py - 10}" width="80" height="20" rx="10" fill="{ACCENT}"/>\n'
            svg += f'  <text x="{px + pw // 2}" y="{py + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">POPULAR</text>\n'
        svg += f'  <text x="{px + pw // 2}" y="{py + 40}" text-anchor="middle" fill="{TEXT_DARK}" font-size="16" font-weight="bold">{plan_name}</text>\n'
        svg += f'  <text x="{px + pw // 2}" y="{py + 68}" text-anchor="middle" fill="{ACCENT}" font-size="22" font-weight="bold">{price}</text>\n'
        for fi, feat in enumerate(features):
            svg += f'  <text x="{px + 30}" y="{py + 100 + fi * 22}" fill="{TEXT_MID}" font-size="12">✓ {feat}</text>\n'
        btn_y2 = py + ph - 50
        svg += button(px + 30, btn_y2, pw - 60, 36,
                       "Current Plan" if popular else "Upgrade",
                       filled=popular)

    svg += '</svg>'
    return svg


def make_ep_file(name, svg_content, title, purpose):
    """Create a Pencil .ep file (zipped XML)."""
    page_id = f"Page_{name.replace('-', '_')}"
    page_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Page xmlns="http://evolus.vn/Namespaces/Pencil"
      id="{page_id}" name="{title}"
      width="{W}" height="{H}">
  <Properties>
    <Property name="name">{title}</Property>
    <Property name="width">{W}</Property>
    <Property name="height">{H}</Property>
    <Property name="background">{BG}</Property>
  </Properties>
  <Content>
    {svg_content.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')}
  </Content>
</Page>'''

    content_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Content xmlns="http://evolus.vn/Namespaces/Pencil">
  <Properties>
    <Property name="name">{title} Wireframe</Property>
    <Property name="description">{purpose}</Property>
  </Properties>
  <Pages>
    <PageRef ref="{page_id}"/>
  </Pages>
</Content>'''

    ep_path = os.path.join(OUT, f"{name}.ep")
    with zipfile.ZipFile(ep_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('content.xml', content_xml)
        zf.writestr(f'Pages/{page_id}.xml', page_xml)
    return ep_path


SCREENS = [
    ("dashboard", "Dashboard", "Central hub displaying active security questionnaires, pending tasks, and overall compliance status.", gen_dashboard),
    ("questionnaire-upload", "Questionnaire Upload", "Interface for users to upload new security questionnaires (PDF, DOCX, XLSX) for AI processing.", gen_questionnaire_upload),
    ("questionnaire-responder", "Questionnaire Responder", "Interactive editor displaying AI-generated answers mapped to original questions with linked evidence.", gen_questionnaire_responder),
    ("evidence-library", "Evidence Library", "Searchable repository for managing security policies, architectural diagrams, and generated proof artifacts.", gen_evidence_library),
    ("integrations-settings", "Integrations Settings", "Configuration screen to connect engineering tools (AWS, GitHub, Jira) for continuous automated evidence collection.", gen_integrations_settings),
    ("billing-and-account", "Billing and Account", "Administrative screen for managing user profiles, team members, and monthly SaaS subscription tiers.", gen_billing_and_account),
]

for name, title, purpose, gen_fn in SCREENS:
    svg_content = gen_fn()
    svg_path = os.path.join(OUT, f"{name}.svg")
    png_path = os.path.join(OUT, f"{name}.png")

    with open(svg_path, 'w') as f:
        f.write(svg_content)
    print(f"Wrote {svg_path}")

    make_ep_file(name, svg_content, title, purpose)
    print(f"Wrote {os.path.join(OUT, name + '.ep')}")

    subprocess.run(
        ["rsvg-convert", "-w", "2400", "-o", png_path, svg_path],
        check=True,
    )
    print(f"Wrote {png_path}")

# ─── index.md ─────────────────────────────────────────────────────────────────

md = """# Wireframes

Pencil wireframe previews for the SecureFlow compliance platform.

"""
for name, title, purpose, _ in SCREENS:
    md += f"- **{title}** — {purpose}\n\n  ![{title}]({name}.png)\n\n"

index_path = os.path.join(OUT, "index.md")
with open(index_path, 'w') as f:
    f.write(md)
print(f"Wrote {index_path}")

print("\nAll wireframes generated successfully.")

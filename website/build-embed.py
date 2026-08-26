# -*- coding: utf-8 -*-
"""Baut den statischen Dashboard-Nachbau: Fragment fuer die Website + Artifact-Seite."""
import io, os

OUT_FRAGMENT = 'website/dashboard-embed.html'
OUT_PAGE = os.environ['SP'] + '/dashboard-bausatz.html'

# ── Echte Zahlen aus der Datenbank (30 Tage) ──────────────────────────────
BARS = [3, 6, 7, 10, 8, 5, 2, 6, 7, 4, 9, 7, 16, 4, 10, 8, 14, 18, 20, 12, 41, 11, 12, 5, 18, 19, 13, 3, 13, 7]
AVGS = [4.14, 4.0, 4.6, 4.25, 4.07, 4.75, 4.33, 4.5, 4.67, 4.13, 4.06, 4.25, 4.22, 4.67, 4.29, 4.42,
        4.41, 4.0, 4.59, 4.29, 4.61, 4.42, 4.17, 4.67, 4.28, 4.4, 4.45, 4.25, 4.4, 4.33]
DATES = ['28.07.', '29.07.', '30.07.', '31.07.', '01.08.', '02.08.', '03.08.', '04.08.', '05.08.', '06.08.',
         '07.08.', '08.08.', '09.08.', '10.08.', '11.08.', '12.08.', '13.08.', '14.08.', '15.08.', '16.08.',
         '17.08.', '18.08.', '19.08.', '20.08.', '21.08.', '22.08.', '23.08.', '24.08.', '25.08.', '26.08.']

# name, avg, count, preis, kategorie
DISHES = [
    ('Spicy Tuna Roll', 4.62, 69, 14.50, 'Speisen'),
    ('Edamame', 4.61, 147, 5.00, 'Speisen'),
    ('Dragon Roll', 4.54, 155, 16.00, 'Speisen'),
    ('California Roll', 4.34, 38, 12.50, 'Speisen'),
    ('Matcha Latte', 4.14, 7, 4.20, 'Getränke'),
    ('Japanischer Sake', 4.08, 12, 6.50, 'Getränke'),
    ('Asahi Bier', 3.86, 7, 4.80, 'Getränke'),
    ('Miso Suppe', 3.80, 54, 4.50, 'Speisen'),
    ('Lachs Nigiri', 3.68, 73, 13.00, 'Speisen'),
]
MEDIAN = 54

COLORS = {'stars': '#10b981', 'hidden': '#9ca3af', 'fix': '#f59e0b', 'watch': '#ef4444'}
QUAD_TEXT = [
    ('stars', 'Zugpferde', 'Hohe Bewertung, viele Rezensionen'),
    ('hidden', 'Geheimtipps', 'Hohe Bewertung, wenige Rezensionen'),
    ('fix', 'Verbesserungsbedarf', 'Niedrige Bewertung, viele Rezensionen'),
    ('watch', 'Im Auge behalten', 'Niedrige Bewertung, wenige Rezensionen'),
]

def quad(avg, count):
    good = avg >= 4
    many = count > MEDIAN
    return 'stars' if (good and many) else 'hidden' if good else ('fix' if many else 'watch')

def de(x, digits=1):
    return ('%.*f' % (digits, x)).replace('.', ',')

# ── Verlauf ───────────────────────────────────────────────────────────────
def verlauf_svg():
    W, H = 700, 150
    x0, x1 = 30.0, 664.0
    y0, y1 = 8.0, 112.0
    top_tick = 45.0
    slot = (x1 - x0) / len(BARS)
    bw = 11.0
    p = []
    # Gitter und linke Achse
    for t in (0, 15, 30, 45):
        y = y1 - t / top_tick * (y1 - y0)
        p.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#f1f5f9" stroke-width="1"/>' % (x0, y, x1, y))
        p.append('<text x="%.1f" y="%.1f" class="bd-tick" text-anchor="end">%d</text>' % (x0 - 6, y + 4, t))
    # Rechte Achse: die Note, fest 0 bis 5
    for t in range(6):
        y = y1 - t / 5.0 * (y1 - y0)
        p.append('<text x="%.1f" y="%.1f" class="bd-tick bd-tick-soft">%d</text>' % (x1 + 8, y + 4, t))
    for i, v in enumerate(BARS):
        h = v / top_tick * (y1 - y0)
        x = x0 + i * slot + (slot - bw) / 2
        p.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" fill="var(--bd-accent)"/>'
                 % (x, y1 - h, bw, max(h, 0.8)))
    pts = []
    for i, a in enumerate(AVGS):
        x = x0 + i * slot + slot / 2
        y = y1 - a / 5.0 * (y1 - y0)
        pts.append('%.1f,%.1f' % (x, y))
    p.append('<polyline points="%s" fill="none" stroke="#111827" stroke-width="2" stroke-linejoin="round"/>' % ' '.join(pts))
    for i in (0, 5, 10, 15, 20, 25, 29):
        x = x0 + i * slot + slot / 2
        p.append('<text x="%.1f" y="%d" class="bd-tick" text-anchor="middle">%s</text>' % (x, H - 8, DATES[i][:6]))
    return '<svg viewBox="0 0 %d %d" class="bd-chart" role="img" aria-label="Bewertungen je Tag der letzten 30 Tage, dazu der Schnitt">%s</svg>' % (W, H, ''.join(p))

# ── Menü-Matrix ───────────────────────────────────────────────────────────
def matrix_svg():
    W, H = 700, 300
    x0, x1 = 46.0, 668.0
    y0, y1 = 16.0, 246.0
    ax0, ax1 = 3.0, 5.0          # Fenster der Bewertungsachse
    cmax = 165.0
    def px(a): return x0 + (a - ax0) / (ax1 - ax0) * (x1 - x0)
    def py(c): return y1 - c / cmax * (y1 - y0)
    p = []
    for t in (0, 55, 110, 165):
        y = py(t)
        p.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="3 3"/>' % (x0, y, x1, y))
        p.append('<text x="%.1f" y="%.1f" class="bd-tick" text-anchor="end">%d</text>' % (x0 - 8, y + 4, t))
    for t in (3.0, 3.5, 4.0, 4.5, 5.0):
        x = px(t)
        p.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="3 3"/>' % (x, y0, x, y1))
        p.append('<text x="%.1f" y="%.1f" class="bd-tick" text-anchor="middle">%s</text>' % (x, y1 + 20, de(t)))
    # Die zwei Schwellen
    p.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="4 3"/>' % (px(4.0), y0, px(4.0), y1))
    p.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="4 3"/>' % (x0, py(MEDIAN), x1, py(MEDIAN)))
    for name, avg, count, _, _ in DISHES:
        p.append('<circle cx="%.1f" cy="%.1f" r="7.5" fill="%s" fill-opacity="0.85" stroke="#fff" stroke-width="2"><title>%s — %s ★ · %d Bewertungen</title></circle>'
                 % (px(avg), py(count), COLORS[quad(avg, count)], name, de(avg), count))
    p.append('<text x="%.1f" y="%d" class="bd-tick bd-tick-soft" text-anchor="middle">Ø Bewertung</text>' % ((x0 + x1) / 2, H - 6))
    p.append('<text x="14" y="%.1f" class="bd-tick bd-tick-soft" text-anchor="middle" transform="rotate(-90 14 %.1f)">Anzahl</text>' % ((y0 + y1) / 2, (y0 + y1) / 2))
    return '<svg viewBox="0 0 %d %d" class="bd-chart" role="img" aria-label="Gerichte nach Bewertung und Anzahl der Rezensionen">%s</svg>' % (W, H, ''.join(p))

STAR = 'M12 2l2.9 6.26 6.6.7-4.95 4.5 1.4 6.54L12 16.9l-5.95 3.1 1.4-6.54L2.5 8.96l6.6-.7z'

def stars(n):
    out = ['<span class="bd-stars" aria-hidden="true">']
    for i in range(5):
        fill = '#111827' if i < n else '#e5e7eb'
        out.append('<svg viewBox="0 0 24 24" width="12" height="12"><path d="%s" fill="%s"/></svg>' % (STAR, fill))
    out.append('</span>')
    return ''.join(out)

def rank_list(rows):
    out = []
    for i, (name, avg, count) in enumerate(rows, 1):
        out.append('<li><span class="bd-rank">%d</span><span class="bd-rank-name">%s</span>'
                   '<span class="bd-rank-count">%d×</span><span class="bd-rank-avg">%s</span></li>'
                   % (i, name, count, de(avg)))
    return ''.join(out)

def table_rows():
    out = []
    for i, (name, avg, count, price, cat) in enumerate(DISHES, 1):
        out.append('<tr><td class="bd-num">%d</td><td><p class="bd-dish">%s</p><p class="bd-cat">%s</p></td>'
                   '<td><span class="bd-score">%s<b>%s</b></span></td><td class="bd-cell">%d</td>'
                   '<td class="bd-cell">%s €</td></tr>'
                   % (i, name, cat, stars(round(avg)), de(avg), count, de(price, 2)))
    return ''.join(out)

def legend():
    out = []
    for key, title, desc in QUAD_TEXT:
        out.append('<div class="bd-legend-item"><span class="bd-dot" style="background:%s"></span>'
                   '<div><p class="bd-legend-title">%s</p><p class="bd-legend-desc">%s</p></div></div>'
                   % (COLORS[key], title, desc))
    return ''.join(out)

CSS = """.bitely-dash{--bd-accent:#16A34A;--bd-ink:#111827;--bd-muted:#6b7280;--bd-soft:#9ca3af;--bd-line:#f3f4f6;--bd-card:#fff;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--bd-ink);
  display:flex;flex-direction:column;gap:16px;-webkit-font-smoothing:antialiased}
.bitely-dash *{box-sizing:border-box;margin:0}
.bitely-dash .bd-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.bitely-dash .bd-card{background:var(--bd-card);border:1px solid var(--bd-line);border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.05);padding:20px}
.bitely-dash .bd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.bitely-dash .bd-title{font-size:15px;font-weight:600;letter-spacing:-.01em}
.bitely-dash .bd-sub{font-size:12px;color:var(--bd-soft);margin-top:2px}
.bitely-dash .bd-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.bitely-dash .bd-kpi-label{font-size:12px;color:var(--bd-muted);margin-bottom:6px}
.bitely-dash .bd-kpi-value{font-size:30px;font-weight:700;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.bitely-dash .bd-kpi-sub{font-size:11px;color:var(--bd-soft);margin-top:4px}
.bitely-dash .bd-rate{margin-top:16px;padding-top:16px;border-top:1px solid var(--bd-line)}
.bitely-dash .bd-rate-row{display:flex;justify-content:space-between;font-size:12px;color:var(--bd-muted);margin-bottom:6px}
.bitely-dash .bd-rate-row b{color:#1f2937;font-weight:600}
.bitely-dash .bd-bar{height:6px;border-radius:999px;background:var(--bd-line);overflow:hidden}
.bitely-dash .bd-bar span{display:block;height:100%;border-radius:999px;background:var(--bd-accent)}
.bitely-dash .bd-week{font-size:14px;line-height:1.6;color:#374151}
.bitely-dash .bd-week-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.bitely-dash .bd-legend-chart{display:flex;align-items:center;gap:14px;font-size:11px;color:var(--bd-muted)}
.bitely-dash .bd-swatch{width:10px;height:10px;border-radius:2px;background:var(--bd-accent);display:inline-block}
.bitely-dash .bd-line-swatch{width:16px;height:2px;border-radius:2px;background:#111827;display:inline-block}
.bitely-dash .bd-chart{width:100%;height:auto;display:block;overflow:visible}
.bitely-dash .bd-tick{font-size:11px;fill:#64748b;font-family:inherit}
.bitely-dash .bd-tick-soft{fill:#94a3b8}
.bitely-dash .bd-thresholds{font-size:12px;color:var(--bd-muted);margin-top:2px;line-height:1.5}
.bitely-dash .bd-thresholds b{color:var(--bd-accent);font-weight:600}
.bitely-dash .bd-legend{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-top:16px}
.bitely-dash .bd-legend-item{display:flex;align-items:flex-start;gap:10px}
.bitely-dash .bd-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;margin-top:4px}
.bitely-dash .bd-legend-title{font-size:12px;font-weight:600}
.bitely-dash .bd-legend-desc{font-size:11px;color:var(--bd-soft);margin-top:2px}
.bitely-dash ol.bd-ranks{list-style:none;padding:0;display:flex;flex-direction:column;gap:10px}
.bitely-dash ol.bd-ranks li{display:flex;align-items:center;gap:12px;font-size:14px}
.bitely-dash .bd-rank{width:20px;font-size:12px;color:#d1d5db;flex:0 0 auto}
.bitely-dash .bd-rank-name{flex:1;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bitely-dash .bd-rank-count{font-size:12px;color:var(--bd-soft);flex:0 0 auto}
.bitely-dash .bd-rank-avg{font-weight:600;width:32px;text-align:right;flex:0 0 auto;font-variant-numeric:tabular-nums}
.bitely-dash .bd-table-card{background:var(--bd-card);border:1px solid var(--bd-line);border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.05);overflow:hidden}
.bitely-dash .bd-table-head{padding:16px 24px;border-bottom:1px solid var(--bd-line)}
.bitely-dash .bd-table-wrap{overflow-x:auto}
.bitely-dash table{width:100%;border-collapse:collapse}
.bitely-dash thead tr{background:#f9fafb;border-bottom:1px solid var(--bd-line)}
.bitely-dash th{text-align:left;padding:12px 20px;font-size:11px;font-weight:600;color:var(--bd-soft);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.bitely-dash td{padding:12px 20px;border-bottom:1px solid #f9fafb;vertical-align:middle}
.bitely-dash tbody tr:last-child td{border-bottom:0}
.bitely-dash .bd-num{font-size:13px;color:var(--bd-soft)}
.bitely-dash .bd-dish{font-size:14px;font-weight:500;white-space:nowrap}
.bitely-dash .bd-cat{font-size:11px;color:var(--bd-soft);margin-top:1px}
.bitely-dash .bd-cell{font-size:14px;color:#4b5563;font-variant-numeric:tabular-nums}
.bitely-dash .bd-score{display:inline-flex;align-items:center;gap:8px}
.bitely-dash .bd-score b{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.bitely-dash .bd-stars{display:inline-flex;gap:1px}
@media (max-width:820px){.bitely-dash .bd-grid2,.bitely-dash .bd-legend{grid-template-columns:1fr}}"""

ZAP = ('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--bd-accent)" stroke-width="1.5" '
       'stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h7l-1 8 10-12h-7l1-8z"/></svg>')

def icon(path):
    return ('<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#9ca3af" stroke-width="1.5" '
            'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % path)

ICONS = {
    'star': '<path d="%s"/>' % STAR,
    'msg': '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 3.6 12a8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 9 8z"/>',
    'fork': '<path d="M3 2v7c0 1.1.9 2 2 2h1v11M8 2v9M14 22V10a4 4 0 0 1 4-4h3v16"/>',
}

WEEK_TEXT = ('Starke Woche: 319 Bewertungen bei 530 Bestellungen — jede dritte Bestellung hinterlässt '
             'Feedback. Das <b>Lachs Nigiri</b> fällt weiter ab (3,7 ★ bei 73 Rezensionen) und ist damit '
             'das einzige viel bestellte Gericht unter vier Sternen. <b>Edamame</b> und <b>Dragon Roll</b> '
             'tragen den Schnitt.')

def fragment():
    kpis = [
        ('star', 'Ø Bewertung', de(4.36), '571 Gerichtsurteile'),
        ('msg', 'Bewertungen', '319', 'Letzte 30 Tage'),
        ('fork', 'Bestellungen', '530', 'gebucht'),
    ]
    kpi_html = ''.join(
        '<div><div class="bd-kpi-label" style="display:flex;align-items:center;gap:6px">%s<span>%s</span></div>'
        '<p class="bd-kpi-value">%s</p><p class="bd-kpi-sub">%s</p></div>' % (icon(ICONS[ic]), label, value, sub)
        for ic, label, value, sub in kpis)

    best = rank_list([(n, a, c) for n, a, c, _, _ in DISHES[:5]])
    worst = rank_list([(n, a, c) for n, a, c, _, _ in list(reversed(DISHES))[:5]])

    return """<div class="bitely-dash">

  <!-- Ø Bewertung, Bewertungen, Bestellungen — und ihr Verhältnis -->
  <div class="bd-grid2">
    <div class="bd-card">
      <div class="bd-kpis">%s</div>
      <div class="bd-rate">
        <div class="bd-rate-row"><span>Bestellungen mit Feedback</span><b>60 %%</b></div>
        <div class="bd-bar"><span style="width:60%%"></span></div>
      </div>
    </div>
    <div class="bd-card">
      <div class="bd-week-head">%s<p class="bd-title">Diese Woche</p></div>
      <p class="bd-week">%s</p>
    </div>
  </div>

  <!-- Verlauf: Balken für die Anzahl, Linie für den Schnitt -->
  <div class="bd-card">
    <div class="bd-head">
      <div><p class="bd-title">Verlauf</p><p class="bd-sub">Bewertungen je Tag, dazu der Schnitt</p></div>
      <div class="bd-legend-chart">
        <span><span class="bd-swatch"></span> Anzahl</span>
        <span><span class="bd-line-swatch"></span> Ø Bewertung</span>
      </div>
    </div>
    %s
  </div>

  <!-- Beste und schwächste Gerichte -->
  <div class="bd-grid2">
    <div class="bd-card"><p class="bd-title" style="margin-bottom:12px">Beste Gerichte</p><ol class="bd-ranks">%s</ol></div>
    <div class="bd-card"><p class="bd-title" style="margin-bottom:12px">Schwächste Gerichte</p><ol class="bd-ranks">%s</ol></div>
  </div>

  <!-- Menü-Matrix: Bewertung gegen Anzahl der Rezensionen -->
  <div class="bd-card">
    <div style="margin-bottom:16px">
      <p class="bd-title">Menü-Matrix</p>
      <p class="bd-thresholds"><b>Hoch</b> = 4,0 ★ und mehr · <b>Viele</b> = mehr als der Median aller Gerichte (54 Bewertungen)</p>
    </div>
    %s
    <div class="bd-legend">%s</div>
  </div>

  <!-- Alle Gerichte -->
  <div class="bd-table-card">
    <div class="bd-table-head"><p class="bd-title">Alle Gerichte</p><p class="bd-sub">Spaltenkopf antippen zum Sortieren</p></div>
    <div class="bd-table-wrap">
      <table>
        <thead><tr><th>#</th><th>Gericht</th><th>Ø Bewertung</th><th>Bewertungen</th><th>Preis</th></tr></thead>
        <tbody>%s</tbody>
      </table>
    </div>
  </div>

</div>""" % (kpi_html, ZAP, WEEK_TEXT, verlauf_svg(), best, worst, matrix_svg(), legend(), table_rows())


FRAG = fragment()

os.makedirs('website', exist_ok=True)
io.open(OUT_FRAGMENT, 'w', encoding='utf-8', newline='\n').write(
"""<!--
  Bitely — Auswertungsbildschirm als statischer Block für die Website.

  Erzeugt aus den echten Zahlen eines Demo-Restaurants (30 Tage). Keine
  Abhängigkeiten: kein React, kein Recharts, kein Skript. Die Diagramme sind
  Inline-SVG, alles ist unter `.bitely-dash` eingekapselt und kollidiert
  deshalb nicht mit dem CSS der Website.

  Einbauen: dieses <style> in den <head> (oder in die eigene CSS-Datei), das
  <div class="bitely-dash"> an die gewünschte Stelle im Text. Die Schrift Inter
  muss geladen sein, sonst fällt es auf die Systemschrift zurück:
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">

  Anpassen:
  - Farbe: --bd-accent in der ersten Regel (Standard #16A34A, das Grün der App).
  - Zahlen: stehen im Klartext im Markup. Die Balken sind <rect>, die
    Punkte der Matrix <circle> — wer sie ändert, muss die Koordinaten
    mitrechnen; einfacher ist, den Block neu erzeugen zu lassen.
-->
<style>
""" + CSS + """
</style>

""" + FRAG + "\n")

# ── Artifact-Seite ────────────────────────────────────────────────────────
PAGE = """<title>Dashboard-Bausatz</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap">
<style>
  :root{
    --ground:#f4f6f6; --panel:#ffffff; --ink:#12181a; --muted:#5d6b70; --faint:#8d9aa0;
    --hair:#dde3e4; --accent:#16A34A; --code-bg:#eef1f2;
  }
  :root:not([data-theme="light"]){}
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --ground:#0d1112; --panel:#151a1c; --ink:#e8edee; --muted:#a3b0b5; --faint:#78868c;
      --hair:#232b2e; --accent:#34d17c; --code-bg:#0a0d0e;
    }
  }
  :root[data-theme="dark"]{
    --ground:#0d1112; --panel:#151a1c; --ink:#e8edee; --muted:#a3b0b5; --faint:#78868c;
    --hair:#232b2e; --accent:#34d17c; --code-bg:#0a0d0e;
  }
  *{box-sizing:border-box}
  body{background:var(--ground);color:var(--ink);font-family:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
       line-height:1.6;margin:0;padding:48px 24px 96px}
  .wrap{max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:40px}
  .prose{max-width:68ch}
  .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:500}
  h1{font-size:clamp(28px,4vw,40px);line-height:1.15;font-weight:600;letter-spacing:-.02em;margin:8px 0 12px;text-wrap:balance}
  h2{font-size:20px;font-weight:600;letter-spacing:-.01em;margin:0 0 4px;text-wrap:balance}
  p{margin:0 0 12px}
  .lead{font-size:17px;color:var(--muted)}
  .stage{background:#f9fafb;border:1px solid var(--hair);border-radius:20px;padding:28px;overflow-x:auto}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .stage{background:#f9fafb}}
  .stage-bar{display:flex;align-items:center;gap:6px;margin-bottom:20px}
  .stage-bar i{width:9px;height:9px;border-radius:50%;background:#e2e5e7;display:block}
  .stage-bar span{margin-left:8px;font-size:11px;color:#9aa3a8;font-family:"IBM Plex Mono",monospace}
  section{background:var(--panel);border:1px solid var(--hair);border-radius:16px;padding:28px}
  .steps{list-style:none;padding:0;margin:20px 0 0;display:flex;flex-direction:column;gap:20px;counter-reset:s}
  .steps li{display:grid;grid-template-columns:28px 1fr;gap:16px;align-items:start}
  .steps li::before{counter-increment:s;content:counter(s);font-family:"IBM Plex Mono",monospace;font-size:12px;
    color:var(--accent);border:1px solid var(--hair);border-radius:8px;width:28px;height:28px;display:grid;place-items:center}
  .steps h3{font-size:15px;font-weight:600;margin:2px 0 4px}
  .steps p{font-size:14px;color:var(--muted);margin:0}
  code{font-family:"IBM Plex Mono",monospace;font-size:13px;background:var(--code-bg);padding:2px 6px;border-radius:5px}
  pre{font-family:"IBM Plex Mono",monospace;font-size:12.5px;line-height:1.6;background:var(--code-bg);color:var(--ink);
      border:1px solid var(--hair);border-radius:12px;padding:16px;overflow-x:auto;margin:12px 0 0}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--hair);
    border:1px solid var(--hair);border-radius:12px;overflow:hidden;margin-top:20px}
  .facts div{background:var(--panel);padding:16px}
  .facts dt{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:6px}
  .facts dd{margin:0;font-size:15px;font-weight:600}
  .note{border-left:2px solid var(--accent);padding-left:16px;color:var(--muted);font-size:14px}
  button.copy{font:inherit;font-size:13px;font-weight:500;color:var(--ink);background:var(--panel);border:1px solid var(--hair);
    border-radius:9px;padding:8px 14px;cursor:pointer;transition:border-color .15s}
  button.copy:hover{border-color:var(--accent)}
  button.copy:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}
  .fine{font-size:13px;color:var(--faint)}
  table.compare{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
  table.compare th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);
    font-weight:500;padding:0 0 8px;border-bottom:1px solid var(--hair)}
  table.compare td{padding:10px 0;border-bottom:1px solid var(--hair);color:var(--muted);vertical-align:top}
  table.compare td:first-child{color:var(--ink);width:40%;padding-right:24px}
</style>

<div class="wrap">

  <header class="prose">
    <p class="eyebrow">Bitely · Website-Baustein</p>
    <h1>Das Dashboard, ohne Screenshot</h1>
    <p class="lead">Der Auswertungsbildschirm als statischer HTML-Block: derselbe Aufbau, dieselben Maße,
    dieselben Zahlen wie in der echten App — aber ohne React, ohne Server und ohne Bild, das auf einem
    Retina-Display ausfranst.</p>
  </header>

  <div class="stage">
    <div class="stage-bar"><i></i><i></i><i></i><span>bitely.at/sakura-sushi/admin</span></div>
    @@FRAG@@
  </div>

  <section class="prose">
    <h2>So baut man ihn ein</h2>
    <p style="color:var(--muted);margin-top:4px">Ein Block, keine Abhängigkeiten. Er bringt sein eigenes CSS mit,
    eingekapselt unter <code>.bitely-dash</code> — er kann also mit dem Stylesheet der Website nicht kollidieren.</p>
    <ol class="steps">
      <li><div><h3>Schrift laden</h3><p>Die App setzt Inter. Ohne diese Zeile im <code>&lt;head&gt;</code> fällt der Block still auf die Systemschrift zurück und sieht nicht mehr aus wie das Produkt.</p>
        <pre>&lt;link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap"&gt;</pre></div></li>
      <li><div><h3>Block einsetzen</h3><p>Den Inhalt von <code>website/dashboard-embed.html</code> an die Stelle kopieren, an der das Dashboard stehen soll — <code>&lt;style&gt;</code> und <code>&lt;div&gt;</code> gehören zusammen.</p></div></li>
      <li><div><h3>Breite geben</h3><p>Ein Dashboard braucht Platz. Der Elterncontainer sollte mindestens 900 px breit sein dürfen; darunter klappen die Karten von selbst untereinander.</p></div></li>
    </ol>
    <div class="row">
      <button class="copy" id="copy">Markup kopieren</button>
      <span class="fine" id="copy-note">Kopiert den kompletten Block samt CSS.</span>
    </div>
  </section>

  <section class="prose">
    <h2>Was sich ändern lässt</h2>
    <table class="compare">
      <thead><tr><th>Stellschraube</th><th>Wo</th></tr></thead>
      <tbody>
        <tr><td>Akzentfarbe</td><td><code>--bd-accent</code> in der ersten CSS-Regel. Standard ist <code>#16A34A</code>, das Grün der App. Ein Restaurant mit eigener Marke bekommt hier seine Farbe — genau wie in der echten Anwendung.</td></tr>
        <tr><td>Ganz ohne Farbe</td><td>Denselben Wert auf <code>#111827</code> setzen: Balken und Fortschritt werden schwarz, die vier Punkte der Matrix bleiben als einzige Farbe stehen.</td></tr>
        <tr><td>Zahlen und Namen</td><td>Stehen im Klartext im Markup. Balken sind <code>&lt;rect&gt;</code>, Punkte <code>&lt;circle&gt;</code> — deren Koordinaten sind ausgerechnet, ändere sie nicht von Hand, sondern lass den Block neu erzeugen.</td></tr>
        <tr><td>Weniger Karten</td><td>Jede Karte ist ein eigenes <code>&lt;div class="bd-card"&gt;</code> mit einem Kommentar darüber. Wegnehmen genügt, das Raster schließt die Lücke.</td></tr>
      </tbody>
    </table>
  </section>

  <section class="prose">
    <h2>Woher die Zahlen kommen</h2>
    <p style="color:var(--muted);margin-top:4px">Nicht erfunden: ausgelesen aus der Demo-Datenbank über
    <code>npm run dashboard-snapshot --prefix server -- 30</code>. Dieselbe Rechnung wie im Dashboard,
    dieselben Schwellen.</p>
    <dl class="facts">
      <div><dt>Zeitraum</dt><dd>30 Tage</dd></div>
      <div><dt>Bewertungen</dt><dd>319</dd></div>
      <div><dt>Bestellungen</dt><dd>530</dd></div>
      <div><dt>Ø Bewertung</dt><dd>4,4 ★</dd></div>
    </dl>
    <p class="note" style="margin-top:24px">Was der Nachbau nicht kann: Tooltips beim Überfahren der Punkte,
    Sortieren der Tabelle, Umschalten des Zeitraums und den Dunkelmodus. Das ist Absicht — es ist ein Bild
    des Produkts, kein zweites Produkt. Wer die Interaktion zeigen will, verlinkt eine Demo-Anmeldung.</p>
  </section>

</div>

<template id="src">@@FRAG@@</template>
<script>
  document.getElementById('copy').addEventListener('click', async () => {
    const markup = '<style>\\n' + %s + '\\n</style>\\n\\n' + document.getElementById('src').innerHTML.trim();
    const note = document.getElementById('copy-note');
    try {
      await navigator.clipboard.writeText(markup);
      note.textContent = 'Kopiert — ' + markup.length.toLocaleString('de-AT') + ' Zeichen.';
    } catch (err) {
      note.textContent = 'Das Kopieren hat der Browser abgelehnt. Nimm die Datei website/dashboard-embed.html.';
    }
  });
</script>"""

import json
page = PAGE.replace("@@FRAG@@", FRAG).replace("@@CSSJSON@@", json.dumps(CSS))
io.open(OUT_PAGE, 'w', encoding='utf-8', newline='\n').write(page)
print('fragment:', len(FRAG), 'zeichen ->', OUT_FRAGMENT)
print('seite:', len(page), 'zeichen ->', OUT_PAGE)

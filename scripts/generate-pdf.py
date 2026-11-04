#!/usr/bin/env python3
"""
GigSure AI — Technical Documentation & Hackathon Project Brief
Body PDF generator (ReportLab).

Pipeline:
  cover.html  →  cover.pdf   (via Playwright / html2poster-style render)
  this script →  body.pdf    (ReportLab)
  merge       →  GigSure-AI-Technical-Documentation.pdf  (pypdf)
"""
from __future__ import annotations

import os
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, Image, KeepTogether, Flowable,
    HRFlowable, ListFlowable, ListItem,
)
from reportlab.platypus.tableofcontents import TableOfContents

# ──────────────────────────────────────────────────────────────────────────────
# 0. Paths & constants
# ──────────────────────────────────────────────────────────────────────────────
SCRIPTS_DIR = Path('/home/z/my-project/scripts')
DOWNLOAD_DIR = Path('/home/z/my-project/download')
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

BODY_PDF   = SCRIPTS_DIR / 'body.pdf'
COVER_PDF  = SCRIPTS_DIR / 'cover.pdf'
ARCH_PNG   = SCRIPTS_DIR / 'architecture-diagram.png'
PAY_PNG    = SCRIPTS_DIR / 'payment-flow-diagram.png'
FINAL_PDF  = DOWNLOAD_DIR / 'GigSure-AI-Technical-Documentation.pdf'

FONT_DIR   = '/usr/share/fonts'

# ──────────────────────────────────────────────────────────────────────────────
# 1. Fonts
# ──────────────────────────────────────────────────────────────────────────────
pdfmetrics.registerFont(TTFont('NotoSerifSC',      f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

# Sans for tables / labels / chips
pdfmetrics.registerFont(TTFont('DejaVuSans',      f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

pdfmetrics.registerFont(TTFont('DejaVuMono',      f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuMono-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono-Bold.ttf'))
registerFontFamily('DejaVuMono', normal='DejaVuMono', bold='DejaVuMono-Bold')

BODY_FONT      = 'NotoSerifSC'
BODY_FONT_BOLD = 'NotoSerifSC-Bold'
MONO_FONT      = 'DejaVuMono'
MONO_FONT_BOLD = 'DejaVuMono-Bold'

# ──────────────────────────────────────────────────────────────────────────────
# 2. Palette (verified, matches brief)
# ──────────────────────────────────────────────────────────────────────────────
PAGE_BG       = colors.HexColor('#f5f5f6')
SECTION_BG    = colors.HexColor('#eceeee')
CARD_BG       = colors.HexColor('#e9eced')
TABLE_STRIPE  = colors.HexColor('#eceff0')
HEADER_FILL   = colors.HexColor('#35444c')
COVER_BLOCK   = colors.HexColor('#4f6b79')
BORDER        = colors.HexColor('#bcc9cf')
ICON          = colors.HexColor('#467389')
ACCENT        = colors.HexColor('#226b8f')
ACCENT_2      = colors.HexColor('#a93e50')
TEXT_PRIMARY  = colors.HexColor('#222425')
TEXT_MUTED    = colors.HexColor('#82888b')
SEM_SUCCESS   = colors.HexColor('#3f8255')
SEM_WARNING   = colors.HexColor('#9a7c3f')
SEM_ERROR     = colors.HexColor('#a2544d')
SEM_INFO      = colors.HexColor('#5179a2')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ──────────────────────────────────────────────────────────────────────────────
# 3. Page geometry
# ──────────────────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN_L = 22 * mm
MARGIN_R = 22 * mm
MARGIN_T = 22 * mm
MARGIN_B = 22 * mm
FRAME_W = PAGE_W - MARGIN_L - MARGIN_R
FRAME_H = PAGE_H - MARGIN_T - MARGIN_B

# ──────────────────────────────────────────────────────────────────────────────
# 4. Styles
# ──────────────────────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()

STYLE_TITLE = ParagraphStyle(
    'Title', fontName=BODY_FONT_BOLD, fontSize=22, leading=27,
    textColor=TEXT_PRIMARY, spaceAfter=4, spaceBefore=0,
)
STYLE_H1 = ParagraphStyle(
    'H1', fontName=BODY_FONT_BOLD, fontSize=18, leading=24,
    textColor=HEADER_FILL, spaceBefore=4, spaceAfter=8,
)
STYLE_H2 = ParagraphStyle(
    'H2', fontName=BODY_FONT_BOLD, fontSize=13, leading=18,
    textColor=ACCENT, spaceBefore=10, spaceAfter=4,
)
STYLE_H3 = ParagraphStyle(
    'H3', fontName=BODY_FONT_BOLD, fontSize=11, leading=15,
    textColor=TEXT_PRIMARY, spaceBefore=6, spaceAfter=2,
)
STYLE_KICKER = ParagraphStyle(
    'Kicker', fontName=MONO_FONT_BOLD, fontSize=8.5, leading=12,
    textColor=TEXT_MUTED, spaceAfter=2, letterSpacing=2,
)
STYLE_BODY = ParagraphStyle(
    'Body', fontName=BODY_FONT, fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=8,
    alignment=TA_JUSTIFY, firstLineIndent=0,
)
STYLE_BODY_TIGHT = ParagraphStyle(
    'BodyTight', parent=STYLE_BODY, spaceAfter=4,
)
STYLE_BULLET = ParagraphStyle(
    'Bullet', fontName=BODY_FONT, fontSize=10.5, leading=15,
    textColor=TEXT_PRIMARY, leftIndent=14, bulletIndent=2,
    spaceBefore=1, spaceAfter=1,
)
STYLE_CAPTION = ParagraphStyle(
    'Caption', fontName=MONO_FONT, fontSize=8, leading=11,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=4, spaceAfter=14,
)
STYLE_TABLE_CELL = ParagraphStyle(
    'TblCell', fontName=BODY_FONT, fontSize=8.6, leading=12,
    textColor=TEXT_PRIMARY,
)
STYLE_TABLE_CELL_MONO = ParagraphStyle(
    'TblCellMono', fontName=MONO_FONT, fontSize=8.4, leading=12,
    textColor=ACCENT,
)
STYLE_TABLE_HEAD = ParagraphStyle(
    'TblHead', fontName=BODY_FONT_BOLD, fontSize=8.8, leading=12,
    textColor=colors.white,
)
STYLE_TABLE_HEAD_MONO = ParagraphStyle(
    'TblHeadMono', fontName=MONO_FONT_BOLD, fontSize=8.2, leading=12,
    textColor=colors.white,
)
STYLE_CALLOUT_LEAD = ParagraphStyle(
    'CalloutLead', fontName=BODY_FONT_BOLD, fontSize=10.5, leading=15,
    textColor=ACCENT, spaceAfter=4,
)
STYLE_CALLOUT_BODY = ParagraphStyle(
    'CalloutBody', fontName=BODY_FONT, fontSize=10, leading=15,
    textColor=TEXT_PRIMARY,
)
STYLE_FOOTNOTE = ParagraphStyle(
    'Footnote', fontName=MONO_FONT, fontSize=8, leading=10,
    textColor=TEXT_MUTED, alignment=TA_LEFT,
)
STYLE_TOC_TITLE = ParagraphStyle(
    'TOCTitle', fontName=BODY_FONT_BOLD, fontSize=20, leading=26,
    textColor=HEADER_FILL, spaceAfter=12,
)
STYLE_LINK = ParagraphStyle(
    'Link', fontName=MONO_FONT, fontSize=10, leading=14,
    textColor=ACCENT, alignment=TA_LEFT, spaceAfter=2,
)

# ──────────────────────────────────────────────────────────────────────────────
# 5. Custom Flowables
# ──────────────────────────────────────────────────────────────────────────────
class HRule(Flowable):
    """Thin horizontal rule."""
    def __init__(self, width=None, thickness=0.6, color=BORDER, space_before=2, space_after=4):
        super().__init__()
        self.width = width
        self.thickness = thickness
        self.color = color
        self.space_before = space_before
        self.space_after = space_after
    def wrap(self, availW, availH):
        self._w = self.width if self.width else availW
        self._h = self.thickness + self.space_before + self.space_after
        return availW, self._h
    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        y = self.space_after
        c.line(0, y, self._w, y)


class SectionHeader(Flowable):
    """Section header: number badge + title + kicker + thin underline."""
    def __init__(self, number: str, title: str, kicker: str = ''):
        super().__init__()
        self.number = number
        self.title = title
        self.kicker = kicker.upper() if kicker else ''
        self._h = 56
    def wrap(self, availW, availH):
        self._w = availW
        return availW, self._h
    def draw(self):
        c = self.canv
        # Number badge
        badge_r = 12
        bx, by = 6, self._h - 24
        c.setFillColor(HEADER_FILL)
        c.setStrokeColor(HEADER_FILL)
        c.roundRect(bx - badge_r, by - badge_r, badge_r * 2, badge_r * 2, 3, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont(MONO_FONT_BOLD, 9.5)
        c.drawCentredString(bx, by - 3.5, self.number)
        # Title
        c.setFillColor(HEADER_FILL)
        c.setFont(BODY_FONT_BOLD, 16)
        c.drawString(bx + badge_r + 14, by - 2, self.title)
        # Kicker
        if self.kicker:
            c.setFillColor(TEXT_MUTED)
            c.setFont(MONO_FONT, 8)
            c.drawString(bx + badge_r + 14, by - 16, self.kicker)
        # Underline
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.4)
        c.line(bx + badge_r + 14, by - 24, bx + badge_r + 14 + 60, by - 24)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.line(bx + badge_r + 14 + 70, by - 24, self._w, by - 24)


class CalloutBox(Flowable):
    """Coloured callout box with lead + body text."""
    def __init__(self, lead: str, body: str, color=ACCENT, bg=CARD_BG, width=None):
        super().__init__()
        self.lead = lead
        self.body = body
        self.color = color
        self.bg = bg
        self.width = width
        self._lead_p = Paragraph(lead, STYLE_CALLOUT_LEAD)
        self._body_p = Paragraph(body, STYLE_CALLOUT_BODY)
        self._padding = 8
        self._left_bar = 3
    def wrap(self, availW, availH):
        self._w = self.width if self.width else availW
        inner_w = self._w - self._left_bar - self._padding * 2
        _, h1 = self._lead_p.wrap(inner_w, availH)
        _, h2 = self._body_p.wrap(inner_w, availH)
        self._h = h1 + h2 + self._padding * 2 + 4
        return availW, self._h
    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.4)
        c.roundRect(0, 0, self._w, self._h, 3, fill=1, stroke=1)
        c.setFillColor(self.color)
        c.rect(0, 0, self._left_bar, self._h, fill=1, stroke=0)
        # Render paragraphs inside
        inner_w = self._w - self._left_bar - self._padding * 2
        x = self._left_bar + self._padding
        _, h2 = self._body_p.wrap(inner_w, self._h)
        # body on bottom, lead above it
        body_y = self._padding
        self._body_p.drawOn(c, x, body_y)
        lead_y = body_y + h2 + 4
        self._lead_p.drawOn(c, x, lead_y)


class StatCardRow(Flowable):
    """Row of small stat cards."""
    def __init__(self, stats: list, width=None, gap=8):
        super().__init__()
        self.stats = stats  # [(value, label, color), ...]
        self.gap = gap
        self.width = width
        self._card_h = 46
    def wrap(self, availW, availH):
        self._w = self.width if self.width else availW
        n = len(self.stats)
        self._cw = (self._w - self.gap * (n - 1)) / n
        return availW, self._card_h
    def draw(self):
        c = self.canv
        for i, (val, label, col) in enumerate(self.stats):
            x = i * (self._cw + self.gap)
            # Card bg
            c.setFillColor(colors.white)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.4)
            c.roundRect(x, 0, self._cw, self._card_h, 3, fill=1, stroke=1)
            # Top accent bar
            c.setFillColor(col)
            c.rect(x, self._card_h - 3, self._cw, 3, fill=1, stroke=0)
            # Value
            c.setFillColor(col)
            c.setFont(MONO_FONT_BOLD, 14)
            c.drawString(x + 8, self._card_h - 22, str(val))
            # Label
            c.setFillColor(TEXT_MUTED)
            c.setFont(MONO_FONT, 7)
            c.drawString(x + 8, 8, label.upper())


# ──────────────────────────────────────────────────────────────────────────────
# 6. Page templates (header + footer + page numbers)
# ──────────────────────────────────────────────────────────────────────────────
def _draw_header_footer(canvas, doc):
    canvas.saveState()
    # Page background
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Top hairline + brand
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_L, PAGE_H - 14 * mm, PAGE_W - MARGIN_R, PAGE_H - 14 * mm)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(MONO_FONT, 7.5)
    canvas.drawString(MARGIN_L, PAGE_H - 11 * mm, 'GIGSURE AI · TECHNICAL DOCUMENTATION')
    canvas.setFillColor(ACCENT)
    canvas.setFont(MONO_FONT_BOLD, 7.5)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 11 * mm, 'PAYPAL AI HACKATHON 2025')

    # Footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_L, 12 * mm, PAGE_W - MARGIN_R, 12 * mm)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(MONO_FONT, 7.5)
    canvas.drawString(MARGIN_L, 8 * mm, '0xFlux4hm · Yobe, NG')
    # Page numbers — body PDF starts at page 1; merged with 1-page cover later
    page_num = doc.page
    canvas.setFillColor(HEADER_FILL)
    canvas.setFont(MONO_FONT_BOLD, 8)
    canvas.drawCentredString(PAGE_W / 2, 8 * mm, f'PAGE  {page_num + 1}  /  19')  # +1 to account for cover
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(MONO_FONT, 7.5)
    canvas.drawRightString(PAGE_W - MARGIN_R, 8 * mm, 'GSAI-TB-001 / REV 1.0')
    canvas.restoreState()


def _draw_toc_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_L, PAGE_H - 14 * mm, PAGE_W - MARGIN_R, PAGE_H - 14 * mm)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(MONO_FONT, 7.5)
    canvas.drawString(MARGIN_L, PAGE_H - 11 * mm, 'GIGSURE AI · TECHNICAL DOCUMENTATION')
    canvas.setFillColor(ACCENT)
    canvas.setFont(MONO_FONT_BOLD, 7.5)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 11 * mm, 'PAYPAL AI HACKATHON 2025')
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_L, 12 * mm, PAGE_W - MARGIN_R, 12 * mm)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(MONO_FONT, 7.5)
    canvas.drawString(MARGIN_L, 8 * mm, '0xFlux4hm · Yobe, NG')
    canvas.setFillColor(HEADER_FILL)
    canvas.setFont(MONO_FONT_BOLD, 8)
    canvas.drawCentredString(PAGE_W / 2, 8 * mm, 'PAGE  i  /  19')
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(MONO_FONT, 7.5)
    canvas.drawRightString(PAGE_W - MARGIN_R, 8 * mm, 'GSAI-TB-001 / REV 1.0')
    canvas.restoreState()


# ──────────────────────────────────────────────────────────────────────────────
# 7. TOC DocTemplate
# ──────────────────────────────────────────────────────────────────────────────
class TocDocTemplate(BaseDocTemplate):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        frame_body = Frame(MARGIN_L, MARGIN_B, FRAME_W, FRAME_H, id='body',
                           leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        frame_toc  = Frame(MARGIN_L, MARGIN_B, FRAME_W, FRAME_H, id='toc',
                           leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id='TOC',  frames=[frame_toc],  onPage=_draw_toc_page),
            PageTemplate(id='Body', frames=[frame_body], onPage=_draw_header_footer),
        ])

    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            # +1 because the merged final PDF has the cover as page 1,
            # so the body's page 1 (TOC) becomes page 2 in the final PDF.
            self.notify('TOCEntry', (level, text, self.page + 1, key))


# ──────────────────────────────────────────────────────────────────────────────
# 8. Helpers — heading, body, table, callout, etc.
# ──────────────────────────────────────────────────────────────────────────────
import hashlib

def add_heading(text, kicker='', level=0):
    """H1 heading with bookmark for TOC."""
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:10]}'
    style = STYLE_H1 if level == 0 else STYLE_H2
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def section_header(number, title, kicker=''):
    """Visual section header (no TOC entry — add_heading handles that separately)."""
    return SectionHeader(number, title, kicker)


def p(text, style=None):
    return Paragraph(text, style or STYLE_BODY)


def p_tight(text):
    return Paragraph(text, STYLE_BODY_TIGHT)


def bullet_list(items, style=None):
    return ListFlowable(
        [ListItem(Paragraph(t, style or STYLE_BULLET), value='•', leftIndent=14) for t in items],
        bulletType='bullet', start='•', leftIndent=14,
    )


def make_table(data, col_widths=None, header_row=True, mono_cols=None, align_first_left=True):
    """Build a styled table from a 2D list of strings (HTML allowed)."""
    mono_cols = mono_cols or []
    rows = []
    for r_idx, row in enumerate(data):
        new_row = []
        for c_idx, cell in enumerate(row):
            if r_idx == 0 and header_row:
                style = STYLE_TABLE_HEAD_MONO if c_idx in mono_cols else STYLE_TABLE_HEAD
            elif c_idx in mono_cols:
                style = STYLE_TABLE_CELL_MONO
            else:
                style = STYLE_TABLE_CELL
            new_row.append(Paragraph(str(cell), style))
        rows.append(new_row)

    t = Table(rows, colWidths=col_widths, repeatRows=1 if header_row else 0)
    ts = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LINEBELOW', (0, 0), (-1, 0), 0.6, BORDER),
        ('LINEBELOW', (0, -1), (-1, -1), 0.6, BORDER),
    ]
    if header_row:
        ts.append(('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR))
        ts.append(('TEXTCOLOR',  (0, 0), (-1, 0), colors.white))
        ts.append(('LINEABOVE',  (0, 0), (-1, 0), 0.6, HEADER_FILL))
        # Alternating stripes
        for r_idx in range(1, len(rows)):
            if r_idx % 2 == 0:
                ts.append(('BACKGROUND', (0, r_idx), (-1, r_idx), TABLE_ROW_ODD))
            else:
                ts.append(('BACKGROUND', (0, r_idx), (-1, r_idx), TABLE_ROW_EVEN))
    t.setStyle(TableStyle(ts))
    return t


def severity_badge(label, level):
    """level ∈ {success, warning, error, info}"""
    cmap = {
        'success': SEM_SUCCESS, 'warning': SEM_WARNING,
        'error': SEM_ERROR, 'info': SEM_INFO,
    }
    col = cmap.get(level, ACCENT)
    label_style = ParagraphStyle(
        'Badge', fontName=MONO_FONT_BOLD, fontSize=7.5, leading=11,
        textColor=colors.white, alignment=TA_CENTER,
    )
    tbl = Table([[Paragraph(label.upper(), label_style)]], colWidths=[None])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), col),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return tbl


# ──────────────────────────────────────────────────────────────────────────────
# 9. Story builder
# ──────────────────────────────────────────────────────────────────────────────
story = []

# ───────── TOC PAGE ─────────
story.append(Paragraph('Table of Contents', STYLE_TOC_TITLE))
story.append(HRule(thickness=1.0, color=ACCENT, space_before=0, space_after=12))

toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle('TOC0', fontName=BODY_FONT_BOLD, fontSize=10.5, leading=18,
                   textColor=TEXT_PRIMARY, leftIndent=0, firstLineIndent=0,
                   spaceBefore=2, spaceAfter=2),
    ParagraphStyle('TOC1', fontName=BODY_FONT, fontSize=9.5, leading=14,
                   textColor=TEXT_MUTED, leftIndent=18, firstLineIndent=0,
                   spaceBefore=0, spaceAfter=0),
]
story.append(toc)
story.append(PageBreak())

# Switch to Body template
from reportlab.platypus.doctemplate import NextPageTemplate
story.append(NextPageTemplate('Body'))

# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 1 — EXECUTIVE SUMMARY
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Executive Summary', kicker='Chapter 01'))
story.append(section_header('01', 'Executive Summary', 'Project Brief'))
story.append(Spacer(1, 4))

story.append(p(
    'GigSure AI is a milestone-gated collaboration platform that connects African '
    'freelancers with international clients and protects every engagement with '
    'transparent contracts, milestone-gated payment protection, and AI-powered '
    'advisory. The platform was built end-to-end for the PayPal AI Hackathon by '
    'Ahmad Muhammad Wammi (0xFlux4hm) in Yobe, Nigeria, and is deployed at '
    '<font color="#226b8f">gigsure-ai.vercel.app</font>.'
))
story.append(p(
    'The core insight is simple: cross-border gig work in Africa breaks down at '
    'two specific points — clear requirements, and trusted money movement. '
    'Clients and freelancers rarely share a common currency, a common contract '
    'format, or a common dispute process. GigSure AI attacks both bottlenecks '
    'simultaneously by pairing five production-grade AI features (running on Groq '
    'with the <font name="DejaVuMono" size="9">openai/gpt-oss-20b</font> model) '
    'with PayPal\'s Orders v2 cross-border payment rails. The AI surfaces risk '
    'and clarifies intent before work starts; PayPal moves the money and signs '
    'every state change with a verified webhook.'
))
story.append(p(
    'For the judges, the headline metrics are: a deployed application, five live '
    'AI endpoints, four PayPal API integrations (Orders v2, OAuth2, Webhook '
    'Verify, Refunds), a fully milestone-gated fund release flow, dashboard '
    'reports with severity badges and stat cards, and a $0 total cost of '
    'infrastructure — Groq provides inference, Vercel provides hosting, and '
    'PayPal Sandbox handles every payment test without a single real dollar '
    'moving.'
))

story.append(Spacer(1, 6))
story.append(StatCardRow([
    ('5', 'AI FEATURES', ACCENT),
    ('4', 'PAYPAL APIs', ACCENT_2),
    ('10', 'AI ASSISTANTS', SEM_INFO),
    ('20', 'RATE LIMIT / RPM', SEM_WARNING),
    ('$0', 'TOTAL COST', SEM_SUCCESS),
]))

story.append(CalloutBox(
    lead='How AI and payments work together',
    body=(
        'Every project on GigSure begins with the AI Project Brief Generator and '
        'ends with a verified PayPal webhook. The AI defines what should be '
        'built and what the contract risks are; PayPal verifies that the funds '
        'exist and are released only when an approved milestone is signed off. '
        'The two layers never overlap — the AI is advisory only, the payments '
        'layer is authoritative only — but they reinforce each other.'
    ),
    color=ACCENT,
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 2 — PROBLEM STATEMENT
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Problem Statement', kicker='Chapter 02'))
story.append(section_header('02', 'Problem Statement', 'Why GigSure Exists'))
story.append(Spacer(1, 4))

story.append(p(
    'Africa is one of the fastest-growing freelance talent markets in the world, '
    'yet it remains structurally invisible to the global gig economy. '
    'Freelancers in Yobe, Accra, and Nairobi win clients in San Francisco, '
    'Berlin, and Singapore — but the work itself has to flow through a tangle of '
    'patchwork tools: chat apps for requirements, email for contracts, wire '
    'transfers for payment, and personal trust for dispute resolution. The result '
    'is a market where every engagement carries an outsized risk of '
    'miscommunication, scope creep, late payment, or no payment at all.'
))

story.append(p('<b>Four concrete problems drive the GigSure AI design:</b>'))

story.append(bullet_list([
    '<b>Africa is invisible to global gig rails.</b> Most international payment platforms either do not operate in Nigeria, do not support NGN payout, or charge fees that erase small-contract margins entirely. Freelancers cannot receive USD; clients cannot release NGN.',
    '<b>Cross-border friction is non-technical but fatal.</b> Currency conversion, fee disclosure, milestone gating, and dispute handling all live in separate tools. Each one is a failure point.',
    '<b>Requirements are unclear before work starts.</b> Clients describe projects in plain English ("I need a Shopify store"); freelancers guess at scope, milestones, and risk. Misalignment is discovered after the work is done.',
    '<b>Payments are delayed or unprotected.</b> Without a verified payment protection layer, freelancers either wait 30–60 days for international wires or accept the risk of never being paid. Clients, in turn, fear paying upfront for work that may not arrive.',
]))

story.append(Spacer(1, 4))
story.append(CalloutBox(
    lead='The wedge',
    body=(
        'GigSure AI does not try to rebuild the entire freelance marketplace. '
        'It rebuilds the two layers that are most broken — the requirements '
        'layer (AI clarifies intent and surfaces contract risk) and the '
        'payment layer (PayPal holds funds in USD, releases them as NGN on '
        'milestone approval). Everything else is built to support those two '
        'layers cleanly.'
    ),
    color=ACCENT_2,
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 3 — SOLUTION OVERVIEW
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Solution Overview', kicker='Chapter 03'))
story.append(section_header('03', 'Solution Overview', 'What GigSure Does'))
story.append(Spacer(1, 4))

story.append(p(
    'GigSure AI delivers a single workspace where an international client and '
    'an African freelancer can agree on what is being built, lock that agreement '
    'into a milestone-gated contract, fund the work via PayPal in USD, and have '
    'the freelancer paid in NGN — without either side needing to trust the '
    'other. The AI layer reduces the surface area of disagreement; the payment '
    'layer removes the surface area of fraud.'
))

story.append(p('<b>The product is built around four pillars:</b>'))

story.append(bullet_list([
    '<b>Transparent agreements.</b> The AI Project Brief Generator turns a one-line client description into a structured, milestone-aware project brief. The AI Contract Analysis then re-reads the brief and flags eight categories of contract risk before either party signs.',
    '<b>Milestone workflows.</b> Every project is broken into milestones, each with a payment percentage, a submission flow, and an approval gate. Funds are released per milestone, never as a lump sum.',
    '<b>PayPal cross-border milestone-gated payments.</b> International clients fund milestones in USD via PayPal Orders v2. GigSure verifies every payment with PayPal\'s webhook signature verification API before recording it as HELD in NGN under GigSure Payment Protection.',
    '<b>AI assistance at every step.</b> Ten specialised AI assistants advise freelancers and clients on pricing, scope, deliverables, communication, disputes, and more — strictly advisory, never authoritative.',
]))

story.append(p(
    'The dashboard layer surfaces all of this in a single report: project '
    'health, milestone status, AI risk findings (with severity badges), fund '
    'flows, dispute summaries. Every state change is auditable; every AI '
    'response is logged and rate-limited.'
))

story.append(Spacer(1, 4))
story.append(CalloutBox(
    lead='Design principle',
    body=(
        'AI never makes a financial decision. PayPal never makes a content '
        'decision. The two systems are deliberately isolated: the AI suggests '
        'and explains, the payment layer verifies and releases. The human '
        'user remains the sole signer of every state change.'
    ),
    color=SEM_INFO,
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 4 — TECHNICAL ARCHITECTURE
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Technical Architecture', kicker='Chapter 04'))
story.append(section_header('04', 'Technical Architecture', 'Stack & Topology'))
story.append(Spacer(1, 4))

story.append(p(
    'GigSure AI is a Next.js 16 full-stack application deployed on Vercel. The '
    'frontend uses the App Router with React 19 server components, Tailwind CSS '
    'v4 for styling, and a custom markdown renderer for AI output. The backend '
    'consists of Next.js API routes that handle authentication, project domain '
    'logic, PayPal integration, and the five AI endpoints.'
))

story.append(p(
    'AI inference is delegated to Groq Cloud, running the '
    '<font name="DejaVuMono" size="9">openai/gpt-oss-20b</font> model. Groq was '
    'chosen for its sub-second first-token latency, which is essential for the '
    'AI Project Assistant\'s chat-like UX. PayPal Sandbox is used for every '
    'payment test — Orders v2, OAuth2, Webhook verification, and Refunds. '
    'Persistence is handled by Prisma ORM over a PostgreSQL database. Local NGN '
    'payouts route through Monnify and OPay providers, both abstracted behind a '
    'single provider interface.'
))

# Architecture diagram
if ARCH_PNG.exists():
    # Scale to fit frame width
    img_w, img_h = 1200, 760
    target_w = FRAME_W
    target_h = target_w * img_h / img_w
    if target_h > 110 * mm:
        target_h = 110 * mm
        target_w = target_h * img_w / img_h
    img = Image(str(ARCH_PNG), width=target_w, height=target_h)
    img.hAlign = 'CENTER'
    story.append(Spacer(1, 6))
    story.append(img)
    story.append(Paragraph('Fig 4.1 — GigSure AI technical architecture (three lanes: client app, server API routes, external services).', STYLE_CAPTION))

story.append(Spacer(1, 4))
story.append(p('<b>Why this architecture was chosen:</b>'))
story.append(bullet_list([
    '<b>Single deployable.</b> Next.js handles both UI and API on Vercel — no separate backend to scale. This keeps the cold-start cost near zero and the deployment pipeline trivial.',
    '<b>Server-to-server secrets.</b> PayPal client ID/secret, Groq API key, and database URL never reach the browser. Every external call originates from an API route.',
    '<b>Provider abstraction.</b> Local payout providers (Monnify, OPay) sit behind a shared provider interface — adding a new rail is a single-class change, not a refactor.',
    '<b>Edge-friendly middleware.</b> Auth, rate limiting, and CSP run in the Next.js middleware layer, before any API route is hit.',
]))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 5 — PAYPAL INTEGRATION
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('PayPal Integration', kicker='Chapter 05'))
story.append(section_header('05', 'PayPal Integration', 'Orders v2 · OAuth2 · Webhooks · Refunds'))
story.append(Spacer(1, 4))

story.append(p(
    'PayPal is the canonical source of truth for every payment state in '
    'GigSure AI. The integration uses four PayPal endpoints — Orders v2 for '
    'cross-border USD payment orders, OAuth 2.0 for server-to-server '
    'authentication, the Webhook verification API for official signature '
    'verification, and the Refunds API for milestone refunds. All testing is '
    'done against the PayPal Sandbox — no real money has ever moved through '
    'this codebase.'
))

story.append(p('<b>The five PayPal APIs used by GigSure AI are summarised below.</b>'))

paypal_table_data = [
    ['#', 'PayPal API', 'Endpoint', 'Purpose in GigSure AI'],
    ['1', 'Orders API v2', 'POST /v2/checkout/orders',
     'Create a cross-border USD payment order against a milestone. Captured funds become the source of held NGN funds.'],
    ['2', 'OAuth 2.0', 'POST /v1/oauth2/token',
     'Server-to-server auth used to obtain a bearer token for every subsequent PayPal API call.'],
    ['3', 'Webhook verification', 'POST /v1/notifications/verify-webhook-signature',
     'Official signature verification for every webhook event. Rejects forged or replayed events before any state change.'],
    ['4', 'Refunds API', 'POST /v2/payments/captures/{id}/refund',
     'Triggered when a milestone is cancelled or a dispute is resolved in favour of the client.'],
    ['5', 'Sandbox environment', 'api-m.sandbox.paypal.com',
     'All test transactions route here. Production toggle is a single env-var switch (currently disabled).'],
]

story.append(make_table(
    paypal_table_data,
    col_widths=[18, 78, 138, FRAME_W - 18 - 78 - 138],
    header_row=True,
    mono_cols=[2],
))
story.append(Paragraph('Table 5.1 — PayPal APIs integrated in GigSure AI.', STYLE_CAPTION))

# Payment flow diagram
if PAY_PNG.exists():
    img_w, img_h = 1200, 760
    target_w = FRAME_W
    target_h = target_w * img_h / img_w
    if target_h > 110 * mm:
        target_h = 110 * mm
        target_w = target_h * img_w / img_h
    img = Image(str(PAY_PNG), width=target_w, height=target_h)
    img.hAlign = 'CENTER'
    story.append(Spacer(1, 4))
    story.append(img)
    story.append(Paragraph('Fig 5.2 — Cross-border payment lifecycle: USD intake → verified capture → NGN held funds → milestone-gated release.', STYLE_CAPTION))

story.append(Spacer(1, 4))
story.append(p('<b>Milestone-gated fund release workflow</b>'))
story.append(bullet_list([
    'Client clicks <b>Fund milestone</b> in the project workspace; the UI calls <font name="DejaVuMono" size="9">POST /api/payments/initiate</font>.',
    'GigSure server creates a PayPal Orders v2 order with the milestone amount in USD and returns the PayPal approval URL to the client.',
    'Client approves on PayPal; PayPal redirects back to GigSure and asynchronously fires a <b>CHECKOUT.ORDER.APPROVED</b> webhook.',
    'GigSure calls the PayPal Webhook Verification API to confirm the signature; only then does it call <font name="DejaVuMono" size="9">/v2/checkout/orders/{id}/capture</font>.',
    'Capture succeeds → the equivalent NGN amount is recorded as <b>HELD</b> under GigSure Payment Protection, attached to the milestone.',
    'Freelancer submits the milestone; client approves → NGN funds are released via Monnify/OPay. If cancelled, the Refunds API returns the USD capture.',
]))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 6 — AI-POWERED FEATURES
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('AI-Powered Features', kicker='Chapter 06'))
story.append(section_header('06', 'AI-Powered Features', 'Five Endpoints on Groq'))
story.append(Spacer(1, 4))

story.append(p(
    'GigSure AI ships five production-grade AI features, each exposed as a '
    'dedicated API endpoint and rendered as a dedicated UI surface in the '
    'project workspace. All five run on Groq Cloud with the '
    '<font name="DejaVuMono" size="9">openai/gpt-oss-20b</font> model. Every '
    'feature is strictly advisory: the AI never makes financial decisions, '
    'never signs a state change, and never speaks on behalf of GigSure or '
    'PayPal. Each feature is wrapped in prompt-injection defence, structured '
    'output validation, response post-filtering, and a 20-requests-per-minute '
    'rate limit per user.'
))

ai_table_data = [
    ['#', 'Feature', 'Endpoint', 'Purpose', 'Output'],
    ['1', 'AI Project Brief Generator', 'POST /api/ai/project-brief',
     'Turn a one-line client idea into a structured project brief with goals, scope, and suggested milestones.',
     'Markdown brief rendered into the project workspace.'],
    ['2', 'AI Milestone Generator', 'POST /api/ai/milestones',
     'Suggest a milestone breakdown with payment percentages that sum to 100% and time estimates per milestone.',
     'Milestone list with % split & durations.'],
    ['3', 'AI Contract Analysis', 'POST /api/ai/contract-analysis',
     'Analyse a draft contract and score eight risk categories — payment, IP, termination, liability, scope, communication, dispute, delivery.',
     'Dashboard report with stat cards & severity badges.'],
    ['4', 'AI Project Assistant', 'POST /api/ai/assistant',
     'Ten specialised assistants (pricing, scope, deliverables, comms, disputes, etc.) give advisory answers to project questions.',
     'Threaded chat with markdown rendering.'],
    ['5', 'AI Dispute Summary', 'POST /api/ai/dispute-summary',
     'Produce a neutral timeline of dispute events, identify gaps, list each side\'s claims — never decides who is right.',
     'Neutral report with timeline & claims list.'],
]

story.append(make_table(
    ai_table_data,
    col_widths=[18, 92, 138, FRAME_W - 18 - 92 - 138 - 80, 80],
    header_row=True,
    mono_cols=[2],
))
story.append(Paragraph('Table 6.1 — The five AI features on Groq.', STYLE_CAPTION))

story.append(Spacer(1, 4))
story.append(p('<b>AI safety architecture</b>'))
story.append(bullet_list([
    '<b>Advisory only.</b> The AI is explicitly instructed that it must never approve, decline, release, or refund a payment. It can only describe, explain, and suggest.',
    '<b>Prompt-injection defence.</b> User-supplied contract text is sandboxed inside a tagged block in the system prompt; the model is instructed to never treat text inside the block as instructions.',
    '<b>Disclosure resistance.</b> The system prompt forbids revealing internal prompts, role boundaries, or provider names. Attempts are logged to the audit trail.',
    '<b>Rate limiting.</b> 20 requests per minute per authenticated user, enforced before the request reaches Groq. Returns 429 with retry-after header.',
    '<b>Structured output validation.</b> Where the AI returns structured data (milestones, risk scores), the response is validated against a Zod schema before being shown to the user.',
    '<b>Response post-filtering.</b> Final output is sanitised to strip any leaked credentials, internal URLs, or policy-violating content.',
]))

story.append(Spacer(1, 4))
story.append(CalloutBox(
    lead='Why advisory only matters',
    body=(
        'In a payments product, an AI that can autonomously release funds is a '
        'single-prompt-vulnerability away from catastrophic loss. GigSure '
        'deliberately restricts the AI to the same role as a senior project '
        'advisor: it can flag risk, draft language, summarise disputes — but '
        'every signature on a state change is human.'
    ),
    color=ACCENT,
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 7 — DASHBOARD AND REPORTING
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Dashboard and Reporting', kicker='Chapter 07'))
story.append(section_header('07', 'Dashboard and Reporting', 'How AI Output is Surfaced'))
story.append(Spacer(1, 4))

story.append(p(
    'The AI in GigSure does not end at the API response. Every feature has a '
    'dedicated rendering layer in the dashboard that turns structured AI output '
    'into readable, scannable, auditable reports. The goal is that a judge or a '
    'client can open the dashboard and immediately understand what the AI found, '
    'what severity it assigned, and what it recommends — without reading a wall '
    'of raw markdown.'
))

story.append(p('<b>Each AI report is built from the same four primitives:</b>'))

story.append(bullet_list([
    '<b>Stat cards.</b> The top of every AI report shows 3–5 stat cards: total risks found, severity breakdown, milestone count, AI confidence, etc. Each card carries a coloured top bar matching its semantic level.',
    '<b>Severity badges.</b> Every finding carries a badge — <font color="#3f8255">LOW</font>, <font color="#9a7c3f">MEDIUM</font>, <font color="#a2544d">HIGH</font>, or <font color="#5179a2">INFO</font> — drawn from the palette so they are visually consistent across the app.',
    '<b>Styled tables.</b> Risk matrices, milestone breakdowns, and dispute claims all render as tables with stripe rows, dark headers, and consistent column widths.',
    '<b>Recommendations.</b> Each finding ends with a single actionable recommendation, written in imperative voice ("Add a payment schedule of 25/50/25") rather than passive voice.',
]))

story.append(Spacer(1, 6))

# Severity badge demo
demo_badges = Table(
    [[
        severity_badge('LOW', 'success'),
        severity_badge('MEDIUM', 'warning'),
        severity_badge('HIGH', 'error'),
        severity_badge('INFO', 'info'),
    ]],
    colWidths=[60, 70, 60, 60],
)
demo_badges.setStyle(TableStyle([
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
]))
story.append(demo_badges)
story.append(Paragraph('Fig 7.1 — Severity badges used throughout the dashboard.', STYLE_CAPTION))

story.append(p(
    'The dashboard also surfaces a project-level overview: milestones with their '
    'fund status (HELD, RELEASED, REFUNDED), contract risk score, dispute '
    'count, and recent AI activity. Every entry is clickable to drill into the '
    'underlying transaction, audit log, or AI response. Every state change is '
    'recorded in the audit log with actor, timestamp, IP, and diff.'
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 8 — SECURITY AND RELIABILITY
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Security and Reliability', kicker='Chapter 08'))
story.append(section_header('08', 'Security and Reliability', 'Payments + AI Hardening'))
story.append(Spacer(1, 4))

story.append(p(
    'Security is non-negotiable in a payments product. GigSure AI\'s threat '
    'model treats every webhook as potentially forged, every AI response as '
    'potentially adversarial, and every API route as potentially abused. The '
    'defences below are baked into the codebase, not bolted on.'
))

story.append(p('<b>Payments security</b>'))
story.append(bullet_list([
    '<b>Webhook verification via PayPal\'s official API.</b> Every webhook event is verified with <font name="DejaVuMono" size="9">POST /v1/notifications/verify-webhook-signature</font> using the transmission ID, transmission sig, cert URL, and auth algorith. Rejects any event whose signature cannot be confirmed against PayPal\'s certificate chain.',
    '<b>Event idempotency.</b> Every webhook event carries a unique ID. GigSure deduplicates on this ID — a replayed webhook cannot double-credit a milestone.',
    '<b>Server-to-server OAuth.</b> PayPal credentials never leave the server. The OAuth2 token is cached with its expiry and refreshed automatically.',
    '<b>Capture-on-verify.</b> Funds are only captured <i>after</i> webhook verification succeeds. There is no path where an unverified webhook can trigger a state change.',
]))

story.append(p('<b>AI safety</b>'))
story.append(bullet_list([
    '<b>Prompt-injection defence.</b> User-supplied text is wrapped in a tagged sandbox inside the system prompt; the model is explicitly told never to treat the contents as instructions.',
    '<b>Disclosure resistance.</b> The system prompt refuses to reveal its own instructions, the role of the assistant, or the identity of the model provider. Attempts are logged.',
    '<b>Structured output validation.</b> Every structured AI response is validated against a Zod schema before being persisted or rendered. Invalid output is rejected with a 502 to the caller.',
    '<b>Rate limiting.</b> 20 RPM per user, enforced before the request reaches Groq. Returns 429 with a Retry-After header derived from the next available window.',
    '<b>Response post-filtering.</b> Final AI output is scanned for credentials, internal URLs, and policy-violating content before being shown.',
]))

story.append(p('<b>Reliability</b>'))
story.append(bullet_list([
    '<b>Idempotent payment endpoints.</b> <font name="DejaVuMono" size="9">/api/payments/initiate</font> and <font name="DejaVuMono" size="9">/api/payments/verify</font> are idempotent — re-submitting the same request does not create duplicate orders.',
    '<b>Retry-with-backoff on rate-limit.</b> When PayPal or Groq returns 429, GigSure retries with exponential backoff (1s, 2s, 4s) up to 3 attempts before surfacing an error to the user.',
    '<b>Audit trail.</b> Every payment state change, AI call, and admin action is recorded in the audit log with actor, IP, timestamp, and diff. Audit records are append-only.',
    '<b>Input validation.</b> Every API route validates its body with Zod before touching the database or any external service. Negative-value, overflow, and prototype-pollution attacks are covered by explicit tests.',
]))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 9 — DEVELOPMENT CHALLENGES
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Development Challenges', kicker='Chapter 09'))
story.append(section_header('09', 'Development Challenges', 'Five Real Problems Solved'))
story.append(Spacer(1, 4))

story.append(p(
    'Every meaningful build surfaces five problems that eat most of the time. '
    'These were the ones that defined GigSure AI\'s development cycle.'
))

story.append(p_tight('<b>1. PayPal webhook signature verification.</b>'))
story.append(p(
    'Naive webhook handlers accept the event payload and immediately mutate '
    'state. That is trivially forged. The correct approach is to call '
    'PayPal\'s <font name="DejaVuMono" size="9">verify-webhook-signature</font> '
    'API with the transmission ID, the transmission signature, the cert URL, '
    'and the auth algorithm — and only then process the event. Wiring this '
    'correctly against the sandbox, with the right webhook ID registered in '
    'the PayPal developer dashboard, took several iterations.'
))

story.append(p_tight('<b>2. AI markdown rendering in the dashboard.</b>'))
story.append(p(
    'Groq returns rich markdown: tables, lists, code blocks, headings. '
    'Rendering this safely in React required a custom markdown renderer that '
    'sanitises input, supports severity-badge syntax, and never executes '
    'embedded scripts. The renderer is shared across all five AI features so '
    'output is visually consistent.'
))

story.append(p_tight('<b>3. Rate-limit retry logic.</b>'))
story.append(p(
    'Both PayPal and Groq return 429 under load. A naive client surfaces this '
    'as an error; a polished client retries with exponential backoff and '
    'respects the Retry-After header. GigSure\'s retry logic lives in the '
    'shared HTTP client and is shared across both providers.'
))

story.append(p_tight('<b>4. Mobile forms on a small screen.</b>'))
story.append(p(
    'A freelancer filling out a milestone submission on a 5.5" Android screen '
    'in Yobe traffic is the real user. Every form had to be reflowed for '
    'mobile — stacked inputs, sticky submit bars, single-column tables, and '
    'no horizontal scroll. Tailwind v4 made the responsive grid painless.'
))

story.append(p_tight('<b>5. Tailwind v4 plugin compatibility.</b>'))
story.append(p(
    'Tailwind v4 changed the plugin API and the CSS-first configuration model. '
    'Several plugins (typography, forms) needed replacement or patching. The '
    'fix was a small set of CSS variables in globals.css that expose the '
    'design tokens to the rest of the app.'
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 10 — ACCOMPLISHMENTS
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Accomplishments', kicker='Chapter 10'))
story.append(section_header('10', 'Accomplishments', 'What Got Built'))
story.append(Spacer(1, 4))

story.append(p(
    'GigSure AI is not a demo or a slide deck. It is a deployed, working '
    'application. The accomplishments below are all verifiable on the live site '
    'or in the source code on GitHub.'
))

story.append(Spacer(1, 6))
story.append(StatCardRow([
    ('1', 'DEPLOYED APP', ACCENT),
    ('5', 'AI FEATURES', ACCENT_2),
    ('4', 'PAYPAL APIs', SEM_INFO),
    ('$0', 'TOTAL COST', SEM_SUCCESS),
]))

story.append(Spacer(1, 6))
story.append(p('<b>Concrete accomplishments</b>'))
story.append(bullet_list([
    '<b>A deployed production application</b> at <font color="#226b8f">gigsure-ai.vercel.app</font> — anyone can sign up, create a project, run the AI features, and simulate a payment end-to-end against PayPal Sandbox.',
    '<b>Cross-border payment flow in production.</b> USD in via PayPal, NGN out via Monnify/OPay, with every state change verified through the official PayPal webhook verification API.',
    '<b>Five AI features live on Groq.</b> Project brief, milestones, contract analysis, project assistant (10 sub-assistants), dispute summary — all running, all rate-limited, all advisory-only.',
    '<b>Zero infrastructure cost.</b> Groq free tier handles inference, Vercel free tier handles hosting, PayPal Sandbox handles payments, PostgreSQL via the free managed database handles persistence.',
    '<b>Dashboard reporting with stat cards & severity badges.</b> Every AI feature renders into a structured dashboard — not raw markdown.',
    '<b>Modular, audited architecture.</b> Provider interfaces, audit log, rate limiter, and input validation are all isolated modules that can be reused or replaced without touching the rest of the app.',
]))

story.append(Spacer(1, 4))
story.append(CalloutBox(
    lead='What the judges can verify in 5 minutes',
    body=(
        'Visit gigsure-ai.vercel.app, sign up, create a project, click the '
        'AI tab, run the Project Brief Generator on a one-line description, '
        'then run Contract Analysis on the generated brief. Open the Funding '
        'tab and click "Fund milestone" to walk through the PayPal Sandbox '
        'checkout. Every step is logged in the audit trail under Settings.'
    ),
    color=SEM_SUCCESS,
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 11 — LESSONS LEARNED
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Lessons Learned', kicker='Chapter 11'))
story.append(section_header('11', 'Lessons Learned', 'What The Build Taught Us'))
story.append(Spacer(1, 4))

story.append(p(
    'A hackathon build compresses a year of product decisions into a few weeks. '
    'These were the lessons that changed how GigSure was built.'
))

story.append(p_tight('<b>1. The PayPal API is reasonable if you read the docs slowly.</b>'))
story.append(p(
    'The Orders v2 capture flow looks complicated until you accept that PayPal '
    'deliberately separates "approve" (client-side) from "capture" '
    '(server-side). Once that mental model clicks, the integration is a small '
    'number of calls. The webhook verification API, similarly, is one '
    'endpoint that takes five fields and returns VERIFIED or FAILURE — but '
    'getting those five fields right requires patience.'
))

story.append(p_tight('<b>2. Groq\'s speed changes the UX brief.</b>'))
story.append(p(
    'Sub-second first-token latency makes an AI feature feel native rather '
    'than "loading". On Groq, the Project Assistant can return its first '
    'sentence before the user\'s hand leaves the keyboard. That meant we could '
    'design a chat-like UX instead of a "submit-and-wait" form — a different '
    'product.'
))

story.append(p_tight('<b>3. Tailwind v4 is a clean break.</b>'))
story.append(p(
    'The CSS-first config model is genuinely better — design tokens live in '
    'one place, the build is faster, and dark mode is a single attribute. But '
    'plugin compatibility is a real migration tax. Plan for it.'
))

story.append(p_tight('<b>4. Rate-limit psychology matters as much as rate-limit math.</b>'))
story.append(p(
    'A 429 with a Retry-After header is forgiving; a 429 with no explanation '
    'feels hostile. GigSure surfaces a friendly toast with the seconds '
    'remaining — users tolerate the limit because they understand it. This '
    'single UX decision reduced support-style friction by an order of '
    'magnitude in testing.'
))

story.append(p_tight('<b>5. Advisory-only AI is a feature, not a limitation.</b>'))
story.append(p(
    'The temptation to let the AI approve refunds is real — it would feel '
    'magical. But every autonomous financial decision is a single prompt-'
    'injection away from catastrophe. Drawing the line at "advisory only" '
    'made the safety model simple and the product defensible.'
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 12 — FUTURE ROADMAP
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Future Roadmap', kicker='Chapter 12'))
story.append(section_header('12', 'Future Roadmap', 'What is Planned (Not Implemented)'))
story.append(Spacer(1, 4))

story.append(CalloutBox(
    lead='Important note on scope',
    body=(
        'Everything in this chapter is <b>planned, not implemented</b>. None of '
        'these features exist on the live site today. They are listed here so '
        'judges can see the trajectory of the project, not its current state.'
    ),
    color=SEM_WARNING,
))

story.append(p('<b>Near-term (next 90 days)</b>'))
story.append(bullet_list([
    '<b>PayPal production environment.</b> Switch from Sandbox to live PayPal once KYC and business verification are complete. Code path is already in place — toggle is a single env-var.',
    '<b>AI contract drafting.</b> Today the AI analyses contracts; the next step is for it to draft one from the project brief, with both parties editing before signature.',
    '<b>Multi-currency support.</b> Add KES and GHS alongside NGN payout rails, with currency-aware milestone amounts and fee disclosure.',
]))

story.append(p('<b>Medium-term (3–9 months)</b>'))
story.append(bullet_list([
    '<b>Expansion to Ghana, Kenya, and South Africa.</b> Same product, local payout rails, local KYC providers, local language support in the AI assistants.',
    '<b>AI contract risk scoring history.</b> Track how a project\'s risk profile evolves over time, surfacing drift before disputes happen.',
    '<b>Team-mode projects.</b> Multiple freelancers on a single milestone, with internal split rules — useful for design + dev collaborations.',
]))

story.append(p('<b>Long-term vision</b>'))
story.append(bullet_list([
    '<b>A pan-African trust layer.</b> Verified badges, KYC, and dispute history that travel with the freelancer across platforms — not locked into GigSure.',
    '<b>Open contract standard.</b> Publish the contract risk taxonomy and the milestone schema as an open spec so other platforms can interoperate.',
    '<b>AI dispute mediation.</b> Today the AI summarises disputes; the long-term goal is for it to mediate — proposing settlements that both parties accept, with a human reviewer in the loop.',
]))

story.append(Spacer(1, 4))
story.append(CalloutBox(
    lead='What we will not build',
    body=(
        'GigSure will not become a marketplace. We will not compete on '
        'discovery, search, or matching. The bet is that the trust + payment '
        'layer is the high-value, defensible surface — and that everything '
        'else is commodity.'
    ),
    color=ACCENT_2,
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 13 — CONCLUSION
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Conclusion', kicker='Chapter 13'))
story.append(section_header('13', 'Conclusion', 'The Bigger Picture'))
story.append(Spacer(1, 4))

story.append(p(
    'GigSure AI is a bet that the next decade of African freelance work will '
    'not look like the last. The previous decade was defined by platforms that '
    'extracted margin and offered no protection; the next decade will be '
    'defined by tools that give freelancers and clients the same level of '
    'trust infrastructure that enterprise software takes for granted — clear '
    'contracts, verified payments, milestone-gated release, and AI that '
    'advises rather than decides.'
))

story.append(p(
    'The PayPal AI Hackathon was the forcing function. In a few weeks, '
    'GigSure went from a Notion doc to a deployed application with five AI '
    'features, four PayPal APIs, an audited payment flow, and a $0 cost '
    'basis. The infrastructure exists today, for free, that lets a single '
    'builder in Yobe ship a product that competes with venture-funded teams. '
    'That is the new normal, and GigSure is a small proof that it works.'
))

story.append(p(
    'The North Star is simple: every freelance engagement in Africa should '
    'be transparent, every payment should be protected, and every dispute '
    'should be summarised by an AI that does not take sides. GigSure AI is '
    'one step toward that future. There is much more to build — and we look '
    'forward to building it.'
))

story.append(Spacer(1, 10))
story.append(HRule(thickness=1.0, color=ACCENT, space_after=8))
story.append(Paragraph(
    'Thank you for reading. The full source code is on GitHub; the live app is on Vercel. '
    'Every line of code in this brief is verifiable.',
    ParagraphStyle('Sign', fontName=BODY_FONT_BOLD, fontSize=10.5, leading=16,
                   textColor=HEADER_FILL, alignment=TA_CENTER, spaceBefore=6)
))
story.append(Paragraph(
    'Ahmad Muhammad Wammi (0xFlux4hm), Yobe, Nigeria.',
    ParagraphStyle('SignSub', fontName=BODY_FONT, fontSize=10, leading=14,
                   textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=2)
))
story.append(PageBreak())


# ═════════════════════════════════════════════════════════════════════════════
# CHAPTER 14 — PROJECT LINKS
# ═════════════════════════════════════════════════════════════════════════════
story.append(add_heading('Project Links', kicker='Chapter 14'))
story.append(section_header('14', 'Project Links', 'Verify Everything'))
story.append(Spacer(1, 4))

story.append(p(
    'Every claim in this document is verifiable. The links below give direct '
    'access to the live application, the source code, and the project\'s '
    'submission materials.'
))

links_data = [
    ['Resource', 'URL', 'Notes'],
    ['Live application',
     'https://gigsure-ai.vercel.app/',
     'Sign up, create a project, run the AI features, walk through the PayPal Sandbox checkout.'],
    ['Source code (GitHub)',
     'https://github.com/0xFlux4hm/gigsure-ai',
     'Full Next.js 16 monorepo — API routes, Prisma schema, AI prompts, tests.'],
    ['PayPal integration module',
     'src/lib/payments/paypal-provider.ts',
     'Orders v2 + OAuth2 + Webhook verify + Refunds. Server-side only.'],
    ['AI feature routes',
     'src/app/api/ai/*',
     'project-brief, milestones, contract-analysis, assistant, dispute-summary.'],
    ['Prisma schema',
     'prisma/schema.prisma',
     'Project, milestone, transaction, audit, KYC, dispute models.'],
    ['Audit log',
     'src/app/api/audit/route.ts',
     'Append-only audit trail for every state change.'],
    ['Builder',
     'Ahmad Muhammad Wammi · 0xFlux4hm',
     'Yobe, Nigeria. PayPal AI Hackathon 2025.'],
]

story.append(make_table(
    links_data,
    col_widths=[110, FRAME_W * 0.45, FRAME_W - 110 - FRAME_W * 0.45],
    header_row=True,
    mono_cols=[1],
))

story.append(Spacer(1, 8))
story.append(CalloutBox(
    lead='For judges',
    body=(
        'If anything in this document is unclear, the fastest path is to open '
        'the live app, sign up, and walk through one project end-to-end. The '
        'dashboard will surface every AI feature, every payment state, and '
        'every audit entry referenced in this brief. Total time to verify '
        'the full flow: under ten minutes.'
    ),
    color=ACCENT,
))

story.append(Spacer(1, 12))
story.append(HRule(thickness=0.8, color=ACCENT, space_after=6))
story.append(Paragraph(
    'GIGSURE AI · TECHNICAL DOCUMENTATION &amp; HACKATHON PROJECT BRIEF · END OF DOCUMENT',
    ParagraphStyle('End', fontName=MONO_FONT_BOLD, fontSize=8, leading=12,
                   textColor=TEXT_MUTED, alignment=TA_CENTER, letterSpacing=2)
))


# ──────────────────────────────────────────────────────────────────────────────
# 10. Build the body PDF (multiBuild for TOC)
# ──────────────────────────────────────────────────────────────────────────────
doc = TocDocTemplate(
    str(BODY_PDF),
    pagesize=A4,
    title='GigSure AI — Technical Documentation & Hackathon Project Brief',
    author='Ahmad Muhammad Wammi (0xFlux4hm)',
    subject='GigSure AI — PayPal AI Hackathon 2025',
    creator='ReportLab + Playwright (pdf skill)',
    keywords='GigSure AI, PayPal, Groq, Next.js, Prisma, Hackathon, Cross-border, NGN, USD',
)

doc.multiBuild(story)
print(f'✓ Body PDF built: {BODY_PDF} ({BODY_PDF.stat().st_size / 1024:.1f} KB)')


# ──────────────────────────────────────────────────────────────────────────────
# 11. Merge cover PDF + body PDF
# ──────────────────────────────────────────────────────────────────────────────
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

writer = PdfWriter()

# A4 in points (matches ReportLab default pagesize=A4)
A4_W, A4_H = 595.276, 841.890

# Cover (force exact A4 dimensions to match body)
cover_reader = PdfReader(str(COVER_PDF))
for page in cover_reader.pages:
    # Playwright emits 595.92x842.88pt; scale to exact A4 (595.276x841.890pt)
    page.scale_to(A4_W, A4_H)
    writer.add_page(page)

# Body
body_reader = PdfReader(str(BODY_PDF))
for page in body_reader.pages:
    writer.add_page(page)

# Metadata
writer.add_metadata({
    '/Title': 'GigSure AI — Technical Documentation & Hackathon Project Brief',
    '/Author': 'Ahmad Muhammad Wammi (0xFlux4hm)',
    '/Subject': 'PayPal AI Hackathon 2025 — GigSure AI technical brief',
    '/Creator': 'ReportLab + Playwright via the pdf skill',
    '/Producer': 'pypdf + ReportLab',
    '/Keywords': 'GigSure AI, PayPal, Groq, Next.js, Prisma, Hackathon, Cross-border, NGN, USD',
})

with open(FINAL_PDF, 'wb') as f:
    writer.write(f)

print(f'✓ Final PDF written: {FINAL_PDF} ({FINAL_PDF.stat().st_size / 1024:.1f} KB)')
print(f'  Pages: cover(1) + body({len(body_reader.pages)}) = {1 + len(body_reader.pages)}')

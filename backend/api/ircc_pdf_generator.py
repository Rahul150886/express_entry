"""
IRCC Pre-Filled Application PDFs
Generates two professional PDFs from profile data:
  1. Express Entry Profile Reference Sheet (entering the pool)
  2. eAPR Application Reference Sheet (post-ITA full application)
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
from io import BytesIO
import datetime

# ── Colour palette ──────────────────────────────────────────────
MAPLE_RED   = colors.HexColor('#C8102E')
MAPLE_DARK  = colors.HexColor('#8B0A1F')
SLATE_900   = colors.HexColor('#0F172A')
SLATE_800   = colors.HexColor('#1E293B')
SLATE_700   = colors.HexColor('#334155')
SLATE_500   = colors.HexColor('#64748B')
SLATE_300   = colors.HexColor('#CBD5E1')
SLATE_100   = colors.HexColor('#F1F5F9')
WHITE       = colors.white
EMERALD     = colors.HexColor('#10B981')
AMBER       = colors.HexColor('#F59E0B')
BLUE        = colors.HexColor('#3B82F6')
RED_LIGHT   = colors.HexColor('#FEE2E2')
RED_BORDER  = colors.HexColor('#FCA5A5')
AMBER_LIGHT = colors.HexColor('#FEF3C7')
BLUE_LIGHT  = colors.HexColor('#DBEAFE')
GREEN_LIGHT = colors.HexColor('#D1FAE5')
FIELD_BG    = colors.HexColor('#F8FAFC')
FIELD_BORDER= colors.HexColor('#E2E8F0')
SECTION_BG  = colors.HexColor('#EFF6FF')

W, H = A4

# ── Styles ───────────────────────────────────────────────────────
def make_styles():
    return {
        'title': ParagraphStyle('title',
            fontName='Helvetica-Bold', fontSize=22, textColor=WHITE,
            leading=28, spaceAfter=4),
        'subtitle': ParagraphStyle('subtitle',
            fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#CBD5E1'),
            leading=14),
        'section_header': ParagraphStyle('section_header',
            fontName='Helvetica-Bold', fontSize=11, textColor=WHITE,
            leading=16, spaceBefore=0, spaceAfter=0),
        'field_label': ParagraphStyle('field_label',
            fontName='Helvetica-Bold', fontSize=7.5, textColor=SLATE_500,
            leading=10, spaceAfter=2),
        'field_value': ParagraphStyle('field_value',
            fontName='Helvetica', fontSize=10, textColor=SLATE_900,
            leading=14),
        'field_value_missing': ParagraphStyle('field_value_missing',
            fontName='Helvetica-Oblique', fontSize=9, textColor=colors.HexColor('#EF4444'),
            leading=13),
        'note': ParagraphStyle('note',
            fontName='Helvetica-Oblique', fontSize=7.5, textColor=SLATE_500,
            leading=11),
        'warning_text': ParagraphStyle('warning_text',
            fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#92400E'),
            leading=12),
        'info_text': ParagraphStyle('info_text',
            fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#1E40AF'),
            leading=12),
        'job_title_style': ParagraphStyle('job_title',
            fontName='Helvetica-Bold', fontSize=10, textColor=SLATE_900, leading=14),
        'body': ParagraphStyle('body',
            fontName='Helvetica', fontSize=9, textColor=SLATE_700, leading=13),
        'checklist_item': ParagraphStyle('checklist_item',
            fontName='Helvetica', fontSize=9, textColor=SLATE_700, leading=14),
        'page_header_text': ParagraphStyle('page_header_text',
            fontName='Helvetica', fontSize=8, textColor=SLATE_500, leading=10),
    }

S = make_styles()

def val(v, fallback='— Not provided —'):
    """Return value or fallback string if empty."""
    if v is None or str(v).strip() == '' or str(v).strip() == 'None':
        return None
    return str(v).strip()

def field_val(v):
    return Paragraph(val(v) or '— Not provided —',
                     S['field_value'] if val(v) else S['field_value_missing'])

def field_row(label, value, note=None):
    """Single labelled field block."""
    items = [Paragraph(label.upper(), S['field_label']), field_val(value)]
    if note:
        items.append(Paragraph(note, S['note']))
    cell = items
    return Table(
        [[cell]],
        colWidths=[None],
        style=TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), FIELD_BG),
            ('BOX',        (0,0), (-1,-1), 0.5, FIELD_BORDER),
            ('ROUNDEDCORNERS', [4]),
            ('TOPPADDING',  (0,0), (-1,-1), 6),
            ('BOTTOMPADDING',(0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING',(0,0), (-1,-1), 8),
        ])
    )

def two_col(pairs):
    """Two-column row of field_row items."""
    rows = []
    for i in range(0, len(pairs), 2):
        left = pairs[i]
        right = pairs[i+1] if i+1 < len(pairs) else ('', '')
        cell_left  = [Paragraph(left[0].upper(),  S['field_label']), field_val(left[1])] if left[0] else [Paragraph('', S['field_label'])]
        cell_right = [Paragraph(right[0].upper(), S['field_label']), field_val(right[1])] if right[0] else [Paragraph('', S['field_label'])]
        rows.append([cell_left, cell_right])

    col_w = (W - 40*mm) / 2
    t = Table(rows, colWidths=[col_w - 3, col_w - 3], spaceBefore=0, spaceAfter=0)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), FIELD_BG),
        ('BOX',        (0,0), (0,-1), 0.5, FIELD_BORDER),
        ('BOX',        (1,0), (1,-1), 0.5, FIELD_BORDER),
        ('TOPPADDING',  (0,0), (-1,-1), 6),
        ('BOTTOMPADDING',(0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING',(0,0), (-1,-1), 8),
        ('VALIGN',      (0,0), (-1,-1), 'TOP'),
        ('COLUMNPADDING',(0,0), (-1,-1), 3),
    ]))
    return t

def section_header(title, icon='', color=MAPLE_RED, description=None):
    """Coloured section header bar."""
    title_p   = Paragraph(f'{icon}  {title}' if icon else title, S['section_header'])
    desc_p    = Paragraph(description, S['note']) if description else Paragraph('', S['note'])
    inner     = [[title_p], [desc_p]] if description else [[title_p]]
    inner_tbl = Table(inner, colWidths=[W - 40*mm])
    inner_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), color),
        ('TOPPADDING',  (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING',(0,0), (-1,-1), 12),
    ]))
    return inner_tbl

def info_box(text, style='info'):
    """Coloured information/warning box."""
    bg     = BLUE_LIGHT  if style == 'info'    else AMBER_LIGHT if style == 'warn' else GREEN_LIGHT
    border = BLUE        if style == 'info'    else AMBER       if style == 'warn' else EMERALD
    pstyle = S['info_text'] if style == 'info' else S['warning_text']
    t = Table([[Paragraph(text, pstyle)]],
              colWidths=[W - 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',  (0,0), (-1,-1), bg),
        ('LINEAFTER',   (0,0), (0,-1), 3, border),
        ('TOPPADDING',  (0,0), (-1,-1), 8),
        ('BOTTOMPADDING',(0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING',(0,0), (-1,-1), 12),
    ]))
    return t

def checklist_table(items):
    """Checklist with checkbox squares."""
    rows = [[Paragraph('☐  ' + item, S['checklist_item'])] for item in items]
    t = Table(rows, colWidths=[W - 40*mm])
    t.setStyle(TableStyle([
        ('TOPPADDING',  (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('LINEBEFORE',  (0,0), (0,-1), 0.5, FIELD_BORDER),
        ('LINEAFTER',   (0,0), (0,-1), 0.5, FIELD_BORDER),
        ('LINEBELOW',   (0,0), (0,-1), 0.3, FIELD_BORDER),
        ('LINEABOVE',   (0,0), (0,0),  0.3, FIELD_BORDER),
        ('BACKGROUND',  (0,0), (-1,-1), FIELD_BG),
    ]))
    return t

def gap(h=4):
    return Spacer(1, h*mm)

# ── Page canvas callbacks ──────────────────────────────────────
def make_header_footer(form_num, form_label, applicant_name, generated_date):
    def draw_hf(c, doc):
        c.saveState()
        # Top red bar
        c.setFillColor(MAPLE_RED)
        c.rect(0, H - 8*mm, W, 8*mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 7)
        c.drawString(20*mm, H - 5.5*mm, f'IRCC APPLICATION REFERENCE  |  Form {form_num}: {form_label}')
        c.setFont('Helvetica', 7)
        c.drawRightString(W - 20*mm, H - 5.5*mm, f'{applicant_name}  |  Generated {generated_date}')

        # Bottom footer
        c.setFillColor(SLATE_100)
        c.rect(0, 0, W, 10*mm, fill=1, stroke=0)
        c.setFillColor(SLATE_500)
        c.setFont('Helvetica', 6.5)
        c.drawString(20*mm, 3.5*mm,
            'This document is a reference aid only. Always verify all information at canada.ca/express-entry before submitting to IRCC.')
        c.drawRightString(W - 20*mm, 3.5*mm, f'Page {doc.page}')
        c.restoreState()
    return draw_hf

# ═══════════════════════════════════════════════════════════════
# PDF 1 — Express Entry Profile Reference (Enter the Pool)
# ═══════════════════════════════════════════════════════════════
def build_form1(profile_data):
    buf     = BytesIO()
    p       = profile_data.get('personal', {})
    l       = profile_data.get('language', {})
    e       = profile_data.get('education', {})
    a       = profile_data.get('adaptability', {})
    work    = profile_data.get('work_history', [])
    crs     = profile_data.get('crs', {})

    full_name  = f"{val(p.get('given_name',''),'') or ''} {val(p.get('family_name',''),'') or ''}".strip() or 'Applicant'
    gen_date   = datetime.date.today().strftime('%B %d, %Y')

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18*mm, bottomMargin=16*mm,
        leftMargin=20*mm, rightMargin=20*mm,
        title=f'Express Entry Profile — {full_name}',
        author='Express Entry PR App',
    )

    story = []
    hf = make_header_footer('1', 'Express Entry Profile', full_name, gen_date)

    # ── Cover block ──────────────────────────────────────────────
    cover = Table([[
        [
            Paragraph('Express Entry', ParagraphStyle('cover_sup', fontName='Helvetica', fontSize=10,
                textColor=colors.HexColor('#FCA5A5'), leading=14)),
            Paragraph('Profile Reference Sheet', S['title']),
            Paragraph('Form 1 of 2 — Enter the Pool', S['subtitle']),
            gap(3),
            Paragraph(
                f'Prepared for: <b>{full_name}</b>    |    Generated: {gen_date}    |    '
                f'Use this alongside your IRCC portal session',
                ParagraphStyle('cover_meta', fontName='Helvetica', fontSize=8.5,
                    textColor=colors.HexColor('#94A3B8'), leading=12)
            ),
        ]
    ]], colWidths=[W - 40*mm])
    cover.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,-1), SLATE_900),
        ('TOPPADDING',    (0,0), (-1,-1), 16),
        ('BOTTOMPADDING', (0,0), (-1,-1), 16),
        ('LEFTPADDING',   (0,0), (-1,-1), 16),
        ('RIGHTPADDING',  (0,0), (-1,-1), 16),
        ('LINEBELOW',     (0,-1), (-1,-1), 4, MAPLE_RED),
    ]))
    story += [cover, gap(4)]

    # ── How to use ───────────────────────────────────────────────
    story += [
        info_box(
            'HOW TO USE THIS SHEET:  Open your IRCC portal in one browser tab and this PDF in another. '
            'Each field below is labelled exactly as IRCC labels it in the form. '
            'Copy values exactly — date formats, CLB numbers, and NOC codes must match precisely.',
            style='info'
        ),
        gap(5),
    ]

    # ── SECTION 1: Personal ──────────────────────────────────────
    story += [
        section_header('Personal Information', '👤', SLATE_800,
            'Section 1 of your Express Entry profile — fields must match your passport exactly'),
        gap(2),
        two_col([
            ('Family Name (Last Name)', p.get('family_name')),
            ('Given Name (First Name)', p.get('given_name')),
        ]),
        gap(2),
        two_col([
            ('Date of Birth — Year', p.get('dob_year')),
            ('Date of Birth — Month (MM)', p.get('dob_month')),
        ]),
        gap(2),
        two_col([
            ('Date of Birth — Day (DD)', p.get('dob_day')),
            ('Country of Birth', p.get('country_of_birth')),
        ]),
        gap(2),
        two_col([
            ('Country of Citizenship', p.get('country_of_citizenship')),
            ('Marital Status', p.get('marital_status')),
        ]),
        gap(2),
        field_row('Full Date of Birth (combined)',
            f"{p.get('dob_year','YYYY')}-{p.get('dob_month','MM')}-{p.get('dob_day','DD')}",
            'IRCC may ask for YYYY-MM-DD format — use this combined value'),
        gap(6),
    ]

    # ── SECTION 2: Language ──────────────────────────────────────
    story += [
        section_header('Official Language Test Results', '🗣', BLUE,
            'IRCC validates your scores directly with the test provider — all 4 skills required'),
        gap(2),
        two_col([
            ('Test Type', l.get('first_language_test')),
            ('Registration / Candidate Number', l.get('registration_number')),
        ]),
        gap(2),
        field_row('Test Date', l.get('test_date'),
            'Must be within 2 years of the date you create/update your Express Entry profile'),
        gap(2),
    ]

    # Language scores table
    lang_header = [
        Paragraph('SKILL', S['field_label']),
        Paragraph('RAW SCORE', S['field_label']),
        Paragraph('CLB EQUIVALENT', S['field_label']),
        Paragraph('IRCC DISPLAY', S['field_label']),
    ]
    lang_rows = [lang_header]
    for skill, raw_key, clb_key in [
        ('Listening', 'listening_score', 'clb_listening'),
        ('Reading',   'reading_score',   'clb_reading'),
        ('Writing',   'writing_score',   'clb_writing'),
        ('Speaking',  'speaking_score',  'clb_speaking'),
    ]:
        raw = val(l.get(raw_key))
        clb = val(l.get(clb_key))
        lang_rows.append([
            Paragraph(skill, S['body']),
            Paragraph(raw or '—', S['field_value'] if raw else S['field_value_missing']),
            Paragraph(f'CLB {clb}' if clb else '—', S['field_value'] if clb else S['field_value_missing']),
            Paragraph(f'{raw} ({l.get("first_language_test","")})' if raw else '—',
                      S['field_value'] if raw else S['field_value_missing']),
        ])

    cw = (W - 40*mm) / 4
    lang_tbl = Table(lang_rows, colWidths=[cw]*4)
    lang_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),   SLATE_800),
        ('TEXTCOLOR',     (0,0), (-1,0),   WHITE),
        ('BACKGROUND',    (0,1), (-1,-1),  FIELD_BG),
        ('ROWBACKGROUNDS',(0,1), (-1,-1),  [FIELD_BG, colors.HexColor('#F0F9FF')]),
        ('BOX',           (0,0), (-1,-1),  0.5, FIELD_BORDER),
        ('INNERGRID',     (0,0), (-1,-1),  0.3, FIELD_BORDER),
        ('TOPPADDING',    (0,0), (-1,-1),  6),
        ('BOTTOMPADDING', (0,0), (-1,-1),  6),
        ('LEFTPADDING',   (0,0), (-1,-1),  8),
        ('RIGHTPADDING',  (0,0), (-1,-1),  8),
        ('VALIGN',        (0,0), (-1,-1),  'MIDDLE'),
    ]))
    story += [lang_tbl, gap(3),
        info_box('⚠  CLB 7 is the minimum in all 4 skills for FSW eligibility. '
                 'CLB 9+ in all 4 skills earns maximum language CRS points (136 pts with spouse, 160 pts without).',
                 style='warn'),
        gap(6),
    ]

    # ── SECTION 3: Education ─────────────────────────────────────
    story += [
        section_header('Education', '🎓', colors.HexColor('#7C3AED'),
            'Highest credential only for Express Entry profile — full history needed for eAPR'),
        gap(2),
        field_row('Highest Level of Education',
            e.get('highest_level'),
            'IRCC values: Secondary / One-year post-secondary / Two-year post-secondary / '
            "Bachelor's degree / Two or more degrees / Master's degree / Doctoral degree"),
        gap(2),
        two_col([
            ('Name of Institution', e.get('institution')),
            ('Field of Study', e.get('field_of_study')),
        ]),
        gap(2),
        two_col([
            ('Country Where You Studied', e.get('country_studied')),
            ('Canadian Credential?', e.get('is_canadian')),
        ]),
    ]
    if val(e.get('eca_organization')) or val(e.get('eca_reference')):
        story += [
            gap(2),
            two_col([
                ('ECA Organization', e.get('eca_organization')),
                ('ECA Reference Number', e.get('eca_reference')),
            ]),
        ]
    story += [gap(6)]

    # ── SECTION 4: Work History ───────────────────────────────────
    story += [
        section_header('Work Experience', '💼', colors.HexColor('#D97706'),
            f'{len(work)} job(s) on file — all qualifying positions must have a NOC code'),
        gap(2),
    ]

    if not work:
        story += [info_box('No work experience on file. Add jobs in Profile → Work Experience.', style='warn'), gap(4)]
    else:
        for i, job in enumerate(work):
            start = f"{job.get('start_year','?')}-{job.get('start_month','?')}"
            end   = f"{job.get('end_year','Present')}" + (f"-{job.get('end_month')}" if job.get('end_month') else '')
            is_cdn = job.get('country') == 'Canada'

            job_label_tbl = Table([[
                Paragraph(f"Job {i+1}:  {val(job.get('job_title')) or 'Untitled'}",
                          S['job_title_style']),
                Paragraph('🍁 Canadian' if is_cdn else '🌍 Foreign',
                          ParagraphStyle('cdn_badge', fontName='Helvetica-Bold', fontSize=8,
                              textColor=EMERALD if is_cdn else SLATE_500,
                              alignment=TA_RIGHT)),
            ]], colWidths=[(W-40*mm)*0.75, (W-40*mm)*0.25])
            job_label_tbl.setStyle(TableStyle([
                ('BACKGROUND',    (0,0),(-1,-1), SLATE_100),
                ('TOPPADDING',    (0,0),(-1,-1), 5),
                ('BOTTOMPADDING', (0,0),(-1,-1), 5),
                ('LEFTPADDING',   (0,0),(0,-1),  8),
                ('RIGHTPADDING',  (-1,0),(-1,-1),8),
                ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
                ('LINEBELOW',     (0,-1),(-1,-1),0.5, MAPLE_RED),
            ]))

            story += [
                job_label_tbl, gap(1),
                two_col([
                    ('Employer Name', job.get('employer')),
                    ('NOC Code', job.get('noc_code')),
                ]),
                gap(1),
                two_col([
                    ('Start Date (YYYY-MM)', start),
                    ('End Date (YYYY-MM or Present)', end),
                ]),
                gap(1),
                two_col([
                    ('Hours Per Week', job.get('hours_per_week')),
                    ('Country', job.get('country')),
                ]),
                gap(3),
            ]

    # ── SECTION 5: Adaptability ──────────────────────────────────
    story += [
        section_header('Adaptability Factors', '✓', colors.HexColor('#059669'),
            'Bonus CRS points — check all that apply to your situation'),
        gap(2),
        two_col([
            ('Valid Job Offer from Canadian Employer?', a.get('has_job_offer')),
            ('Sibling in Canada (citizen or PR)?',     a.get('has_sibling')),
        ]),
        gap(2),
        two_col([
            ('Provincial Nomination (PNP)?', a.get('has_pnp')),
            ('', ''),
        ]),
        gap(6),
    ]

    # ── CRS Summary (if available) ───────────────────────────────
    if crs.get('total'):
        story += [
            section_header('CRS Score Summary', '📊', SLATE_800),
            gap(2),
            two_col([
                ('Total CRS Score', str(crs.get('total', ''))),
                ('Core Human Capital', str(crs.get('core_human_capital', ''))),
            ]),
            gap(6),
        ]

    # ── Pre-submission checklist ─────────────────────────────────
    story += [
        PageBreak(),
        section_header('Pre-Submission Checklist — Express Entry Profile', '✅', SLATE_800),
        gap(3),
        info_box('Complete all items below before clicking "Submit Profile" in your IRCC portal.', 'info'),
        gap(3),
        checklist_table([
            'Name in IRCC portal matches passport exactly (including middle names)',
            'Date of birth confirmed in YYYY-MM-DD format',
            'Language test scores entered for all 4 skills',
            'Language test registration number entered correctly',
            'Language test date is within 2 years',
            'Highest level of education selected',
            'ECA reference number entered (for non-Canadian credentials)',
            'At least one qualifying work experience with NOC code',
            'Hours per week ≥ 30 for qualifying work experience',
            'Work experience dates (start/end) entered as YYYY-MM',
            'Adaptability factors selected (job offer, sibling, PNP)',
            'Contact information (email, phone) up to date',
            'Profile reviewed end-to-end before submitting',
        ]),
        gap(6),
        info_box(
            'AFTER SUBMITTING YOUR PROFILE: You will be placed in the Express Entry pool. '
            'Monitor your email for ITA (Invitation to Apply) notifications. '
            'Once you receive an ITA, you have 60 days to submit your full eAPR application (Form 2 of 2).',
            style='info'
        ),
    ]

    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    return buf.getvalue()


# ═══════════════════════════════════════════════════════════════
# PDF 2 — eAPR Application Reference (Post-ITA Full Application)
# ═══════════════════════════════════════════════════════════════
def build_form2(profile_data):
    buf   = BytesIO()
    p     = profile_data.get('personal', {})
    l     = profile_data.get('language', {})
    e     = profile_data.get('education', {})
    a     = profile_data.get('adaptability', {})
    work  = profile_data.get('work_history', [])

    full_name = f"{val(p.get('given_name',''),'') or ''} {val(p.get('family_name',''),'') or ''}".strip() or 'Applicant'
    gen_date  = datetime.date.today().strftime('%B %d, %Y')

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18*mm, bottomMargin=16*mm,
        leftMargin=20*mm, rightMargin=20*mm,
        title=f'eAPR Application Reference — {full_name}',
        author='Express Entry PR App',
    )

    story = []
    hf = make_header_footer('2', 'eAPR Full Application', full_name, gen_date)

    # ── Cover ────────────────────────────────────────────────────
    cover = Table([[
        [
            Paragraph('eAPR — After ITA', ParagraphStyle('cover_sup2', fontName='Helvetica', fontSize=10,
                textColor=colors.HexColor('#FCA5A5'), leading=14)),
            Paragraph('Full Application Reference Sheet', S['title']),
            Paragraph('Form 2 of 2 — Submit within 60 days of receiving your ITA', S['subtitle']),
            gap(3),
            Paragraph(
                f'Prepared for: <b>{full_name}</b>    |    Generated: {gen_date}    |    '
                f'eAPR fees: $1,365 principal applicant + $500 per dependent + $85 biometrics',
                ParagraphStyle('cover_meta2', fontName='Helvetica', fontSize=8.5,
                    textColor=colors.HexColor('#94A3B8'), leading=12)
            ),
        ]
    ]], colWidths=[W - 40*mm])
    cover.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,-1), SLATE_900),
        ('TOPPADDING',    (0,0), (-1,-1), 16),
        ('BOTTOMPADDING', (0,0), (-1,-1), 16),
        ('LEFTPADDING',   (0,0), (-1,-1), 16),
        ('RIGHTPADDING',  (0,0), (-1,-1), 16),
        ('LINEBELOW',     (0,-1), (-1,-1), 4, MAPLE_RED),
    ]))
    story += [cover, gap(4)]

    # ── 60-day warning ────────────────────────────────────────────
    story += [
        info_box(
            '⚠  60-DAY DEADLINE:  After receiving your ITA, you have exactly 60 days to submit your complete '
            'eAPR application. Missing this deadline means your ITA expires and you return to the pool '
            '(or may need to re-enter). Start gathering documents immediately upon receiving your ITA.',
            style='warn'
        ),
        gap(5),
    ]

    # ── SECTION A: Personal & Background ─────────────────────────
    story += [
        section_header('Schedule A — Personal & Background Declaration', '👤', SLATE_800,
            'All information must match your passport and supporting documents exactly'),
        gap(2),
        two_col([
            ('Family Name (as in passport)', p.get('family_name')),
            ('Given Name (as in passport)',  p.get('given_name')),
        ]),
        gap(2),
        field_row('All Other Names Ever Used',
            None,
            'Include all aliases, previous names, maiden name, names from previous marriages'),
        gap(2),
        two_col([
            ('Date of Birth (YYYY-MM-DD)',
             f"{p.get('dob_year','?')}-{p.get('dob_month','?')}-{p.get('dob_day','?')}"),
            ('Country of Birth', p.get('country_of_birth')),
        ]),
        gap(2),
        two_col([
            ('Country of Citizenship', p.get('country_of_citizenship')),
            ('Marital Status',         p.get('marital_status')),
        ]),
        gap(2),
        field_row('All Countries Where You Hold Citizenship',
            p.get('country_of_citizenship'),
            'List every country — dual/multiple citizenship must all be declared'),
        gap(2),
        field_row('Current Residential Address', None,
            'Full address: unit, street, city, province/state, postal/ZIP code, country'),
        gap(2),
        field_row('Address History (past 5 years)', None,
            'Every address you have lived at — no gaps allowed. Include from/to dates.'),
        gap(6),
    ]

    # ── SECTION B: Language (repeat) ─────────────────────────────
    story += [
        section_header('Official Language Test Results (repeat from Profile)', '🗣', BLUE,
            'Must match your Express Entry profile scores exactly — IRCC cross-checks'),
        gap(2),
        two_col([
            ('Test Type',                    l.get('first_language_test')),
            ('Registration / Candidate No.', l.get('registration_number')),
        ]),
        gap(2),
        field_row('Test Date', l.get('test_date')),
        gap(2),
    ]

    # Compact 2-col language grid
    lang_pairs = []
    for skill, raw_k, clb_k in [
        ('Listening', 'listening_score', 'clb_listening'),
        ('Reading',   'reading_score',   'clb_reading'),
        ('Writing',   'writing_score',   'clb_writing'),
        ('Speaking',  'speaking_score',  'clb_speaking'),
    ]:
        raw = val(l.get(raw_k))
        clb = val(l.get(clb_k))
        lang_pairs += [
            (f'{skill} Score', raw),
            (f'{skill} CLB',   f'CLB {clb}' if clb else None),
        ]
    story += [two_col(lang_pairs), gap(6)]

    # ── SECTION C: Education (detailed) ──────────────────────────
    story += [
        section_header('Education History (complete)', '🎓', colors.HexColor('#7C3AED'),
            'eAPR requires ALL education, not just the highest credential'),
        gap(2),
        field_row('Highest Level of Education', e.get('highest_level')),
        gap(2),
        two_col([
            ('Institution Name',     e.get('institution')),
            ('Field of Study',       e.get('field_of_study')),
        ]),
        gap(2),
        two_col([
            ('Country Where Studied', e.get('country_studied')),
            ('Canadian Credential?',  e.get('is_canadian')),
        ]),
    ]
    if val(e.get('eca_organization')) or val(e.get('eca_reference')):
        story += [
            gap(2),
            two_col([
                ('ECA Organization',  e.get('eca_organization')),
                ('ECA Reference No.', e.get('eca_reference')),
            ]),
        ]
    story += [
        gap(2),
        info_box(
            'eAPR requires complete education history — all post-secondary credentials, '
            'not just your highest. Have institution names, addresses, dates of attendance, '
            'and ECA documents ready for each foreign credential.',
            style='info'
        ),
        gap(6),
    ]

    # ── SECTION D: Work (detailed) ────────────────────────────────
    story += [
        section_header('Work Experience (detailed for eAPR)', '💼', colors.HexColor('#D97706'),
            'Reference letters required for ALL qualifying work experience periods'),
        gap(2),
    ]

    if not work:
        story += [info_box('No work experience on file.', style='warn')]
    else:
        for i, job in enumerate(work):
            start = f"{job.get('start_year','?')}-{job.get('start_month','?')}"
            end   = f"{job.get('end_year','Present')}" + (f"-{job.get('end_month')}" if job.get('end_month') else '')
            is_cdn = job.get('country') == 'Canada'

            job_hdr = Table([[
                Paragraph(f"Job {i+1}:  {val(job.get('job_title')) or 'Untitled'}",
                          S['job_title_style']),
                Paragraph('🍁 Canadian' if is_cdn else '🌍 Foreign',
                          ParagraphStyle('cdn_badge2', fontName='Helvetica-Bold', fontSize=8,
                              textColor=EMERALD if is_cdn else SLATE_500,
                              alignment=TA_RIGHT)),
            ]], colWidths=[(W-40*mm)*0.75, (W-40*mm)*0.25])
            job_hdr.setStyle(TableStyle([
                ('BACKGROUND',    (0,0),(-1,-1), SLATE_100),
                ('TOPPADDING',    (0,0),(-1,-1), 5),
                ('BOTTOMPADDING', (0,0),(-1,-1), 5),
                ('LEFTPADDING',   (0,0),(0,-1),  8),
                ('RIGHTPADDING',  (-1,0),(-1,-1),8),
                ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
                ('LINEBELOW',     (0,-1),(-1,-1),0.5, MAPLE_RED),
            ]))

            story += [
                job_hdr, gap(1),
                two_col([
                    ('Employer Name',        job.get('employer')),
                    ('NOC Code',             job.get('noc_code')),
                ]),
                gap(1),
                two_col([
                    ('Start Date (YYYY-MM)', start),
                    ('End Date (YYYY-MM)',   end),
                ]),
                gap(1),
                two_col([
                    ('Hours Per Week', job.get('hours_per_week')),
                    ('Country',       job.get('country')),
                ]),
                gap(1),
                field_row('Employer Address', None,
                    'Required for eAPR — full street address of employer'),
                gap(1),
                field_row('Supervisor Name & Title', None,
                    'Name of direct supervisor who signed your reference letter'),
                gap(1),
                field_row('Annual Salary / Wage', None,
                    'Include currency. Must match reference letter and pay stubs.'),
                gap(1),
                field_row('Main Duties (NOC-matching)', None,
                    'Describe duties that align with your NOC code — reviewer will compare'),
                gap(3),
            ]

    story += [gap(2)]

    # ── SECTION E: Travel History ─────────────────────────────────
    story += [
        PageBreak(),
        section_header('10-Year Travel History', '✈', colors.HexColor('#0891B2'),
            'Every country visited for 6+ months in the past 10 years — no gaps allowed'),
        gap(2),
        info_box(
            'IRCC requires a complete, gap-free travel history for the past 10 years. '
            'For each entry include: country, from date, to date, purpose '
            '(tourism/work/study/transit), and your immigration status there. '
            'Periods in your home country count — list them too to fill gaps.',
            style='info'
        ),
        gap(3),
    ]

    # Travel history template rows
    travel_header = [
        Paragraph('COUNTRY', S['field_label']),
        Paragraph('FROM (YYYY-MM)', S['field_label']),
        Paragraph('TO (YYYY-MM)', S['field_label']),
        Paragraph('PURPOSE', S['field_label']),
        Paragraph('IMMIGRATION STATUS', S['field_label']),
    ]
    travel_rows = [travel_header]
    for _ in range(8):
        travel_rows.append([
            Paragraph('', S['body']),
            Paragraph('', S['body']),
            Paragraph('', S['body']),
            Paragraph('', S['body']),
            Paragraph('', S['body']),
        ])

    cw_travel = (W - 40*mm) / 5
    travel_tbl = Table(travel_rows, colWidths=[cw_travel * 1.4, cw_travel * 0.9,
                                                cw_travel * 0.9, cw_travel * 0.9, cw_travel * 0.9])
    travel_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  SLATE_800),
        ('TEXTCOLOR',     (0,0), (-1,0),  WHITE),
        ('BACKGROUND',    (0,1), (-1,-1), FIELD_BG),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [FIELD_BG, WHITE]),
        ('BOX',           (0,0), (-1,-1), 0.5, FIELD_BORDER),
        ('INNERGRID',     (0,0), (-1,-1), 0.3, FIELD_BORDER),
        ('TOPPADDING',    (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING',   (0,0), (-1,-1), 6),
        ('RIGHTPADDING',  (0,0), (-1,-1), 6),
        ('FONTNAME',      (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE',      (0,1), (-1,-1), 9),
    ]))
    story += [travel_tbl, gap(6)]

    # ── SECTION F: Family Members ─────────────────────────────────
    story += [
        section_header('Family Members', '👨‍👩‍👧', colors.HexColor('#DB2777'),
            'Spouse/partner + all dependent children — whether accompanying you or not'),
        gap(2),
        info_box(
            'ALL family members must be declared even if they are NOT coming to Canada. '
            'For each person: full legal name, date of birth, country of birth, relationship, '
            'current immigration status, and whether they will accompany you.',
            style='info'
        ),
        gap(3),
    ]

    # Family member template
    fam_header = [
        Paragraph('FULL NAME', S['field_label']),
        Paragraph('RELATIONSHIP', S['field_label']),
        Paragraph('DATE OF BIRTH', S['field_label']),
        Paragraph('COUNTRY OF BIRTH', S['field_label']),
        Paragraph('ACCOMPANYING?', S['field_label']),
    ]
    fam_rows = [fam_header]
    for _ in range(5):
        fam_rows.append([
            Paragraph('', S['body']),
            Paragraph('', S['body']),
            Paragraph('', S['body']),
            Paragraph('', S['body']),
            Paragraph('', S['body']),
        ])

    cw_fam = (W - 40*mm) / 5
    fam_tbl = Table(fam_rows, colWidths=[cw_fam * 1.5, cw_fam * 0.9,
                                          cw_fam * 0.9, cw_fam * 0.9, cw_fam * 0.8])
    fam_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  SLATE_800),
        ('TEXTCOLOR',     (0,0), (-1,0),  WHITE),
        ('BACKGROUND',    (0,1), (-1,-1), FIELD_BG),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [FIELD_BG, WHITE]),
        ('BOX',           (0,0), (-1,-1), 0.5, FIELD_BORDER),
        ('INNERGRID',     (0,0), (-1,-1), 0.3, FIELD_BORDER),
        ('TOPPADDING',    (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING',   (0,0), (-1,-1), 6),
        ('RIGHTPADDING',  (0,0), (-1,-1), 6),
        ('FONTNAME',      (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE',      (0,1), (-1,-1), 9),
    ]))
    story += [fam_tbl, gap(6)]

    # ── SECTION G: Background Declaration ────────────────────────
    story += [
        section_header('Background Declaration (Schedule A)', '🛡', SLATE_800,
            'Answer truthfully — misrepresentation is grounds for permanent ban'),
        gap(2),
        info_box(
            'IRCC performs security, criminal, and background checks. '
            'Answer all questions honestly. If unsure, consult an RCIC (Regulated Canadian Immigration Consultant) '
            'or immigration lawyer before answering.',
            style='warn'
        ),
        gap(3),
        checklist_table([
            'Criminal history in any country (including charges, convictions, or pardons)',
            'Military or police service in any country',
            'Government or public service employment in any country',
            'Previous visa or permit applications to any country that were refused',
            'Previous removal from any country',
            'Any family members inadmissible to Canada',
            'Any health conditions that may affect eligibility',
        ]),
        gap(6),
    ]

    # ── SECTION H: Documents Checklist ───────────────────────────
    story += [
        section_header('Documents to Upload to IRCC Portal', '📄', colors.HexColor('#059669'),
            'Upload originals or certified copies — all documents must be in English or French'),
        gap(2),
    ]

    doc_sections = [
        ('Principal Applicant — Identity', [
            'Valid passport (all pages, including blank pages)',
            'National identity card (if applicable)',
            'Birth certificate',
            'Passport-style photos (IRCC specification: 50mm x 70mm, white background)',
        ]),
        ('Language Test', [
            'Official IELTS / CELPIP / TEF result letter (original)',
            'Confirmation of Test Results (CTR) page showing registration number',
        ]),
        ('Education', [
            'Degree/diploma certificate for each credential',
            'Official transcripts from each institution',
            'ECA report from designated organization (WES, ICAS, etc.) — for foreign credentials',
        ]),
        ('Work Experience', [
            'Reference letter on employer letterhead (for each qualifying job)',
            'Letter must include: employer address, supervisor name & title, your title, start/end dates, '
            'salary, hours/week, main duties, reason for leaving',
            'Pay stubs (most recent 3 months, or T4s for previous years)',
            'Employment contract or offer letter (if available)',
            'T4 slips for Canadian experience (past 2 tax years)',
        ]),
        ('Proof of Funds (if required)', [
            'Bank statements (last 6 months)',
            'Fixed deposit certificates',
            'Letter from financial institution confirming available funds',
            'Required amounts: CAD $13,757 for single; $17,127 for 2; $21,055 for 3; etc.',
        ]),
        ('Medical', [
            'Upfront Medical Exam results (from IRCC-designated physician)',
            'Form IMM 1017E or IMM 5986 as applicable',
        ]),
        ('Police Certificates', [
            'Police clearance certificate from each country lived in for 6+ months since age 18',
            'Must be recent (within 3-6 months for most countries)',
        ]),
        ('Spouse / Common-Law Partner (if applicable)', [
            'Passport copy',
            'Birth certificate',
            'Marriage certificate (or proof of common-law)',
            'Photos (IRCC specification)',
            'Language test results (if spouse took one)',
        ]),
    ]

    for section_title, items in doc_sections:
        story += [
            Paragraph(section_title.upper(),
                      ParagraphStyle('doc_section', fontName='Helvetica-Bold', fontSize=8,
                          textColor=SLATE_500, spaceBefore=6, spaceAfter=3)),
            checklist_table(items),
            gap(2),
        ]

    story += [gap(6)]

    # ── Final submission checklist ────────────────────────────────
    story += [
        section_header('Final Pre-Submission Checklist', '✅', MAPLE_RED,
            'Complete every item before clicking Submit in your IRCC portal'),
        gap(3),
        checklist_table([
            'All family members declared (even those not accompanying)',
            '10-year travel history complete with no unexplained gaps',
            'Background declaration questions answered truthfully',
            'All required documents uploaded in correct format (PDF preferred)',
            'All documents in English or French (or certified translation provided)',
            'All names/dates consistent across all documents',
            'Police certificates obtained for all required countries',
            'Medical exam completed with IRCC-designated physician',
            'Proof of funds documents current (within 6 months)',
            'Application fees paid: check canada.ca for current fee schedule',
            'Biometrics appointment booked (if not previously given)',
            'Reviewed entire application for typos and inconsistencies',
            'Application submitted before 60-day ITA deadline',
        ]),
        gap(4),
        info_box(
            'AFTER SUBMITTING YOUR eAPR: IRCC will send an Acknowledgement of Receipt (AOR). '
            'Keep this reference number. Processing times vary — check your IRCC portal account regularly. '
            'You may be asked for additional documents. IRCC will contact you for the next steps.',
            style='info'
        ),
    ]

    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    return buf.getvalue()


# ── Test / demo run ───────────────────────────────────────────
if __name__ == '__main__':
    # Sample data matching the ircc-ready endpoint structure
    sample = {
        'personal': {
            'family_name': 'Ahuja', 'given_name': 'Anjali',
            'dob_year': '1992', 'dob_month': '07', 'dob_day': '14',
            'country_of_birth': 'India', 'country_of_citizenship': 'India',
            'marital_status': 'Married',
        },
        'language': {
            'first_language_test': 'IELTS',
            'listening_score': '8.5', 'reading_score': '8.0',
            'writing_score': '7.5',   'speaking_score': '7.5',
            'test_date': '2024-03-15', 'registration_number': 'IN2024031500987',
            'clb_listening': '10', 'clb_reading': '9',
            'clb_writing': '9',   'clb_speaking': '9',
        },
        'education': {
            'highest_level': 'bachelors',
            'institution': 'Delhi University',
            'field_of_study': 'Computer Science',
            'country_studied': 'India',
            'is_canadian': 'False',
            'eca_organization': 'WES (World Education Services)',
            'eca_reference': 'WES0001234567',
        },
        'work_history': [
            {
                'employer': 'Infosys Ltd',
                'job_title': 'Software Engineer',
                'noc_code': '21231',
                'country': 'India',
                'start_year': '2018', 'start_month': '06',
                'end_year': '2022',   'end_month': '08',
                'hours_per_week': '40',
                'is_current': 'False',
            },
            {
                'employer': 'Shopify Inc',
                'job_title': 'Senior Software Engineer',
                'noc_code': '21231',
                'country': 'Canada',
                'start_year': '2022', 'start_month': '09',
                'end_year': 'Present', 'end_month': '',
                'hours_per_week': '40',
                'is_current': 'True',
            },
        ],
        'adaptability': {
            'has_sibling': 'False',
            'has_job_offer': 'True',
            'has_pnp': 'False',
        },
        'crs': {'total': 487, 'core_human_capital': 401},
    }

    pdf1 = build_form1(sample)
    pdf2 = build_form2(sample)

    with open('/mnt/user-data/outputs/IRCC_Form1_Express_Entry_Profile.pdf', 'wb') as f:
        f.write(pdf1)
    with open('/mnt/user-data/outputs/IRCC_Form2_eAPR_Application.pdf', 'wb') as f:
        f.write(pdf2)

    print(f'Form 1: {len(pdf1):,} bytes')
    print(f'Form 2: {len(pdf2):,} bytes')
    print('Done — check /mnt/user-data/outputs/')

#!/usr/bin/env python3
"""
Generate polished academic PDF from markdown
"""

import re
import os

# Read the markdown file
with open('VALUE_PROPOSITION.md', 'r') as f:
    md_content = f.read()

# Replace mermaid blocks with images
diagram_count = 0
def replace_mermaid(match):
    global diagram_count
    diagram_count += 1
    return f'''<figure>
<img src="diagrams/diagram{diagram_count}.png" alt="Diagram {diagram_count}">
<figcaption>Figure {diagram_count}</figcaption>
</figure>'''

md_content = re.sub(r'```mermaid\n[\s\S]*?```', replace_mermaid, md_content)

# Convert markdown to HTML manually for more control
def md_to_html(text):
    # Title
    text = re.sub(r'^# (.+)$', r'<h1>\1</h1>', text, flags=re.MULTILINE)
    
    # Add subtitle and meta after title
    text = text.replace('</h1>\n\n', '''</h1>
<div class="meta">January 2026</div>
<div class="abstract">
<div class="abstract-title">Abstract</div>
This document examines how the wrapper around a language model affects clinical documentation output. We processed the same psychiatric case through ChatGPT and through Psych Intake Brief. Both use GPT-5.2. The difference is in how the interaction gets structured.
</div>
''')
    
    # Headers
    text = re.sub(r'^## (.+)$', r'<h2>\1</h2>', text, flags=re.MULTILINE)
    text = re.sub(r'^### (.+)$', r'<h3>\1</h3>', text, flags=re.MULTILINE)
    
    # Horizontal rules
    text = re.sub(r'^---+$', r'<hr>', text, flags=re.MULTILINE)
    
    # Code blocks
    def format_code_block(match):
        code = match.group(1)
        code = code.replace('<', '&lt;').replace('>', '&gt;')
        return f'<pre><code>{code}</code></pre>'
    text = re.sub(r'```\w*\n([\s\S]*?)```', format_code_block, text)
    
    # Inline code
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    
    # Bold
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    
    # Italic
    text = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', text)
    
    # Images
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<figure><img src="\2" alt="\1"><figcaption>\1</figcaption></figure>', text)
    
    # Tables
    def format_table(match):
        lines = match.group(0).strip().split('\n')
        html = '<table>\n'
        for i, line in enumerate(lines):
            if '---' in line:
                continue
            cells = [c.strip() for c in line.split('|')[1:-1]]
            tag = 'th' if i == 0 else 'td'
            row = '<tr>' + ''.join(f'<{tag}>{c}</{tag}>' for c in cells) + '</tr>\n'
            html += row
        html += '</table>'
        return html
    text = re.sub(r'(\|.+\|[\n])+', format_table, text)
    
    # Lists
    def format_list(match):
        items = match.group(0).strip().split('\n')
        html = '<ul>\n'
        for item in items:
            item = re.sub(r'^[\s]*[-*]\s*', '', item)
            html += f'<li>{item}</li>\n'
        html += '</ul>'
        return html
    text = re.sub(r'(^[\s]*[-*]\s+.+[\n]?)+', format_list, text, flags=re.MULTILINE)
    
    # Numbered lists
    def format_ol(match):
        items = match.group(0).strip().split('\n')
        html = '<ol>\n'
        for item in items:
            item = re.sub(r'^[\s]*\d+\.\s*', '', item)
            html += f'<li>{item}</li>\n'
        html += '</ol>'
        return html
    text = re.sub(r'(^[\s]*\d+\.\s+.+[\n]?)+', format_ol, text, flags=re.MULTILINE)
    
    # Paragraphs
    paragraphs = text.split('\n\n')
    for i, p in enumerate(paragraphs):
        p = p.strip()
        if p and not p.startswith('<'):
            paragraphs[i] = f'<p>{p}</p>'
    text = '\n\n'.join(paragraphs)
    
    # Clean up
    text = text.replace('\n</p>', '</p>')
    text = re.sub(r'<p>\s*</p>', '', text)
    text = re.sub(r'<p>\s*(<h\d|<hr|<figure|<table|<ul|<ol|<pre)', r'\1', text)
    text = re.sub(r'(</h\d>|</table>|</ul>|</ol>|</pre>|</figure>)\s*</p>', r'\1', text)
    
    return text

html_content = md_to_html(md_content)

# Create full HTML document
html_doc = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Structured Harnesses for Clinical AI</title>
    <link rel="stylesheet" href="academic-style.css">
</head>
<body>
{html_content}
</body>
</html>'''

# Write HTML
with open('academic-output.html', 'w') as f:
    f.write(html_doc)

print("HTML generated: academic-output.html")

# Generate PDF with weasyprint
try:
    from weasyprint import HTML, CSS
    from weasyprint.text.fonts import FontConfiguration
    
    font_config = FontConfiguration()
    html = HTML(filename='academic-output.html', base_url='.')
    css = CSS(filename='academic-style.css', font_config=font_config)
    
    html.write_pdf(
        'Psych_Intake_Brief_Technical_Documentation.pdf',
        stylesheets=[css],
        font_config=font_config
    )
    
    print("PDF generated: Psych_Intake_Brief_Technical_Documentation.pdf")
    
    # Get file size
    size = os.path.getsize('Psych_Intake_Brief_Technical_Documentation.pdf')
    print(f"Size: {size / 1024:.0f} KB")
    
except Exception as e:
    print(f"PDF generation error: {e}")


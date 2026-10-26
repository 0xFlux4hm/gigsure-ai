"""
Generate GigSure AI business logo — text + icon style, deep green brand color.
Outputs: SVG (crisp at any size) + PNG (for website header/footer).
"""
import struct
import zlib

# ---------------------------------------------------------------------------
# SVG Logo — text + icon, deep green (#107A57)
# ---------------------------------------------------------------------------

svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#107A57;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0A5C42;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Icon: Shield with checkmark (trust + protection) -->
  <g transform="translate(10, 15)">
    <!-- Shield outline -->
    <path d="M 35 5 L 60 15 L 60 40 Q 60 60 35 70 Q 10 60 10 40 L 10 15 Z"
          fill="url(#grad)" stroke="#0A5C42" stroke-width="1"/>
    <!-- Checkmark -->
    <path d="M 22 35 L 31 44 L 48 25"
          fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  
  <!-- Text: GigSure AI -->
  <text x="85" y="45" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="32" font-weight="700" fill="#1A1A1A" letter-spacing="-0.5">
    Gig<tspan fill="#107A57">Sure</tspan>
  </text>
  <text x="85" y="72" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="14" font-weight="600" fill="#107A57" letter-spacing="2">
    AI
  </text>
  
  <!-- Tagline -->
  <text x="85" y="88" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="9" font-weight="400" fill="#999999" letter-spacing="0.5">
    Work with confidence. Get paid with trust.
  </text>
</svg>'''

# ---------------------------------------------------------------------------
# Dark version (for dark backgrounds)
# ---------------------------------------------------------------------------

svg_dark = '''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100">
  <defs>
    <linearGradient id="grad-dark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1AA67C;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#107A57;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <g transform="translate(10, 15)">
    <path d="M 35 5 L 60 15 L 60 40 Q 60 60 35 70 Q 10 60 10 40 L 10 15 Z"
          fill="url(#grad-dark)" stroke="#1AA67C" stroke-width="1"/>
    <path d="M 22 35 L 31 44 L 48 25"
          fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  
  <text x="85" y="45" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="32" font-weight="700" fill="#FFFFFF" letter-spacing="-0.5">
    Gig<tspan fill="#1AA67C">Sure</tspan>
  </text>
  <text x="85" y="72" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="14" font-weight="600" fill="#1AA67C" letter-spacing="2">
    AI
  </text>
  
  <text x="85" y="88" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
        font-size="9" font-weight="400" fill="#888888" letter-spacing="0.5">
    Work with confidence. Get paid with trust.
  </text>
</svg>'''

# ---------------------------------------------------------------------------
# Icon-only version (for favicon, app icon)
# ---------------------------------------------------------------------------

svg_icon = '''<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <defs>
    <linearGradient id="grad-icon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#107A57;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0A5C42;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="80" height="80" rx="16" fill="url(#grad-icon)"/>
  <g transform="translate(15, 12)">
    <path d="M 25 5 L 45 13 L 45 35 Q 45 52 25 60 Q 5 52 5 35 L 5 13 Z"
          fill="none" stroke="#FFFFFF" stroke-width="2.5" opacity="0.9"/>
    <path d="M 15 30 L 23 38 L 36 22"
          fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>'''

# Write SVG files
with open('/home/z/my-project/download/logo.svg', 'w') as f:
    f.write(svg_content)

with open('/home/z/my-project/download/logo-dark.svg', 'w') as f:
    f.write(svg_dark)

with open('/home/z/my-project/download/icon.svg', 'w') as f:
    f.write(svg_icon)

print("✅ Generated SVG files:")
print("   - download/logo.svg (light version)")
print("   - download/logo-dark.svg (dark version)")
print("   - download/icon.svg (icon-only)")

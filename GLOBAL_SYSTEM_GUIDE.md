# SevaSphere Global Design System — v1.1

## Product direction
SevaSphere is a lightweight, premium emerald-and-white digital workspace for photo preparation, print layouts, document formats, PDF utilities, billing and calculators. This package is a test build; it is not deployed to GitHub.

## Architecture
- `assets/css/portal.css`: legacy compatibility stylesheet used by existing tools. Preserve while templates are audited.
- `assets/css/csc-system.css`: shared design tokens and reusable `csc-*` components for current and future pages.
- `assets/css/home.css`: homepage-only styling. Keep homepage rules here, not in the global system.
- `assets/js/site.js`: shared header/footer, tool registry, filtering, theme support and helper utilities. Existing tool-specific logic remains in dedicated scripts.
- `TEMPLATE_STARTER.html`: starter structure for new tools. Give every public page its own useful title, description, H1, instructions and final canonical URL.
- `SITE_MANIFEST.json`: lightweight project manifest describing the shared architecture.

## 100+ page growth rules
1. Build new tools from `TEMPLATE_STARTER.html` or an approved template; do not copy the homepage CSS into tool pages.
2. Load shared styles in this order: `portal.css` (legacy compatibility), `csc-system.css` (shared components), then an optional page-specific stylesheet.
3. Use shared `csc-*` components for new common UI. Keep page-specific rules scoped to the page root.
4. Register each discoverable tool in `assets/js/site.js`; keep its name, description, category and file path accurate.
5. Load only the JavaScript a tool needs. Avoid introducing a large framework for simple static tools.
6. Preserve accessible labels, keyboard focus, clear errors and reduced-motion support.
7. Keep shared brand colors, spacing and component rules centralized. New templates must follow the SevaSphere design system.
8. Before adding a page, check for duplicate purpose/slug, broken links, unique metadata and whether the page adds genuine user value.

## SEO release checklist
- Unique, descriptive title and meta description for every indexable page.
- One clear H1 and useful original instructions.
- Add canonical URLs only after the final domain and path are known. The demo intentionally does not carry over the previous site's canonical URL.
- Use crawlable HTML links to important tools; do not make all discovery depend on client-side search.
- Add a sitemap only after the URL inventory and canonical decisions are audited.
- Add structured data only when it accurately represents visible content. It does not guarantee ranking.
- Test mobile usability, performance, broken links and JavaScript errors; verify the published domain in search webmaster tools.

## Scope and limitations
This demo rebrands the existing homepage and page titles, introduces shared design tokens/components, and provides a repeatable starter pattern. It does not yet redesign and manually audit every individual tool page. The current Font Awesome CDN remains because existing pages rely on its icon classes. A later performance pass can replace or subset those icons after compatibility testing.

Google rankings cannot be guaranteed. Search performance also depends on helpful content, crawlability, competition, reputation, links, technical health and ongoing measurement.

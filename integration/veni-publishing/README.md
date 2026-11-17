# Reserve discovery contract (not published)

The adjacent HTML fragment is a review-only product entry for `/platforms/` in
`venipublishing-website-preview`. This local integration contract is the addendum's
interim option; no umbrella repository, Pages deployment or current account route
has been changed. Apply it to a separately reviewed preview branch before production.

The only public destination is the existing synthetic Playground. It carries no
setup, user, tenant, booking or account parameters. The real SaaS origin is deliberately
unset. Do not substitute the static Playground host as an SSR/signup host.

For local end-to-end link review, use `http://127.0.0.1:5174/` as the proposed standalone
destination (port subject to the runbook). Once an HTTPS SSR origin is approved,
replace the unavailable text with a normal link to that origin's `/`; retain the
separate simulation link. No redirect trampoline, shared cookie, token query parameter
or parent navigation is needed. A proposed umbrella `/reserve/` discovery page is not
implemented or live. Preserve `/kids/`, `/account/`, other sections and existing canonical
metadata. The Reserve logo links to its own `/`.

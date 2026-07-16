# Upstream provenance

HiTranslator Browser Extension is a modified distribution of the Read Frog browser extension.

- Upstream repository: https://github.com/mengxi-ream/read-frog
- Upstream version: `1.39.4`
- Upstream commit: `13fd8981bd93ea82cc94a12b6fd2a14c8d50da08`
- Snapshot imported: `2026-07-11`
- Upstream license used by this fork: GNU General Public License version 3

## HiTranslator modifications

HiTranslator-specific work began on `2026-07-11`. The maintained differences include:

- HiTranslator product name, extension ID, artwork, and release metadata;
- a Chromium Native Messaging bridge to the HiTranslator desktop application;
- translation requests routed through the model selected in the desktop app;
- desktop-managed webpage translation settings and controller state;
- selection translation delegated to the desktop floating translator;
- adaptive translation colors based on the desktop theme;
- upstream account, analytics, Notebase, learning, and cloud-service initialization disabled;
- a separate packaging and installation flow for Chrome, Edge, and Dia.

The Git history and `NOTICE` provide the modification record. Public binary releases must keep `LICENSE`, `NOTICE`, this file, and a link to the exact corresponding source tag.

Read Frog names and trademarks belong to their respective owners. No endorsement is implied.

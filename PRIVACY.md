# Privacy

HiTranslator Browser Extension is a local companion to the HiTranslator desktop app.

- Webpage text selected for translation is sent to the desktop app through Chromium
  Native Messaging.
- The desktop app sends translation requests to the model services configured by the
  user. API credentials are not stored in the extension.
- Page translation caches and extension settings are stored locally in the browser.
- The public build does not initialize analytics, user accounts, Notebase, advertising,
  or an upstream cloud API.

The extension needs access to webpages so it can find text nodes, insert translations,
observe dynamic content, and provide selection translation. It does not sell user data.

The privacy behavior of a configured model provider is governed by that provider and
the choices made in the HiTranslator desktop app.

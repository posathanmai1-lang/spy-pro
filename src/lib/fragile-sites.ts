/**
 * Built-in "fragile sites" list.
 *
 * Sites where fullscreen interception could break the development experience.
 * These default to 'native' policy. Users can override via the options page.
 *
 * Patterns use the same wildcard syntax as OriginRule.host.
 */
export const FRAGILE_SITES: readonly string[] = [
  // GitHub Codespaces / dev environments
  '*.github.dev',
  'github.dev',

  // CodeSandbox
  '*.codesandbox.io',
  'codesandbox.io',

  // StackBlitz
  '*.stackblitz.io',
  'stackblitz.io',

  // VS Code Web
  'vscode.dev',
  '*.vscode.dev',

  // Gitpod
  '*.gitpod.io',
  'gitpod.io',

  // Replit
  '*.replit.com',
  'replit.com',

  // CodePen
  'codepen.io',
  '*.codepen.io',

  // JSFiddle
  'jsfiddle.net',

  // Glitch
  'glitch.com',
  '*.glitch.me',

  // Google Meet / Slides (fullscreen is intentional)
  'meet.google.com',
  'docs.google.com',
] as const;

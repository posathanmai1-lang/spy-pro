# Contributing to Spy Pro

Thank you for your interest in contributing to **Spy Pro**!

## How to Contribute

1. **Fork the Repository**: Create your own fork on GitHub.
2. **Clone locally**:
   ```bash
   git clone https://github.com/posathanmai1-lang/spy-pro.git
   cd spy-pro
   npm install
   ```
3. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Development & Testing**:
   - Run type checking: `npx tsc --noEmit`
   - Run tests: `npm run test`
   - Build extension: `npm run build`
5. **Commit & Push**:
   - Keep commits concise and clear.
   - Push to your branch and submit a Pull Request.

## Code Style & Privacy

- All code must pass TypeScript compilation and Vitest suites without errors.
- Never commit credentials, private tokens, or unnecessary telemetry.
- Keep UI modern, fast, and responsive.

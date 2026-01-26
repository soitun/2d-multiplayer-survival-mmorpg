# Contributing to Broth & Bullets

First off, thank you for considering contributing to Broth & Bullets! We welcome contributions that improve correctness, stability, or player experience.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [What Can I Contribute?](#what-can-i-contribute)
- [Getting Started](#getting-started)
- [Contribution Workflow](#contribution-workflow)
- [Reporting Exploits](#reporting-exploits)
- [Style Guidelines](#style-guidelines)
- [License](#license)

## Code of Conduct

Please be respectful and constructive in all interactions. We're building a community around this project, and positive collaboration makes it better for everyone.

## What Can I Contribute?

### ✅ Welcome Contributions

- **Bug fixes** - Fixing issues in game logic, UI, or server code
- **Performance improvements** - Optimizations that don't change game balance
- **New features** - Gameplay mechanics, UI improvements, quality-of-life features
- **Documentation** - Improving README, adding guides, code comments
- **Tests** - Adding test coverage for existing functionality
- **Refactoring** - Code cleanup that improves maintainability
- **Localization** - Translations and internationalization support

### 📋 High-Priority Areas (from Roadmap)

If you're looking for impactful contributions, these planned features are great starting points:

- 🔫 **Firearms & Advanced Combat** - More gun types, zoom mechanics
- 🤖 **Neutral Faction & NPCs** - AI NPCs in monuments, quests
- 🔑 **Social Auth** - Steam, Discord, Twitch authentication
- 🔬 **Advanced Tech Tree** - Faction unlocks and progression
- 🎨 **Graphical Improvements** - If you're a pixel artist!

### ⚠️ Requires Discussion First

Please open an issue to discuss before working on:

- Major architectural changes
- Game balance modifications
- Changes to core gameplay loops
- New dependencies or tech stack changes

### ❌ Out of Scope

- Changes to protected IP (see [NOTICE](./NOTICE))
- Modifications that enable cheating or exploits
- Features that would fragment the player base

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vibe-coding-starter-pack-2d-multiplayer-survival.git
   cd vibe-coding-starter-pack-2d-multiplayer-survival
   ```
3. **Set up the development environment** following the [Quick Local Setup](./README.md#-quick-local-setup) guide
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Contribution Workflow

### 1. Create an Issue (Optional but Recommended)

For significant changes, create an issue first to discuss your approach. This helps avoid duplicate work and ensures your contribution aligns with project goals.

### 2. Make Your Changes

- Follow the existing code style
- Keep commits focused and atomic
- Write clear commit messages
- Test your changes thoroughly

### 3. Test Your Changes

**Server changes:**
```bash
cd server/
spacetime build --project-path .
./deploy-local-clean.ps1  # Test with fresh database
```

**Client changes:**
```bash
npm run dev
# Test in browser, check console for errors
```

**Multiplayer testing:**
```bash
# Open two terminals with `npm run dev`
# Test interactions between multiple clients
```

### 4. Submit a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
2. Open a Pull Request against the `main` branch
3. Fill out the PR template with:
   - Clear description of changes
   - Related issue numbers (if any)
   - Testing steps
   - Screenshots/videos for UI changes

### 5. Code Review

- Respond to feedback constructively
- Make requested changes in new commits
- Once approved, your PR will be merged

## Reporting Exploits

**⚠️ IMPORTANT: Do not publicly disclose exploits!**

If you discover an exploit or security vulnerability:

1. **DO NOT** create a public issue
2. **DO NOT** share details in Discord or other public channels
3. **DO** report privately via [this form](https://forms.gle/your-exploit-form) or email

Contributors who report meaningful, previously unreported, and verified exploits may receive special recognition.

## Style Guidelines

### Rust (Server)

- Follow standard Rust conventions
- Use `cargo fmt` before committing
- Keep files under ~600 lines where practical
- Document public functions and complex logic

### TypeScript (Client)

- Use TypeScript strict mode
- Follow existing component patterns
- Use functional components with hooks
- Keep components focused and reusable

### Commit Messages

Use conventional commit format:
```
feat: Add new crafting recipe system
fix: Resolve inventory duplication bug
docs: Update authentication setup guide
refactor: Extract container logic to shared module
```

## License

By contributing to this project, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE).

**Important:** Contributions become part of the open source codebase. Do not include:
- Proprietary code you don't have rights to share
- Assets with restrictive licenses
- Content that infringes on others' intellectual property

---

Thank you for contributing to Broth & Bullets! 🎮

Questions? Join our [Discord](https://discord.com/channels/1037340874172014652/1395802030169391221/threads/1409306941888397496) or open an issue.

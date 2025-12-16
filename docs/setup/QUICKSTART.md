# Quickstart Guide

Get the 2D multiplayer survival game running locally in under 10 minutes.

## Prerequisites

Before you begin, ensure you have:

| Tool | Version | Installation |
|------|---------|--------------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **Rust** | 1.70+ | [rustup.rs](https://rustup.rs/) |
| **SpacetimeDB CLI** | 1.6+ | See below |

### Install SpacetimeDB CLI

**Windows (PowerShell):**
```powershell
iwr https://windows.spacetimedb.com -useb | iex
```

**macOS/Linux:**
```bash
curl -sSf https://install.spacetimedb.com | sh
```

Verify installation:
```bash
spacetime version
# Should output: spacetimedb-cli 1.6.x
```

## Quick Setup (5 Steps)

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd vibe-coding-starter-pack-2d-multiplayer-survival

# Install client dependencies
cd client
npm install
cd ..
```

### 2. Start Local SpacetimeDB Server

Open a terminal and keep it running:
```bash
spacetime start
```

You should see:
```
Starting SpacetimeDB standalone server...
Server listening on 127.0.0.1:3000
```

### 3. Build & Publish Server Module

In a new terminal:
```bash
# Build the Rust server module
spacetime build --project-path ./server

# Publish to local database
spacetime publish --project-path ./server broth-bullets-local
```

### 4. Generate Client Bindings

```bash
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server
```

### 5. Start Client Dev Server

```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## You're Done! 🎉

You should see the login screen. Create an account or use guest mode to start playing.

---

## Common Commands Reference

### Development Workflow

| Command | Description |
|---------|-------------|
| `spacetime start` | Start local SpacetimeDB server |
| `spacetime build --project-path ./server` | Build server module |
| `spacetime publish --project-path ./server broth-bullets-local` | Publish to local DB |
| `spacetime publish -c --project-path ./server broth-bullets-local` | Publish with data clear |
| `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server` | Regenerate client bindings |
| `npm run dev` | Start client dev server |

### Debugging

| Command | Description |
|---------|-------------|
| `spacetime logs broth-bullets-local` | View server logs |
| `spacetime logs -f broth-bullets-local` | Follow logs in real-time |
| `spacetime sql broth-bullets-local "SELECT * FROM player"` | Query database |

### Database Management

| Command | Description |
|---------|-------------|
| `spacetime list` | List all databases |
| `spacetime delete broth-bullets-local` | Delete database |

## Project Structure

```
├── client/                 # React/TypeScript frontend
│   ├── src/
│   │   ├── generated/      # Auto-generated SpacetimeDB bindings
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   └── contexts/       # React contexts
│   └── package.json
│
├── server/                 # Rust SpacetimeDB module
│   ├── src/
│   │   ├── lib.rs          # Main module entry point
│   │   ├── player.rs       # Player table & reducers
│   │   ├── items.rs        # Item system
│   │   └── ...             # Other game systems
│   └── Cargo.toml
│
└── docs/                   # Documentation
```

## After Server Changes

Whenever you modify server code (`server/src/*.rs`):

```bash
# 1. Build
spacetime build --project-path ./server

# 2. Publish (add -c to clear data if schema changed)
spacetime publish --project-path ./server broth-bullets-local

# 3. Regenerate bindings (if tables/reducers changed)
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server
```

## Troubleshooting

### "Address already in use"
SpacetimeDB server is already running. Kill existing process or use different port.

### "Module not found" errors in client
Regenerate bindings:
```bash
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server
```

### Server build fails
Check Rust is installed and updated:
```bash
rustup update
```

### Client shows blank screen
1. Check browser console for errors
2. Verify SpacetimeDB server is running
3. Verify module is published

### Database connection fails
1. Ensure `spacetime start` is running
2. Check database name matches in `GameConnectionContext.tsx`

## Next Steps

- Read [CLIENT_ARCHITECTURE.md](../architecture/CLIENT_ARCHITECTURE.md) to understand the client
- Read [SERVER_MODULE_ARCHITECTURE.md](../architecture/SERVER_MODULE_ARCHITECTURE.md) for server patterns
- Check [ADDING_NEW_ITEMS.md](../content/ADDING_NEW_ITEMS.md) to add game content

## Environment Variables (Optional)

For production deployment, see [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for:
- OpenAuth configuration
- API keys
- Production SpacetimeDB connection


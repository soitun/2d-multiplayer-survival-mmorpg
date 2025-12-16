# Authentication Flow

This document describes the authentication architecture using OpenAuth for OIDC-based authentication with SpacetimeDB.

## Overview

The game uses a multi-layer authentication flow:
1. **OpenAuth OIDC** - User authentication via social providers
2. **Auth Server** - Token exchange service (backend)
3. **SpacetimeDB** - Game server with identity verification

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  OpenAuth   │────▶│ Auth Server │────▶│ SpacetimeDB │
│   Client    │◀────│   (OIDC)    │◀────│  (Backend)  │◀────│   Server    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## Authentication Layers

### Layer 1: OpenAuth OIDC

Users authenticate via OpenAuth's OIDC flow (Google, Discord, etc.):

```typescript
// AuthContext.tsx
import { createClient } from "@openauthjs/openauth/client";

const authClient = createClient({
    clientID: "broth-bullets-client",
    issuer: import.meta.env.VITE_AUTH_ISSUER_URL
});

// Redirect user to login
const loginRedirect = () => {
    authClient.authorize(
        window.location.origin + "/",  // Redirect back here
        "code"  // Authorization code flow
    );
};
```

### Layer 2: Token Exchange

After OIDC authentication, the access token is exchanged for a SpacetimeDB token:

```typescript
// After receiving OpenAuth callback
const response = await fetch(`${AUTH_SERVER_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        access_token: openAuthAccessToken,
        subject: userProfile.sub
    })
});

const { spacetimeToken } = await response.json();
// spacetimeToken is now used for SpacetimeDB connection
```

### Layer 3: SpacetimeDB Connection

The SpacetimeDB token authenticates the WebSocket connection:

```typescript
// GameConnectionContext.tsx
DbConnection.builder()
    .withUri(SPACETIME_DB_ADDRESS)
    .withModuleName(SPACETIME_DB_NAME)
    .withToken(spacetimeToken)  // Authenticates the connection
    .onConnect((conn, identity) => {
        // identity is derived from the token
        // Used for player registration and authorization
    })
    .build();
```

## Token Lifecycle

### Token Refresh Flow

```typescript
const refreshToken = async () => {
    // 1. Check if current token is expiring
    if (accessToken && isTokenExpiringSoon(accessToken)) {
        // 2. Request refresh from OpenAuth
        const newToken = await authClient.refresh(refreshToken);
        
        // 3. Exchange for new SpacetimeDB token
        const spacetimeToken = await exchangeToken(newToken);
        
        // 4. Reconnect with new token
        reconnectWithToken(spacetimeToken);
    }
};
```

### Token Invalidation

When tokens become invalid:

```typescript
// AuthContext.tsx
const invalidateCurrentToken = useCallback(() => {
    // Clear stored tokens
    localStorage.removeItem('auth_access_token');
    localStorage.removeItem('auth_spacetime_token');
    
    // Reset auth state
    setAccessToken(null);
    setSpacetimeToken(null);
    setIsAuthenticated(false);
    
    // Force re-authentication
    window.location.href = '/';
}, []);
```

## Identity Management

### SpacetimeDB Identity

SpacetimeDB derives a unique `Identity` from the OIDC token:

```
Token Claims (iss, sub) 
    ↓
BLAKE3 Hash
    ↓
32-byte Identity (0xc200...)
```

This identity:
- Is consistent across sessions (same user = same identity)
- Is used as the primary key for player data
- Cannot be spoofed without the correct token

### Player Registration

```typescript
// Client requests registration
connection.reducers.registerPlayer(username);

// Server validates and creates player
#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String) -> Result<(), String> {
    let sender_id = ctx.sender;  // Identity from token
    
    // Check if already registered
    if ctx.db.player().identity().find(&sender_id).is_some() {
        // Player exists - update timestamp and return
        return Ok(());
    }
    
    // Create new player with this identity
    ctx.db.player().insert(Player {
        identity: sender_id,
        username,
        // ... other fields
    });
    
    Ok(())
}
```

## Security Considerations

### Client-Side Security

1. **Token Storage:** Tokens stored in localStorage (acceptable for browser games)
2. **Token Refresh:** Automatic refresh before expiration
3. **Error Recovery:** Invalid tokens trigger re-authentication

### Server-Side Security

1. **Identity Verification:** All reducers verify `ctx.sender`
2. **Scheduled Reducer Protection:** Check `ctx.sender == ctx.identity()`
3. **No Trust of Client Data:** Validate all inputs server-side

```rust
#[spacetimedb::reducer]
pub fn protected_action(ctx: &ReducerContext) -> Result<(), String> {
    // Verify the caller owns this player
    let player = ctx.db.player().identity().find(&ctx.sender)
        .ok_or("Unauthorized")?;
    
    // Now we know ctx.sender is the authenticated player
    // Proceed with action...
    Ok(())
}
```

## Auth State in UI

### AuthContext API

```typescript
const {
    // State
    isAuthenticated,     // Is user logged in?
    isLoading,          // Is auth in progress?
    userProfile,        // OIDC user info
    accessToken,        // OpenAuth token
    spacetimeToken,     // SpacetimeDB token
    
    // Actions
    loginRedirect,      // Start login flow
    logout,             // Clear tokens and logout
    invalidateCurrentToken  // Force re-auth
} = useAuth();
```

### Auth-Aware Rendering

```typescript
// App.tsx
{!isAuthenticated && (
    <LoginScreen handleJoinGame={loginRedirect} />
)}

{isAuthenticated && !localPlayerRegistered && (
    <LoginScreen handleJoinGame={handleAttemptRegisterPlayer} />
)}

{isAuthenticated && localPlayerRegistered && (
    <GameScreen /* ... */ />
)}
```

## Error Handling

### Authentication Errors

```typescript
// Handle auth failures
.onConnectError((context, err) => {
    const errorMessage = err.message;
    
    if (errorMessage.includes('401') || 
        errorMessage.toLowerCase().includes('unauthorized')) {
        // Token is invalid - need to re-authenticate
        invalidateCurrentToken();
    }
});
```

### Registration Errors

```typescript
const handleAttemptRegisterPlayer = async (username: string) => {
    // Layer 1: Check authentication
    if (!isAuthenticated) {
        throw new Error("Authentication required");
    }
    
    // Layer 2: Check SpacetimeDB token
    if (!spacetimeToken) {
        throw new Error("Please sign in again");
    }
    
    // Layer 3: Check connection
    if (!connection || !dbIdentity) {
        throw new Error("Connecting to servers...");
    }
    
    // Attempt registration
    await registerPlayer(username);
};
```

## Environment Configuration

### Development
```env
VITE_AUTH_ISSUER_URL=http://localhost:3001
VITE_AUTH_SERVER_URL=http://localhost:3002
```

### Production
```env
VITE_AUTH_ISSUER_URL=https://auth.yourdomain.com
VITE_AUTH_SERVER_URL=https://api.yourdomain.com
```

## Sequence Diagram

```
User          Browser        OpenAuth       Auth Server      SpacetimeDB
  │              │              │               │                │
  │──Click Login─▶│              │               │                │
  │              │──Redirect────▶│               │                │
  │              │◀──Auth Page───│               │                │
  │──Credentials─▶│              │               │                │
  │              │──Submit──────▶│               │                │
  │              │◀──Code────────│               │                │
  │              │──Token Req───▶│               │                │
  │              │◀──Access Tkn──│               │                │
  │              │──Exchange────────────────────▶│                │
  │              │◀──SpacetimeDB Token───────────│                │
  │              │──Connect with Token──────────────────────────▶│
  │              │◀──Connected + Identity────────────────────────│
  │              │──registerPlayer────────────────────────────────▶│
  │              │◀──Player Data─────────────────────────────────│
  │◀─Game Ready──│              │               │                │
```


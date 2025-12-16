# SpacetimeDB Integration

This document explains how the client connects to and communicates with the SpacetimeDB server.

## Overview

SpacetimeDB provides:
- **Relational Database:** Tables with primary keys, indexes, and constraints
- **Serverless Compute:** Reducers (functions) that run atomically on the server
- **Real-time Sync:** Subscription queries that push updates to clients
- **Generated Bindings:** Type-safe client code auto-generated from server schema

## Connection Architecture

### GameConnectionContext

The `GameConnectionContext` (`client/src/contexts/GameConnectionContext.tsx`) manages the SpacetimeDB connection:

```typescript
// Environment-based configuration
const SPACETIME_DB_ADDRESS = isDevelopment 
  ? 'ws://localhost:3000' 
  : 'wss://maincloud.spacetimedb.com';

const SPACETIME_DB_NAME = isDevelopment
  ? 'broth-bullets-local'
  : 'broth-bullets';
```

### Connection Flow

```
1. AuthContext obtains OpenAuth token
         ↓
2. GameConnectionContext receives spacetimeToken
         ↓
3. DbConnection.builder() creates connection
         ↓
4. .withToken(spacetimeToken) authenticates
         ↓
5. .onConnect() callback fires when connected
         ↓
6. useSpacetimeTables subscribes to data
```

### Connection Builder Pattern

```typescript
const builder = DbConnection.builder()
    .withUri(SPACETIME_DB_ADDRESS)
    .withModuleName(SPACETIME_DB_NAME)
    .withToken(spacetimeToken)
    .onConnect((conn, identity) => {
        // Connection successful
        connectionInstanceRef.current = conn;
        updateConnectionState(ConnectionState.CONNECTED, conn, identity, null);
    })
    .onDisconnect((context, err) => {
        // Handle disconnection
        if (err) {
            // Check for auth errors, schema mismatches
        }
    })
    .onConnectError((context, err) => {
        // Handle connection failures
    });

const connection = builder.build();
```

### Connection States

```typescript
enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting', 
    CONNECTED = 'connected',
    ERROR = 'error'
}
```

## Data Subscriptions

### useSpacetimeTables Hook

The `useSpacetimeTables` hook (`client/src/hooks/useSpacetimeTables.ts`) manages all data subscriptions:

```typescript
export function useSpacetimeTables({ 
    connection, 
    cancelPlacement,
    viewport,
    grassEnabled 
}) {
    // State for each entity type
    const [players, setPlayers] = useState<Map<string, Player>>(() => new Map());
    const [trees, setTrees] = useState<Map<string, Tree>>(() => new Map());
    // ... more entity types

    useEffect(() => {
        if (!connection) return;

        // Subscribe to tables
        connection.db.player.onInsert(handlePlayerInsert);
        connection.db.player.onUpdate(handlePlayerUpdate);
        connection.db.player.onDelete(handlePlayerDelete);
        
        // Subscribe with SQL queries for spatial filtering
        connection.subscription_builder()
            .on_applied(() => console.log('Subscription applied'))
            .subscribe([
                'SELECT * FROM player',
                'SELECT * FROM tree WHERE chunk_x >= ? AND chunk_x <= ?',
                // ... more queries
            ]);

        return () => {
            // Cleanup subscriptions
        };
    }, [connection, viewport]);

    return { players, trees, /* ... */ };
}
```

### Subscription Patterns

#### Full Table Subscriptions
For small, global tables:
```typescript
connection.db.itemDefinition.onInsert(handleInsert);
// Client receives all rows from the table
```

#### Spatial/Chunk-Based Subscriptions
For large, spatial tables:
```typescript
// Only subscribe to entities in visible chunks
const queries = [`
    SELECT * FROM tree 
    WHERE chunk_x >= ${minChunkX} AND chunk_x <= ${maxChunkX}
      AND chunk_y >= ${minChunkY} AND chunk_y <= ${maxChunkY}
`];
```

### Update Handlers

Optimized handlers that only update when relevant fields change:

```typescript
const handlePlayerUpdate = (ctx, oldPlayer, newPlayer) => {
    // Only update state if position or important fields changed
    const changed = oldPlayer.positionX !== newPlayer.positionX ||
                   oldPlayer.positionY !== newPlayer.positionY ||
                   oldPlayer.health !== newPlayer.health;
    
    if (changed) {
        setPlayers(prev => {
            const newMap = new Map(prev);
            newMap.set(newPlayer.identity.toHexString(), newPlayer);
            return newMap;
        });
    }
};
```

## Calling Reducers

### Basic Reducer Call

```typescript
// Fire-and-forget style
connection.reducers.registerPlayer(username);

// With callback for result
connection.reducers.onRegisterPlayer((ctx, submittedUsername) => {
    if (ctx.event?.status?.tag === 'Committed') {
        console.log('Registration successful');
    } else if (ctx.event?.status?.tag === 'Failed') {
        console.error('Registration failed:', ctx.event.status.value);
    }
});
```

### PlayerActionsContext

Commonly used reducers are wrapped in the `PlayerActionsContext`:

```typescript
const PlayerActionsContext = createContext({
    updatePlayerPosition: (x, y, direction, sequence, isSprinting) => {},
    setSprinting: (isSprinting) => {},
    toggleCrouch: () => {},
    updateViewport: (minX, minY, maxX, maxY) => {},
    // ... more actions
});

// Implementation
const updatePlayerPosition = useCallback((x, y, direction, sequence, isSprinting) => {
    if (connection?.reducers) {
        connection.reducers.updatePlayerPositionSimple(x, y, direction, sequence, isSprinting);
    }
}, [connection]);
```

## Generated Bindings

SpacetimeDB generates TypeScript types from the Rust server schema.

### Generating Bindings

```bash
spacetime generate --lang typescript \
    --out-dir ./client/src/generated \
    --project-path ./server
```

### Generated Files

```
client/src/generated/
├── index.ts           # Re-exports all types
├── DbConnection.ts    # Connection class
├── player.ts          # Player table type
├── tree.ts           # Tree table type
├── register_player.ts # Reducer function
└── ...
```

### Using Generated Types

```typescript
import { 
    DbConnection,
    Player,
    Tree,
    ItemDefinition 
} from '../generated';

// Type-safe access
const player: Player = connection.db.player.identity().find(identity);
const trees: Tree[] = Array.from(connection.db.tree.iter());
```

## Authentication

### Token Flow

1. **AuthContext** authenticates user via OpenAuth
2. **auth-server** exchanges OpenAuth token for SpacetimeDB token
3. **GameConnectionContext** uses SpacetimeDB token for connection
4. **SpacetimeDB** validates token and associates identity

### Identity

The SpacetimeDB `Identity` is derived from the OpenAuth credentials:
```typescript
const { dbIdentity } = useGameConnection();
// dbIdentity is a SpacetimeDB Identity representing the authenticated user
```

## Error Handling

### Connection Errors

```typescript
.onConnectError((context, err) => {
    const errorMessage = err.message;
    
    // Check for schema mismatch
    if (errorMessage.includes('Tried to read') && errorMessage.includes('byte(s)')) {
        // Client/server schema mismatch - need to regenerate bindings
    }
    
    // Check for auth errors
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        invalidateCurrentToken();
    }
});
```

### Reducer Errors

```typescript
connection.reducers.onSomeReducer((ctx, ...args) => {
    switch (ctx.event?.status?.tag) {
        case 'Committed':
            // Success
            break;
        case 'Failed':
            // Error message in ctx.event.status.value
            break;
        case 'OutOfEnergy':
            // Server overloaded
            break;
    }
});
```

## Performance Considerations

### 1. Batch Updates
SpacetimeDB batches multiple updates in a single network message:
```typescript
// Multiple inserts from one reducer call arrive together
connection.db.inventoryItem.onInsert(...)  // Called multiple times in rapid succession
```

### 2. Optimistic Updates
The SDK handles optimistic updates automatically - changes are reflected immediately on the caller's client.

### 3. Subscription Scope
Minimize subscription scope for better performance:
```typescript
// Bad: Subscribe to all trees
'SELECT * FROM tree'

// Good: Subscribe to visible trees only
'SELECT * FROM tree WHERE chunk_x BETWEEN ? AND ? AND chunk_y BETWEEN ? AND ?'
```

### 4. Map-Based Storage
Store entities in Maps for O(1) lookup:
```typescript
const [players, setPlayers] = useState<Map<string, Player>>(() => new Map());
// Lookup: players.get(identityHex)
```

## Development vs Production

### Local Development
```bash
# Start local SpacetimeDB server
spacetime start

# Publish module locally
spacetime publish --project-path ./server broth-bullets-local

# Client connects to ws://localhost:3000
```

### Production (Maincloud)
```bash
# Publish to Maincloud
spacetime publish --project-path ./server broth-bullets -s maincloud

# Client connects to wss://maincloud.spacetimedb.com
```


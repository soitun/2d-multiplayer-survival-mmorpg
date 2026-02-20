---
name: Add Missing Indexes
overview: Add missing B-tree indexes on `chunk_index` columns (barrel, sea_stack, wild_animal) and `health` column (grass) to eliminate sequential scans and optimize subscription queries.
todos:
  - id: index-grass-health
    content: "Add #[index(btree)] to health field in grass table"
    status: completed
  - id: index-barrel-chunk
    content: "Add #[index(btree)] to chunk_index field in barrel table"
    status: completed
  - id: index-seastack-chunk
    content: "Add #[index(btree)] to chunk_index field in sea_stack table"
    status: completed
  - id: index-wildanimal-chunk
    content: "Add #[index(btree)] to chunk_index field in wild_animal table"
    status: completed
  - id: build-publish
    content: Build and publish server with new indexes
    status: completed
---

# Add Missing Database Indexes

## Problem

SpacetimeDB notifications indicate 414 subscription queries are using sequential scans on tables missing indexes:

- `grass`: `health` column not indexed (indexed_with_filter scan)
- `barrel`: `chunk_index` column not indexed (sequential scan)
- `sea_stack`: `chunk_index` column not indexed (sequential scan)
- `wild_animal`: `chunk_index` column not indexed (sequential scan)

## Solution

Add `#[index(btree)]` attributes to the specified columns.

## Changes

### 1. [server/src/grass.rs](server/src/grass.rs)

Add index on `health` field (line 126):

```rust
// Before:
pub health: u32,

// After:
#[index(btree)]
pub health: u32,
```



### 2. [server/src/barrel.rs](server/src/barrel.rs)

Add index on `chunk_index` field (line 86):

```rust
// Before:
pub chunk_index: u32,

// After:
#[index(btree)]
pub chunk_index: u32,
```



### 3. [server/src/sea_stack.rs](server/src/sea_stack.rs)

Add index on `chunk_index` field (line 21):

```rust
// Before:
pub chunk_index: u32,

// After:
#[index(btree)]
pub chunk_index: u32,
```



### 4. [server/src/wild_animal_npc/core.rs](server/src/wild_animal_npc/core.rs)

Add index on `chunk_index` field (line 213):

```rust
// Before:
pub chunk_index: u32, // For spatial optimization

// After:
#[index(btree)]
pub chunk_index: u32, // For spatial optimization
```



## Deployment

After making changes:

1. Build: `spacetime build --project-path ./server`
2. Publish (clears data): `spacetime publish -c --project-path ./server broth-bullets-local`
3. Regenerate bindings: `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server`
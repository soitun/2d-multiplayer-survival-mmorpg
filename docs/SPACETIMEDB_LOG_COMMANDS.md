# SpacetimeDB Log Commands Reference

Quick reference guide for querying and filtering SpacetimeDB server logs. Useful for debugging, monitoring entity counts, and tracking game events.

## Basic Log Commands

### View All Logs
```powershell
# View all logs (streaming, like tail -f)
spacetime logs broth-bullets-local

# View last N lines
spacetime logs -n 100 broth-bullets-local

# Follow logs in real-time
spacetime logs -f broth-bullets-local
```

### Filter by Pattern (Case-Insensitive)
```powershell
# Search for any mention of "cairn" (case-insensitive)
spacetime logs broth-bullets-local | Select-String -Pattern "cairn" -CaseSensitive:$false

# Search for "player" mentions
spacetime logs broth-bullets-local | Select-String -Pattern "player" -CaseSensitive:$false

# Search for errors only
spacetime logs broth-bullets-local | Select-String -Pattern "error|ERROR|Error" -CaseSensitive:$false
```

## Entity Count Queries

### Count Entities by Type

```powershell
# Count cairns spawned
spacetime logs broth-bullets-local | Select-String -Pattern "Spawned cairn" | Measure-Object -Line

# Count trees seeded
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Trees|Trees already exist" | Measure-Object -Line

# Count stones seeded
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Stones|Stones already exist" | Measure-Object -Line

# Count players connected
spacetime logs broth-bullets-local | Select-String -Pattern "Client connected|identity" | Measure-Object -Line

# Count wild animals spawned
spacetime logs broth-bullets-local | Select-String -Pattern "Spawning.*wild_animal|Spawned.*at.*group member" | Measure-Object -Line
```

### Get Entity Spawn Summary

```powershell
# Get cairn spawn summary (shows total spawned vs target)
spacetime logs broth-bullets-local | Select-String -Pattern "Finished seeding cairns" -CaseSensitive:$false

# Get environment seeding summary
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding environment|Environment already fully seeded" -CaseSensitive:$false

# Get tree seeding summary
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Trees|Trees already exist" -CaseSensitive:$false
```

## Specific Entity Searches

### Cairns
```powershell
# Find all cairn spawns with positions
spacetime logs broth-bullets-local | Select-String -Pattern "Spawned cairn.*at" -CaseSensitive:$false

# Find cairn seeding summary
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding.*cairns|Finished seeding cairns" -CaseSensitive:$false

# Find specific cairn lore IDs
spacetime logs broth-bullets-local | Select-String -Pattern "lore_id: cairn_" -CaseSensitive:$false
```

### Trees
```powershell
# Find tree seeding operations
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Trees|Trees already exist" -CaseSensitive:$false

# Find dense forest cluster seeding
spacetime logs broth-bullets-local | Select-String -Pattern "dense forest clusters" -CaseSensitive:$false
```

### Stones
```powershell
# Find stone seeding operations
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Stones|Stones already exist" -CaseSensitive:$false

# Find quarry entity seeding (stones, fumaroles, basalt columns)
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Quarry Entities|Finished seeding quarry entities" -CaseSensitive:$false
```

### Players
```powershell
# Find player connections
spacetime logs broth-bullets-local | Select-String -Pattern "Client connected|identity" -CaseSensitive:$false

# Find player disconnections
spacetime logs broth-bullets-local | Select-String -Pattern "Client disconnected" -CaseSensitive:$false

# Find player actions (customize based on your reducer names)
spacetime logs broth-bullets-local | Select-String -Pattern "move_player|interact" -CaseSensitive:$false
```

### Wild Animals
```powershell
# Find wild animal spawning
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Wild Animals|Spawning.*wild_animal" -CaseSensitive:$false

# Find specific animal spawns with positions
spacetime logs broth-bullets-local | Select-String -Pattern "Spawned.*at.*group member" -CaseSensitive:$false
```

### Harvestable Resources
```powershell
# Find harvestable resource seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Harvestable Resources|Seeding.*plant_type" -CaseSensitive:$false

# Find specific plant type seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding.*berry|Seeding.*mushroom" -CaseSensitive:$false
```

### Grass & Foliage
```powershell
# Find grass seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Grass|Seeding Tundra Grass|Seeding Alpine Grass" -CaseSensitive:$false

# Find water foliage seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Water Foliage|Water Foliage spawning" -CaseSensitive:$false
```

### Barrels & Sea Stacks
```powershell
# Find sea stack seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Sea Stacks" -CaseSensitive:$false

# Find barrel spawning (sea, beach, road barrels)
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Sea Barrels|Seeding Beach Barrels|Seeding Barrels on dirt roads" -CaseSensitive:$false

# Find barrel spawn counts
spacetime logs broth-bullets-local | Select-String -Pattern "Successfully spawned.*barrels" -CaseSensitive:$false
```

### Clouds
```powershell
# Find cloud seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Clouds" -CaseSensitive:$false
```

### Rune Stones
```powershell
# Find rune stone seeding
spacetime logs broth-bullets-local | Select-String -Pattern "Seeding Rune Stones" -CaseSensitive:$false

# Find rune stone loot generation
spacetime logs broth-bullets-local | Select-String -Pattern "Generated seed loot table for.*rune stone" -CaseSensitive:$false
```

## Error & Warning Searches

```powershell
# Find all errors
spacetime logs broth-bullets-local | Select-String -Pattern "ERROR|error|Error" -CaseSensitive:$false

# Find all warnings
spacetime logs broth-bullets-local | Select-String -Pattern "WARN|warn|Warn|warning|Warning" -CaseSensitive:$false

# Find critical errors (system failures)
spacetime logs broth-bullets-local | Select-String -Pattern "CRITICAL|⚠️" -CaseSensitive:$false

# Find constraint violations
spacetime logs broth-bullets-local | Select-String -Pattern "constraint|violation|ConstraintViolation" -CaseSensitive:$false
```

## System Initialization

```powershell
# Find init reducer logs
spacetime logs broth-bullets-local | Select-String -Pattern "init_module|Database Initializing" -CaseSensitive:$false

# Find schedule initialization
spacetime logs broth-bullets-local | Select-String -Pattern "schedule initialized|schedule insertion" -CaseSensitive:$false

# Find system startup issues
spacetime logs broth-bullets-local | Select-String -Pattern "DISABLED|Failed to initialize" -CaseSensitive:$false
```

## Advanced Filtering

### Multiple Patterns (OR)
```powershell
# Search for multiple entity types
spacetime logs broth-bullets-local | Select-String -Pattern "cairn|tree|stone" -CaseSensitive:$false

# Search for multiple events
spacetime logs broth-bullets-local | Select-String -Pattern "connected|disconnected|spawned" -CaseSensitive:$false
```

### Extract Specific Information
```powershell
# Extract cairn positions only
spacetime logs broth-bullets-local | Select-String -Pattern "Spawned cairn.*at" | ForEach-Object { $_ -match '\(([^)]+)\)' | Out-Null; $matches[1] }

# Extract entity counts from summaries
spacetime logs broth-bullets-local | Select-String -Pattern "Total:|target:" -CaseSensitive:$false
```

### Time-Based Filtering
```powershell
# Get logs from last 10 minutes (requires timestamp parsing)
spacetime logs -n 1000 broth-bullets-local | Select-String -Pattern "2025-12-11T21:" -CaseSensitive:$false
```

## Useful PowerShell Aliases

Add these to your PowerShell profile (`$PROFILE`) for quick access:

```powershell
# Alias for viewing logs
function st-logs { spacetime logs $args }
Set-Alias -Name stlogs -Value st-logs

# Alias for filtering logs
function st-grep { spacetime logs broth-bullets-local | Select-String -Pattern $args[0] -CaseSensitive:$false }
Set-Alias -Name stgrep -Value st-grep

# Count entities in logs
function st-count { spacetime logs broth-bullets-local | Select-String -Pattern $args[0] -CaseSensitive:$false | Measure-Object -Line }
Set-Alias -Name stcount -Value st-count
```

## Common Use Cases

### Check if Environment is Fully Seeded
```powershell
spacetime logs broth-bullets-local | Select-String -Pattern "Environment already fully seeded|Seeding environment" -CaseSensitive:$false
```

### Verify Entity Counts Match Targets
```powershell
# Check cairn count
spacetime logs broth-bullets-local | Select-String -Pattern "Finished seeding cairns" -CaseSensitive:$false

# Check tree count (if logged)
spacetime logs broth-bullets-local | Select-String -Pattern "Trees.*Total|Seeding Trees" -CaseSensitive:$false
```

### Debug Spawn Failures
```powershell
# Find failed spawns
spacetime logs broth-bullets-local | Select-String -Pattern "Failed to insert|Failed to spawn" -CaseSensitive:$false

# Find spawn attempts vs successes
spacetime logs broth-bullets-local | Select-String -Pattern "Attempts:|Total:" -CaseSensitive:$false
```

### Monitor Player Activity
```powershell
# Recent player connections
spacetime logs -n 50 broth-bullets-local | Select-String -Pattern "Client connected" -CaseSensitive:$false

# Player actions (customize reducer names)
spacetime logs -n 100 broth-bullets-local | Select-String -Pattern "move_player|interact|craft" -CaseSensitive:$false
```

## Tips

1. **Use `-n` flag** to limit output when searching through large log files
2. **Combine with `Measure-Object -Line`** to count occurrences
3. **Use `-CaseSensitive:$false`** for case-insensitive searches (default in PowerShell)
4. **Pipe to `Out-File`** to save filtered logs: `spacetime logs broth-bullets-local | Select-String -Pattern "error" > errors.txt`
5. **Use `-Context` parameter** to see surrounding lines: `Select-String -Pattern "error" -Context 2,2`

## Database Query Alternative

For entity counts, you can also use SQL queries directly:

```powershell
# Count entities in database (more accurate than log parsing)
spacetime sql broth-bullets-local "SELECT COUNT(*) FROM cairn"
spacetime sql broth-bullets-local "SELECT COUNT(*) FROM tree"
spacetime sql broth-bullets-local "SELECT COUNT(*) FROM stone"
spacetime sql broth-bullets-local "SELECT COUNT(*) FROM player"
spacetime sql broth-bullets-local "SELECT COUNT(*) FROM wild_animal"
```

See [spacetimedb-workflow.mdc](.cursor/rules/spacetimedb-workflow.mdc) for more SQL query examples.

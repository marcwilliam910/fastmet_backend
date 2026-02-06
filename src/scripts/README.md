# Index Synchronization Script

This script syncs MongoDB indexes with your current model definitions.

## What it does

- ✅ Creates missing indexes from your models
- ❌ Removes old indexes that are no longer defined in your models
- ✓ Keeps indexes that match your current model definitions

## Usage

Run the sync script:

```bash
npm run sync-indexes
```

Or directly with ts-node:

```bash
ts-node src/scripts/syncIndexes.ts
```

## Important Notes

⚠️ **This script will modify your database indexes!**

- Old indexes that don't match your model definitions will be **dropped**
- New indexes from your models will be **created**
- The script will show you exactly what indexes are being added and removed

## Example Output

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB

🔄 Starting index synchronization...

📋 Syncing indexes for: Booking
  ❌ Dropped 2 old index(es): [ 'old_index_1', 'old_index_2' ]
  ✅ Added 3 new index(es): [ 'customerId_1_status_1_createdAt_-1', 'driverId_1_status_1', ... ]
  
📋 Syncing indexes for: User
  ✓ Indexes are already in sync

✅ Index synchronization completed!
```

## When to Run

Run this script when:
- You've added new indexes to your models
- You've removed indexes from your models
- You want to clean up old/unused indexes
- After deploying model changes to production

## Safety

The script uses Mongoose's built-in `syncIndexes()` method, which is safe and will:
- Not drop indexes that are still defined in your models
- Only create indexes that are explicitly defined
- Handle unique constraints properly

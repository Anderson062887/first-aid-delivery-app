// server/scripts/backfillDeliveryRep.js
// Fills in the rep account on deliveries saved before deliveries stored it.
// Dry run by default; pass --apply to write.
//   node scripts/backfillDeliveryRep.js          # show what would change
//   node scripts/backfillDeliveryRep.js --apply  # write it
import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db.js';
import { backfillDeliveryRep } from '../src/maintenance/backfillDeliveryRep.js';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');

  await connectDB();
  const r = await backfillDeliveryRep({ apply });
  await disconnectDB();

  console.log(apply ? 'Updated:' : 'Dry run (nothing written). Would update:');
  console.log(`  ${r.fromVisit} deliveries from their visit's rep`);
  console.log(`  ${r.fromName} visit-less deliveries by matching the rep name`);
  if (r.visitMissing.length) {
    console.log(`Skipped ${r.visitMissing.length} deliveries whose visit no longer exists`);
  }
  for (const u of r.unresolved) {
    console.log(`Skipped ${u.deliveries} deliveries named "${u.repName}": ${u.reason}`);
  }
  if (!apply) console.log('Run again with --apply to write these changes.');
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDB().catch(() => {});
  process.exit(1);
});

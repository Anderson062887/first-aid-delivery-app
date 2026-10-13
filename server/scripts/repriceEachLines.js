// server/scripts/repriceEachLines.js
// Corrects deliveries saved before the pricing fix, where "each" lines were
// charged the full case price per unit. Dry run by default.
//   node scripts/repriceEachLines.js          # list what would change
//   node scripts/repriceEachLines.js --apply  # write it
import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db.js';
import { repriceEachLines } from '../src/maintenance/repriceEachLines.js';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');

  await connectDB();
  const r = await repriceEachLines({ apply });
  await disconnectDB();

  console.log(apply ? 'Repriced:' : 'Dry run (nothing written). Would reprice:');
  for (const c of r.changes) {
    const when = c.deliveredAt ? new Date(c.deliveredAt).toISOString().slice(0, 10) : '';
    console.log(`  ${when}  ${c.location}  ${c.repName}  delivery ${c.delivery}: $${c.oldTotal.toFixed(2)} -> $${c.newTotal.toFixed(2)}`);
  }
  console.log(`${r.changes.length} deliveries, overcharged by $${r.overcharged.toFixed(2)} in total.`);

  if (r.unsure.length) {
    console.log(`\n${r.unsure.length} "each" lines left alone because the item's price changed since (check by hand):`);
    for (const u of r.unsure) {
      console.log(`  delivery ${u.delivery}: ${u.item} charged $${u.unitPrice} each; now $${u.pricePerPack} per ${u.unitsPerPack}`);
    }
  }
  if (!apply && r.changes.length) console.log('\nRun again with --apply to write these changes.');
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDB().catch(() => {});
  process.exit(1);
});

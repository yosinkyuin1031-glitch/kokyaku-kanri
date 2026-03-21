const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://postgres:fJZj8SDawfJze7H9@db.vzkfkazjylrkspqrnhnx.supabase.co:5432/postgres');
  await client.connect();

  console.log('=== Search for 山下 ===');
  const r1 = await client.query("SELECT id, name, furigana FROM cm_patients WHERE name LIKE '%山下%'");
  console.table(r1.rows);

  console.log('=== Search for 申 ===');
  const r2 = await client.query("SELECT id, name, furigana FROM cm_patients WHERE name LIKE '%申%'");
  console.table(r2.rows);

  console.log('=== Orphaned slips ===');
  const r3 = await client.query("SELECT id, patient_name, visit_date, total_price FROM cm_slips WHERE patient_id IS NULL ORDER BY patient_name");
  console.table(r3.rows);

  // Now try to match orphaned slips
  if (r3.rows.length > 0) {
    for (const slip of r3.rows) {
      const name = slip.patient_name;
      if (!name) continue;
      
      // Try exact match first
      let match = await client.query("SELECT id, name FROM cm_patients WHERE name = $1", [name]);
      
      if (match.rows.length === 0) {
        // Try partial: extract last name (first 1-3 chars before common name patterns)
        // Or just search if any patient name contains part of this name or vice versa
        const lastName = name.substring(0, Math.min(name.length, 3));
        match = await client.query("SELECT id, name FROM cm_patients WHERE name LIKE $1 || '%'", [lastName]);
        console.log(`Partial match for "${name}" using "${lastName}%":`, match.rows);
      }
      
      if (match.rows.length === 1) {
        console.log(`>>> Linking slip ${slip.id} ("${name}") -> patient ${match.rows[0].id} ("${match.rows[0].name}")`);
        await client.query("UPDATE cm_slips SET patient_id = $1 WHERE id = $2", [match.rows[0].id, slip.id]);
      } else if (match.rows.length > 1) {
        console.log(`Multiple matches for "${name}", skipping:`, match.rows);
      } else {
        console.log(`No match found for "${name}"`);
      }
    }
    
    // Verify remaining orphans
    console.log('\n=== Remaining orphaned slips ===');
    const remaining = await client.query("SELECT id, patient_name, visit_date FROM cm_slips WHERE patient_id IS NULL");
    console.table(remaining.rows);
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });

const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://postgres:fJZj8SDawfJze7H9@db.vzkfkazjylrkspqrnhnx.supabase.co:5432/postgres');
  await client.connect();

  // The orphaned slip has "山下哲子" but the patient is "山下　哲子" (with full-width space)
  // Match by removing spaces
  const match = await client.query("SELECT id, name FROM cm_patients WHERE REPLACE(REPLACE(name, '　', ''), ' ', '') = '山下哲子'");
  console.log('Match result:', match.rows);

  if (match.rows.length === 1) {
    const patientId = match.rows[0].id;
    const slipId = '3db84b64-7572-4073-a0cb-c5483403ed53';
    console.log(`Linking slip ${slipId} ("山下哲子") -> patient ${patientId} ("${match.rows[0].name}")`);
    await client.query("UPDATE cm_slips SET patient_id = $1 WHERE id = $2", [patientId, slipId]);
    console.log('Done!');
  }

  // Final check
  const remaining = await client.query("SELECT id, patient_name FROM cm_slips WHERE patient_id IS NULL");
  console.log('Remaining orphaned slips:', remaining.rows.length === 0 ? 'None' : remaining.rows);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });

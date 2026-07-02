/**
 * Quick programmatic verification of the tracking-number conditional
 * validation. Run with:  npx ts-node scripts/test-tracking.ts
 */
import { createCargoSchema } from "../src/validators/cargo.validator";

async function check(label: string, input: any) {
  try {
    const result = await createCargoSchema.validate(input, { abortEarly: false });
    const trimmed = result.trackingNumber === undefined ? "auto-generated" : JSON.stringify(result.trackingNumber);
    console.log(`  ✓ ${label.padEnd(45)} → trackingNumber=${trimmed}`);
  } catch (err: any) {
    const fields = err.inner?.map((e: any) => `${e.path}: ${e.message}`).join("; ") || err.message;
    console.log(`  ✗ ${label.padEnd(45)} → ${fields}`);
  }
}

const baseInput = {
  title: "Test Cargo",
  senderName: "Sender Co",
  receiverName: "Receiver Co",
  origin: "New York, NY",
  destination: "Los Angeles, CA",
};

(async () => {
  console.log("\n=== Tracking-number conditional validation ===\n");
  console.log("These inputs SHOULD pass (empty/undefined → backend auto-generates):");
  await check("undefined",                       { ...baseInput });
  await check("empty string ''",                 { ...baseInput, trackingNumber: "" });
  await check("whitespace-only '   '",           { ...baseInput, trackingNumber: "   " });
  await check("null",                            { ...baseInput, trackingNumber: null });

  console.log("\nThese inputs SHOULD pass (valid tracking numbers):");
  await check("'CT-XYZ'",                        { ...baseInput, trackingNumber: "CT-XYZ" });
  await check("'A1B2C3D4E5F6'",                  { ...baseInput, trackingNumber: "A1B2C3D4E5F6" });

  console.log("\nThese inputs SHOULD fail (validation rules apply):");
  await check("'AB' (too short, <4 chars)",      { ...baseInput, trackingNumber: "AB" });
  await check("'CT XYZ!' (invalid chars)",        { ...baseInput, trackingNumber: "CT XYZ!" });
  await check("51 chars (too long)",             { ...baseInput, trackingNumber: "A".repeat(51) });
})();

interface RegistrySyncUpdates {
  status?: string;
  water_source?: string;
  authorized_activity?: string;
  volume_or_area?: string;
  location?: string;
  issuance_date?: string;
  expiration_date?: string;
  permit_holder?: string;
  latitude?: number;
  longitude?: number;
  duration?: string;
  contact?: string;
  method_of_water_taking?: string;
  regime?: string;
}

/**
 * Forward-sync permit data into the `permit_registry` table.
 *
 * Looks up the registry row by `permit_number` (exact then case-insensitive).
 * If a matching row exists it is updated; otherwise the call is a no-op -- we
 * never force-insert system permits into the historical registry.
 */
export async function syncPermitToRegistry(
  supabaseClient: { from: (table: string) => any },
  permitNumber: string,
  updates: RegistrySyncUpdates
): Promise<{ synced: boolean; error?: string }> {
  try {
    if (!permitNumber?.trim()) {
      return { synced: false, error: "Empty permit number" };
    }

    const trimmed = permitNumber.trim();

    // Find ALL matching rows (exact match first, then case-insensitive fallback)
    let matches: { id: string; permit_number: string }[] = [];

    const { data: exact, error: exactErr } = await supabaseClient
      .from("permit_registry")
      .select("id, permit_number")
      .eq("permit_number", trimmed);

    if (!exactErr && exact && exact.length > 0) {
      matches = exact;
    } else {
      const { data: fuzzy, error: fuzzyErr } = await supabaseClient
        .from("permit_registry")
        .select("id, permit_number")
        .ilike("permit_number", trimmed);

      if (!fuzzyErr && fuzzy && fuzzy.length > 0) {
        matches = fuzzy;
      }
    }

    if (matches.length === 0) {
      return { synced: false };
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.status) payload.status = updates.status;
    if (updates.water_source) payload.water_source = updates.water_source;
    if (updates.authorized_activity) payload.authorized_activity = updates.authorized_activity;
    if (updates.volume_or_area) payload.volume_or_area = updates.volume_or_area;
    if (updates.location) payload.location = updates.location;
    if (updates.issuance_date) payload.issuance_date = updates.issuance_date;
    if (updates.expiration_date) payload.expiration_date = updates.expiration_date;
    if (updates.permit_holder) payload.permit_holder = updates.permit_holder;
    if (updates.latitude != null && Number.isFinite(updates.latitude)) payload.latitude = updates.latitude;
    if (updates.longitude != null && Number.isFinite(updates.longitude)) payload.longitude = updates.longitude;
    if (updates.duration) payload.duration = updates.duration;
    if (updates.contact) payload.contact = updates.contact;
    if (updates.method_of_water_taking) payload.method_of_water_taking = updates.method_of_water_taking;
    if (updates.regime) payload.regime = updates.regime;

    const matchIds = matches.map((r) => r.id);
    let updateErr: { message?: string } | null = null;
    const guardedUpdate = await supabaseClient
      .from("permit_registry")
      .update(payload)
      .in("id", matchIds)
      .is("manually_edited_at", null)
      .is("deleted_at", null);
    updateErr = guardedUpdate.error;

    // Backward compatibility before migration is run.
    if (updateErr?.message?.includes("manually_edited_at") || updateErr?.message?.includes("deleted_at")) {
      console.warn("⚠️ permit-registry-sync: missing edit/delete columns, using legacy sync behavior");
      const legacyUpdate = await supabaseClient
        .from("permit_registry")
        .update(payload)
        .in("id", matchIds);
      updateErr = legacyUpdate.error;
    }

    if (updateErr) {
      console.warn("⚠️ permit-registry-sync: update error", updateErr.message);
      return { synced: false, error: updateErr.message };
    }

    console.log(`✅ permit-registry-sync: updated ${matches.length} registry row(s) for`, matches[0].permit_number);
    return { synced: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("⚠️ permit-registry-sync: unexpected error", msg);
    return { synced: false, error: msg };
  }
}

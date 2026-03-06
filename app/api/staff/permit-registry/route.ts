import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const regime = searchParams.get("regime") || "all";
    const status = searchParams.get("status") || "all";
    const sortBy = searchParams.get("sort_by") || "serial_number";
    const sortDir = searchParams.get("sort_dir") === "desc" ? false : true;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const validSortColumns = [
      "serial_number",
      "permit_holder",
      "permit_number",
      "issuance_date",
      "expiration_date",
      "status",
      "regime",
    ];
    const column = validSortColumns.includes(sortBy) ? sortBy : "serial_number";
    const orderDir = sortDir ? "asc" : "desc";
    const where: string[] = [];
    const values: unknown[] = [];
    const p = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (regime && regime !== "all") where.push(`lower(coalesce(regime, '')) = lower(${p(regime)})`);
    if (status && status !== "all") where.push(`upper(coalesce(status, '')) = ${p(status.toUpperCase())}`);
    if (q) {
      const term = `%${q}%`;
      const pv = p(term);
      where.push(
        `(lower(permit_holder) like ${pv} or lower(permit_number) like ${pv} or lower(location) like ${pv} or lower(water_source) like ${pv} or lower(authorized_activity) like ${pv})`
      );
    }
    const whereSql = where.length ? `and ${where.join(" and ")}` : "";

    const baseCte = `
      with unified as (
        select
          pr.id,
          pr.serial_number,
          pr.permit_holder,
          pr.permit_number,
          pr.regime,
          pr.water_source,
          pr.volume_or_area,
          pr.method_of_water_taking,
          pr.authorized_activity,
          pr.location,
          pr.latitude,
          pr.longitude,
          pr.issuance_date,
          pr.duration,
          pr.expiration_date,
          upper(coalesce(pr.status, 'OPERATIONAL')) as status,
          pr.contact,
          pr.created_at,
          pr.updated_at,
          'registry'::text as source_kind
        from public.permit_registry pr

        union all

        select
          p.id,
          null::integer as serial_number,
          coalesce(a.project_title, 'Unknown Permit Holder') as permit_holder,
          p.permit_number::text as permit_number,
          case
            when geometrytype(coalesce(p.coordinates, a.coordinates)) in ('POLYGON', 'MULTIPOLYGON') then 'Concession'
            else 'Authorization'
          end as regime,
          p.water_source::text as water_source,
          null::text as volume_or_area,
          null::text as method_of_water_taking,
          a.project_description as authorized_activity,
          concat_ws(', ', a.district, a.province::text) as location,
          case
            when coalesce(p.coordinates, a.coordinates) is null then null
            else st_y(st_centroid(coalesce(p.coordinates, a.coordinates)))
          end as latitude,
          case
            when coalesce(p.coordinates, a.coordinates) is null then null
            else st_x(st_centroid(coalesce(p.coordinates, a.coordinates)))
          end as longitude,
          p.issued_date as issuance_date,
          null::text as duration,
          p.expiry_date as expiration_date,
          case
            when p.status = 'expired'::permit_status then 'EXPIRED'
            when p.status = 'expiring_soon'::permit_status then 'EXPIRING_SOON'
            when p.status = 'suspended'::permit_status then 'SUSPENDED'
            when p.status = 'revoked'::permit_status then 'REVOKED'
            else 'OPERATIONAL'
          end as status,
          null::text as contact,
          p.created_at,
          p.updated_at,
          'permit'::text as source_kind
        from public.permits p
        join public.applications a on a.id = p.application_id
        where p.permit_number is not null
      ),
      merged as (
        select
          coalesce(
            max(u.id::text) filter (where u.source_kind = 'registry'),
            max(u.id::text) filter (where u.source_kind = 'permit')
          )::uuid as id,
          max(u.serial_number) filter (where u.source_kind = 'registry') as serial_number,
          coalesce(
            max(u.permit_holder) filter (where u.source_kind = 'registry'),
            max(u.permit_holder) filter (where u.source_kind = 'permit')
          ) as permit_holder,
          u.permit_number,
          coalesce(
            max(u.regime) filter (where u.source_kind = 'registry'),
            max(u.regime) filter (where u.source_kind = 'permit')
          ) as regime,
          coalesce(
            max(u.water_source) filter (where u.source_kind = 'registry'),
            max(u.water_source) filter (where u.source_kind = 'permit')
          ) as water_source,
          coalesce(
            max(u.volume_or_area) filter (where u.source_kind = 'registry'),
            max(u.volume_or_area) filter (where u.source_kind = 'permit')
          ) as volume_or_area,
          coalesce(
            max(u.method_of_water_taking) filter (where u.source_kind = 'registry'),
            max(u.method_of_water_taking) filter (where u.source_kind = 'permit')
          ) as method_of_water_taking,
          coalesce(
            max(u.authorized_activity) filter (where u.source_kind = 'registry'),
            max(u.authorized_activity) filter (where u.source_kind = 'permit')
          ) as authorized_activity,
          coalesce(
            max(u.location) filter (where u.source_kind = 'registry'),
            max(u.location) filter (where u.source_kind = 'permit')
          ) as location,
          coalesce(
            max(u.latitude) filter (where u.source_kind = 'registry'),
            max(u.latitude) filter (where u.source_kind = 'permit')
          ) as latitude,
          coalesce(
            max(u.longitude) filter (where u.source_kind = 'registry'),
            max(u.longitude) filter (where u.source_kind = 'permit')
          ) as longitude,
          coalesce(
            max(u.issuance_date) filter (where u.source_kind = 'registry'),
            max(u.issuance_date) filter (where u.source_kind = 'permit')
          ) as issuance_date,
          coalesce(
            max(u.duration) filter (where u.source_kind = 'registry'),
            max(u.duration) filter (where u.source_kind = 'permit')
          ) as duration,
          coalesce(
            max(u.expiration_date) filter (where u.source_kind = 'registry'),
            max(u.expiration_date) filter (where u.source_kind = 'permit')
          ) as expiration_date,
          coalesce(
            max(u.status) filter (where u.source_kind = 'registry'),
            max(u.status) filter (where u.source_kind = 'permit')
          ) as status,
          coalesce(
            max(u.contact) filter (where u.source_kind = 'registry'),
            max(u.contact) filter (where u.source_kind = 'permit')
          ) as contact,
          coalesce(
            max(u.created_at) filter (where u.source_kind = 'registry'),
            max(u.created_at) filter (where u.source_kind = 'permit')
          ) as created_at,
          coalesce(
            max(u.updated_at) filter (where u.source_kind = 'registry'),
            max(u.updated_at) filter (where u.source_kind = 'permit')
          ) as updated_at,
          (
            jsonb_agg(
              jsonb_build_object(
                'permit_holder', u.permit_holder,
                'regime', u.regime,
                'water_source', u.water_source,
                'volume_or_area', u.volume_or_area,
                'method_of_water_taking', u.method_of_water_taking,
                'authorized_activity', u.authorized_activity,
                'location', u.location,
                'latitude', u.latitude,
                'longitude', u.longitude,
                'issuance_date', u.issuance_date,
                'duration', u.duration,
                'expiration_date', u.expiration_date,
                'status', u.status,
                'contact', u.contact
              )
              order by u.updated_at desc nulls last
            )
          filter (where u.source_kind = 'registry')) -> 0 as registry_values,
          (
            jsonb_agg(
              jsonb_build_object(
                'permit_holder', u.permit_holder,
                'regime', u.regime,
                'water_source', u.water_source,
                'volume_or_area', u.volume_or_area,
                'method_of_water_taking', u.method_of_water_taking,
                'authorized_activity', u.authorized_activity,
                'location', u.location,
                'latitude', u.latitude,
                'longitude', u.longitude,
                'issuance_date', u.issuance_date,
                'duration', u.duration,
                'expiration_date', u.expiration_date,
                'status', u.status,
                'contact', u.contact
              )
              order by u.updated_at desc nulls last
            )
          filter (where u.source_kind = 'permit')) -> 0 as permit_values
        from unified u
        group by u.permit_number
      )
    `;

    const totalRes = await query<{ count: string }>(
      `
      ${baseCte}
      select count(*)::text as count
      from merged
      where 1 = 1
      ${whereSql}
      `,
      values
    );

    const pageValues = [...values];
    pageValues.push(offset);
    const offsetParam = `$${pageValues.length}`;
    pageValues.push(limit);
    const limitParam = `$${pageValues.length}`;

    const pageRes = await query(
      `
      ${baseCte}
      select
        id,
        serial_number,
        permit_holder,
        permit_number,
        regime,
        water_source,
        volume_or_area,
        method_of_water_taking,
        authorized_activity,
        location,
        latitude,
        longitude,
        issuance_date,
        duration,
        expiration_date,
        status,
        contact,
        created_at,
        updated_at,
        registry_values,
        permit_values
      from merged
      where 1 = 1
      ${whereSql}
      order by ${column} ${orderDir} nulls last
      offset ${offsetParam} limit ${limitParam}
      `,
      pageValues
    );
    const count = Number(totalRes.rows[0]?.count || "0");
    const data = pageRes.rows;

    return NextResponse.json({
      items: data || [],
      total: count ?? 0,
      pagination: { limit, offset, returned: (data || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

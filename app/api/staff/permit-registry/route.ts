import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

const EMPTY_RESULT = {
  items: [],
  total: 0,
  summary: { total: 0, operational: 0, expired: 0, expiringSoon: 0, regimeTypes: 0 },
  pagination: { limit: 50, offset: 0, returned: 0 },
};

async function detectSchema(): Promise<{
  hasRegistry: boolean;
  hasPermits: boolean;
  hasApplications: boolean;
  hasDocColumns: boolean;
  hasPostGIS: boolean;
}> {
  const [tablesRes, extRes] = await Promise.all([
    query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('permit_registry', 'permits', 'applications')`
    ),
    query<{ n: string }>(
      `select count(*)::text as n from pg_extension where extname = 'postgis'`
    ),
  ]);

  const tables = new Set(tablesRes.rows.map((r) => r.table_name));
  const hasRegistry = tables.has("permit_registry");

  let hasDocColumns = false;
  if (hasRegistry) {
    const docRes = await query<{ present: string }>(
      `select count(*)::text as present
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'permit_registry'
         and column_name in (
           'uploaded_doc_path','uploaded_doc_name',
           'uploaded_doc_mime_type','uploaded_doc_uploaded_at'
         )`
    );
    hasDocColumns = Number(docRes.rows[0]?.present || "0") === 4;
  }

  return {
    hasRegistry,
    hasPermits: tables.has("permits"),
    hasApplications: tables.has("applications"),
    hasDocColumns,
    hasPostGIS: Number(extRes.rows[0]?.n || "0") > 0,
  };
}

function buildRegistrySelect(hasDocColumns: boolean): string {
  const docSelect = hasDocColumns
    ? `pr.uploaded_doc_path, pr.uploaded_doc_name, pr.uploaded_doc_mime_type, pr.uploaded_doc_uploaded_at,`
    : `null::text as uploaded_doc_path, null::text as uploaded_doc_name,
       null::text as uploaded_doc_mime_type, null::timestamptz as uploaded_doc_uploaded_at,`;

  return `
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
      ${docSelect}
      pr.created_at,
      pr.updated_at,
      'registry'::text as source_kind
    from public.permit_registry pr`;
}

function buildPermitsSelect(hasApplications: boolean, hasPostGIS: boolean): string {
  const regimeExpr = hasPostGIS
    ? `case
         when geometrytype(coalesce(p.coordinates, a.coordinates)) in ('POLYGON', 'MULTIPOLYGON') then 'Concession'
         else 'Authorization'
       end`
    : `'Authorization'`;

  const latExpr = hasPostGIS
    ? `case
         when coalesce(p.coordinates, a.coordinates) is null then null
         else st_y(st_centroid(coalesce(p.coordinates, a.coordinates)))
       end`
    : `null::double precision`;

  const lngExpr = hasPostGIS
    ? `case
         when coalesce(p.coordinates, a.coordinates) is null then null
         else st_x(st_centroid(coalesce(p.coordinates, a.coordinates)))
       end`
    : `null::double precision`;

  if (!hasApplications) {
    return `
    select
      p.id,
      null::integer as serial_number,
      'Unknown Permit Holder' as permit_holder,
      p.permit_number::text as permit_number,
      'Authorization' as regime,
      p.water_source::text as water_source,
      null::text as volume_or_area,
      null::text as method_of_water_taking,
      null::text as authorized_activity,
      null::text as location,
      null::double precision as latitude,
      null::double precision as longitude,
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
      null::text as uploaded_doc_path,
      null::text as uploaded_doc_name,
      null::text as uploaded_doc_mime_type,
      null::timestamptz as uploaded_doc_uploaded_at,
      p.created_at,
      p.updated_at,
      'permit'::text as source_kind
    from public.permits p
    where p.permit_number is not null`;
  }

  return `
    select
      p.id,
      null::integer as serial_number,
      coalesce(a.project_title, 'Unknown Permit Holder') as permit_holder,
      p.permit_number::text as permit_number,
      ${regimeExpr} as regime,
      p.water_source::text as water_source,
      null::text as volume_or_area,
      null::text as method_of_water_taking,
      coalesce(a.project_description, null) as authorized_activity,
      case when a.id is not null then concat_ws(', ', a.district, a.province::text) else null end as location,
      ${latExpr} as latitude,
      ${lngExpr} as longitude,
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
      null::text as uploaded_doc_path,
      null::text as uploaded_doc_name,
      null::text as uploaded_doc_mime_type,
      null::timestamptz as uploaded_doc_uploaded_at,
      p.created_at,
      p.updated_at,
      'permit'::text as source_kind
    from public.permits p
    left join public.applications a on a.id = p.application_id
    where p.permit_number is not null`;
}

const MERGED_CTE = `
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
      max(u.uploaded_doc_path) filter (where u.source_kind = 'registry') as uploaded_doc_path,
      max(u.uploaded_doc_name) filter (where u.source_kind = 'registry') as uploaded_doc_name,
      max(u.uploaded_doc_mime_type) filter (where u.source_kind = 'registry') as uploaded_doc_mime_type,
      max(u.uploaded_doc_uploaded_at) filter (where u.source_kind = 'registry') as uploaded_doc_uploaded_at,
      coalesce(
        max(u.created_at) filter (where u.source_kind = 'registry'),
        max(u.created_at) filter (where u.source_kind = 'permit')
      ) as created_at,
      coalesce(
        max(u.updated_at) filter (where u.source_kind = 'registry'),
        max(u.updated_at) filter (where u.source_kind = 'permit')
      ) as updated_at,
      string_agg(distinct u.source_kind, ',' order by u.source_kind) as source_kind,
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
  )`;

export async function GET(req: NextRequest) {
  try {
    const schema = await detectSchema();

    if (!schema.hasRegistry && !schema.hasPermits) {
      return NextResponse.json(EMPTY_RESULT);
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const regime = searchParams.get("regime") || "all";
    const status = searchParams.get("status") || "all";
    const sortBy = searchParams.get("sort_by") || "serial_number";
    const sortDir = searchParams.get("sort_dir") === "desc" ? false : true;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const validSortColumns = ["serial_number", "permit_holder", "permit_number", "status", "regime"];
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

    const unionParts: string[] = [];
    if (schema.hasRegistry) {
      unionParts.push(buildRegistrySelect(schema.hasDocColumns));
    }
    if (schema.hasPermits) {
      unionParts.push(buildPermitsSelect(schema.hasApplications, schema.hasPostGIS));
    }

    const baseCte = `
      with unified as (
        ${unionParts.join("\n        union all\n")}
      ),
      ${MERGED_CTE}
    `;

    const summaryRes = await query<{
      total: string;
      operational: string;
      expired: string;
      expiring_soon: string;
      regime_types: string;
    }>(
      `
      ${baseCte}
      , filtered as (
        select *
        from merged
        where 1 = 1
        ${whereSql}
      )
      select
        count(*)::text as total,
        count(*) filter (where upper(coalesce(status, '')) = 'OPERATIONAL')::text as operational,
        count(*) filter (where upper(coalesce(status, '')) = 'EXPIRED')::text as expired,
        count(*) filter (where upper(coalesce(status, '')) = 'EXPIRING_SOON')::text as expiring_soon,
        count(distinct nullif(trim(coalesce(regime, '')), ''))::text as regime_types
      from filtered
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
        uploaded_doc_path,
        uploaded_doc_name,
        uploaded_doc_mime_type,
        uploaded_doc_uploaded_at,
        created_at,
        updated_at,
        source_kind,
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
    const summaryRow = summaryRes.rows[0];
    const count = Number(summaryRow?.total || "0");
    const data = pageRes.rows;

    return NextResponse.json({
      items: data || [],
      total: count ?? 0,
      summary: {
        total: count ?? 0,
        operational: Number(summaryRow?.operational || "0"),
        expired: Number(summaryRow?.expired || "0"),
        expiringSoon: Number(summaryRow?.expiring_soon || "0"),
        regimeTypes: Number(summaryRow?.regime_types || "0"),
      },
      pagination: { limit, offset, returned: (data || []).length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

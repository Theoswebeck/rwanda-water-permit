import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET /api/hr/vehicles - Get all active vehicles
export async function GET() {
  try {
    const supabase = createClient();
    
    // Get all active vehicles from the database
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        id,
        make,
        model,
        year,
        license_plate,
        status
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    return NextResponse.json(
      { error: "Failed to fetch vehicles" },
      { status: 500 }
    );
  }
}

// POST /api/hr/vehicles - Create a new vehicle
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    const { make, model, year, license_plate, status } = body;
    
    // Validate required fields
    if (!make || !model || !year || !license_plate) {
      return NextResponse.json(
        { error: "Make, model, year, and license plate are required" },
        { status: 400 }
      );
    }
    
    // Check if vehicle with this license plate already exists
    const { data: existingVehicle, error: existingError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("license_plate", license_plate)
      .single();
    
    if (existingError && existingError.code !== "PGRST116") {
      throw new Error(existingError.message);
    }
    
    if (existingVehicle) {
      return NextResponse.json(
        { error: "Vehicle with this license plate already exists" },
        { status: 409 }
      );
    }
    
    // Create new vehicle
    const { data, error } = await supabase
      .from("vehicles")
      .insert([
        {
          make,
          model,
          year,
          license_plate,
          status: status || "active",
        }
      ])
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating vehicle:", error);
    return NextResponse.json(
      { error: "Failed to create vehicle" },
      { status: 500 }
    );
  }
}
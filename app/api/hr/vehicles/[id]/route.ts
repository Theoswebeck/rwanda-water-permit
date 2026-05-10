import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// PUT /api/hr/vehicles/[id] - Update a vehicle
export async function PUT(request: Request, { params }: { params: { id: string } }) {
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
    
    // Check if vehicle exists
    const { data: existingVehicle, error: existingError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("id", params.id)
      .single();
    
    if (existingError) {
      if (existingError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Vehicle not found" },
          { status: 404 }
        );
      }
      throw new Error(existingError.message);
    }
    
    // Check if another vehicle with this license plate already exists
    const { data: licenseCheck, error: licenseCheckError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("license_plate", license_plate)
      .neq("id", params.id)
      .single();
    
    if (licenseCheckError && licenseCheckError.code !== "PGRST116") {
      throw new Error(licenseCheckError.message);
    }
    
    if (licenseCheck) {
      return NextResponse.json(
        { error: "Vehicle with this license plate already exists" },
        { status: 409 }
      );
    }
    
    // Update vehicle
    const { data, error } = await supabase
      .from("vehicles")
      .update({
        make,
        model,
        year,
        license_plate,
        status: status || "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating vehicle:", error);
    return NextResponse.json(
      { error: "Failed to update vehicle" },
      { status: 500 }
    );
  }
}

// DELETE /api/hr/vehicles/[id] - Delete a vehicle
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    
    // Check if vehicle exists
    const { data: existingVehicle, error: existingError } = await supabase
      .from("vehicles")
      .select("id")
      .eq("id", params.id)
      .single();
    
    if (existingError) {
      if (existingError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Vehicle not found" },
          { status: 404 }
        );
      }
      throw new Error(existingError.message);
    }
    
    // Check if vehicle is assigned to any employee
    const { data: assignedEmployee, error: employeeError } = await supabase
      .from("employees")
      .select("id")
      .eq("vehicle_id", params.id)
      .single();
    
    if (employeeError && employeeError.code !== "PGRST116") {
      throw new Error(employeeError.message);
    }
    
    if (assignedEmployee) {
      return NextResponse.json(
        { error: "Cannot delete vehicle that is assigned to an employee" },
        { status: 409 }
      );
    }
    
    // Delete vehicle
    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", params.id);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    return NextResponse.json(
      { error: "Failed to delete vehicle" },
      { status: 500 }
    );
  }
}
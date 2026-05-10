import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET /api/hr/employees - Get all employees
export async function GET() {
  try {
    const supabase = createClient();
    
    // Get all employees from the database with vehicle details
    const { data, error } = await supabase
      .from("employees")
      .select(`
        id,
        name,
        email,
        employee_type,
        vehicle_id,
        created_at,
        updated_at,
        vehicles (
          make,
          model,
          license_plate
        )
      `)
      .order("created_at", { ascending: false });
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Transform data to include vehicle information
    const transformedData = data.map(emp => {
      const vehicleInfo = emp.vehicles ? `${emp.vehicles.make} ${emp.vehicles.model}` : null;
      return {
        ...emp,
        assignedVehicle: vehicleInfo
      };
    });
    
    return NextResponse.json(transformedData);
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

// POST /api/hr/employees - Create a new employee
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    const { name, email, employee_type, vehicle_id } = body;
    
    // Validate required fields
    if (!name || !email || !employee_type) {
      return NextResponse.json(
        { error: "Name, email, and employee type are required" },
        { status: 400 }
      );
    }
    
    // Check if employee with this email already exists
    const { data: existingEmployee, error: existingError } = await supabase
      .from("employees")
      .select("id")
      .eq("email", email)
      .single();
    
    if (existingError && existingError.code !== "PGRST116") {
      throw new Error(existingError.message);
    }
    
    if (existingEmployee) {
      return NextResponse.json(
        { error: "Employee with this email already exists" },
        { status: 409 }
      );
    }
    
    // If employee is a driver, vehicle_id is required
    if (employee_type === "Driver" && !vehicle_id) {
      return NextResponse.json(
        { error: "Vehicle assignment is required for drivers" },
        { status: 400 }
      );
    }
    
    // Create new employee
    const { data, error } = await supabase
      .from("employees")
      .insert([
        {
          name,
          email,
          employee_type,
          vehicle_id: vehicle_id || null,
        }
      ])
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "Failed to create employee" },
      { status: 500 }
    );
  }
}
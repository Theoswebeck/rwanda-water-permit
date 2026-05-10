import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// PUT /api/hr/employees/[id] - Update an employee
export async function PUT(request: Request, { params }: { params: { id: string } }) {
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
    
    // Check if employee exists
    const { data: existingEmployee, error: existingError } = await supabase
      .from("employees")
      .select("id, employee_type, vehicle_id")
      .eq("id", params.id)
      .single();
    
    if (existingError) {
      if (existingError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Employee not found" },
          { status: 404 }
        );
      }
      throw new Error(existingError.message);
    }
    
    // Check if another employee with this email already exists
    const { data: emailCheck, error: emailCheckError } = await supabase
      .from("employees")
      .select("id")
      .eq("email", email)
      .neq("id", params.id)
      .single();
    
    if (emailCheckError && emailCheckError.code !== "PGRST116") {
      throw new Error(emailCheckError.message);
    }
    
    if (emailCheck) {
      return NextResponse.json(
        { error: "Employee with this email already exists" },
        { status: 409 }
      );
    }
    
    // If employee is being changed to a driver, vehicle_id is required
    if (employee_type === "Driver" && !vehicle_id) {
      return NextResponse.json(
        { error: "Vehicle assignment is required for drivers" },
        { status: 400 }
      );
    }
    
    // Update employee
    const { data, error } = await supabase
      .from("employees")
      .update({
        name,
        email,
        employee_type,
        vehicle_id: vehicle_id || null,
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
    console.error("Error updating employee:", error);
    return NextResponse.json(
      { error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

// DELETE /api/hr/employees/[id] - Delete an employee
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    
    // Check if employee exists
    const { data: existingEmployee, error: existingError } = await supabase
      .from("employees")
      .select("id")
      .eq("id", params.id)
      .single();
    
    if (existingError) {
      if (existingError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Employee not found" },
          { status: 404 }
        );
      }
      throw new Error(existingError.message);
    }
    
    // Delete employee
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", params.id);
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json(
      { error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}
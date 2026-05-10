"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  PlusCircle,
  Edit,
  Trash2,
  MoreHorizontal,
  User,
  Car,
  Wrench,
  Shield,
  Users,
  AlertTriangle
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// Employee type definition
type EmployeeType = 'Driver' | 'Mechanic' | 'Dispatcher' | 'Assistant Mechanic';

// Employee data structure
interface Employee {
  id: string;
  name: string;
  email: string;
  employeeType: EmployeeType;
  vehicleId?: string | null;
  assignedVehicle?: string;
  createdAt: string;
  updatedAt: string;
}

// Vehicle data structure
interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  status: 'active' | 'inactive' | 'maintenance';
}

// Validation schema
const employeeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  employeeType: z.enum(['Driver', 'Mechanic', 'Dispatcher', 'Assistant Mechanic'], {
    message: "Please select an employee type"
  }),
  vehicleId: z.string().optional().nullable(),
});

export default function EmployeesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: '',
      email: '',
      employeeType: 'Driver',
      vehicleId: null,
    },
  });

  // Load employees and vehicles
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Load employees
        const employeesResponse = await fetch('/api/hr/employees');
        const employeesData = await employeesResponse.json();
        
        // Load vehicles
        const vehiclesResponse = await fetch('/api/hr/vehicles');
        const vehiclesData = await vehiclesResponse.json();
        
        setEmployees(employeesData);
        setVehicles(vehiclesData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: "Error",
          description: "Failed to load employees and vehicles.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  const onSubmit = async (data: z.infer<typeof employeeSchema>) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          employee_type: data.employeeType,
          vehicle_id: data.vehicleId || null,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to add employee');
      }
      
      // Add the new employee to the list
      setEmployees([...employees, result]);
      
      toast({
        title: "Employee Added",
        description: `${result.name} has been successfully added.`,
      });

      // Reset form and close dialog
      form.reset();
      setIsDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add employee. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    form.reset({
      name: employee.name,
      email: employee.email,
      employeeType: employee.employeeType,
      vehicleId: employee.vehicleId || null,
    });
    setIsDialogOpen(true);
  };

  const handleUpdate = async (data: z.infer<typeof employeeSchema>) => {
    if (!editingEmployee) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/hr/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          employee_type: data.employeeType,
          vehicle_id: data.vehicleId || null,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update employee');
      }
      
      // Update the employee in the list
      setEmployees(employees.map(emp => emp.id === editingEmployee.id ? result : emp));
      
      toast({
        title: "Employee Updated",
        description: `${result.name} has been successfully updated.`,
      });

      // Reset form and close dialog
      form.reset();
      setIsDialogOpen(false);
      setEditingEmployee(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update employee. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete) return;
    
    try {
      const response = await fetch(`/api/hr/employees/${employeeToDelete.id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete employee');
      }
      
      // Remove the employee from the list
      setEmployees(employees.filter(emp => emp.id !== employeeToDelete.id));
      
      toast({
        title: "Employee Deleted",
        description: `${employeeToDelete.name} has been successfully deleted.`,
      });
      
      setIsDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete employee. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getVehicleOptions = () => {
    return vehicles
      .filter(vehicle => vehicle.status === 'active')
      .map(vehicle => ({
        value: vehicle.id,
        label: `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`
      }));
  };

  const getEmployeeTypeIcon = (type: EmployeeType) => {
    switch (type) {
      case 'Driver': return <Car className="h-4 w-4" />;
      case 'Mechanic': return <Wrench className="h-4 w-4" />;
      case 'Dispatcher': return <Shield className="h-4 w-4" />;
      case 'Assistant Mechanic': return <Wrench className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  // Handle form submission to validate driver assignment
  const handleSubmit = (data: z.infer<typeof employeeSchema>) => {
    // If employee is a driver, vehicle assignment is required
    if (data.employeeType === 'Driver' && !data.vehicleId) {
      toast({
        title: "Validation Error",
        description: "Vehicle assignment is required for drivers.",
        variant: "destructive",
      });
      return;
    }
    
    if (editingEmployee) {
      handleUpdate(data);
    } else {
      onSubmit(data);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'manager']} requireProfile={true}>
        <DashboardLayout>
          <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading employees and vehicles...</p>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']} requireProfile={true}>
      <DashboardLayout>
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className="text-primary leading-tight text-2xl sm:text-4xl font-semibold tracking-tight xl:text-5xl xl:tracking-tighter">
                Employee Management
              </h1>
              <p className="mt-1 text-sm sm:text-base text-muted-foreground">
                Manage employees and their vehicle assignments
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingEmployee ? "Edit Employee" : "Add New Employee"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingEmployee 
                      ? "Update employee details" 
                      : "Enter employee information to create a new employee record"}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form 
                    onSubmit={form.handleSubmit(handleSubmit)} 
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter employee name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              type="email" 
                              placeholder="Enter employee email" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="employeeType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employee Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Driver">Driver</SelectItem>
                              <SelectItem value="Mechanic">Mechanic</SelectItem>
                              <SelectItem value="Dispatcher">Dispatcher</SelectItem>
                              <SelectItem value="Assistant Mechanic">Assistant Mechanic</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="vehicleId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned Vehicle (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select vehicle (optional)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {getVehicleOptions().map(vehicle => (
                                <SelectItem key={vehicle.value} value={vehicle.value}>
                                  {vehicle.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select a vehicle for this employee to be assigned to
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          setIsDialogOpen(false);
                          setEditingEmployee(null);
                          form.reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : editingEmployee ? "Update" : "Add Employee"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employees
              </CardTitle>
              <CardDescription>
                Manage your team members and their assignments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Employee Type</TableHead>
                    <TableHead>Assigned Vehicle</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.length > 0 ? (
                    employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell>{employee.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getEmployeeTypeIcon(employee.employeeType)}
                            <span>{employee.employeeType}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {employee.vehicleId ? (
                            <span className="inline-flex items-center gap-1">
                              <Car className="h-4 w-4" />
                              {employee.assignedVehicle || 'N/A'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleEdit(employee)}
                                className="flex items-center gap-2"
                              >
                                <Edit className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(employee)}
                                className="flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No employees found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the employee 
                  <strong> {employeeToDelete?.name}</strong> and remove them from the system.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
import { redirect } from "next/navigation";

// Common mistyping of the request page's URL — send it to the real page.
export default function ApiAccessRequestsRedirect() {
  redirect("/api-access");
}

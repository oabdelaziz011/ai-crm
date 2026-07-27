import { useEffect } from "react";
import { CustomersListWorkspace } from "@/components/customers-list";
import { restoreCustomersListScroll } from "@/lib/customer-workspace/customers-list-scroll";

export default function CustomersPage() {
  useEffect(() => {
    restoreCustomersListScroll();
  }, []);

  return <CustomersListWorkspace />;
}

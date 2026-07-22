import { CustomerService } from "../crm/customer/customer-service.js";
import type { CustomerRepositoryPort } from "../crm/customer/customer-repository-port.js";
import type { FindCustomerInput, FindCustomerResult } from "../crm/types/find-customer-input.js";

export interface CustomerServicePort {
  findCustomer(input: FindCustomerInput): Promise<FindCustomerResult>;
}

export class DefaultCustomerServicePort implements CustomerServicePort {
  private readonly service: CustomerService;

  constructor(repository: CustomerRepositoryPort) {
    this.service = new CustomerService(repository);
  }

  findCustomer(input: FindCustomerInput): Promise<FindCustomerResult> {
    return this.service.findCustomer(input);
  }
}

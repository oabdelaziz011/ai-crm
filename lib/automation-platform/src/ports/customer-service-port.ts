import { CustomerService } from "../crm/customer/customer-service.js";
import type { CustomerRepositoryPort } from "../crm/customer/customer-repository-port.js";
import type { FindCustomerInput, FindCustomerResult } from "../crm/types/find-customer-input.js";
import type { CreateCustomerInput, CreateCustomerResult, UpdateCustomerInput, UpdateCustomerResult } from "../crm/types/customer-mutation-input.js";

export interface CustomerServicePort {
  findCustomer(input: FindCustomerInput): Promise<FindCustomerResult>;
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  updateCustomer(input: UpdateCustomerInput): Promise<UpdateCustomerResult>;
}

export class DefaultCustomerServicePort implements CustomerServicePort {
  private readonly service: CustomerService;

  constructor(repository: CustomerRepositoryPort) {
    this.service = new CustomerService(repository);
  }

  findCustomer(input: FindCustomerInput): Promise<FindCustomerResult> {
    return this.service.findCustomer(input);
  }

  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    return this.service.createCustomer(input);
  }

  updateCustomer(input: UpdateCustomerInput): Promise<UpdateCustomerResult> {
    return this.service.updateCustomer(input);
  }
}

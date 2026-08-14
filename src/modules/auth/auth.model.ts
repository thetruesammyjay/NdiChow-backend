export interface Customer {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface CustomerWithPassword extends Customer {
  passwordHash: string;
}

export interface CreateCustomerInput {
  email: string;
  name: string;
  passwordHash: string;
}

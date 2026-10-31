import { ApiError } from "@/services/api";
import { paginate, mockDelay } from "@/mocks/utils";
import type { Customer, CustomerDetail, CustomerCreate, CustomerUpdate } from "@/types/customer";
import type { Paginated, ListQuery } from "@/types/common";

// ---------------------------------------------------------------------------
// Seed data — 20 realistic Indian B2B customers
// ---------------------------------------------------------------------------
let nextId = 21;

const SEED: Customer[] = [
  {
    id: 1,
    name: "Priya Sharma",
    email: "priya.sharma@acmecorp.in",
    phone: "+91 98201 34567",
    company: "Acme Corp India",
    billing_address: "12, MG Road, Bengaluru, Karnataka 560001",
    active_subscriptions: 3,
    outstanding_amount: 14500,
    total_paid: 128000,
    portal_access: true,
    created_at: "2024-02-10T09:00:00Z",
  },
  {
    id: 2,
    name: "Rahul Mehta",
    email: "rahul@zesttech.io",
    phone: "+91 90000 22345",
    company: "Zest Technologies",
    billing_address: "Flat 3B, Powai, Mumbai, Maharashtra 400076",
    active_subscriptions: 1,
    outstanding_amount: 0,
    total_paid: 36000,
    portal_access: true,
    created_at: "2024-03-15T10:30:00Z",
  },
  {
    id: 3,
    name: "Sneha Kapoor",
    email: "sneha.kapoor@brightwave.in",
    phone: "+91 91234 56789",
    company: "BrightWave Solutions",
    billing_address: "Tower B, Cyber City, Gurugram, Haryana 122002",
    active_subscriptions: 2,
    outstanding_amount: 7200,
    total_paid: 54000,
    portal_access: false,
    created_at: "2024-04-01T08:15:00Z",
  },
  {
    id: 4,
    name: "Arjun Nair",
    email: "arjun@navvycloud.com",
    phone: "+91 99876 12345",
    company: "NavvyCloud Pvt Ltd",
    billing_address: "No 5, Infopark, Kochi, Kerala 682042",
    active_subscriptions: 4,
    outstanding_amount: 0,
    total_paid: 210000,
    portal_access: true,
    created_at: "2023-11-20T11:00:00Z",
  },
  {
    id: 5,
    name: "Deepika Iyer",
    email: "deepika@sunrisefinance.com",
    phone: "+91 87654 32109",
    company: "Sunrise Finance",
    billing_address: "Anna Salai, Chennai, Tamil Nadu 600002",
    active_subscriptions: 1,
    outstanding_amount: 3500,
    total_paid: 42000,
    portal_access: true,
    created_at: "2024-01-05T14:00:00Z",
  },
  {
    id: 6,
    name: "Vikram Reddy",
    email: "vikram.reddy@deltaretail.in",
    phone: "+91 93456 78901",
    company: "Delta Retail Group",
    billing_address: "Banjara Hills, Hyderabad, Telangana 500034",
    active_subscriptions: 0,
    outstanding_amount: 0,
    total_paid: 18000,
    portal_access: false,
    created_at: "2024-05-12T09:45:00Z",
  },
  {
    id: 7,
    name: "Anjali Gupta",
    email: "anjali@pixeltribe.in",
    phone: "+91 80000 45678",
    company: "PixelTribe Design Studio",
    billing_address: "Koramangala, Bengaluru, Karnataka 560034",
    active_subscriptions: 2,
    outstanding_amount: 9800,
    total_paid: 67000,
    portal_access: true,
    created_at: "2023-09-18T16:20:00Z",
  },
  {
    id: 8,
    name: "Saurabh Joshi",
    email: "saurabh@logixprime.com",
    phone: "+91 82345 67890",
    company: "LogixPrime Supply Chain",
    billing_address: "MIDC, Pune, Maharashtra 411018",
    active_subscriptions: 3,
    outstanding_amount: 0,
    total_paid: 156000,
    portal_access: true,
    created_at: "2023-07-30T12:00:00Z",
  },
  {
    id: 9,
    name: "Meera Pillai",
    email: "meera@aquasoft.in",
    phone: "+91 76543 21098",
    company: "AquaSoft Technologies",
    billing_address: "Technopark, Thiruvananthapuram, Kerala 695581",
    active_subscriptions: 1,
    outstanding_amount: 2100,
    total_paid: 24000,
    portal_access: false,
    created_at: "2024-06-01T08:00:00Z",
  },
  {
    id: 10,
    name: "Karan Singh",
    email: "karan.singh@fintrust.in",
    phone: "+91 99001 23456",
    company: "FinTrust Advisors",
    billing_address: "Connaught Place, New Delhi, Delhi 110001",
    active_subscriptions: 5,
    outstanding_amount: 25000,
    total_paid: 312000,
    portal_access: true,
    created_at: "2023-05-10T10:00:00Z",
  },
  {
    id: 11,
    name: "Nandita Bose",
    email: "nandita@ecopack.in",
    phone: "+91 84567 89012",
    company: "EcoPack Industries",
    billing_address: "Salt Lake, Kolkata, West Bengal 700091",
    active_subscriptions: 2,
    outstanding_amount: 0,
    total_paid: 48000,
    portal_access: true,
    created_at: "2024-02-28T09:30:00Z",
  },
  {
    id: 12,
    name: "Rohit Verma",
    email: "rohit@sportzone.co.in",
    phone: "+91 95678 90123",
    company: "SportZone Retail",
    billing_address: "Vastrapur, Ahmedabad, Gujarat 380015",
    active_subscriptions: 1,
    outstanding_amount: 4000,
    total_paid: 30000,
    portal_access: false,
    created_at: "2024-04-20T11:15:00Z",
  },
  {
    id: 13,
    name: "Lavanya Krishnan",
    email: "lavanya@mobiledge.io",
    phone: "+91 78901 23456",
    company: "MobilEdge Networks",
    billing_address: "Whitefield, Bengaluru, Karnataka 560066",
    active_subscriptions: 3,
    outstanding_amount: 11200,
    total_paid: 89000,
    portal_access: true,
    created_at: "2023-10-05T13:45:00Z",
  },
  {
    id: 14,
    name: "Rajesh Patel",
    email: "rajesh.patel@greenleaf.in",
    phone: "+91 97890 12345",
    company: "GreenLeaf Agri Solutions",
    billing_address: "Anand, Gujarat 388001",
    active_subscriptions: 0,
    outstanding_amount: 0,
    total_paid: 12000,
    portal_access: false,
    created_at: "2024-07-01T07:00:00Z",
  },
  {
    id: 15,
    name: "Pooja Menon",
    email: "pooja@cleverops.in",
    phone: "+91 86789 01234",
    company: "CleverOps Consulting",
    billing_address: "Kalyani Nagar, Pune, Maharashtra 411006",
    active_subscriptions: 2,
    outstanding_amount: 6300,
    total_paid: 75000,
    portal_access: true,
    created_at: "2023-12-10T15:00:00Z",
  },
  {
    id: 16,
    name: "Amit Desai",
    email: "amit@skylink.co.in",
    phone: "+91 94321 65890",
    company: "SkyLink Telecom",
    billing_address: "BKC, Mumbai, Maharashtra 400051",
    active_subscriptions: 4,
    outstanding_amount: 0,
    total_paid: 240000,
    portal_access: true,
    created_at: "2023-06-22T09:00:00Z",
  },
  {
    id: 17,
    name: "Sunita Rao",
    email: "sunita@medilink.in",
    phone: "+91 73456 78901",
    company: "MediLink Healthcare",
    billing_address: "Bhubaneswar, Odisha 751009",
    active_subscriptions: 1,
    outstanding_amount: 1800,
    total_paid: 21600,
    portal_access: false,
    created_at: "2024-03-05T10:00:00Z",
  },
  {
    id: 18,
    name: "Nikhil Tiwari",
    email: "nikhil@buildfast.in",
    phone: "+91 85432 10987",
    company: "BuildFast Construction",
    billing_address: "Gomti Nagar, Lucknow, UP 226010",
    active_subscriptions: 2,
    outstanding_amount: 8900,
    total_paid: 56000,
    portal_access: true,
    created_at: "2024-01-20T08:30:00Z",
  },
  {
    id: 19,
    name: "Ritu Agarwal",
    email: "ritu@swiftship.in",
    phone: "+91 92109 87654",
    company: "SwiftShip Logistics",
    billing_address: "Sector 63, Noida, UP 201301",
    active_subscriptions: 3,
    outstanding_amount: 0,
    total_paid: 108000,
    portal_access: true,
    created_at: "2023-08-14T11:00:00Z",
  },
  {
    id: 20,
    name: "Karthik Subramanian",
    email: "karthik@alphadata.io",
    phone: "+91 88765 43210",
    company: "AlphaData Analytics",
    billing_address: "Sholinganallur, Chennai, Tamil Nadu 600119",
    active_subscriptions: 5,
    outstanding_amount: 32000,
    total_paid: 420000,
    portal_access: true,
    created_at: "2023-04-18T09:00:00Z",
  },
];

// In-memory store — mutations persist until page refresh.
let store: Customer[] = [...SEED];

function findOrThrow(id: number): Customer {
  const c = store.find((c) => c.id === id);
  if (!c) throw new ApiError(404, "Customer not found.");
  return c;
}

export const mockCustomers = {
  async list(query: ListQuery): Promise<Paginated<Customer>> {
    await mockDelay();
    return paginate(store, query, ["name", "email", "phone", "company"]);
  },

  async getById(id: number): Promise<CustomerDetail> {
    await mockDelay();
    const c = findOrThrow(id);
    return { ...c, customer_since: c.created_at };
  },

  async create(data: CustomerCreate): Promise<Customer> {
    await mockDelay();
    if (store.some((c) => c.email.toLowerCase() === data.email.toLowerCase())) {
      throw new ApiError(409, "A customer with this email already exists.");
    }
    const customer: Customer = {
      id: nextId++,
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      billing_address: data.billing_address,
      active_subscriptions: 0,
      outstanding_amount: 0,
      total_paid: 0,
      portal_access: false,
      created_at: new Date().toISOString(),
    };
    store = [...store, customer];
    return customer;
  },

  async update(id: number, data: CustomerUpdate): Promise<Customer> {
    await mockDelay();
    findOrThrow(id);
    if (
      data.email &&
      store.some((c) => c.id !== id && c.email.toLowerCase() === data.email!.toLowerCase())
    ) {
      throw new ApiError(409, "A customer with this email already exists.");
    }
    store = store.map((c) => (c.id === id ? { ...c, ...data } : c));
    return store.find((c) => c.id === id)!;
  },

  async inviteToPortal(id: number): Promise<{ message: string }> {
    await mockDelay(800);
    findOrThrow(id);
    store = store.map((c) => (c.id === id ? { ...c, portal_access: true } : c));
    return { message: "Portal invitation sent." };
  },
};

export const categories = [
  { id: "all", label: "All services" },
  { id: "maid", label: "Maid" },
  { id: "electrician", label: "Electrician" },
  { id: "carpenter", label: "Carpenter" },
  { id: "plumber", label: "Plumber" },
  { id: "cook", label: "Cook" },
  { id: "babysitter", label: "Babysitter" }
];

export const jobs = [
  {
    id: "job-001",
    title: "Kitchen sink leakage repair",
    category: "Plumber",
    location: "Kakkanad, Kochi",
    budget: "₹900 - ₹1200",
    schedule: "Today, 5-7 PM",
    status: "Open"
  },
  {
    id: "job-002",
    title: "Full-day maid for deep cleaning",
    category: "Maid",
    location: "Trivandrum",
    budget: "₹1500",
    schedule: "Tomorrow, 10 AM",
    status: "Open"
  },
  {
    id: "job-003",
    title: "Electrical rewiring for kitchen",
    category: "Electrician",
    location: "Coimbatore",
    budget: "₹2200 - ₹3000",
    schedule: "Fri, 9 AM",
    status: "Open"
  }
];

export const connections = [
  {
    id: "conn-001",
    name: "Anita M.",
    role: "Provider",
    status: "Pending mutual approval",
    city: "Kochi"
  },
  {
    id: "conn-002",
    name: "Ravi S.",
    role: "Seeker",
    status: "Accepted",
    city: "Madurai"
  }
];

export const consentRequests = [
  {
    id: "consent-001",
    requester: "Anita M.",
    fields: ["Phone", "Email"],
    purpose: "Share contact to confirm cleaning schedule",
    status: "Pending"
  },
  {
    id: "consent-002",
    requester: "Ravi S.",
    fields: ["Phone"],
    purpose: "Job completion follow-up",
    status: "Granted"
  }
];

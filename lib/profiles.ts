export const DEMO_PROFILES = [
  {
    id: "mila",
    name: "Mila Janssen",
    line: "28, lives alone, owns a car",
    initials: "MJ",
  },
  {
    id: "sofie",
    name: "Sofie Martens",
    line: "Salaried, saving a little each month",
    initials: "SM",
  },
  {
    id: "noah",
    name: "Noah Peeters",
    line: "Freelance, with income that changes",
    initials: "NP",
  },
] as const;

export type DemoCustomerId = (typeof DEMO_PROFILES)[number]["id"];

export function isDemoCustomer(id: string | undefined): id is DemoCustomerId {
  return id === "mila" || id === "sofie" || id === "noah";
}

export function profileLine(id: DemoCustomerId) {
  return DEMO_PROFILES.find((profile) => profile.id === id)!.line;
}

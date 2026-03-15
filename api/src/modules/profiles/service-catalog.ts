export type SkillProficiency = "beginner" | "intermediate" | "advanced" | "expert";
export type ServiceSkillSource = "catalog" | "custom";

export interface ServiceSkill {
  jobName: string;
  proficiency: SkillProficiency;
  source: ServiceSkillSource;
}

export interface ServiceCatalogOption {
  value: string;
  label: string;
  group: string;
}

export const SERVICE_PROFICIENCIES: SkillProficiency[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert"
];

export const HOME_SERVICE_CATALOG: ServiceCatalogOption[] = [
  { value: "plumbing", label: "Plumbing", group: "Repairs" },
  { value: "electrical", label: "Electrical", group: "Repairs" },
  { value: "carpentry", label: "Carpentry", group: "Repairs" },
  { value: "painting", label: "Painting", group: "Repairs" },
  { value: "wall putty", label: "Wall putty", group: "Repairs" },
  { value: "tiling", label: "Tiling", group: "Repairs" },
  { value: "masonry", label: "Masonry", group: "Repairs" },
  { value: "welding", label: "Welding", group: "Repairs" },
  { value: "locksmith", label: "Locksmith", group: "Repairs" },
  { value: "appliance repair", label: "Appliance repair", group: "Repairs" },
  { value: "ac service", label: "AC service", group: "Repairs" },
  { value: "water purifier / ro service", label: "Water purifier / RO service", group: "Repairs" },
  { value: "inverter / ups service", label: "Inverter / UPS service", group: "Repairs" },
  { value: "cctv / camera installation", label: "CCTV / camera installation", group: "Repairs" },
  { value: "furniture assembly", label: "Furniture assembly", group: "Repairs" },
  { value: "curtain / blind installation", label: "Curtain / blind installation", group: "Repairs" },

  { value: "cleaning", label: "Cleaning", group: "Cleaning & Housekeeping" },
  { value: "deep cleaning", label: "Deep cleaning", group: "Cleaning & Housekeeping" },
  { value: "bathroom cleaning", label: "Bathroom cleaning", group: "Cleaning & Housekeeping" },
  { value: "kitchen cleaning", label: "Kitchen cleaning", group: "Cleaning & Housekeeping" },
  { value: "sofa cleaning", label: "Sofa cleaning", group: "Cleaning & Housekeeping" },
  { value: "mattress cleaning", label: "Mattress cleaning", group: "Cleaning & Housekeeping" },
  { value: "carpet cleaning", label: "Carpet cleaning", group: "Cleaning & Housekeeping" },
  { value: "window cleaning", label: "Window cleaning", group: "Cleaning & Housekeeping" },
  { value: "laundry", label: "Laundry", group: "Cleaning & Housekeeping" },
  { value: "ironing", label: "Ironing", group: "Cleaning & Housekeeping" },
  { value: "dishwashing", label: "Dishwashing", group: "Cleaning & Housekeeping" },
  { value: "housekeeping", label: "Housekeeping", group: "Cleaning & Housekeeping" },

  { value: "childcare", label: "Childcare", group: "Care" },
  { value: "babysitting", label: "Babysitting", group: "Care" },
  { value: "elder care", label: "Elder care", group: "Care" },
  { value: "home nursing", label: "Home nursing", group: "Care" },
  { value: "patient care attendant", label: "Patient care attendant", group: "Care" },
  { value: "disability support", label: "Disability support", group: "Care" },
  { value: "pet care", label: "Pet care", group: "Care" },

  { value: "cooking", label: "Cooking", group: "Cooking & Food" },
  { value: "meal prep", label: "Meal prep", group: "Cooking & Food" },
  { value: "baking", label: "Baking", group: "Cooking & Food" },
  { value: "catering support", label: "Catering support", group: "Cooking & Food" },

  { value: "gardening", label: "Gardening", group: "Outdoor & Utility" },
  { value: "landscaping", label: "Landscaping", group: "Outdoor & Utility" },
  { value: "pest control", label: "Pest control", group: "Outdoor & Utility" },
  { value: "car washing", label: "Car washing", group: "Outdoor & Utility" },
  { value: "terrace / outdoor cleaning", label: "Terrace / outdoor cleaning", group: "Outdoor & Utility" },

  { value: "driver", label: "Driver", group: "Home Support" },
  { value: "security", label: "Security", group: "Home Support" },
  { value: "moving help", label: "Moving help", group: "Home Support" },
  { value: "packing / unpacking", label: "Packing / unpacking", group: "Home Support" },
  { value: "errands", label: "Errands", group: "Home Support" },
  { value: "grocery assistance", label: "Grocery assistance", group: "Home Support" },

  { value: "arts & crafts", label: "Arts & crafts", group: "Creative / In-home Personal Services" },
  { value: "wall art / mural", label: "Wall art / mural", group: "Creative / In-home Personal Services" },
  { value: "tailoring / stitching", label: "Tailoring / stitching", group: "Creative / In-home Personal Services" },
  { value: "beautician services", label: "Beautician services", group: "Creative / In-home Personal Services" },
  { value: "mehendi / henna", label: "Mehendi / henna", group: "Creative / In-home Personal Services" },
  { value: "home tutoring", label: "Home tutoring", group: "Creative / In-home Personal Services" },
  { value: "music lessons", label: "Music lessons", group: "Creative / In-home Personal Services" },

  { value: "other", label: "Other", group: "Custom" }
];

const CATALOG_VALUES = new Set(HOME_SERVICE_CATALOG.map((item) => item.value));

export function normalizeCatalogLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function serviceSkillToCategory(skill: ServiceSkill): string {
  return normalizeCatalogLabel(skill.jobName);
}

export function normalizeServiceSkills(input: ServiceSkill[]): ServiceSkill[] {
  const normalized: ServiceSkill[] = [];
  const seen = new Set<string>();

  for (const skill of input) {
    const jobName = normalizeCatalogLabel(skill.jobName);
    if (!jobName) {
      continue;
    }
    const source = CATALOG_VALUES.has(jobName) ? "catalog" : skill.source;
    const key = `${jobName}:${skill.proficiency}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({
      jobName,
      proficiency: skill.proficiency,
      source
    });
  }

  return normalized.slice(0, 20);
}

export function categoriesFromSkills(skills: ServiceSkill[]): string[] {
  const categories = skills.map(serviceSkillToCategory);
  return [...new Set(categories)].slice(0, 20);
}

export function buildSkillSnapshotForCategory(
  skills: ServiceSkill[],
  category: string
): ServiceSkill | null {
  const normalizedCategory = normalizeCatalogLabel(category);
  if (!normalizedCategory) {
    return null;
  }

  const exact = skills.find((skill) => normalizeCatalogLabel(skill.jobName) === normalizedCategory);
  if (exact) {
    return exact;
  }

  return skills.find((skill) => normalizedCategory.includes(normalizeCatalogLabel(skill.jobName))) ?? null;
}

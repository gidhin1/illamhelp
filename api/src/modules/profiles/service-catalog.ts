import {
  HOME_SERVICE_CATALOG,
  SERVICE_PROFICIENCIES,
  type ServiceCatalogOption,
  type ServiceSkill,
  type SkillProficiency
} from "@illamhelp/shared-types";

export type ServiceSkillSource = "catalog" | "custom";
export { HOME_SERVICE_CATALOG, SERVICE_PROFICIENCIES };

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

import {
  HOME_SERVICE_CATALOG,
  SERVICE_PROFICIENCIES,
  type ServiceSkill
} from "@illamhelp/shared-types";

export const FALLBACK_SERVICE_CATALOG = HOME_SERVICE_CATALOG;

export const PROFICIENCY_OPTIONS = SERVICE_PROFICIENCIES;

export function summarizeSkills(skills: ServiceSkill[], limit = 3): string[] {
  return skills.slice(0, limit).map((skill) => `${skill.jobName} (${skill.proficiency})`);
}

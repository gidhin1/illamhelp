import { describe, expect, it } from "vitest";

import { escapeIlikeLiteral } from "./sql";

describe("escapeIlikeLiteral", () => {
    it("returns plain text unchanged", () => {
        expect(escapeIlikeLiteral("plumber kochi")).toBe("plumber kochi");
    });

    it("escapes percent signs", () => {
        expect(escapeIlikeLiteral("50% off")).toBe("50\\% off");
    });

    it("escapes underscore characters", () => {
        expect(escapeIlikeLiteral("user_name")).toBe("user\\_name");
    });

    it("escapes backslash characters", () => {
        expect(escapeIlikeLiteral("path\\to\\thing")).toBe("path\\\\to\\\\thing");
    });

    it("escapes all special characters together", () => {
        expect(escapeIlikeLiteral("%_\\")).toBe("\\%\\_\\\\");
    });

    it("handles empty string", () => {
        expect(escapeIlikeLiteral("")).toBe("");
    });

    it("does not alter regular search terms", () => {
        const input = "kitchen sink repair kakkanad";
        expect(escapeIlikeLiteral(input)).toBe(input);
    });

    it("correctly builds a safe ILIKE pattern", () => {
        const userInput = "50%_off";
        const pattern = `%${escapeIlikeLiteral(userInput)}%`;
        expect(pattern).toBe("%50\\%\\_off%");
    });
});
